/**
 * CPCA Alumni Network — mailer
 * Runs inside the admin@cpcaalumni.org Google Workspace account (Apps Script), on a timer.
 *
 * It does two jobs:
 *   sendQueuedAnnouncements()  — every 10 minutes: emails any new announcement to all members
 *   sendWeeklyReminders()      — once a week: nudges members whose profile is still incomplete
 *
 * It reads the portal's database directly with this account's own Google sign-in — there is no
 * password or key file anywhere. For that to work the account needs the "Cloud Datastore User"
 * role on the cpca-alumni-portal project (granted once, in the Google Cloud console).
 *
 * It matters WHICH account this lives in: Apps Script allows 100 recipients a day from a personal
 * gmail.com account and 1,500 from a Workspace account. Hence admin@cpcaalumni.org.
 *
 * Mail goes out through Brevo or Resend — whichever key is set in Project Settings ->
 * Script properties (BREVO_KEY or RESEND_KEY). With neither, it falls back to Gmail, so the
 * mailer always works. Every send is capped at DAILY_CAP and the rest are picked up on the next
 * run, so a daily allowance can never be overshot. Nobody is emailed twice for the same thing.
 */

const PROJECT = 'cpca-alumni-portal';
const PORTAL = 'https://cpcaalumni.org';
// The portal's mail identity. Everything is sent from this address and replies come back to it.
// A friendlier alias (alumni@cpcaalumni.org) can be added in Workspace later — change it here and
// nothing else needs touching. alumnigau@gmail.com remains a portal administrator either way.
const SUPPORT = 'admin@cpcaalumni.org';
const REMINDER_GAP_DAYS = 21;    // never nudge the same person more often than this

// Who the mail comes from. Through Gmail this is really decided by the account the script runs
// under — so the script must live in the admin@cpcaalumni.org Workspace account, which is also
// what raises the limit from 100 messages a day to 1,500. The display name is used either way.
const FROM = 'CPCA Alumni Network <admin@cpcaalumni.org>';

// How many people one run may email. Free plans allow 300 a day (Brevo) or 100 (Resend/Gmail),
// so 90 is safe for all of them. Raise it by setting a DAILY_CAP script property
// (Project Settings -> Script properties) to, say, 280 on Brevo. No code change needed.
const DAILY_CAP = Number(PropertiesService.getScriptProperties().getProperty('DAILY_CAP')) || 90;

const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';

// ── Firestore plumbing ───────────────────────────────────────────────────────
function authHeaders_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'Content-Type': 'application/json' };
}
function fsFetch_(url, options) {
  const res = UrlFetchApp.fetch(url, Object.assign({ headers: authHeaders_(), muteHttpExceptions: true }, options || {}));
  const code = res.getResponseCode();
  if (code === 403 || code === 401) {
    throw new Error('The database refused this account. Grant ' + SUPPORT + ' the "Cloud Datastore User" '
      + 'role on the ' + PROJECT + ' project (Google Cloud console -> IAM -> Grant access), then run this again.');
  }
  if (code >= 300) throw new Error('Firestore ' + code + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText() || '{}');
}
// Firestore returns values wrapped by type; unwrap the few kinds we use.
function val_(f) {
  if (!f) return null;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return f.doubleValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.nullValue !== undefined) return null;
  if (f.arrayValue !== undefined) return (f.arrayValue.values || []).map(val_);
  if (f.mapValue !== undefined) {
    const out = {};
    Object.keys(f.mapValue.fields || {}).forEach(function (k) { out[k] = val_(f.mapValue.fields[k]); });
    return out;
  }
  return null;
}
function docFields_(doc) {
  const out = {};
  Object.keys((doc && doc.fields) || {}).forEach(function (k) { out[k] = val_(doc.fields[k]); });
  out._name = doc.name;
  out._id = doc.name.split('/').pop();
  return out;
}
function query_(body) {
  const rows = fsFetch_(BASE + ':runQuery', { method: 'post', payload: JSON.stringify(body) });
  return (rows || []).filter(function (r) { return r.document; }).map(function (r) { return docFields_(r.document); });
}
function patch_(path, fields, maskFields) {
  const mask = maskFields.map(function (f) { return 'updateMask.fieldPaths=' + encodeURIComponent(f); }).join('&');
  return fsFetch_(BASE + '/' + path + '?' + mask, { method: 'patch', payload: JSON.stringify({ fields: fields }) });
}
const numField_ = (n) => ({ integerValue: String(n) });

// ── Who gets the post ────────────────────────────────────────────────────────
/** Every approved member, with the email address on their contact card. */
function approvedMembers_() {
  const profiles = query_({ structuredQuery: {
    from: [{ collectionId: 'profiles' }],
    where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } },
    limit: 2000,
  } });
  const owned = profiles.filter(function (p) { return p.userId; });   // only people who actually signed in
  const requests = owned.map(function (p) {
    return { url: BASE + '/profiles/' + p._id + '/private/contact', headers: authHeaders_(), muteHttpExceptions: true };
  });
  const out = [];
  for (let i = 0; i < requests.length; i += 50) {            // fetch the contact cards in batches
    const slice = requests.slice(i, i + 50);
    const responses = UrlFetchApp.fetchAll(slice);
    responses.forEach(function (res, n) {
      if (res.getResponseCode() !== 200) return;
      const c = docFields_(JSON.parse(res.getContentText()));
      const person = owned[i + n];
      if (c.email && c.email.indexOf('@') > 0) {
        out.push({ id: person._id, name: person.fullName || 'Alumnus', email: String(c.email).trim().toLowerCase(),
                   profile: person, lastReminderAt: c.lastReminderAt || 0 });
      }
    });
  }
  // one address only, even if it appears on two profiles
  const seen = {};
  return out.filter(function (m) { if (seen[m.email]) return false; seen[m.email] = 1; return true; });
}

/** The same message with the markup stripped out, for mail readers that show plain text. */
const plainText_ = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Which mail service to use. Whichever key you put into the script decides — no code change:
 *   Project Settings -> Script properties
 *     BREVO_KEY   a Brevo key   (free plan: 300 a day)   <- recommended
 *     RESEND_KEY  a Resend key  (free plan: 100 a day)
 *     neither     Gmail is used — 1,500 a day from a Workspace account, 100 from a personal one
 * If both keys are present, Brevo wins. Nothing here is ever written into the code repository.
 */
function prop_(name) {
  return (PropertiesService.getScriptProperties().getProperty(name) || '').trim();
}
function sender_() {
  if (prop_('BREVO_KEY')) return { via: 'Brevo', key: prop_('BREVO_KEY'), perDay: 300 };
  if (prop_('RESEND_KEY')) return { via: 'Resend', key: prop_('RESEND_KEY'), perDay: 100 };
  return { via: 'Gmail', key: '', perDay: 100 };
}

/** The from address split into the two pieces the services want. */
function fromParts_() {
  const m = /^(.*?)\s*<(.+)>$/.exec(FROM);
  return m ? { name: m[1], email: m[2] } : { name: 'CPCA Alumni Network', email: FROM };
}

/**
 * Send one message through whichever service is configured. Throws if it was not accepted —
 * the callers treat an ordinary error as "try this person again next run", and a SETUP error
 * as "stop everything", so a wrong key can never quietly skip all 125 people.
 */
function sendMail_(to, subject, html, attempt) {
  const s = sender_(), from = fromParts_();
  if (s.via === 'Gmail') {
    GmailApp.sendEmail(to, subject, plainText_(html), { name: from.name, replyTo: SUPPORT, htmlBody: html });
    return;
  }

  const req = s.via === 'Brevo'
    ? { url: 'https://api.brevo.com/v3/smtp/email',
        headers: { 'api-key': s.key, accept: 'application/json' },
        payload: { sender: from, to: [{ email: to }], replyTo: { email: SUPPORT },
                   subject: subject, htmlContent: html, textContent: plainText_(html) } }
    : { url: 'https://api.resend.com/emails',
        headers: { Authorization: 'Bearer ' + s.key },
        payload: { from: FROM, to: [to], reply_to: SUPPORT,
                   subject: subject, html: html, text: plainText_(html) } };

  const res = UrlFetchApp.fetch(req.url, {
    method: 'post', contentType: 'application/json', headers: req.headers,
    muteHttpExceptions: true, payload: JSON.stringify(req.payload),
  });
  const code = res.getResponseCode();
  if (code === 429 && (attempt || 0) < 2) {          // asked to slow down — wait, then try again
    Utilities.sleep(2000);
    return sendMail_(to, subject, html, (attempt || 0) + 1);
  }
  const text = res.getContentText().slice(0, 200);
  // 401/403 mean the key or the sending address is wrong, which is true for every recipient.
  // Say SETUP so the run stops at the first message instead of failing silently 125 times.
  // Brevo says 400 for a bad sender, Resend says 422 — treat both as a setup problem.
  if (code === 401 || code === 403 || ((code === 400 || code === 422) && /sender|domain|from|not valid/i.test(text))) {
    throw new Error('SETUP: ' + s.via + ' rejected the account (' + code + '): ' + text
      + '  — check the ' + s.via.toUpperCase() + '_KEY script property, and that ' + from.email
      + ' is on a domain verified inside ' + s.via + '.');
  }
  if (code >= 300) throw new Error(s.via + ' ' + code + ': ' + text);
  Utilities.sleep(550);                              // both services accept about two a second
}

/** True for a problem with the setup rather than with one recipient. */
const isSetupError_ = (err) => String((err && err.message) || err).indexOf('SETUP:') === 0;

/** A one-line description of how mail is being sent, for the reports below. */
function senderNote_() {
  const s = sender_();
  return s.via === 'Gmail'
    ? 'No mail-service key set — still sending through Gmail. Recipients left today: ' + MailApp.getRemainingDailyQuota() + '.'
    : 'Sending through ' + s.via + ' (' + s.perDay + ' a day on the free plan), up to ' + DAILY_CAP + ' a run.';
}

const SHELL = function (title, body, buttonText, footerNote) {
  return '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#14231c">'
    + '<div style="background:#0f3d2e;color:#fff;padding:20px 24px;border-radius:14px 14px 0 0">'
    + '<div style="font-size:19px;font-weight:600">CPCA Alumni Network</div>'
    + '<div style="font-size:12px;opacity:.75">C. P. College of Agriculture · SDAU</div></div>'
    + '<div style="border:1px solid #e4e0d4;border-top:0;border-radius:0 0 14px 14px;padding:24px">'
    + '<h2 style="margin:0 0 14px;font-size:20px">' + title + '</h2>' + body
    + '<p style="margin:24px 0 8px"><a href="' + PORTAL + '" style="background:#0f3d2e;color:#fff;padding:11px 22px;'
    + 'border-radius:999px;text-decoration:none;display:inline-block">' + buttonText + '</a></p>'
    + '<p style="font-size:12px;color:#5d6b63;margin-top:22px">' + (footerNote || DEFAULT_FOOTER)
    + ' Questions, or want to stop these emails? Reply to this message or write to '
    + '<a href="mailto:' + SUPPORT + '">' + SUPPORT + '</a>.</p></div></div>';
};

const DEFAULT_FOOTER = 'You are receiving this because you are a member of the CPCA Alumni Network.';
// The people with an unclaimed profile have never joined, so the line above would be untrue.
const INVITE_FOOTER = 'You are receiving this because you gave this email address when you answered the '
  + 'Gujarat agriculture alumni questionnaire.';

const escapeHtml_ = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Many alumni write their name with a title in front. Greeting them as "Hello Dr.," reads badly,
// so skip over anything that is plainly a title and take the first real name after it.
const TITLES = /^(dr|mr|mrs|ms|miss|prof|professor|shri|shree|smt|sri|er|ar|adv|capt|maj|col|late)\.?$/i;
function firstName_(full) {
  const words = String(full || '').trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (!TITLES.test(words[i].replace(/[.,]/g, ''))) return tidyCase_(words[i]);
  }
  return tidyCase_(words[0]) || 'there';   // nothing but titles — fall back rather than break
}

// Plenty of people typed their name in lower case on the form, and "Hello mayur," reads poorly.
// Only an all-lower-case word is touched, so McDonald, DeSouza and RK keep the spelling they chose.
function tidyCase_(word) {
  const w = String(word || '');
  return /^[a-z]+$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

// ── Job 1: email each new announcement ───────────────────────────────────────
/**
 * Everyone an announcement should reach: verified members, people who have signed in but are not
 * approved yet, and the alumni whose profile is still waiting to be claimed. One pass over the
 * profiles rather than calling the three separate helpers, which overlap and would read the same
 * contact cards twice.
 *
 * Each person is tagged with `kind` so the message can close with the right words — a reader who
 * has never signed in must not be told they are already a member.
 */
function announcementAudience_() {
  const profiles = query_({ structuredQuery: {
    from: [{ collectionId: 'profiles' }],
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: 2000,
  } });

  const wanted = [];
  profiles.forEach(function (p) {
    if (p.userId) wanted.push({ p: p, kind: p.status === 'approved' ? 'member' : 'pending' });
    else if (p.status === 'pending' && String(p.source || '').indexOf('questionnaire') >= 0) {
      wanted.push({ p: p, kind: 'unclaimed' });
    }
  });

  const out = [];
  for (let i = 0; i < wanted.length; i += 50) {
    const slice = wanted.slice(i, i + 50);
    const responses = UrlFetchApp.fetchAll(slice.map(function (w) {
      return { url: BASE + '/profiles/' + w.p._id + '/private/contact', headers: authHeaders_(), muteHttpExceptions: true };
    }));
    responses.forEach(function (res, n) {
      if (res.getResponseCode() !== 200) return;
      const c = docFields_(JSON.parse(res.getContentText()));
      if (c.email && String(c.email).indexOf('@') > 0) {
        out.push({ id: slice[n].p._id, kind: slice[n].kind, name: slice[n].p.fullName || 'Alumnus',
                   email: String(c.email).trim().toLowerCase() });
      }
    });
  }
  // One address only. A verified member wins over the same address sitting on an unclaimed profile.
  const rank = { member: 0, pending: 1, unclaimed: 2 };
  out.sort(function (a, b) { return rank[a.kind] - rank[b.kind]; });
  const seen = {};
  return out.filter(function (m) { if (seen[m.email]) return false; seen[m.email] = 1; return true; });
}

/** The closing paragraph and button, which differ by how far along the reader is. */
function audienceTail_(kind) {
  if (kind === 'unclaimed') {
    return { note: '<p style="background:#f6edcf;padding:14px;border-radius:10px;margin:18px 0 0">'
        + 'A profile is already waiting for you on the network. Sign in with this email address to claim it, '
        + 'check your details and add your photograph — there is no password.</p>',
      button: 'Claim my profile', footer: INVITE_FOOTER };
  }
  if (kind === 'pending') {
    return { note: '<p style="background:#f6edcf;padding:14px;border-radius:10px;margin:18px 0 0">'
        + 'Your profile is not in the directory yet. Sign in, open <strong>My profile</strong> and add the degree '
        + 'you earned at C. P. College of Agriculture, and an administrator can approve you.</p>',
      button: 'Complete my profile', footer: DEFAULT_FOOTER };
  }
  return { note: '', button: 'Open the portal', footer: DEFAULT_FOOTER };
}

// An announcement that can never finish — a handful of dead addresses that always throw — would
// otherwise be retried every hour for ever, re-reading every profile each time. Let it go after
// this many days and mark it sent.
const ANNOUNCEMENT_MAX_DAYS = 14;

function sendQueuedAnnouncements() {
  // Read the newest announcements and pick the unsent ones here. (Firestore's REST API needs a
  // special "is null" filter for null fields, and getting that subtly wrong silently matches
  // nothing — filtering in code is plainer and cannot fail quietly.)
  const queued = query_({ structuredQuery: {
    from: [{ collectionId: 'announcements' }],
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: 20,
  } }).filter(function (a) { return a.emailQueuedAt && !a.emailSentAt; }).slice(0, 5);

  if (!queued.length) return 'nothing queued';
  // Everyone with an address on file, not only approved members: an announcement is also the thing
  // most likely to bring the people who have not finished joining back to the portal.
  const members = announcementAudience_();
  let report = [];

  queued.forEach(function (a) {
    const already = a.emailSentTo || [];
    const todo = members.filter(function (m) { return already.indexOf(m.email) === -1; }).slice(0, DAILY_CAP);
    const bodyHtml = escapeHtml_(a.body).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
    todo.forEach(function (m) {
      try {
        const tail = audienceTail_(m.kind);
        sendMail_(m.email, a.title,
          SHELL(escapeHtml_(a.title), '<p>' + bodyHtml + '</p>' + tail.note, tail.button, tail.footer));
        already.push(m.email);
      } catch (err) { if (isSetupError_(err)) throw err; /* a bad address — the rest go next run */ }
    });
    const tooOld = (Date.now() - (a.createdAt || Date.now())) > ANNOUNCEMENT_MAX_DAYS * 86400000;
    const done = already.length >= members.length || tooOld;
    patch_('announcements/' + a._id,
      done ? { emailSentAt: numField_(Date.now()), emailSentTo: { arrayValue: { values: already.map(function (e) { return { stringValue: e }; }) } } }
           : { emailSentTo: { arrayValue: { values: already.map(function (e) { return { stringValue: e }; }) } } },
      done ? ['emailSentAt', 'emailSentTo'] : ['emailSentTo']);
    report.push(a.title + ': ' + already.length + '/' + members.length + (done ? ' (complete)' : ' (continues next run)'));
  });
  return report.join(' | ');
}

// ── Job 2: weekly nudge for unfinished profiles ──────────────────────────────
function missingBits_(p) {
  const gaps = [];
  if (!(p.education || []).length) gaps.push('the degree you earned and your pass-out year');
  if (!p.campus) gaps.push('your college or campus');
  if (!p.profession) gaps.push('what you do now');
  if (!p.location) gaps.push('where you live or work');
  if (!p.photoUrl) gaps.push('a photograph');
  if (!p.headline) gaps.push('a one-line headline');
  return gaps;
}

function sendWeeklyReminders() {
  const members = approvedMembers_();
  const now = Date.now(), gap = REMINDER_GAP_DAYS * 86400000;
  const due = members
    .map(function (m) { return { m: m, gaps: missingBits_(m.profile) }; })
    .filter(function (x) { return x.gaps.length >= 2 && (now - (x.m.lastReminderAt || 0)) > gap; })
    .slice(0, DAILY_CAP);

  let sent = 0;
  due.forEach(function (x) {
    const list = '<ul style="padding-left:18px;margin:12px 0">' + x.gaps.map(function (g) { return '<li>' + g + '</li>'; }).join('') + '</ul>';
    const body = '<p>Your profile on the alumni network is still missing a few things. Signing in takes a moment — '
      + 'no password, just your email or Google account — and a fuller profile means batchmates can actually find you.</p>'
      + '<p style="margin-bottom:0"><strong>Still to add:</strong></p>' + list;
    try {
      sendMail_(x.m.email, 'Finish your CPCA Alumni profile — it takes two minutes',
                SHELL('Hello ' + escapeHtml_(firstName_(x.m.name)) + ',', body, 'Complete my profile'));
      patch_('profiles/' + x.m.id + '/private/contact', { lastReminderAt: numField_(now) }, ['lastReminderAt']);
      sent++;
    } catch (err) { if (isSetupError_(err)) throw err; /* a bad address — the rest go next week */ }
  });
  return 'reminders sent: ' + sent + ' of ' + due.length + ' due (' + members.length + ' members checked)';
}

// ── Setup, run once from the editor ──────────────────────────────────────────
function setUpTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  // Hourly, not every ten minutes. While an announcement is only part-sent, each run re-reads
  // every member and their contact card — about 315 database reads. Six runs an hour came to
  // roughly 45,000 reads a day, which is almost the whole free Firebase allowance of 50,000 and
  // was starving the website itself. Hourly costs a sixth of that, and an announcement still
  // reaches everyone the same day.
  ScriptApp.newTrigger('sendQueuedAnnouncements').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('sendWeeklyReminders').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(10).create();
  ScriptApp.newTrigger('sendPendingNudge').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(10).create();
  ScriptApp.newTrigger('sendClaimInvites').timeBased().onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(10).create();
  return 'Triggers set: announcements hourly, profile reminders Tuesdays, claim invitations Wednesdays, '
       + 'nudges to people awaiting approval Fridays.';
}

/** Safe check — reads the database and counts recipients, sends nothing. */
function testConnection() {
  const members = approvedMembers_();
  const incomplete = members.filter(function (m) { return missingBits_(m.profile).length >= 2; });
  const msg = 'Connected. ' + members.length + ' members with an email address; '
            + incomplete.length + ' have an incomplete profile. ' + senderNote_();
  Logger.log(msg);
  return msg;
}

// ── Job 3: the people stuck before approval ─────────────────────────────────
/**
 * Everyone who has signed in but is still waiting for approval — usually because they never
 * said which college and batch they belong to, which is what an administrator checks.
 * The weekly reminder deliberately skips these people (it only emails approved members),
 * so they need their own note.
 */
function pendingMembers_() {
  const profiles = query_({ structuredQuery: {
    from: [{ collectionId: 'profiles' }],
    where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } },
    limit: 2000,
  } }).filter(function (p) { return p.userId; });   // only people who actually signed in

  const out = [];
  for (let i = 0; i < profiles.length; i += 50) {
    const slice = profiles.slice(i, i + 50);
    const responses = UrlFetchApp.fetchAll(slice.map(function (p) {
      return { url: BASE + '/profiles/' + p._id + '/private/contact', headers: authHeaders_(), muteHttpExceptions: true };
    }));
    responses.forEach(function (res, n) {
      if (res.getResponseCode() !== 200) return;
      const c = docFields_(JSON.parse(res.getContentText()));
      if (c.email && c.email.indexOf('@') > 0) {
        out.push({ id: slice[n]._id, name: slice[n].fullName || 'Alumnus',
                   email: String(c.email).trim().toLowerCase(), profile: slice[n], lastNudgeAt: c.lastNudgeAt || 0 });
      }
    });
  }
  const seen = {};
  return out.filter(function (m) { if (seen[m.email]) return false; seen[m.email] = 1; return true; });
}

function sendPendingNudge() {
  const now = Date.now(), gap = REMINDER_GAP_DAYS * 86400000;
  const due = pendingMembers_().filter(function (m) { return (now - (m.lastNudgeAt || 0)) > gap; }).slice(0, DAILY_CAP);
  let sent = 0;
  due.forEach(function (m) {
    const body = '<p>Thank you for joining the CPCA Alumni Network. Your profile is not in the directory yet, '
      + 'because we still need one thing from you:</p>'
      + '<p style="background:#f6edcf;padding:14px;border-radius:10px;margin:14px 0">'
      + '<strong>Your college and your batch</strong> — the degree you earned at C. P. College of Agriculture, '
      + 'and the year you passed out.</p>'
      + '<p>That is how an administrator confirms you really are a CPCA alumnus. Sign in — no password, just your '
      + 'email or Google account — open <strong>My profile</strong>, then <strong>CPCA &amp; education</strong>, '
      + 'and add your degree. Approval usually follows within a day, and your profile then appears in the directory '
      + 'alongside your batchmates.</p>';
    try {
      sendMail_(m.email, 'One step left to join the CPCA Alumni directory',
                SHELL('Hello ' + escapeHtml_(firstName_(m.name)) + ',', body, 'Add my college and batch'));
      patch_('profiles/' + m.id + '/private/contact', { lastNudgeAt: numField_(now) }, ['lastNudgeAt']);
      sent++;
    } catch (err) { if (isSetupError_(err)) throw err; /* a bad address — the rest go on the next run */ }
  });
  return 'nudged ' + sent + ' of ' + due.length + ' people waiting for approval';
}

// ── Job 4: invite the people whose profile is waiting to be claimed ─────────
/**
 * Alumni who answered the 2025 questionnaire. A profile was prepared for each of them and is
 * hidden from the public; it becomes theirs the moment they sign in with the same email address.
 * They have never signed in, so nothing else in this mailer reaches them.
 */
function unclaimedProfiles_() {
  const profiles = query_({ structuredQuery: {
    from: [{ collectionId: 'profiles' }],
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: 2000,
  } }).filter(function (p) {
    return !p.userId && p.status === 'pending' && String(p.source || '').indexOf('questionnaire') >= 0;
  });

  const out = [];
  for (let i = 0; i < profiles.length; i += 50) {
    const slice = profiles.slice(i, i + 50);
    const responses = UrlFetchApp.fetchAll(slice.map(function (p) {
      return { url: BASE + '/profiles/' + p._id + '/private/contact', headers: authHeaders_(), muteHttpExceptions: true };
    }));
    responses.forEach(function (res, n) {
      if (res.getResponseCode() !== 200) return;
      const c = docFields_(JSON.parse(res.getContentText()));
      if (c.email && c.email.indexOf('@') > 0) {
        out.push({ id: slice[n]._id, profile: slice[n], name: slice[n].fullName || 'Alumnus',
                   email: String(c.email).trim().toLowerCase(), lastInviteAt: c.lastInviteAt || 0 });
      }
    });
  }
  const seen = {};
  return out.filter(function (m) { if (seen[m.email]) return false; seen[m.email] = 1; return true; });
}

/** The details the questionnaire gave us, written back to the person so they recognise them. */
function knownDetails_(p) {
  const rows = [];
  const degree = (p.education || []).map(function (e) {
    return [e.level, e.program, e.endYear].filter(Boolean).join(' ');
  }).filter(Boolean);
  if (degree.length) rows.push(['Degree', degree.join('; ')]);
  if (p.campus) rows.push(['College', p.campus]);
  if (p.batchYear) rows.push(['Batch', String(p.batchYear)]);
  if (p.profession) rows.push(['Profession', p.professionDetail || p.profession]);
  if (p.location) rows.push(['Place', p.location]);
  if (!rows.length) return '';
  return '<table style="border-collapse:collapse;margin:14px 0;font-size:14px">'
    + rows.map(function (r) {
        return '<tr><td style="padding:4px 14px 4px 0;color:#5d6b63;vertical-align:top">' + escapeHtml_(r[0])
             + '</td><td style="padding:4px 0"><strong>' + escapeHtml_(r[1]) + '</strong></td></tr>';
      }).join('')
    + '</table>';
}

function sendClaimInvites() {
  const now = Date.now(), gap = REMINDER_GAP_DAYS * 86400000;
  const due = unclaimedProfiles_().filter(function (m) { return (now - (m.lastInviteAt || 0)) > gap; }).slice(0, DAILY_CAP);
  let sent = 0;
  due.forEach(function (m) {
    const body = '<p>When you filled in the Gujarat agriculture alumni questionnaire, you gave us your details. '
      + 'A profile has been prepared for you on the CPCA Alumni Network and it is <strong>waiting for you to claim it</strong>.</p>'
      + '<p>Here is what we hold for you:</p>'
      + knownDetails_(m.profile)
      + '<p>It is <strong>not visible to anyone</strong> yet. Sign in with this same email address — '
      + '<strong>' + escapeHtml_(m.email) + '</strong> — and the profile becomes yours: correct anything that is wrong, '
      + 'add your photograph and your work, and decide who may see your phone number.</p>'
      + '<p>There is no password. Choose "Continue with Google" or ask for a sign-in link by email.</p>';
    try {
      sendMail_(m.email, 'Your CPCA Alumni profile is ready to claim',
                SHELL('Hello ' + escapeHtml_(firstName_(m.name)) + ',', body, 'Claim my profile', INVITE_FOOTER));
      patch_('profiles/' + m.id + '/private/contact', { lastInviteAt: numField_(now) }, ['lastInviteAt']);
      sent++;
    } catch (err) { if (isSetupError_(err)) throw err; /* a bad address — the rest go on the next run */ }
  });
  return 'invited ' + sent + ' of ' + due.length + ' people with an unclaimed profile';
}

/** Counts only — sends nothing. Shows what each job would do and the quota left. */
function previewAll() {
  const audience = announcementAudience_();
  const count = function (k) { return audience.filter(function (m) { return m.kind === k; }).length; };
  const msg = [
    'An announcement now reaches ' + audience.length + ' people'
      + ' (' + count('member') + ' verified, ' + count('pending') + ' awaiting approval, '
      + count('unclaimed') + ' not yet claimed)',
    'Unclaimed profiles to invite: ' + unclaimedProfiles_().length,
    'Signed in but awaiting approval: ' + pendingMembers_().length,
    'Approved members: ' + approvedMembers_().length,
    senderNote_(),
  ].join(' | ');
  Logger.log(msg);
  return msg;
}

/** One-off check: emails only this portal's own address, never the members. */
function sendTestToSelf() {
  sendMail_(SUPPORT, 'Test — the CPCA Alumni mailer is working',
    SHELL('The mailer is connected',
      '<p>This is a test sent from the portal to itself. If you can read this, announcements and the weekly profile reminders will reach members correctly.</p>',
      'Open the portal'));
  return 'sent to ' + SUPPORT;
}

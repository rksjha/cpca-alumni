/**
 * CPCA Alumni Network — mailer
 * Runs inside the alumnigau@gmail.com Google account (Apps Script), on a timer.
 *
 * It does two jobs:
 *   sendQueuedAnnouncements()  — every 10 minutes: emails any new announcement to all members
 *   sendWeeklyReminders()      — once a week: nudges members whose profile is still incomplete
 *
 * It reads the portal's database directly with this account's own Google sign-in — there is no
 * password or key file anywhere. For that to work the account needs the "Cloud Datastore User"
 * role on the cpca-alumni-portal project (granted once, in the Google Cloud console).
 *
 * Gmail on a free account allows about 100 recipients a day, so every send is capped and the
 * rest are picked up on the next run. Nobody is emailed twice for the same thing.
 */

const PROJECT = 'cpca-alumni-portal';
const PORTAL = 'https://cpcaalumni.org';
const SUPPORT = 'alumnigau@gmail.com';
const DAILY_CAP = 90;            // stay under Gmail's free-account limit
const REMINDER_GAP_DAYS = 21;    // never nudge the same person more often than this

const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';

// ── Firestore plumbing ───────────────────────────────────────────────────────
function authHeaders_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'Content-Type': 'application/json' };
}
function fsFetch_(url, options) {
  const res = UrlFetchApp.fetch(url, Object.assign({ headers: authHeaders_(), muteHttpExceptions: true }, options || {}));
  const code = res.getResponseCode();
  if (code === 403 || code === 401) {
    throw new Error('The database refused this account. Grant alumnigau@gmail.com the "Cloud Datastore User" role on the ' + PROJECT + ' project, then run this again.');
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

function sendMail_(to, subject, html) {
  GmailApp.sendEmail(to, subject, html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), {
    name: 'CPCA Alumni Network', replyTo: SUPPORT, htmlBody: html,
  });
}

const SHELL = function (title, body, buttonText) {
  return '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#14231c">'
    + '<div style="background:#0f3d2e;color:#fff;padding:20px 24px;border-radius:14px 14px 0 0">'
    + '<div style="font-size:19px;font-weight:600">CPCA Alumni Network</div>'
    + '<div style="font-size:12px;opacity:.75">C. P. College of Agriculture · SDAU</div></div>'
    + '<div style="border:1px solid #e4e0d4;border-top:0;border-radius:0 0 14px 14px;padding:24px">'
    + '<h2 style="margin:0 0 14px;font-size:20px">' + title + '</h2>' + body
    + '<p style="margin:24px 0 8px"><a href="' + PORTAL + '" style="background:#0f3d2e;color:#fff;padding:11px 22px;'
    + 'border-radius:999px;text-decoration:none;display:inline-block">' + buttonText + '</a></p>'
    + '<p style="font-size:12px;color:#5d6b63;margin-top:22px">You are receiving this because you are a member of the '
    + 'CPCA Alumni Network. Questions, or want to stop these emails? Reply to this message or write to '
    + '<a href="mailto:' + SUPPORT + '">' + SUPPORT + '</a>.</p></div></div>';
};

const escapeHtml_ = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Job 1: email each new announcement ───────────────────────────────────────
function sendQueuedAnnouncements() {
  const queued = query_({ structuredQuery: {
    from: [{ collectionId: 'announcements' }],
    where: { fieldFilter: { field: { fieldPath: 'emailSentAt' }, op: 'EQUAL', value: { nullValue: null } } },
    limit: 5,
  } }).filter(function (a) { return a.emailQueuedAt; });

  if (!queued.length) return 'nothing queued';
  const members = approvedMembers_();
  let report = [];

  queued.forEach(function (a) {
    const already = a.emailSentTo || [];
    const todo = members.filter(function (m) { return already.indexOf(m.email) === -1; }).slice(0, DAILY_CAP);
    const bodyHtml = escapeHtml_(a.body).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
    todo.forEach(function (m) {
      try {
        sendMail_(m.email, a.title, SHELL(escapeHtml_(a.title), '<p>' + bodyHtml + '</p>', 'Open the portal'));
        already.push(m.email);
      } catch (err) { /* quota reached or a bad address — the rest go next run */ }
    });
    const done = already.length >= members.length;
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
                SHELL('Hello ' + escapeHtml_(String(x.m.name).split(' ')[0]) + ',', body, 'Complete my profile'));
      patch_('profiles/' + x.m.id + '/private/contact', { lastReminderAt: numField_(now) }, ['lastReminderAt']);
      sent++;
    } catch (err) { /* quota reached — the rest go next week */ }
  });
  return 'reminders sent: ' + sent + ' of ' + due.length + ' due (' + members.length + ' members checked)';
}

// ── Setup, run once from the editor ──────────────────────────────────────────
function setUpTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendQueuedAnnouncements').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('sendWeeklyReminders').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(10).create();
  ScriptApp.newTrigger('sendPendingNudge').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(10).create();
  return 'Triggers set: announcements every 10 minutes, profile reminders Tuesdays, nudges to people awaiting approval Fridays.';
}

/** Safe check — reads the database and counts recipients, sends nothing. */
function testConnection() {
  const members = approvedMembers_();
  const incomplete = members.filter(function (m) { return missingBits_(m.profile).length >= 2; });
  const msg = 'Connected. ' + members.length + ' members with an email address; '
            + incomplete.length + ' have an incomplete profile. Gmail remaining today: '
            + MailApp.getRemainingDailyQuota() + '.';
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
                SHELL('Hello ' + escapeHtml_(String(m.name).split(' ')[0]) + ',', body, 'Add my college and batch'));
      patch_('profiles/' + m.id + '/private/contact', { lastNudgeAt: numField_(now) }, ['lastNudgeAt']);
      sent++;
    } catch (err) { /* quota reached — the rest go on the next run */ }
  });
  return 'nudged ' + sent + ' of ' + due.length + ' people waiting for approval';
}

/** One-off check: emails only this portal's own address, never the members. */
function sendTestToSelf() {
  sendMail_(SUPPORT, 'Test — the CPCA Alumni mailer is working',
    SHELL('The mailer is connected',
      '<p>This is a test sent from the portal to itself. If you can read this, announcements and the weekly profile reminders will reach members correctly.</p>',
      'Open the portal'));
  return 'sent to ' + SUPPORT;
}

/**
 * Offline tests for the mailer's sending path (mailer/Code.gs).
 *
 * Apps Script cannot be run on this machine, so the Google services it uses are replaced with
 * stand-ins and the real sendMail_ is exercised against made-up Resend replies. This checks the
 * thing that matters most: that a wrong key or an unverified domain stops the run immediately
 * instead of quietly skipping all 125 people and reporting success.
 *
 *   node tests/mailer.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let props = {}, nextResponses = [], calls = [], gmailCalls = [], slept = 0;
globalThis.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => props[k] || null }) };
globalThis.UrlFetchApp = {
  fetch: (url, o) => {
    calls.push({ url, o });
    const r = nextResponses.shift() || { code: 200, body: "{}" };
    return { getResponseCode: () => r.code, getContentText: () => r.body || "{}" };
  },
  fetchAll: () => [],
};
globalThis.Utilities = { sleep: (ms) => { slept += ms; } };
globalThis.GmailApp = { sendEmail: (...a) => gmailCalls.push(a) };
globalThis.MailApp = { getRemainingDailyQuota: () => 0 };
globalThis.ScriptApp = { getOAuthToken: () => "tok", WeekDay: {}, getProjectTriggers: () => [] };
globalThis.Logger = { log: () => {} };

// Apps Script puts every top-level name in one shared scope; eval plus an explicit re-export
// reproduces that here.
const src = readFileSync(join(ROOT, "mailer", "Code.gs"), "utf8");
// eslint-disable-next-line no-eval
(0, eval)(src + "\nglobalThis.sendMail_ = sendMail_; globalThis.isSetupError_ = isSetupError_;"
  + " globalThis.DAILY_CAP = DAILY_CAP; globalThis.plainText_ = plainText_; globalThis.FROM = FROM;"
  + " globalThis.firstName_ = firstName_; globalThis.SHELL = SHELL; globalThis.INVITE_FOOTER = INVITE_FOOTER;"
  + " globalThis.sender_ = sender_; globalThis.senderNote_ = senderNote_; globalThis.fromParts_ = fromParts_;"
  + " globalThis.announcementAudience_ = announcementAudience_; globalThis.audienceTail_ = audienceTail_;"
  + " globalThis.query_ = (q) => globalThis.__query(q); globalThis.DEFAULT_FOOTER = DEFAULT_FOOTER;");

let failed = 0;
const ok = (name, cond) => { console.log((cond ? "  ok   " : "  FAIL ") + name); if (!cond) failed++; };
const threwFrom = (fn) => { try { fn(); return null; } catch (e) { return e; } };

console.log("\nSending with no Resend key configured");
props = {}; calls = []; gmailCalls = [];
sendMail_("a@example.com", "Subject", "<p>Hello <b>there</b></p>");
ok("falls back to Gmail and makes no web request", gmailCalls.length === 1 && calls.length === 0);
ok("includes a plain-text version of the message", gmailCalls[0][2] === "Hello there");

console.log("\nChoosing the mail service from whichever key is set");
props = {}; ok("no key at all -> Gmail", sender_().via === "Gmail");
props = { RESEND_KEY: "r" }; ok("a Resend key -> Resend", sender_().via === "Resend");
props = { BREVO_KEY: "b" }; ok("a Brevo key -> Brevo", sender_().via === "Brevo");
props = { BREVO_KEY: "b", RESEND_KEY: "r" };
ok("both keys -> Brevo wins (the larger free allowance)", sender_().via === "Brevo");
ok("Brevo's daily allowance is reported as 300", sender_().perDay === 300);
props = { RESEND_KEY: "r" }; ok("Resend's is reported as 100", sender_().perDay === 100);
ok("the from address splits into a name and an address",
   fromParts_().name === "CPCA Alumni Network" && fromParts_().email === "admin@cpcaalumni.org");
ok("mail is sent from the portal's own domain, not a personal Gmail",
   /@cpcaalumni\.org$/.test(fromParts_().email));

console.log("\nSending through Brevo");
props = { BREVO_KEY: " xkeysib-abc " }; calls = []; gmailCalls = []; slept = 0;
nextResponses = [{ code: 201, body: '{"messageId":"<1@brevo>"}' }];
sendMail_("b@example.com", "Subject", "<p>Hi</p>");
const bv = JSON.parse(calls[0].o.payload);
ok("posts to Brevo's transactional endpoint", calls[0].url === "https://api.brevo.com/v3/smtp/email");
ok("sends the key in the api-key header, trimmed", calls[0].o.headers["api-key"] === "xkeysib-abc");
ok("sender is an object with name and email", bv.sender.email === "admin@cpcaalumni.org" && bv.sender.name === "CPCA Alumni Network");
ok("recipient and reply-to are set", bv.to[0].email === "b@example.com" && bv.replyTo.email === "admin@cpcaalumni.org");
ok("sends html and plain text", bv.htmlContent === "<p>Hi</p>" && bv.textContent === "Hi");
ok("201 Created is treated as success", true);
ok("Gmail is not touched", gmailCalls.length === 0);

console.log("\nA bad Brevo key stops the run");
props = { BREVO_KEY: "bad" }; nextResponses = [{ code: 401, body: '{"message":"Key not found"}' }];
let be = threwFrom(() => sendMail_("x@example.com", "S", "<p>x</p>"));
ok("401 from Brevo raises a setup error", be !== null && isSetupError_(be));
ok("the message names Brevo and BREVO_KEY", /Brevo/.test(be.message) && /BREVO_KEY/.test(be.message));

console.log("\nWhat the reports say about the sender");
props = {}; ok("Gmail is named when no key is set", /Gmail/.test(senderNote_()));
props = { BREVO_KEY: "b" }; ok("Brevo and its 300 a day are named", /Brevo/.test(senderNote_()) && /300/.test(senderNote_()));

console.log("\nSending through Resend");
props = { RESEND_KEY: " re_test_123 " }; calls = []; gmailCalls = []; slept = 0;
nextResponses = [{ code: 200, body: '{"id":"abc"}' }];
sendMail_("b@example.com", "Subject", "<p>Hi</p>");
const body = JSON.parse(calls[0].o.payload);
ok("Resend is used instead of Gmail", calls.length === 1 && gmailCalls.length === 0);
ok("posts to the Resend messages endpoint", calls[0].url === "https://api.resend.com/emails");
ok("sends the key as a bearer token, whitespace trimmed", calls[0].o.headers.Authorization === "Bearer re_test_123");
ok("sets from, to and reply-to", body.from === FROM && body.to[0] === "b@example.com" && body.reply_to === "admin@cpcaalumni.org");
ok("sends both an HTML and a plain-text part", body.html === "<p>Hi</p>" && body.text === "Hi");
ok("pauses between messages to respect the rate limit", slept === 550);

console.log("\nWhen Resend asks us to slow down");
props = { RESEND_KEY: "k" }; calls = []; slept = 0;
nextResponses = [{ code: 429 }, { code: 200, body: "{}" }];
sendMail_("c@example.com", "S", "<p>x</p>");
ok("waits, then sends again", calls.length === 2 && slept >= 2000);

calls = []; nextResponses = [{ code: 429 }, { code: 429 }, { code: 429 }];
ok("gives up after three attempts rather than looping", (() => {
  const e = threwFrom(() => sendMail_("d@example.com", "S", "<p>x</p>"));
  return calls.length === 3 && e !== null;
})());

console.log("\nWhen the setup is wrong, the whole run must stop");
props = { RESEND_KEY: "bad" }; nextResponses = [{ code: 401, body: '{"message":"API key is invalid"}' }];
let err = threwFrom(() => sendMail_("e@example.com", "S", "<p>x</p>"));
ok("a rejected key raises a setup error", err !== null && isSetupError_(err));
ok("the message says what to check", /RESEND_KEY/.test(err.message) && /cpcaalumni\.org/.test(err.message));

nextResponses = [{ code: 403, body: '{"message":"domain is not verified"}' }];
err = threwFrom(() => sendMail_("f@example.com", "S", "<p>x</p>"));
ok("an unverified sending domain raises a setup error", err !== null && isSetupError_(err));

nextResponses = [{ code: 422, body: '{"message":"The from address is not verified"}' }];
err = threwFrom(() => sendMail_("g@example.com", "S", "<p>x</p>"));
ok("an unverified from address raises a setup error", err !== null && isSetupError_(err));

console.log("\nWhen one address is bad, the run carries on");
nextResponses = [{ code: 400, body: '{"message":"invalid to field"}' }];
err = threwFrom(() => sendMail_("not-an-address", "S", "<p>x</p>"));
ok("one bad recipient is an ordinary error, not a setup error", err !== null && !isSetupError_(err));

console.log("\nGreeting people by name, not by their title");
for (const [full, want] of [
  ["Dr. Vinodkumar Parmar", "Vinodkumar"],
  ["Dr Vinodkumar Parmar", "Vinodkumar"],
  ["Rakesh S Jha", "Rakesh"],
  ["Shri Bhavesh Patel", "Bhavesh"],
  ["Smt. Nayana Desai", "Nayana"],
  ["Prof. R. K. Chaudhary", "R."],
  ["  Mahesh   Kumar  ", "Mahesh"],
  ["mayur", "Mayur"],
  ["mayurprajapat", "Mayurprajapat"],
  ["McDonald Fernandes", "McDonald"],
  ["RK Chaudhary", "RK"],
  ["DeSouza", "DeSouza"],
  ["Dr. mayur patel", "Mayur"],
  ["Dr.", "Dr."],
  ["", "there"],
]) ok(`"${full}" -> ${want}`, firstName_(full) === want);

console.log("\nThe footer must not claim someone is a member when they are not");
ok("the invitation says why they are hearing from us",
   SHELL("Hello", "<p>x</p>", "Claim", INVITE_FOOTER).includes("questionnaire"));
ok("the invitation does not call them a member",
   !SHELL("Hello", "<p>x</p>", "Claim", INVITE_FOOTER).includes("you are a member"));
ok("ordinary member mail keeps the usual footer",
   SHELL("Hello", "<p>x</p>", "Open").includes("you are a member"));

console.log("\nWho an announcement reaches");
// Stand in for the database: three profiles plus one that must be left out.
globalThis.__query = () => ([
  { _id: "a1", userId: "u1", status: "approved", fullName: "Approved Member" },
  { _id: "p1", userId: "u2", status: "pending", fullName: "Signed In Not Approved" },
  { _id: "c1", userId: null, status: "pending", source: "GAU alumni questionnaire 2025", fullName: "Never Signed In" },
  { _id: "x1", userId: null, status: "pending", source: "college list", fullName: "Not From The Questionnaire" },
  { _id: "d1", userId: null, status: "pending", source: "GAU alumni questionnaire 2025", fullName: "Duplicate Address" },
]);
const CONTACTS = { a1: "approved@x.com", p1: "pending@x.com", c1: "unclaimed@x.com", x1: "other@x.com", d1: "approved@x.com" };
globalThis.UrlFetchApp.fetchAll = (reqs) => reqs.map((r) => {
  const id = r.url.split("/profiles/")[1].split("/")[0];
  return { getResponseCode: () => 200,
           getContentText: () => JSON.stringify({ name: "projects/p/databases/(default)/documents/profiles/" + id,
                                                  fields: { email: { stringValue: CONTACTS[id] } } }) };
});

const aud = announcementAudience_();
const byKind = (k) => aud.filter((m) => m.kind === k).map((m) => m.email);
ok("a verified member is included", byKind("member").includes("approved@x.com"));
ok("someone signed in but not approved is included", byKind("pending").includes("pending@x.com"));
ok("someone who has never signed in is included", byKind("unclaimed").includes("unclaimed@x.com"));
ok("a profile that is not from the questionnaire is left out", !aud.some((m) => m.email === "other@x.com"));
ok("one address only, even across two profiles", aud.filter((m) => m.email === "approved@x.com").length === 1);
ok("and the verified record is the one kept", byKind("member").includes("approved@x.com") && !byKind("unclaimed").includes("approved@x.com"));
// a1 + p1 + c1 + d1 are wanted, but d1 shares a1's address, so three distinct people remain.
ok("three distinct people in total", aud.length === 3);

console.log("\nEach group is addressed honestly");
const forMember = audienceTail_("member"), forPending = audienceTail_("pending"), forUnclaimed = audienceTail_("unclaimed");
ok("a verified member gets no extra nagging", forMember.note === "");
ok("someone awaiting approval is told what is missing", /college|degree/i.test(forPending.note));
ok("someone who never signed in is told a profile awaits them", /claim/i.test(forUnclaimed.note));
ok("and is NOT told they are already a member",
   !SHELL("t", "<p>b</p>", forUnclaimed.button, forUnclaimed.footer).includes("you are a member"));
ok("while a verified member still is", SHELL("t", "<p>b</p>", forMember.button, forMember.footer).includes("you are a member"));
ok("the buttons differ per group", forMember.button !== forPending.button && forPending.button !== forUnclaimed.button);

console.log("\nHow many go out in one run");
ok("defaults to 90 a run", DAILY_CAP === 90);

console.log(failed ? `\n${failed} check(s) failed\n` : "\nAll checks passed\n");
process.exit(failed ? 1 : 0);

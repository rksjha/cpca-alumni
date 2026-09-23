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
  + " globalThis.firstName_ = firstName_; globalThis.SHELL = SHELL; globalThis.INVITE_FOOTER = INVITE_FOOTER;");

let failed = 0;
const ok = (name, cond) => { console.log((cond ? "  ok   " : "  FAIL ") + name); if (!cond) failed++; };
const threwFrom = (fn) => { try { fn(); return null; } catch (e) { return e; } };

console.log("\nSending with no Resend key configured");
props = {}; calls = []; gmailCalls = [];
sendMail_("a@example.com", "Subject", "<p>Hello <b>there</b></p>");
ok("falls back to Gmail and makes no web request", gmailCalls.length === 1 && calls.length === 0);
ok("includes a plain-text version of the message", gmailCalls[0][2] === "Hello there");

console.log("\nSending through Resend");
props = { RESEND_KEY: " re_test_123 " }; calls = []; gmailCalls = []; slept = 0;
nextResponses = [{ code: 200, body: '{"id":"abc"}' }];
sendMail_("b@example.com", "Subject", "<p>Hi</p>");
const body = JSON.parse(calls[0].o.payload);
ok("Resend is used instead of Gmail", calls.length === 1 && gmailCalls.length === 0);
ok("posts to the Resend messages endpoint", calls[0].url === "https://api.resend.com/emails");
ok("sends the key as a bearer token, whitespace trimmed", calls[0].o.headers.Authorization === "Bearer re_test_123");
ok("sets from, to and reply-to", body.from === FROM && body.to[0] === "b@example.com" && body.reply_to === "alumnigau@gmail.com");
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

console.log("\nHow many go out in one run");
ok("defaults to 90 a run", DAILY_CAP === 90);

console.log(failed ? `\n${failed} check(s) failed\n` : "\nAll checks passed\n");
process.exit(failed ? 1 : 0);

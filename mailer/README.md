# The mailer — setting it up once

This sends the portal's emails. It is a Google Apps Script, so it lives inside the
**alumnigau@gmail.com** account: no server, no monthly cost, no password stored anywhere.

Mail leaves through **Brevo** or **Resend** — whichever key you put into the script decides, with
no code change. If neither is set it falls back to Gmail, so it always works.

| | Free plan | Cost after that | Good for |
|---|---|---|---|
| **Brevo** (recommended) | **300 a day** | ₹625/mo for 5,000/mo | announcements *and* reminders |
| Resend | 100 a day, 3,000/mo | $20/mo, no daily limit | mostly transactional |
| Gmail | ~100 a day | — | a stop-gap only |

Brevo is the recommendation: 300 a day sends an announcement to the whole network in one go, it
handles both broadcast and transactional mail, and it costs nothing at CPCA's volume.

## What it does
- **Announcements** — every 10 minutes it looks for a new announcement posted on the portal with
  "email this to members" ticked, and sends it to every approved member. Nobody is emailed twice.
- **Weekly reminders** — every Tuesday morning it emails members whose profile is still missing two
  or more things, listing exactly what to add. The same person is never nudged more than once every
  three weeks.

## Setting up the mail service (once)

Only you can do these — they need an account and a secret key, and I will not handle either.

1. **Create a Brevo account** at https://www.brevo.com (free, no card).
2. **Verify the domain** `cpcaalumni.org` — Brevo shows the DNS records to add. Add them in
   Cloudflare under the cpcaalumni.org domain, DNS tab. Verification takes a few minutes.
   *(Ask me and I will add the records for you; you just approve them.)*
3. **Create an API key** in Brevo (SMTP & API -> API keys -> Generate). Copy it.
4. **Put the key into the script**, never into the code: open the script ->
   **Project Settings** -> **Script properties** -> Add property ->
   name `BREVO_KEY`, value the key -> Save.
   *(For Resend instead, everything is the same but the property is named `RESEND_KEY`.)*
5. **Raise the run size.** Add a second property `DAILY_CAP` with the value `280`, so a whole
   announcement goes out in one run rather than three.
6. **Prove it works.** Run `sendTestToSelf` — it emails only alumnigau@gmail.com and nobody else.

If something is wrong with the key or the domain, the mailer now **stops at the first message**
with a note saying so, instead of quietly skipping everybody.

### If the network outgrows the free plan
Brevo free is 300 a day. Beyond that: Brevo Starter is ₹625/month for 5,000 emails a month with no
daily limit, and Zoho ZeptoMail is ₹150 for 10,000 emails (pay as you go, but transactional only —
not for announcements to the whole list). Raise `DAILY_CAP` to match whatever plan you are on.

## Setting up the script itself (about five minutes, once)

1. **Give the account access to the portal's database.**
   Open https://console.cloud.google.com/iam-admin/iam?project=cpca-alumni-portal signed in as
   **rksjha@gmail.com** → **Grant access** → New principals: `alumnigau@gmail.com` →
   Role: **Cloud Datastore User** → Save.
   *(This lets the mailer read members' email addresses. It cannot change the website.)*

2. **Create the script.** Signed in as **alumnigau@gmail.com**, open https://script.google.com →
   **New project** → name it `CPCA Alumni Mailer`.

3. **Paste the code.** Replace everything in `Code.gs` with this folder's `Code.gs`.
   Then Project Settings → tick *Show "appsscript.json" manifest file* → open it and paste this
   folder's `appsscript.json`.

4. **Check the connection.** Choose the function `testConnection` → **Run**. Approve the permissions
   Google asks for the first time. It should report how many members it can see. It sends nothing.

5. **Switch it on.** Choose `setUpTriggers` → **Run**.

## Good to know
- Each run stops at `DAILY_CAP` (90 by default) and the rest go on the next run, so a daily
  allowance can never be overshot and nobody is emailed twice.
- `previewAll` counts who each job would email and sends nothing — always safe to run.
- To send an announcement immediately rather than waiting ten minutes, open the script and run
  `sendQueuedAnnouncements` by hand.
- The sending path has offline tests: `node tests/mailer.test.mjs` from the project folder.
- Every email replies to alumnigau@gmail.com and tells the reader how to stop receiving them.

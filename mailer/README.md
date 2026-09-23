# The mailer — setting it up once

This sends the portal's emails. It is a Google Apps Script, so it lives inside the
**alumnigau@gmail.com** account: no server, no monthly cost, no password stored anywhere.

Mail leaves through **Resend** (resend.com), which allows far more than a free Gmail account and
reports bounces properly. If no Resend key is set the mailer falls back to Gmail, so it always
works — just slowly.

## What it does
- **Announcements** — every 10 minutes it looks for a new announcement posted on the portal with
  "email this to members" ticked, and sends it to every approved member. Nobody is emailed twice.
- **Weekly reminders** — every Tuesday morning it emails members whose profile is still missing two
  or more things, listing exactly what to add. The same person is never nudged more than once every
  three weeks.

## Setting up the mail service (once)

Only you can do these — they need an account and a secret key, and I will not handle either.

1. **Create a Resend account** at https://resend.com (the free plan is 100 emails a day).
2. **Verify the domain** `cpcaalumni.org` — Resend shows three DNS records to add. Add them in
   Cloudflare under the cpcaalumni.org domain, DNS tab. Verification takes a few minutes.
   *(Ask me and I will add the records for you; you just approve them.)*
3. **Create an API key** in Resend (API Keys -> Create, sending permission is enough). Copy it.
4. **Put the key into the script**, never into the code: open the script ->
   **Project Settings** -> **Script properties** -> Add property ->
   name `RESEND_KEY`, value the key -> Save.
5. **Prove it works.** Run `sendTestToSelf` — it emails only alumnigau@gmail.com and nobody else.

If something is wrong with the key or the domain, the mailer now **stops at the first message**
with a note saying so, instead of quietly skipping everybody.

### Sending more than 100 a day
The free plan's 100/day is the only reason a backlog takes several days. On a paid Resend plan
there is no daily limit: add a second script property named `DAILY_CAP` with a value like `500`,
and each run will send that many. No code change.

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

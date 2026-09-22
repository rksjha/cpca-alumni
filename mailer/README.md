# The mailer — setting it up once

This sends the portal's emails from **alumnigau@gmail.com**. It is a Google Apps Script, so it
lives inside that Gmail account: no server, no monthly cost, no password stored anywhere.

## What it does
- **Announcements** — every 10 minutes it looks for a new announcement posted on the portal with
  "email this to members" ticked, and sends it to every approved member. Nobody is emailed twice.
- **Weekly reminders** — every Tuesday morning it emails members whose profile is still missing two
  or more things, listing exactly what to add. The same person is never nudged more than once every
  three weeks.

## Setting it up (about five minutes, once)

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
- A free Gmail account can email about 100 people a day, so each run stops at 90 and the rest go on
  the next run. With more than a few hundred members, move to a mail service (Brevo or Resend, free
  tiers around 300/day) or a Google Workspace account (2,000/day).
- To send an announcement immediately rather than waiting ten minutes, open the script and run
  `sendQueuedAnnouncements` by hand.
- Every email replies to alumnigau@gmail.com and tells the reader how to stop receiving them.

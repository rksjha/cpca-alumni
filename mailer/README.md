# The mailer — setting it up once

This sends the portal's emails. It is a Google Apps Script, so it lives inside the
**admin@cpcaalumni.org** Google Workspace account: no server, no extra cost, no password anywhere.

All mail is sent from **admin@cpcaalumni.org**, and replies come back to it.

**Which account it lives in is the whole point.** Apps Script's own limit is:

| Account running the script | Recipients per day |
|---|---|
| Personal gmail.com | 100 |
| **Google Workspace** | **1,500** |

So the Workspace account gives 1,500 a day at no extra cost — more than Brevo's free plan (300)
or Resend's (100), from the portal's own domain. No third-party mail service is needed.

Brevo and Resend are still supported if they are ever wanted: put a `BREVO_KEY` or `RESEND_KEY`
into Script properties and the mailer uses that instead, with no code change. Leave both unset and
it uses Workspace Gmail, which is the intended setup.

### A friendlier address later
To send as something like `alumni@cpcaalumni.org`, add it as an alias in Workspace, then change
the one `SUPPORT` line at the top of `Code.gs`. Nothing else needs touching.

## What it does
- **Announcements** — every hour it looks for a new announcement posted on the portal with
  "email this to members" ticked, and sends it to every approved member. Nobody is emailed twice.
  (Hourly, not more often: while an announcement is part-sent each run re-reads every member, and
  running it six times an hour was using up the free Firebase database allowance.)
- **Weekly reminders** — every Tuesday morning it emails members whose profile is still missing two
  or more things, listing exactly what to add. The same person is never nudged more than once every
  three weeks.

## Email authentication for cpcaalumni.org — done 2026-09-23

Needed so mail from a new domain is trusted and not filed as spam. All four are live and verified:

| Record | Value |
|---|---|
| MX | Google's five `aspmx.l.google.com` servers |
| SPF | `v=spf1 include:_spf.google.com ~all` |
| DKIM | `google._domainkey`, 2048-bit — Workspace shows *"Authenticating email with DKIM"* |
| DMARC | `_dmarc`, `p=none` (reports only, safe) |

Once DMARC reports look clean for a few weeks, tighten `p=none` to `p=quarantine`.

## Setting it up (once)

1. **Grant the database role.** In the Google Cloud console, IAM for the `cpca-alumni-portal`
   project, grant **admin@cpcaalumni.org** the **Cloud Datastore User** role. Without it the
   mailer cannot read members' email addresses, and it will say so plainly.
2. **Raise the run size.** Project Settings -> Script properties -> add `DAILY_CAP` = `250`.
   (250, not 1,500: the limit is Apps Script's six-minute run time, not the daily allowance.
   Anything left over goes on the next run.)
3. **Prove it works.** Run `sendTestToSelf` — it emails only admin@cpcaalumni.org, nobody else.

If anything is wrong with the account or the sending address, the mailer **stops at the first
message** with a note saying so, instead of quietly skipping everybody.

### If the network outgrows 1,500 a day
That is roughly seven times the current membership, so it is a long way off. If it ever happens:
Brevo Starter is ₹625/month for 5,000 a month with no daily limit, and Zoho ZeptoMail is ₹150 per
10,000 (cheapest, but transactional only — not for announcements to the whole list).

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

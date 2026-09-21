# How the CPCA Alumni Portal is published

**Live site:** https://cpcaalumni.org (secure). `www` and any `http` address redirect to it.

- **Hosting:** Google Firebase Hosting, project `cpca-alumni-portal`, free Spark plan.
  The certificate is issued and renewed by Google automatically — nothing to remember.
- **Database & sign-in:** the same Firebase project (Firestore in Mumbai, Google + email-link sign-in).
- **Source code:** github.com/rksjha/cpca-alumni (the repository is only for keeping the code; the
  website is no longer served from GitHub).

## To publish a change

```
npm run deploy
```

## To re-check the privacy rules

```
npm test
```

Runs 37 checks against Google's offline test database. Needs Java (`brew install openjdk`).

## Files that must never be published

Everything in `private/` — the college's spreadsheet, the alumni file with emails and phone
numbers, and the administrator's address. `firebase.json` excludes that folder, and the
exclusion is verified after every deploy.

## After every deploy, check nothing private leaked

```
npm run check
```

Firebase uploads the whole folder, so the `ignore` list in `firebase.json` is the only thing
keeping `private/`, `.git/` and the working files off the public web. This command confirms it.

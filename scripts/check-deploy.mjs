// Confirms the live site publishes the portal and nothing else.
// Firebase Hosting uploads the whole project folder, so the `ignore` list in firebase.json
// is the only thing keeping private files off the web. This proves it after every deploy.
const SITE = "https://cpcaalumni.org";

const MUST_BE_HIDDEN = [
  "private/seed_alumni.json", "private/admin_email.txt", "private/seed_distinguished.sql",
  "private/Entrepreneurs%20Details%20CPCA%20to%20Rakesh%20Jha.xlsx",
  ".git/config", ".git/HEAD", ".git/index", ".claude/launch.json",
  "firestore.rules", "firebase.json", ".firebaserc", ".gitignore",
  "package.json", "package-lock.json", "tests/rules.test.mjs", "scripts/build_seed.py",
  "supabase/migrations/001_schema.sql", "DEPLOY.md",
];
const MUST_BE_PUBLIC = [
  "", "assets/js/app.js", "assets/js/data.js", "assets/css/styles.css",
  "assets/data/preview-data.js", "assets/img/cpca-badge.svg",
];

// Retries, because a one-off 503 from the CDN is not the same as a file being exposed.
const status = async (path) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const code = (await fetch(`${SITE}/${path}`, { redirect: "manual" })).status;
      if (code !== 503 && code !== 429 && code !== 0) return code;
    } catch { /* network hiccup — try again */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return -1;   // could not tell; reported as a problem so it is never silently ignored
};

let bad = 0;
for (const path of MUST_BE_HIDDEN) {
  const code = await status(path);
  const ok = code === 404;   // anything else means the file is reachable, or we could not tell
  if (!ok) bad++;
  console.log(`  ${ok ? "✓ hidden " : "✗ EXPOSED"}  ${path}  (${code})`);
}
for (const path of MUST_BE_PUBLIC) {
  const code = await status(path);
  const ok = code === 200;
  if (!ok) bad++;
  console.log(`  ${ok ? "✓ served " : "✗ MISSING"}  /${path}  (${code})`);
}
console.log(bad ? `\n${bad} problem(s) — do not leave the site like this.\n` : "\nAll good: the portal is served, nothing private is exposed.\n");
process.exit(bad ? 1 : 0);

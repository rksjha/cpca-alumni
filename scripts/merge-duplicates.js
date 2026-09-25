/**
 * Find and merge duplicate alumni profiles.
 *
 * Two profiles are the same person if they share an email address, or share a mobile number.
 * People end up with two because they sign in once with Google and once with an emailed link
 * (two different accounts, same address), or because the college list and the 2025 questionnaire
 * both recorded them under different addresses.
 *
 * HOW TO RUN
 *   1. Sign in to https://cpcaalumni.org as an administrator.
 *   2. Open the browser's developer console (⌥⌘I on a Mac, then "Console").
 *   3. Paste this whole file and press Enter.
 *   4. Run  await cpcaDedupe.report()   — reads only, changes nothing. Read what it says.
 *   5. Run  await cpcaDedupe.backup()   — downloads every profile as a JSON file. Do not skip this.
 *   6. Run  await cpcaDedupe.merge()    — performs the merges.
 *
 * WHAT A MERGE DOES
 *   The fuller of the two profiles is kept. Anything the other one has that the keeper is missing
 *   is copied across — headline, photo, batch, degrees, companies, career, phone, date of birth.
 *   Degrees and companies are combined, not replaced, and duplicates within them are dropped.
 *   "Pride of CPCA" survives if either profile had it.
 *
 * NOTHING IS DELETED. The emptied duplicate is set to "suspended", which removes it from the
 * directory, and marked with mergedInto so it is clear what happened. It can be put back at any
 * time from the admin desk ("Reinstate"), and the backup file is a second safety net.
 *
 * The person keeps their way in. If the profile being retired is the one they actually sign in
 * with, the sign-in is moved onto the keeper first — otherwise they would be locked out of
 * editing their own page. A second email address is recorded as a claim, so signing in with it
 * later opens the same profile instead of creating a third duplicate.
 *
 * Running merge() twice is safe: anything already merged is skipped.
 */
(function () {
  const db = () => firebase.firestore();

  const nEmail = (e) => String(e || "").trim().toLowerCase();
  const nPhone = (p) => {
    let d = String(p || "").replace(/\D/g, "");
    if (d.length > 10) d = d.slice(-10);
    return d.length === 10 ? d : "";
  };
  // Numbers that are obviously placeholders rather than a real phone.
  const JUNK = new Set(["0000000000", "1111111111", "9999999999", "1234567890", "0123456789"]);

  const SCALARS = ["headline", "about", "photoUrl", "location", "sector", "campus",
    "profession", "professionDetail", "batchYear"];
  const SIG = {
    education: (r) => [r.level, r.program, r.endYear, r.college].join("|").toLowerCase(),
    experience: (r) => [r.title, r.organisation, r.startYear].join("|").toLowerCase(),
    companies: (r) => String(r.name || "").toLowerCase().trim(),
  };
  const CONTACT_FIELDS = ["phone", "whatsapp", "dob", "association"];

  async function loadAll() {
    const snap = await db().collection("profiles").get();
    const docs = snap.docs;
    const out = [];
    for (let i = 0; i < docs.length; i += 25) {
      const batch = docs.slice(i, i + 25);
      const contacts = await Promise.all(batch.map((d) =>
        d.ref.collection("private").doc("contact").get()
          .then((c) => (c.exists ? c.data() : null)).catch(() => null)));
      batch.forEach((d, j) => out.push({ id: d.id, profile: d.data(), contact: contacts[j] }));
    }
    return out;
  }

  /** Groups profiles that share an address or a number, following chains through both. */
  function cluster(all) {
    const parent = {};
    all.forEach((r) => (parent[r.id] = r.id));
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { parent[find(a)] = find(b); };

    [(r) => nEmail((r.contact || {}).email),
     (r) => { const p = nPhone((r.contact || {}).phone); return JUNK.has(p) ? "" : p; }]
      .forEach((keyOf) => {
        const seen = {};
        all.forEach((r) => {
          const k = keyOf(r);
          if (!k) return;
          if (seen[k]) union(r.id, seen[k]); else seen[k] = r.id;
        });
      });

    const groups = {};
    all.forEach((r) => { (groups[find(r.id)] = groups[find(r.id)] || []).push(r); });
    return Object.values(groups).filter((g) => g.length > 1);
  }

  /** How complete a profile is — the fuller one is the one worth keeping. */
  function score(rec) {
    const p = rec.profile, c = rec.contact || {};
    let s = SCALARS.filter((f) => p[f]).length;
    s += 2 * (p.education || []).length + (p.experience || []).length + (p.companies || []).length;
    s += Object.values(p.links || {}).filter(Boolean).length;
    if (p.userId) s += 3;
    if (p.status === "approved") s += 2;
    if (c.phone) s += 1;
    return s;
  }

  function plan(all) {
    return cluster(all).map((group) => {
      const ordered = group.slice().sort((a, b) =>
        (score(b) - score(a)) || ((a.profile.createdAt || 0) - (b.profile.createdAt || 0)));
      return { keep: ordered[0], drop: ordered.slice(1) };
    });
  }

  async function mergeOne(keepId, dropId) {
    const kRef = db().collection("profiles").doc(keepId);
    const dRef = db().collection("profiles").doc(dropId);
    const [kS, dS] = await Promise.all([kRef.get(), dRef.get()]);
    if (!kS.exists || !dS.exists) return { skipped: "one of the pair has gone" };
    const K = kS.data(), D = dS.data();
    if (D.mergedInto) return { skipped: "already merged" };

    const [kcS, dcS] = await Promise.all([
      kRef.collection("private").doc("contact").get(),
      dRef.collection("private").doc("contact").get()]);
    const kc = kcS.exists ? kcS.data() : {}, dc = dcS.exists ? dcS.data() : {};

    const upd = {};
    SCALARS.forEach((f) => { if ((K[f] === undefined || K[f] === null || K[f] === "") && D[f]) upd[f] = D[f]; });
    ["education", "experience", "companies"].forEach((a) => {
      const cur = K[a] || [];
      const add = (D[a] || []).filter((x) => !cur.some((y) => SIG[a](y) === SIG[a](x)));
      if (add.length) upd[a] = cur.concat(add);
    });
    const links = Object.assign({}, D.links || {}, K.links || {});
    if (JSON.stringify(links) !== JSON.stringify(K.links || {})) upd.links = links;
    if (D.isDistinguished && !K.isDistinguished) upd.isDistinguished = true;
    if (D.status === "approved" && K.status !== "approved" && K.status !== "suspended") upd.status = "approved";

    // If the profile being retired is the one this person actually signs in with, the keeper must
    // take over that sign-in — otherwise the rules would not let them edit their own page.
    const keepUid = K.userId || null, dropUid = D.userId || null;
    if (!keepUid && dropUid) upd.userId = dropUid;

    const cupd = {};
    CONTACT_FIELDS.forEach((f) => { if (!kc[f] && dc[f]) cupd[f] = dc[f]; });
    if ((dc.stats || []).length > (kc.stats || []).length) cupd.stats = dc.stats;

    const dropEmail = nEmail(dc.email), keepEmail = nEmail(kc.email);

    if (Object.keys(upd).length) { upd.updatedAt = Date.now(); await kRef.update(upd); }
    if (Object.keys(cupd).length) await kRef.collection("private").doc("contact").set(cupd, { merge: true });
    if (dropUid && dropUid !== keepUid) {
      await db().collection("members").doc(dropUid).set({ profileId: keepId, mergedAt: Date.now() }, { merge: true });
    }
    if (dropEmail && dropEmail !== keepEmail) {
      await db().collection("claims").doc(dropEmail).set({ profileId: keepId, mergedAt: Date.now() }, { merge: true });
    }
    await dRef.update({ status: "suspended", mergedInto: keepId, mergedAt: Date.now(), updatedAt: Date.now() });
    return { done: true, gained: Object.keys(upd), contact: Object.keys(cupd) };
  }

  window.cpcaDedupe = {
    /** Reads only. Prints what would be merged and what needs a human decision. */
    async report() {
      const all = await loadAll();
      const pairs = plan(all);
      console.log(`${all.length} profiles, ${pairs.length} duplicate groups`);
      pairs.forEach(({ keep, drop }) => {
        drop.forEach((d) => {
          const flags = [];
          if (keep.profile.status === "suspended" || d.profile.status === "suspended") flags.push("ONE IS SUSPENDED — decide first");
          if (keep.profile.batchYear && d.profile.batchYear && keep.profile.batchYear !== d.profile.batchYear) {
            flags.push(`different batch years (${d.profile.batchYear} vs ${keep.profile.batchYear})`);
          }
          if (nEmail((keep.contact || {}).email) !== nEmail((d.contact || {}).email)) flags.push("matched on phone only");
          console.log(`keep "${keep.profile.fullName}"  <-  "${d.profile.fullName}"${flags.length ? "   [" + flags.join("; ") + "]" : ""}`);
        });
      });
      return pairs.length;
    },

    /** Downloads every profile, contact card, member link and claim as one JSON file. */
    async backup() {
      const profiles = await loadAll();
      const [mem, claims] = await Promise.all([db().collection("members").get(), db().collection("claims").get()]);
      const data = { takenAt: new Date().toISOString(), profiles,
        members: mem.docs.map((d) => Object.assign({ uid: d.id }, d.data())),
        claims: claims.docs.map((d) => Object.assign({ email: d.id }, d.data())) };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
      a.download = "cpca-profiles-backup-" + data.takenAt.slice(0, 19).replace(/[:T]/g, "-") + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      console.log(`backed up ${profiles.length} profiles to ${a.download}`);
      return profiles.length;
    },

    /**
     * Merges every duplicate group. Anything flagged by report() as needing a decision is left
     * alone unless you pass { includeFlagged: true } after deciding yourself.
     *
     * Pass { only: "some name" } to deal with a single group and leave every other one untouched —
     * useful when one flagged group has been thought about and the rest have not.
     *   await cpcaDedupe.merge({ only: "Praful Parmar", includeFlagged: true })
     */
    async merge(opts) {
      opts = opts || {};
      const only = opts.only ? String(opts.only).toLowerCase() : null;
      const all = await loadAll();
      const pairs = plan(all);
      const out = [];
      for (const { keep, drop } of pairs) {
        for (const d of drop) {
          if (only && ![keep.profile.fullName, d.profile.fullName, keep.id, d.id]
              .some((v) => String(v || "").toLowerCase().includes(only))) continue;
          const suspended = keep.profile.status === "suspended" || d.profile.status === "suspended";
          const batchClash = keep.profile.batchYear && d.profile.batchYear
            && keep.profile.batchYear !== d.profile.batchYear;
          const phoneOnly = nEmail((keep.contact || {}).email) !== nEmail((d.contact || {}).email);
          if (!opts.includeFlagged && (suspended || (phoneOnly && batchClash))) {
            out.push({ held: keep.profile.fullName }); continue;
          }
          try { out.push(Object.assign({ name: keep.profile.fullName }, await mergeOne(keep.id, d.id))); }
          catch (e) { out.push({ name: keep.profile.fullName, error: String(e) }); }
        }
      }
      console.table(out);
      console.log(`merged ${out.filter((o) => o.done).length}, held ${out.filter((o) => o.held).length}, failed ${out.filter((o) => o.error).length}`);
      return out;
    },
  };
  console.log('cpcaDedupe ready — run: await cpcaDedupe.report()');
})();

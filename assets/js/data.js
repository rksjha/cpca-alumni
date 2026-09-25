// Data layer. Live mode talks to Google Firebase (Firestore + Auth);
// preview mode serves the bundled public list read-only.
// The view files call only this file, so the screens never see Firebase directly.
CPCA.data = (function () {
  const cfg = window.CPCA_CONFIG || {};
  const live = Boolean(cfg.projectId && window.firebase && firebase.initializeApp);
  let auth, db;
  if (live) {
    firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
    auth.useDeviceLanguage();
  }

  // Campuses people named in the 2025 questionnaire, so alumni of every GAU/SDAU college fit.
  const CAMPUSES = [
    "C. P. College of Agriculture (CPCA), Sardarkrushinagar",
    "B. A. College of Agriculture (BACA), Anand",
    "ASPEE College of Horticulture & Forestry (ACHF), Navsari",
    "College of Agricultural Engineering & Technology (CAET)",
    "College of Agriculture, Tharad", "College of Agriculture, Bhuj",
    "College of Horticulture, Jagudan", "College of Food Technology",
    "College of Agribusiness Management", "ASPEE College of Nutrition & Community Science",
    "Sardarkrushinagar Dantiwada Agricultural University (SDAU)",
    "Navsari Agricultural University (NAU)", "Junagadh Agricultural University (JAU)",
    "Anand Agricultural University (AAU)", "Gujarat Agricultural University (GAU)",
    "Other campus",
  ];
  // What alumni actually answered: 72 in government service, 23 private sector, 20 in business.
  const PROFESSIONS = [
    "Government Service", "Private Sector", "Self Employed / Business", "Farming",
    "Banking & Finance", "Research & Academia", "NGO / Development Sector",
    "Student", "Retired", "Other",
  ];
  const CPCA_COLLEGE = "C. P. College of Agriculture";
  const SDAU = "Sardarkrushinagar Dantiwada Agricultural University (SDAU)";
  const EMAIL_KEY = "cpca_signin_email"; // remembers the address between sending and opening the link

  // ── Shapes ──
  // profiles/{id}          public half + education/experience/companies arrays
  // profiles/{id}/private/contact   email, phone, whatsapp, visibility, stats[] (per company)
  // members/{uid}          { profileId }      admins/{email}          claims/{email} → { profileId }
  const one = (v) => (Array.isArray(v) ? v[0] || null : v || null);
  const clean = (o) => { const out = {}; Object.keys(o).forEach((k) => { if (o[k] !== undefined) out[k] = o[k]; }); return out; };

  // The views work in snake_case; Firestore stores camelCase.
  function toView(id, d, contact) {
    const stats = (contact && contact.stats) || [];
    return {
      id, user_id: d.userId || null, full_name: d.fullName || "", headline: d.headline || "", about: d.about || null,
      photo_url: d.photoUrl || null, location: d.location || null, sector: d.sector || null,
      batch_year: d.batchYear || null, links: d.links || {}, status: d.status || "pending",
      campus: d.campus || null, profession: d.profession || null, profession_detail: d.professionDetail || null,
      source: d.source || null,
      is_distinguished: Boolean(d.isDistinguished),
      education: (d.education || []).map((e, i) => ({ id: "e" + i, level: e.level || null, program: e.program || null,
        institution: e.institution || null, college: e.college || e.campus || null, start_year: e.startYear || null,
        end_year: e.endYear || null, is_cpca: Boolean(e.isCpca) })),
      experience: (d.experience || []).map((x, i) => ({ id: "x" + i, organisation: x.organisation || "", title: x.title || null,
        location: x.location || null, start_year: x.startYear || null, end_year: x.endYear || null,
        is_current: Boolean(x.isCurrent), description: x.description || null })),
      companies: (d.companies || []).map((c, i) => ({ id: "c" + i, name: c.name || "", role: c.role || null,
        description: c.description || null, location: c.location || null, website: c.website || null,
        year_established: c.yearEstablished || null,
        company_stats: stats[i] ? { employees: stats[i].employees || null, turnover: stats[i].turnover || null } : null })),
      profile_private: contact ? { email: contact.email || null, phone: contact.phone || null,
        whatsapp: contact.whatsapp || null, dob: contact.dob || null,
        visibility: contact.visibility || "members", association: contact.association || null } : null,
    };
  }
  const eduToDb = (r) => clean({ level: r.level, program: r.program, institution: r.institution, college: r.college,
    startYear: r.start_year, endYear: r.end_year, isCpca: Boolean(r.is_cpca) });
  const expToDb = (r) => clean({ organisation: r.organisation, title: r.title, location: r.location,
    startYear: r.start_year, endYear: r.end_year, isCurrent: Boolean(r.is_current), description: r.description });
  const compToDb = (r) => clean({ name: r.name, role: r.role, description: r.description, location: r.location,
    website: r.website, yearEstablished: r.year_established });

  // ── Preview mode (no database configured) ──
  function previewProfiles() {
    return (window.CPCA_PREVIEW || []).map((p) => ({
      id: "p" + p.n, full_name: p.full_name, headline: p.headline, photo_url: null, about: null,
      location: p.location, sector: p.sector, batch_year: p.batch_year, links: {},
      status: "approved", is_distinguished: true, user_id: null,
      companies: [{ id: "c0", name: p.company, role: "Founder / Promoter", description: p.company_about,
                    location: p.location, website: null, year_established: p.year_established, company_stats: null }],
      education: [{ id: "e0", level: null, program: null, institution: SDAU, college: CPCA_COLLEGE,
                    start_year: null, end_year: p.batch_year, is_cpca: true }],
      experience: [], profile_private: null,
    }));
  }

  // ── Reading ──
  async function listProfiles() {
    if (!live) return previewProfiles();
    const snap = await db.collection("profiles").where("status", "==", "approved").get();
    return snap.docs.map((doc) => {
      const d = doc.data();
      return { id: doc.id, full_name: d.fullName || "", headline: d.headline || "", photo_url: d.photoUrl || null,
        location: d.location || null, sector: d.sector || null, batch_year: d.batchYear || null,
        campus: d.campus || null, profession: d.profession || null,
        is_distinguished: Boolean(d.isDistinguished), companies: (d.companies || []).map((c) => ({ name: c.name })) };
    }).sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  async function getProfile(id) {
    if (!live) return previewProfiles().find((p) => p.id === id) || null;
    const doc = await db.collection("profiles").doc(id).get();
    if (!doc.exists) return null;
    let contact = null;
    try { // the rules deny this to visitors who may not see the contact card — that is not an error
      const c = await db.collection("profiles").doc(id).collection("private").doc("contact").get();
      if (c.exists) contact = c.data();
    } catch (e) { contact = null; }
    return toView(doc.id, doc.data(), contact);
  }

  // ── Sign-in ──
  const returnUrl = () => location.origin + location.pathname;
  const getUser = () => (live ? auth.currentUser : null);
  function onAuthChange(cb) { if (live) auth.onAuthStateChanged((user) => cb(user ? "SIGNED_IN" : "SIGNED_OUT", user)); }
  async function ready() { // resolves once Firebase knows whether someone is signed in
    if (!live) return null;
    if (isEmailLink()) await completeEmailLink();
    return new Promise((res) => { const off = auth.onAuthStateChanged((u) => { off(); res(u); }); });
  }

  async function signInWith(provider) {
    const p = provider === "google" ? new firebase.auth.GoogleAuthProvider() : null;
    if (!p) throw new Error("This sign-in option is not available yet. Please use Google or your email.");
    p.setCustomParameters({ prompt: "select_account" });
    try { await auth.signInWithPopup(p); }
    catch (e) { // some phone browsers block the pop-up; fall back to a full-page sign-in
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await auth.signInWithRedirect(p);
      else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") throw e;
    }
  }
  async function sendEmailCode(emailAddr) {
    await auth.sendSignInLinkToEmail(emailAddr, { url: returnUrl() + "#/me", handleCodeInApp: true });
    try { localStorage.setItem(EMAIL_KEY, emailAddr); } catch (e) { /* private browsing */ }
  }
  const isEmailLink = () => live && auth.isSignInWithEmailLink(location.href);
  /**
   * Finishes a sign-in that began with an emailed link.
   *
   * This must NEVER throw. It runs during start-up, before anything is on screen, so an expired
   * or already-used link used to reject and leave the visitor staring at a loading spinner for
   * ever. Instead we record why it failed, clear the dead link out of the address bar, and let
   * the site carry on loading — the sign-in page then shows the reason.
   */
  async function completeEmailLink() {
    let emailAddr = "";
    try { emailAddr = localStorage.getItem(EMAIL_KEY) || ""; } catch (e) { /* private browsing */ }
    // The link is often opened in a different browser from the one that asked for it (tapping it
    // inside the Gmail app, for instance), so the address has to be confirmed.
    if (!emailAddr) emailAddr = window.prompt("Please confirm the email address you asked the sign-in link to be sent to:") || "";
    if (!emailAddr) {
      CPCA.authNotice = "To finish signing in we need the email address the link was sent to. Please try again, or use “Continue with Google”.";
      history.replaceState(null, "", returnUrl() + "#/join");
      return;
    }
    try {
      await auth.signInWithEmailLink(emailAddr, location.href);
      try { localStorage.removeItem(EMAIL_KEY); } catch (e) { /* ignore */ }
      history.replaceState(null, "", returnUrl() + "#/me"); // drop the one-time link from the address bar
    } catch (e) {
      console.error(e);
      CPCA.authNotice = CPCA.ui.explain(e);
      history.replaceState(null, "", returnUrl() + "#/join"); // a dead link must not be retried on refresh
    }
  }
  const signOut = () => auth.signOut();

  // ── Membership ──
  // Returns this member's profile id: their existing one, the college-listed profile matching
  // their verified email, or a newly created pending one.
  async function joinNetwork(fullName) {
    const user = auth.currentUser;
    if (!user) throw new Error("Please sign in first.");
    const memberRef = db.collection("members").doc(user.uid);
    const member = await memberRef.get();
    if (member.exists) return member.data().profileId;

    const emailAddr = (user.email || "").toLowerCase();
    if (emailAddr) {
      let claim = null;
      try { claim = await db.collection("claims").doc(emailAddr).get(); } catch (e) { claim = null; }
      if (claim && claim.exists) {
        const profileId = claim.data().profileId;
        const prof = await db.collection("profiles").doc(profileId).get();
        if (prof.exists && !prof.data().userId) {
          await db.collection("profiles").doc(profileId).update({ userId: user.uid, updatedAt: Date.now() });
          await memberRef.set({ profileId, joinedAt: Date.now() });
          return profileId;
        }
      }
    }
    const name = (fullName || (emailAddr ? emailAddr.split("@")[0] : "") || "New member").slice(0, 120);
    const ref = db.collection("profiles").doc();
    await ref.set({ userId: user.uid, fullName: name, headline: "", status: "pending", isDistinguished: false,
      links: {}, education: [], experience: [], companies: [], createdAt: Date.now(), updatedAt: Date.now() });
    await ref.collection("private").doc("contact").set({ email: emailAddr, visibility: "members", stats: [] });
    await memberRef.set({ profileId: ref.id, joinedAt: Date.now() });
    return ref.id;
  }

  async function isAdmin() {
    const user = live && auth.currentUser;
    if (!user || !user.email) return false;
    try { return (await db.collection("admins").doc(user.email.toLowerCase()).get()).exists; }
    catch (e) { return false; }
  }

  // ── Writing (own profile only; the rules enforce this) ──
  const FIELD_MAP = { full_name: "fullName", headline: "headline", about: "about", photo_url: "photoUrl",
    location: "location", sector: "sector", batch_year: "batchYear", links: "links",
    campus: "campus", profession: "profession", profession_detail: "professionDetail" };
  async function saveProfile(id, fields) {
    const out = { updatedAt: Date.now() };
    Object.keys(fields).forEach((k) => { if (FIELD_MAP[k]) out[FIELD_MAP[k]] = fields[k]; });
    await db.collection("profiles").doc(id).update(out);
  }
  async function saveContact(profileId, fields) {
    await db.collection("profiles").doc(profileId).collection("private").doc("contact")
      .set(clean(fields), { merge: true });
  }

  // Education / experience / companies are lists inside the profile document.
  const LIST = { education: ["education", eduToDb], experience: ["experience", expToDb], companies: ["companies", compToDb] };
  async function readLists(profileId) {
    const doc = await db.collection("profiles").doc(profileId).get();
    const d = doc.data() || {};
    return { education: d.education || [], experience: d.experience || [], companies: d.companies || [] };
  }
  async function saveRow(table, profileId, row) {
    const [key, mapper] = LIST[table];
    const lists = await readLists(profileId);
    const rows = lists[key].slice();
    const at = row.id ? Number(String(row.id).slice(1)) : -1;
    if (at >= 0 && at < rows.length) rows[at] = mapper(row); else rows.push(mapper(row));
    await db.collection("profiles").doc(profileId).update({ [key]: rows, updatedAt: Date.now() });
    const index = at >= 0 && at < rows.length ? at : rows.length - 1;
    return { ...row, id: row.id || table[0] + index };
  }
  async function deleteRow(table, profileId, id) {
    const [key] = LIST[table];
    const lists = await readLists(profileId);
    const rows = lists[key].slice();
    const at = Number(String(id).slice(1));
    if (at >= 0 && at < rows.length) rows.splice(at, 1);
    const update = { [key]: rows, updatedAt: Date.now() };
    await db.collection("profiles").doc(profileId).update(update);
    if (key === "companies") { // keep the members-only figures aligned with the company list
      const c = await db.collection("profiles").doc(profileId).collection("private").doc("contact").get();
      const stats = ((c.exists && c.data().stats) || []).slice();
      if (at >= 0 && at < stats.length) stats.splice(at, 1);
      await saveContact(profileId, { stats });
    }
  }
  async function saveCompany(profileId, row) {
    const { employees, turnover } = row;
    const saved = await saveRow("companies", profileId, row);
    const index = Number(String(saved.id).slice(1));
    const c = await db.collection("profiles").doc(profileId).collection("private").doc("contact").get();
    const stats = ((c.exists && c.data().stats) || []).slice();
    while (stats.length <= index) stats.push({});
    stats[index] = clean({ employees: employees || null, turnover: turnover || null });
    await saveContact(profileId, { stats });
    return saved;
  }

  // Photos are shrunk in the browser and stored inside the profile document (about 25 KB),
  // so the portal needs no separate file storage.
  async function uploadPhoto(file) {
    const bitmap = await createImageBitmap(file);
    const size = 320;
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    if (dataUrl.length > 700000) throw new Error("That photo is too large. Please choose a smaller one.");
    return dataUrl;
  }

  // ── Administration ──
  async function adminListMembers() {
    const snap = await db.collection("profiles").orderBy("createdAt", "desc").get();
    const rows = await Promise.all(snap.docs.map(async (doc) => {
      const d = doc.data();
      let contact = null;
      try { const c = await doc.ref.collection("private").doc("contact").get(); if (c.exists) contact = c.data(); } catch (e) { /* ignore */ }
      return { id: doc.id, full_name: d.fullName || "", status: d.status || "pending",
        is_distinguished: Boolean(d.isDistinguished), batch_year: d.batchYear || null,
        campus: d.campus || null, profession: d.profession || null, source: d.source || null,
        created_at: d.createdAt || Date.now(), user_id: d.userId || null,
        profile_private: contact ? { email: contact.email || null, phone: contact.phone || null } : null,
        education: (d.education || []).map((e) => ({ level: e.level, program: e.program, end_year: e.endYear, is_cpca: Boolean(e.isCpca) })) };
    }));
    return rows;
  }
  const adminSetStatus = (id, status) => db.collection("profiles").doc(id).update({ status, updatedAt: Date.now() });
  const adminSetDistinguished = (id, value) => db.collection("profiles").doc(id).update({ isDistinguished: value, updatedAt: Date.now() });
  async function adminListEmails() {
    const snap = await db.collection("admins").get();
    return snap.docs.map((d) => ({ email: d.id }));
  }
  const adminAddEmail = (emailAddr) => db.collection("admins").doc(emailAddr.toLowerCase())
    .set({ addedAt: Date.now(), addedBy: (auth.currentUser && auth.currentUser.email) || "" });
  const adminRemoveEmail = (emailAddr) => db.collection("admins").doc(emailAddr.toLowerCase()).delete();

  // One-time import of the college's distinguished-alumni list (administrators only).
  // `people` comes from a file the administrator chooses on their own computer, so the
  // alumni's email addresses and phone numbers are never published on the website.
  async function adminImport(people, onProgress) {
    let added = 0, skipped = 0;
    for (const p of people) {
      const emailAddr = (p.email || "").toLowerCase();
      if (emailAddr) {
        const existing = await db.collection("claims").doc(emailAddr).get();
        if (existing.exists) { skipped++; if (onProgress) onProgress(added, skipped, p.full_name); continue; }
      }
      const ref = db.collection("profiles").doc();
      await ref.set(clean({
        userId: null, fullName: p.full_name, headline: p.headline || "", location: p.location || null,
        sector: p.sector || null, batchYear: p.batch_year || null, status: "approved", isDistinguished: true, links: {},
        education: [{ institution: SDAU, college: CPCA_COLLEGE, endYear: p.batch_year || null, isCpca: true }],
        experience: [],
        companies: p.company ? [clean({ name: p.company, role: "Founder / Promoter", description: p.company_about || null,
          location: p.location || null, yearEstablished: p.year_established || null })] : [],
        createdAt: Date.now(), updatedAt: Date.now(), importedAt: Date.now(),
      }));
      await ref.collection("private").doc("contact").set(clean({
        email: emailAddr || null, phone: p.phone || null, visibility: "members",
        stats: p.company ? [clean({ employees: p.employees || null, turnover: p.turnover || null })] : [],
      }));
      if (emailAddr) await db.collection("claims").doc(emailAddr).set({ profileId: ref.id, addedAt: Date.now() });
      added++;
      if (onProgress) onProgress(added, skipped, p.full_name);
    }
    return { added, skipped };
  }

  // People who answered the 2025 questionnaire. They gave their details to help form the alumni
  // body — NOT to be published — so each profile is created hidden ("pending") and appears only
  // once that person signs in with the same address and an administrator approves them.
  async function adminImportRespondents(people, onProgress) {
    let added = 0, skipped = 0;
    for (const p of people) {
      const emailAddr = (p.email || "").toLowerCase();
      if (!emailAddr || !p.full_name) { skipped++; continue; }
      const existing = await db.collection("claims").doc(emailAddr).get();
      if (existing.exists) { skipped++; if (onProgress) onProgress(added, skipped, p.full_name); continue; }

      const ref = db.collection("profiles").doc();
      await ref.set(clean({
        userId: null, fullName: p.full_name, headline: p.profession_detail || p.profession || "",
        location: [p.city, p.country].filter(Boolean).join(", ") || null,
        campus: p.campus || null, profession: p.profession || null, professionDetail: p.profession_detail || null,
        batchYear: p.batch_year || null,
        links: p.linkedin ? { linkedin: p.linkedin } : {},
        education: (p.education || []).map((e) => clean({
          level: e.level, program: e.program, college: e.campus,
          institution: null, endYear: e.end_year, isCpca: Boolean(e.is_cpca) })),
        experience: [], companies: [],
        status: "pending", isDistinguished: false,
        source: p.source || "questionnaire",
        createdAt: Date.now(), updatedAt: Date.now(), importedAt: Date.now(),
      }));
      await ref.collection("private").doc("contact").set(clean({
        email: emailAddr, phone: p.phone || null, whatsapp: p.phone || null,
        dob: p.dob || null, visibility: "members", stats: [],
        association: p.association || null,
      }));
      await db.collection("claims").doc(emailAddr).set({ profileId: ref.id, addedAt: Date.now() });
      added++;
      if (onProgress) onProgress(added, skipped, p.full_name);
    }
    return { added, skipped };
  }

  // ── Announcements: a noticeboard anyone can read, written by administrators ──
  async function listAnnouncements() {
    if (!live) return [];
    const snap = await db.collection("announcements").orderBy("createdAt", "desc").limit(50).get();
    return snap.docs.map((d) => ({ id: d.id, title: d.data().title || "", body: d.data().body || "",
      authorName: d.data().authorName || null, created_at: d.data().createdAt || null, emailed: Boolean(d.data().emailQueuedAt) }));
  }
  async function postAnnouncement({ title, body, email }) {
    const user = auth.currentUser;
    const ref = await db.collection("announcements").add(clean({
      title: title.slice(0, 140), body: body.slice(0, 8000),
      authorName: user.displayName || user.email, authorEmail: user.email,
      createdAt: Date.now(), emailQueuedAt: email ? Date.now() : null, emailSentAt: null,
    }));
    return Boolean(email) && Boolean(ref.id);
  }
  const deleteAnnouncement = (id) => db.collection("announcements").doc(id).delete();

  // ── Chat rooms ──
  const MAX_ROOMS = 50;
  async function myMembership() {
    const user = live && auth.currentUser;
    if (!user) return null;
    const m = await db.collection("members").doc(user.uid).get();
    if (!m.exists) return null;
    const p = await db.collection("profiles").doc(m.data().profileId).get();
    if (!p.exists) return null;
    return { profileId: p.id, status: p.data().status, fullName: p.data().fullName || "" };
  }
  async function listRooms() {
    const snap = await db.collection("rooms").orderBy("lastAt", "desc").limit(MAX_ROOMS).get();
    return snap.docs.map((d) => ({ id: d.id, name: d.data().name || "", kind: d.data().kind || null,
      description: d.data().description || null, message_count: d.data().messageCount || 0, last_at: d.data().lastAt || null }));
  }
  async function getRoom(id) {
    const d = await db.collection("rooms").doc(id).get();
    return d.exists ? { id: d.id, name: d.data().name, kind: d.data().kind, description: d.data().description } : null;
  }
  async function createRoom({ name, kind, description }) {
    const existing = await db.collection("rooms").get();
    if (existing.size >= MAX_ROOMS) throw new Error(`The limit of ${MAX_ROOMS} rooms has been reached. Delete one first.`);
    await db.collection("rooms").add(clean({ name: name.slice(0, 80), kind, description: description || null,
      createdAt: Date.now(), lastAt: Date.now(), messageCount: 0, createdBy: auth.currentUser.email }));
  }
  // Live updates: the page redraws by itself when anyone in the room posts.
  function watchMessages(roomId, onChange, onError) {
    return db.collection("rooms").doc(roomId).collection("messages")
      .orderBy("createdAt", "asc").limitToLast(300)
      .onSnapshot((snap) => onChange(snap.docs.map((d) => ({ id: d.id, text: d.data().text || "",
        author_id: d.data().authorId, author_name: d.data().authorName || "Member", created_at: d.data().createdAt }))),
        (e) => onError && onError(e));
  }
  async function sendMessage(roomId, text) {
    const me = await myMembership();
    if (!me || me.status !== "approved") throw new Error("Only verified members can post.");
    const roomRef = db.collection("rooms").doc(roomId);
    await roomRef.collection("messages").add({ text: text.slice(0, 2000), authorId: auth.currentUser.uid,
      authorName: me.fullName || auth.currentUser.displayName || "Member", createdAt: Date.now() });
    await roomRef.update({ lastAt: Date.now(), messageCount: firebase.firestore.FieldValue.increment(1) }).catch(() => {});
  }
  const deleteMessage = (roomId, id) => db.collection("rooms").doc(roomId).collection("messages").doc(id).delete();

  // ── Approving members in bulk, so a backlog can be cleared in one go ──
  async function adminApproveMany(ids, onProgress) {
    let done = 0;
    for (const id of ids) {
      await db.collection("profiles").doc(id).update({ status: "approved", updatedAt: Date.now() });
      done++;
      if (onProgress) onProgress(done, ids.length);
    }
    return done;
  }

  return {
    live, one, CPCA_COLLEGE, SDAU, CAMPUSES, PROFESSIONS, MAX_ROOMS, listProfiles, getProfile, adminImportRespondents,
    listAnnouncements, postAnnouncement, deleteAnnouncement,
    myMembership, listRooms, getRoom, createRoom, watchMessages, sendMessage, deleteMessage, adminApproveMany,
    ready, getUser, onAuthChange, signInWith, sendEmailCode, signOut, isEmailLink,
    joinNetwork, isAdmin, saveProfile, saveContact, saveRow, deleteRow, saveCompany, uploadPhoto,
    adminListMembers, adminSetStatus, adminSetDistinguished, adminListEmails, adminAddEmail, adminRemoveEmail, adminImport,
  };
})();

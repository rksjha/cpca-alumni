// Data layer. Live mode talks to Supabase; preview mode serves the bundled public list read-only.
CPCA.data = (function () {
  const cfg = window.CPCA_CONFIG || {};
  const live = Boolean(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const sb = live
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { flowType: "pkce" } })
    : null;

  const CPCA_COLLEGE = "C. P. College of Agriculture";
  const SDAU = "Sardarkrushinagar Dantiwada Agricultural University (SDAU)";

  function ok(res) {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  }
  const one = (v) => (Array.isArray(v) ? v[0] || null : v || null);

  // ── Preview mode: same shapes as live, built from the public list ──
  function previewProfiles() {
    return (window.CPCA_PREVIEW || []).map((p) => ({
      id: "p" + p.n, full_name: p.full_name, headline: p.headline, photo_url: null, about: null,
      location: p.location, sector: p.sector, batch_year: p.batch_year, links: {},
      status: "approved", is_distinguished: true, user_id: null,
      companies: [{ id: "c" + p.n, name: p.company, role: "Founder / Promoter", description: p.company_about,
                    location: p.location, website: null, year_established: p.year_established, company_stats: null }],
      education: [{ id: "e" + p.n, level: null, program: null, institution: SDAU, college: CPCA_COLLEGE,
                    start_year: null, end_year: p.batch_year, is_cpca: true }],
      experience: [], profile_private: null,
    }));
  }

  // ── Reading ──
  async function listProfiles() {
    if (!live) return previewProfiles();
    return ok(await sb.from("profiles")
      .select("id, full_name, headline, photo_url, location, sector, batch_year, is_distinguished, companies(name)")
      .eq("status", "approved").order("full_name"));
  }

  async function getProfile(id) {
    if (!live) return previewProfiles().find((p) => p.id === id) || null;
    const p = ok(await sb.from("profiles")
      .select("*, education(*), experience(*), companies(*, company_stats(*)), profile_private(*)")
      .eq("id", id).maybeSingle());
    if (!p) return null;
    p.profile_private = one(p.profile_private);
    (p.companies || []).forEach((c) => (c.company_stats = one(c.company_stats)));
    return p;
  }

  // ── Sign-in ──
  const returnUrl = () => location.origin + location.pathname;
  async function getUser() {
    if (!live) return null;
    const { data } = await sb.auth.getSession();
    return data.session ? data.session.user : null;
  }
  function onAuthChange(cb) { if (live) sb.auth.onAuthStateChange((event) => cb(event)); }
  const signInWith = async (provider) => ok(await sb.auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl() } }));
  const sendEmailCode = async (email) => ok(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: returnUrl() } }));
  const verifyEmailCode = async (email, token) => ok(await sb.auth.verifyOtp({ email, token, type: "email" }));
  const signOut = async () => ok(await sb.auth.signOut());

  // ── Membership ──
  async function joinNetwork(fullName) { return ok(await sb.rpc("join_network", { p_full_name: fullName || null })); }
  async function isAdmin() { return live ? Boolean(ok(await sb.rpc("am_i_admin"))) : false; }

  // ── Writing (own profile only; the database enforces this) ──
  const saveProfile = async (id, fields) => ok(await sb.from("profiles").update(fields).eq("id", id));
  const saveContact = async (profileId, fields) =>
    ok(await sb.from("profile_private").upsert({ profile_id: profileId, ...fields }));

  async function saveRow(table, profileId, row) {
    const { id, ...fields } = row;
    if (id) return ok(await sb.from(table).update(fields).eq("id", id).select().single());
    return ok(await sb.from(table).insert({ profile_id: profileId, ...fields }).select().single());
  }
  const deleteRow = async (table, id) => ok(await sb.from(table).delete().eq("id", id));

  async function saveCompany(profileId, row) {
    const { employees, turnover, ...company } = row;
    const saved = await saveRow("companies", profileId, company);
    ok(await sb.from("company_stats").upsert({ company_id: saved.id, employees, turnover }));
    return saved;
  }

  // Shrinks the photo in the browser (max 512px JPEG) before upload, so storage stays tiny.
  async function uploadPhoto(file) {
    const user = await getUser();
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.86));
    const path = `${user.id}/${Date.now()}.jpg`;
    ok(await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" }));
    return sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }

  // ── Administration ──
  const adminListMembers = async () => ok(await sb.from("profiles")
    .select("id, full_name, status, is_distinguished, batch_year, created_at, user_id, profile_private(email, phone), education(level, program, end_year, is_cpca)")
    .order("created_at", { ascending: false }));
  const adminSetStatus = async (id, status) => ok(await sb.rpc("admin_set_status", { p_profile: id, p_status: status }));
  const adminSetDistinguished = async (id, value) => ok(await sb.rpc("admin_set_distinguished", { p_profile: id, p_value: value }));
  const adminListEmails = async () => ok(await sb.from("admin_emails").select("email").order("email"));
  const adminAddEmail = async (email) => ok(await sb.from("admin_emails").insert({ email: email.toLowerCase() }));
  const adminRemoveEmail = async (email) => ok(await sb.from("admin_emails").delete().eq("email", email));

  return {
    live, one, CPCA_COLLEGE, SDAU, listProfiles, getProfile,
    getUser, onAuthChange, signInWith, sendEmailCode, verifyEmailCode, signOut,
    joinNetwork, isAdmin, saveProfile, saveContact, saveRow, deleteRow, saveCompany, uploadPhoto,
    adminListMembers, adminSetStatus, adminSetDistinguished, adminListEmails, adminAddEmail, adminRemoveEmail,
  };
})();

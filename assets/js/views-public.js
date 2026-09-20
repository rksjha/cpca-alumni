// Pages anyone can see: home, directory, a single alumnus, about.
CPCA.views = CPCA.views || {};

(function () {
  const { esc, safeUrl, avatar, personCard, yearSpan } = CPCA.ui;
  const data = CPCA.data;

  // ── Home ──
  CPCA.views.home = async function (app) {
    const people = await data.listProfiles();
    const years = people.map((p) => p.batch_year).filter(Boolean);
    const sectors = new Set(people.map((p) => p.sector).filter(Boolean));
    const featured = people.filter((p) => p.is_distinguished).slice(0, 6);

    app.innerHTML = `
      <section class="hero"><div class="wrap">
        <span class="eyebrow">C. P. College of Agriculture · SDAU</span>
        <h1>One roof for every<br>CPCA alumnus.</h1>
        <p class="lead">Find your batchmates, discover enterprises built by fellow alumni, and keep your professional story up to date — whether you studied your UG, PG or PhD at Sardarkrushinagar.</p>
        <div class="actions">
          <a class="btn btn-gold" href="#/join">Join the network</a>
          <a class="btn btn-ghost" href="#/directory">Browse the directory</a>
        </div>
      </div></section>

      <div class="wrap"><div class="stats">
        <div class="stat"><b>${people.length}</b><span>alumni on the network</span></div>
        <div class="stat"><b>${years.length ? Math.min(...years) + "–" + Math.max(...years) : "—"}</b><span>batches represented</span></div>
        <div class="stat"><b>${sectors.size}</b><span>sectors of work</span></div>
        <div class="stat"><b>${people.filter((p) => p.is_distinguished).length}</b><span>named “Pride of CPCA”</span></div>
      </div></div>

      <section class="block"><div class="wrap">
        <div class="section-head">
          <div><h2>The Pride of CPCA</h2><p class="muted" style="margin:0">Distinguished alumni recognised by the college for building enterprises and institutions.</p></div>
          <a class="btn btn-ghost btn-sm" href="#/directory">See all alumni →</a>
        </div>
        <div class="cards">${featured.map(personCard).join("") || '<div class="empty">Profiles will appear here soon.</div>'}</div>
      </div></section>

      <section class="block" style="padding-top:0"><div class="wrap">
        <div class="section-head"><h2>Joining takes two minutes</h2></div>
        <div class="steps">
          <div class="step"><div class="num">1</div><h3>Sign in</h3><p class="muted small">Use your Google or LinkedIn account, or just your email. No new password to remember.</p></div>
          <div class="step"><div class="num">2</div><h3>Tell us your CPCA degree</h3><p class="muted small">Add the degree(s) you earned at C. P. College of Agriculture — UG, PG, PhD or all three — with your pass-out year.</p></div>
          <div class="step"><div class="num">3</div><h3>Build your profile</h3><p class="muted small">Add your company, career, photo and social links. An administrator verifies you, and you appear in the directory.</p></div>
        </div>
      </div></section>
      ${CPCA.community.socialSection()}
      <section class="block" style="padding-top:0"><div class="wrap">${CPCA.community.inviteBlock()}</div></section>`;
    CPCA.community.wireSocial(app); CPCA.community.wireInvite(app);
  };

  // ── Directory ──
  CPCA.views.directory = async function (app) {
    const people = await data.listProfiles();
    const sectors = [...new Set(people.map((p) => p.sector).filter(Boolean))].sort();
    const decades = [...new Set(people.map((p) => p.batch_year && Math.floor(p.batch_year / 10) * 10).filter(Boolean))].sort();

    app.innerHTML = `<div class="wrap" style="padding-top:40px;padding-bottom:64px">
      <h1 style="font-size:2.2rem">Alumni directory</h1>
      <p class="muted">Search by name, company, place or line of work.</p>
      <div class="toolbar">
        <input class="grow" id="q" type="search" placeholder="Search alumni…" aria-label="Search alumni">
        <select id="f-sector" aria-label="Sector"><option value="">All sectors</option>${sectors.map((s) => `<option>${esc(s)}</option>`).join("")}</select>
        <select id="f-decade" aria-label="Batch"><option value="">All batches</option>${decades.map((d) => `<option value="${d}">${d}s</option>`).join("")}</select>
        <select id="f-sort" aria-label="Sort"><option value="name">Sort: Name</option><option value="new">Newest batch first</option><option value="old">Oldest batch first</option></select>
      </div>
      <p class="small muted" id="count"></p>
      <div class="cards" id="results"></div>
    </div>`;

    const $ = (id) => app.querySelector(id);
    function render() {
      const q = $("#q").value.trim().toLowerCase();
      const sector = $("#f-sector").value, decade = Number($("#f-decade").value), sort = $("#f-sort").value;
      let list = people.filter((p) => {
        if (sector && p.sector !== sector) return false;
        if (decade && Math.floor((p.batch_year || 0) / 10) * 10 !== decade) return false;
        if (!q) return true;
        const hay = [p.full_name, p.headline, p.location, p.sector, p.batch_year, ...(p.companies || []).map((c) => c.name)].join(" ").toLowerCase();
        return q.split(/\s+/).every((word) => hay.includes(word));
      });
      if (sort === "new") list.sort((a, b) => (b.batch_year || 0) - (a.batch_year || 0));
      else if (sort === "old") list.sort((a, b) => (a.batch_year || 9999) - (b.batch_year || 9999));
      else list.sort((a, b) => a.full_name.localeCompare(b.full_name));
      $("#count").textContent = `${list.length} of ${people.length} alumni`;
      $("#results").innerHTML = list.map(personCard).join("") || '<div class="empty" style="grid-column:1/-1">No alumni match that search. Try fewer words.</div>';
    }
    ["#q", "#f-sector", "#f-decade", "#f-sort"].forEach((id) => $(id).addEventListener("input", render));
    render();
  };

  // ── One alumnus ──
  const LINK_LABELS = { linkedin: "LinkedIn", website: "Website", twitter: "X / Twitter", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube" };

  CPCA.views.profile = async function (app, id, ctx) {
    const p = await data.getProfile(id);
    if (!p) { app.innerHTML = `<div class="wrap narrow center"><h2>Profile not found</h2><p class="muted">It may be awaiting approval or has been removed.</p><a class="btn btn-primary" href="#/directory">Back to directory</a></div>`; return; }

    const isMine = ctx.user && p.user_id === ctx.user.id;
    const contact = p.profile_private;
    const links = Object.entries(p.links || {}).map(([k, v]) => [LINK_LABELS[k], safeUrl(v)]).filter(([label, url]) => label && url);
    const cpca = (p.education || []).filter((e) => e.is_cpca);
    const byYear = (a, b) => (b.end_year || 9999) - (a.end_year || 9999);

    const contactHtml = contact && (contact.email || contact.phone || contact.whatsapp)
      ? `${contact.email ? `<div class="kv"><span>Email</span><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></div>` : ""}
         ${contact.phone ? `<div class="kv"><span>Phone</span><a href="tel:${esc(contact.phone)}">${esc(contact.phone)}</a></div>` : ""}
         ${contact.whatsapp ? `<div class="kv"><span>WhatsApp</span><span>${esc(contact.whatsapp)}</span></div>` : ""}`
      : `<div class="locked">🔒 Contact details are shared with verified CPCA alumni only. ${ctx.user ? "They appear once your membership is approved, if this alumnus has chosen to share them." : '<a href="#/join">Sign in or join</a> to view.'}</div>`;

    app.innerHTML = `
      <div class="profile-head"></div>
      <div class="wrap profile-main">
        <div>
          <div class="panel">
            ${avatar(p, true)}
            <h1 style="font-size:2rem;margin-top:14px">${esc(p.full_name)}</h1>
            <p style="font-size:1.05rem;margin-bottom:12px">${esc(p.headline)}</p>
            <div class="links">
              ${p.is_distinguished ? '<span class="chip gold">★ Pride of CPCA</span>' : ""}
              ${p.batch_year ? `<span class="chip">Batch of ${esc(p.batch_year)}</span>` : ""}
              ${p.sector ? `<span class="chip">${esc(p.sector)}</span>` : ""}
              ${p.location ? `<span class="chip grey">📍 ${esc(p.location)}</span>` : ""}
              ${p.status !== "approved" ? `<span class="chip warn">${esc(p.status)} — visible only to you and admins</span>` : ""}
            </div>
            ${isMine ? '<p style="margin:16px 0 0"><a class="btn btn-primary btn-sm" href="#/me">Edit my profile</a></p>' : ""}
          </div>

          ${p.about ? `<div class="panel"><h2>About</h2><p style="white-space:pre-line;margin:0">${esc(p.about)}</p></div>` : ""}

          ${(p.companies || []).length ? `<div class="panel"><h2>Companies &amp; ventures</h2>${p.companies.map((c) => `
            <div class="item"><h3>${esc(c.name)}</h3>
              <div class="small muted">${esc([c.role, c.location, c.year_established && "Est. " + c.year_established].filter(Boolean).join(" · "))}</div>
              ${c.description ? `<p class="small" style="margin:8px 0 0">${esc(c.description)}</p>` : ""}
              ${c.company_stats && (c.company_stats.employees || c.company_stats.turnover) ? `<div class="links" style="margin-top:8px">
                ${c.company_stats.employees ? `<span class="chip grey">👥 ${esc(c.company_stats.employees)} employees</span>` : ""}
                ${c.company_stats.turnover ? `<span class="chip grey">Turnover ₹ ${esc(c.company_stats.turnover)}</span>` : ""}
                <span class="small muted">members-only figures</span></div>` : ""}
              ${safeUrl(c.website) ? `<a class="small" href="${esc(safeUrl(c.website))}" target="_blank" rel="noopener nofollow">Visit website ↗</a>` : ""}
            </div>`).join("")}</div>` : ""}

          ${(p.experience || []).length ? `<div class="panel"><h2>Experience</h2>${p.experience.slice().sort(byYear).map((x) => `
            <div class="item"><h3>${esc(x.title || x.organisation)}</h3>
              <div class="small muted">${esc([x.title && x.organisation, x.location, yearSpan(x.start_year, x.end_year, x.is_current)].filter(Boolean).join(" · "))}</div>
              ${x.description ? `<p class="small" style="margin:8px 0 0;white-space:pre-line">${esc(x.description)}</p>` : ""}
            </div>`).join("")}</div>` : ""}

          <div class="panel"><h2>Education</h2>${(p.education || []).slice().sort(byYear).map((e) => `
            <div class="item"><h3>${esc([e.level, e.program].filter(Boolean).join(" · ") || (e.is_cpca ? "CPCA graduate" : "Degree"))} ${e.is_cpca ? '<span class="chip" style="margin-left:6px">CPCA</span>' : ""}</h3>
              <div class="small muted">${esc([e.college, e.institution, yearSpan(e.start_year, e.end_year)].filter(Boolean).join(" · "))}</div>
            </div>`).join("") || '<p class="muted small" style="margin:0">Not added yet.</p>'}
            ${cpca.length && !cpca.some((e) => e.level) ? '<p class="hint" style="margin-top:10px">Degree details to be confirmed by the alumnus.</p>' : ""}
          </div>
        </div>

        <aside>
          <div class="panel"><h2>Contact</h2>${contactHtml}</div>
          ${links.length ? `<div class="panel"><h2>Links</h2><div class="links">${links.map(([label, url]) => `<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(label)} ↗</a>`).join("")}</div></div>` : ""}
          ${!p.user_id ? `<div class="panel" style="background:var(--green-100);border-color:#c4dfcf"><h2>Is this you?</h2><p class="small" style="margin-bottom:12px">This profile was prepared from the college's records. Sign in with the email address the college has for you and it becomes yours to edit.</p><a class="btn btn-primary btn-sm" href="#/join">Claim this profile</a></div>` : ""}
        </aside>
      </div>`;
  };

  // ── About & privacy ──
  CPCA.views.about = function (app) {
    app.innerHTML = `<div class="wrap mid">
      <h1 style="font-size:2.2rem">About the network</h1>
      <div class="panel"><p>The CPCA Alumni Network brings together everyone who has studied at <strong>C. P. College of Agriculture, Sardarkrushinagar Dantiwada Agricultural University</strong> — undergraduate, postgraduate and doctoral — under a single roof.</p>
      <p style="margin:0">It is an alumni-led initiative. It is not an official website of the University.</p></div>
      <div class="panel"><h2>Who can join</h2><p style="margin:0">Anyone who earned, or is completing, a degree at CPCA. When you join you state your CPCA degree and pass-out year; an administrator verifies it before your profile is listed.</p></div>
      <div class="panel"><h2>Your privacy</h2>
        <p><strong>Visible to everyone:</strong> your name, photo, headline, batch, education, career, companies and the links you choose to add.</p>
        <p><strong>Visible to verified alumni only:</strong> your email, phone, WhatsApp number, and your company's staff and turnover figures. You can also make your contact card public, or hide it completely.</p>
        <p style="margin:0">You can edit or remove any of your details at any time from “My profile”. To have your profile deleted entirely, write to the administrators.</p></div>
      <div class="panel"><h2>Distinguished alumni</h2><p style="margin:0">Profiles marked “Pride of CPCA” were prepared from the college's list of distinguished alumni. If one is yours, sign in with the email address the college holds for you to take it over and keep it current.</p></div>
    </div>`;
  };
})();

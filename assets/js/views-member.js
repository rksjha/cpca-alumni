// Pages for members: sign in / join, and "My profile" (the editor).
(function () {
  const { esc, avatar, toast, busy, formValues, yearSpan } = CPCA.ui;
  const data = CPCA.data;

  // ── Join / sign in ──
  CPCA.views.join = async function (app, _arg, ctx) {
    if (ctx.user) { location.hash = "#/me"; return; }
    if (!data.live) {
      app.innerHTML = `<div class="wrap narrow"><div class="panel center"><h2>Member sign-in opens shortly</h2>
        <p class="muted">The portal is in preview mode while its member database is being connected. You can already browse the distinguished-alumni directory.</p>
        <a class="btn btn-primary" href="#/directory">Browse the directory</a></div></div>`;
      return;
    }
    app.innerHTML = `<div class="wrap narrow"><div class="panel">
      <h2 class="center">Join the CPCA Alumni Network</h2>
      <p class="muted small center">New here or returning — it's the same step. No password needed.</p>
      <button class="btn btn-ghost btn-block" id="google">Continue with Google</button>
      <div class="divider">or use your email</div>
      <form id="email-form"><div class="field"><label for="email">Email address</label><input id="email" type="email" required autocomplete="email" placeholder="you@example.com"></div>
        <button class="btn btn-primary btn-block">Email me a sign-in link</button></form>
      <div id="sent" hidden><div class="banner info">✓ Check your inbox. Open the link we've just emailed you and you'll be signed in — no password needed. (Look in Spam if it hasn't arrived in a minute.)</div></div>
      <p class="hint center" style="margin-top:16px">Trouble signing in? Write to <a href="mailto:alumnigau@gmail.com?subject=CPCA%20Alumni%20Network%20%E2%80%94%20sign-in%20help">alumnigau@gmail.com</a>.</p>
      <p class="hint center" style="margin-top:16px">Listed among the college's distinguished alumni? Use the same email the college has for you and your ready-made profile is handed to you automatically.</p>
    </div></div>`;

    const $ = (s) => app.querySelector(s);
    $("#google").onclick = (e) => busy(e.target, () => data.signInWith("google"));
    $("#email-form").onsubmit = (e) => {
      e.preventDefault();
      busy(e.submitter, async () => { await data.sendEmailCode($("#email").value.trim()); $("#email-form").hidden = true; $("#sent").hidden = false; });
    };
  };

  // ── Generic "list with add / edit / delete" used for education, experience and companies ──
  function field(f, value) {
    const v = value === null || value === undefined ? "" : value;
    const attrs = `name="${f.name}" id="f-${f.name}" ${f.required ? "required" : ""} ${f.max ? `maxlength="${f.max}"` : ""}`;
    if (f.type === "checkbox") return `<div class="field" style="grid-column:1/-1"><label style="font-weight:500"><input type="checkbox" ${attrs} ${v ? "checked" : ""}>${esc(f.label)}</label></div>`;
    let input;
    if (f.type === "select") input = `<select ${attrs}><option value="">Select…</option>${f.options.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    else if (f.type === "textarea") input = `<textarea ${attrs}>${esc(v)}</textarea>`;
    else if (f.type === "year") input = `<input type="number" min="1940" max="2100" ${attrs} value="${esc(v)}" placeholder="YYYY">`;
    else input = `<input type="${f.type || "text"}" ${attrs} value="${esc(v)}" placeholder="${esc(f.placeholder || "")}">`;
    return `<div class="field" ${f.wide ? 'style="grid-column:1/-1"' : ""}><label for="f-${f.name}">${esc(f.label)}</label>${input}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}</div>`;
  }

  function listEditor(host, o) {
    let editing; // undefined = list only, object = form open
    function render() {
      host.innerHTML = `<div class="panel"><div class="item-row" style="margin-bottom:14px"><h2 style="margin:0">${esc(o.heading)}</h2>
          ${editing ? "" : `<button class="btn btn-primary btn-sm" data-add>+ Add</button>`}</div>
        ${o.intro ? `<p class="small muted">${esc(o.intro)}</p>` : ""}
        ${editing ? `<form class="grid-2" data-form>${o.fields.map((f) => field(f, editing[f.name])).join("")}
            <div style="grid-column:1/-1;display:flex;gap:10px"><button class="btn btn-primary">Save</button><button type="button" class="btn btn-ghost" data-cancel>Cancel</button></div></form>`
          : o.rows.map((r, i) => `<div class="item"><div class="item-row"><div><h3>${o.title(r)}</h3><div class="small muted">${esc(o.subtitle(r))}</div></div>
              <div style="display:flex;gap:6px;flex:none"><button class="btn btn-ghost btn-sm" data-edit="${i}">Edit</button><button class="btn btn-danger btn-sm" data-del="${i}">Delete</button></div></div></div>`).join("")
            || `<div class="empty">${esc(o.emptyText)}</div>`}
      </div>`;

      const q = (s) => host.querySelector(s);
      if (q("[data-add]")) q("[data-add]").onclick = () => { editing = { ...(o.blank || {}) }; render(); };
      if (q("[data-cancel]")) q("[data-cancel]").onclick = () => { editing = undefined; render(); };
      host.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => { editing = { ...o.toForm(o.rows[b.dataset.edit]) }; render(); }));
      host.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
        const row = o.rows[b.dataset.del];
        if (!confirm("Delete this entry?")) return;
        busy(b, async () => { await o.remove(row); o.rows.splice(b.dataset.del, 1); toast("Deleted"); render(); if (o.changed) o.changed(); });
      }));
      if (q("[data-form]")) {
        if (o.onFormOpen) o.onFormOpen(q("[data-form]"));
        q("[data-form]").onsubmit = (e) => {
          e.preventDefault();
          busy(e.submitter, async () => {
            const saved = await o.save({ id: editing.id, ...formValues(e.target) });
            const at = o.rows.findIndex((r) => r.id === saved.id);
            if (at >= 0) o.rows[at] = saved; else o.rows.push(saved);
            editing = undefined; toast("Saved"); render(); if (o.changed) o.changed();
          });
        };
      }
    }
    render();
  }

  // ── My profile ──
  const SECTORS = ["Seeds", "Crop Protection & Agrochemicals", "Fertilizers & Agri Inputs", "Bio & Organic Inputs", "Food Processing & Supply Chain",
    "Nursery & Tissue Culture", "Irrigation & Farm Machinery", "Agri-tech & Services", "Dairy & Animal Husbandry", "Banking & Finance", "Consulting & Finance",
    "Government & Public Service", "Research & Academia", "Farming", "Other Industries"];
  const LINKS = [["linkedin", "LinkedIn"], ["website", "Personal / company website"], ["twitter", "X / Twitter"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["youtube", "YouTube"]];

  CPCA.views.me = async function (app, _arg, ctx) {
    if (!ctx.user) { location.hash = "#/join"; return; }
    const id = await data.joinNetwork(ctx.user.displayName || null); // the name Google gives us, if any
    const p = await data.getProfile(id);
    const contact = p.profile_private || { email: ctx.user.email, visibility: "members" };
    let tab = (p.education || []).some((e) => e.is_cpca) ? "basics" : "education";

    function statusBanner() {
      const hasCpca = p.education.some((e) => e.is_cpca);
      if (p.status === "approved") return `<div class="banner info">✓ You are a verified member. Your profile is live in the directory. <a href="#/alumni/${esc(p.id)}">View it</a></div>`;
      if (p.status === "suspended") return `<div class="banner warn">Your membership is currently suspended. Please contact the administrators.</div>`;
      return hasCpca
        ? `<div class="banner warn"><strong>Awaiting verification.</strong> An administrator will review your CPCA degree and approve your membership. Meanwhile, complete the rest of your profile.</div>`
        : `<div class="banner warn"><strong>Welcome! One thing first:</strong> add the degree you earned at C. P. College of Agriculture below, so an administrator can verify you.</div>`;
    }

    function shell() {
      const tabs = [["basics", "Basics & photo"], ["education", "CPCA & education"], ["companies", "Companies"], ["experience", "Experience"], ["contact", "Contact & links"]];
      app.innerHTML = `<div class="wrap mid">
        <div class="item-row" style="align-items:center;margin-bottom:18px"><h1 style="font-size:2rem;margin:0">My profile</h1><button class="btn btn-ghost btn-sm" id="signout">Sign out</button></div>
        <div id="status">${statusBanner()}</div>
        <div class="tabs" role="tablist">${tabs.map(([k, label]) => `<button role="tab" class="tab ${k === tab ? "active" : ""}" data-tab="${k}">${label}</button>`).join("")}</div>
        <div id="pane"></div>${CPCA.community.inviteBlock(p.batch_year)}</div>`;
      CPCA.community.wireInvite(app);
      app.querySelector("#signout").onclick = (e) => busy(e.target, async () => { await data.signOut(); location.hash = "#/"; });
      app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; shell(); }));
      panes[tab](app.querySelector("#pane"));
    }
    const refreshStatus = () => (app.querySelector("#status").innerHTML = statusBanner());

    const panes = {
      basics(host) {
        host.innerHTML = `<form class="panel" id="basics">
          <div style="display:flex;gap:18px;align-items:center;margin-bottom:20px;flex-wrap:wrap"><span id="photo">${avatar(p, true)}</span>
            <div><label class="btn btn-ghost btn-sm" style="display:inline-flex">Change photo<input type="file" id="file" accept="image/jpeg,image/png,image/webp" hidden></label><div class="hint">A clear head-and-shoulders photo works best.</div></div></div>
          <div class="grid-2">
            ${field({ name: "full_name", label: "Full name", required: true, max: 120 }, p.full_name)}
            ${field({ name: "batch_year", label: "CPCA pass-out year (batch)", type: "year" }, p.batch_year)}
            ${field({ name: "headline", label: "Headline", max: 200, wide: true, placeholder: "e.g. Seed entrepreneur · Founder, ABC Seeds Pvt. Ltd.", hint: "One line that tells fellow alumni what you do." }, p.headline)}
            ${field({ name: "campus", label: "Your college / campus", type: "select",
              options: data.CAMPUSES.includes(p.campus) || !p.campus ? data.CAMPUSES : [p.campus, ...data.CAMPUSES],
              hint: "Where you studied. CPCA alumni: pick C. P. College of Agriculture." }, p.campus)}
            ${field({ name: "profession", label: "What you do now", type: "select",
              options: data.PROFESSIONS.includes(p.profession) || !p.profession ? data.PROFESSIONS : [p.profession, ...data.PROFESSIONS] }, p.profession)}
            ${field({ name: "profession_detail", label: "Your role / designation", max: 120, placeholder: "e.g. Deputy Director of Agriculture" }, p.profession_detail)}
            ${field({ name: "location", label: "Where you live or work", max: 200, placeholder: "City, State, Country" }, p.location)}
            ${field({ name: "sector", label: "Sector (for the directory filter)", type: "select", options: SECTORS.includes(p.sector) || !p.sector ? SECTORS : [p.sector, ...SECTORS] }, p.sector)}
            ${field({ name: "about", label: "About you", type: "textarea", max: 3000, wide: true }, p.about)}
          </div><button class="btn btn-primary">Save</button></form>`;
        host.querySelector("#file").onchange = (e) => {
          const file = e.target.files[0]; if (!file) return;
          busy(null, async () => { toast("Uploading photo…"); p.photo_url = await data.uploadPhoto(file); await data.saveProfile(p.id, { photo_url: p.photo_url }); host.querySelector("#photo").innerHTML = avatar(p, true); toast("Photo updated"); });
        };
        host.querySelector("#basics").onsubmit = (e) => {
          e.preventDefault();
          busy(e.submitter, async () => { const v = formValues(e.target); delete v[""]; await data.saveProfile(p.id, v); Object.assign(p, v); toast("Saved"); });
        };
      },

      education(host) {
        listEditor(host, {
          heading: "CPCA & education", rows: p.education, blank: { is_cpca: true, college: data.CPCA_COLLEGE, institution: data.SDAU },
          intro: "Add each degree separately — if you did both your UG and PG at CPCA, add two entries. You can also add degrees from other institutions.",
          emptyText: "No degrees yet. Add your CPCA degree to get verified.",
          fields: [
            { name: "is_cpca", type: "checkbox", label: "This degree is from C. P. College of Agriculture (SDAU)" },
            { name: "level", label: "Degree level", type: "select", options: ["UG", "PG", "PhD", "Diploma", "Other"], required: true },
            { name: "program", label: "Degree & subject", max: 160, placeholder: "e.g. B.Sc. (Hons.) Agriculture" },
            { name: "college", label: "College / campus", max: 200 }, { name: "institution", label: "University", max: 200 },
            { name: "start_year", label: "Year joined", type: "year" }, { name: "end_year", label: "Pass-out year", type: "year", required: true },
          ],
          title: (r) => esc([r.level, r.program].filter(Boolean).join(" · ") || "Degree") + (r.is_cpca ? ' <span class="chip">CPCA</span>' : ""),
          subtitle: (r) => [r.college, r.institution, yearSpan(r.start_year, r.end_year)].filter(Boolean).join(" · "),
          toForm: (r) => r,
          onFormOpen(form) { // ticking "CPCA" fills in college and university
            const box = form.querySelector("[name=is_cpca]");
            box.onchange = () => { if (box.checked) { form.querySelector("[name=college]").value = data.CPCA_COLLEGE; form.querySelector("[name=institution]").value = data.SDAU; } };
          },
          async save(row) {
            const saved = await data.saveRow("education", p.id, row);
            if (saved.is_cpca && !p.batch_year && saved.end_year) { await data.saveProfile(p.id, { batch_year: saved.end_year }); p.batch_year = saved.end_year; }
            return saved;
          },
          remove: (r) => data.deleteRow("education", p.id, r.id), changed: refreshStatus,
        });
      },

      companies(host) {
        listEditor(host, {
          heading: "Companies & ventures", rows: p.companies, blank: { role: "Founder" },
          intro: "Businesses you own, co-founded or lead. Staff and turnover figures are shown to verified alumni only — leave them blank if you prefer.",
          emptyText: "No companies added. Employed rather than self-employed? Use the Experience tab.",
          fields: [
            { name: "name", label: "Company name", required: true, max: 300 }, { name: "role", label: "Your role", max: 120, placeholder: "Founder, Director, Partner…" },
            { name: "description", label: "What the company does", type: "textarea", max: 2000, wide: true },
            { name: "location", label: "Location", max: 200 }, { name: "website", label: "Website", max: 300, placeholder: "www.example.com" },
            { name: "year_established", label: "Year established", type: "year" }, { name: "employees", label: "Number of employees", type: "number" },
            { name: "turnover", label: "Annual turnover (₹)", max: 60, placeholder: "e.g. 5 Cr" },
          ],
          title: (r) => esc(r.name), subtitle: (r) => [r.role, r.location, r.year_established && "Est. " + r.year_established].filter(Boolean).join(" · "),
          toForm: (r) => ({ ...r, employees: r.company_stats && r.company_stats.employees, turnover: r.company_stats && r.company_stats.turnover }),
          async save(row) {
            delete row.company_stats;
            const saved = await data.saveCompany(p.id, row);
            saved.company_stats = { employees: row.employees, turnover: row.turnover };
            return saved;
          },
          remove: (r) => data.deleteRow("companies", p.id, r.id),
        });
      },

      experience(host) {
        listEditor(host, {
          heading: "Experience", rows: p.experience, blank: {}, intro: "Jobs and positions you have held, most recent first.",
          emptyText: "No experience added yet.",
          fields: [
            { name: "organisation", label: "Organisation", required: true, max: 200 }, { name: "title", label: "Position / title", max: 160 },
            { name: "location", label: "Location", max: 200, wide: true },
            { name: "start_year", label: "From (year)", type: "year" }, { name: "end_year", label: "To (year)", type: "year" },
            { name: "is_current", type: "checkbox", label: "I currently work here" },
            { name: "description", label: "What you did", type: "textarea", max: 2000, wide: true },
          ],
          title: (r) => esc(r.title || r.organisation), subtitle: (r) => [r.title && r.organisation, r.location, yearSpan(r.start_year, r.end_year, r.is_current)].filter(Boolean).join(" · "),
          toForm: (r) => r, save: (row) => data.saveRow("experience", p.id, row), remove: (r) => data.deleteRow("experience", p.id, r.id),
        });
      },

      contact(host) {
        host.innerHTML = `<form class="panel" id="contact"><h2>Contact details</h2><div class="grid-2">
            ${field({ name: "email", label: "Email", type: "email", max: 200 }, contact.email)}
            ${field({ name: "phone", label: "Phone", type: "tel", max: 40 }, contact.phone)}
            ${field({ name: "whatsapp", label: "WhatsApp number", type: "tel", max: 40 }, contact.whatsapp)}
            ${field({ name: "dob", label: "Date of birth", max: 30, placeholder: "DD/MM/YYYY", hint: "Never shown publicly — used only so the network can wish you." }, contact.dob)}
            <div class="field"><label for="f-visibility">Who can see these?</label><select name="visibility" id="f-visibility">
              <option value="members" ${contact.visibility === "members" ? "selected" : ""}>Verified CPCA alumni only (recommended)</option>
              <option value="public" ${contact.visibility === "public" ? "selected" : ""}>Everyone on the internet</option>
              <option value="hidden" ${contact.visibility === "hidden" ? "selected" : ""}>Nobody — keep hidden</option></select></div>
          </div>
          <h2 style="margin-top:12px">Social &amp; web links</h2><div class="grid-2">
            ${LINKS.map(([k, label]) => field({ name: "link_" + k, label, max: 300, placeholder: "https://…" }, (p.links || {})[k])).join("")}
          </div><button class="btn btn-primary">Save</button></form>`;
        host.querySelector("#contact").onsubmit = (e) => {
          e.preventDefault();
          busy(e.submitter, async () => {
            const v = formValues(e.target), links = {};
            LINKS.forEach(([k]) => { if (v["link_" + k]) links[k] = v["link_" + k]; });
            const card = { email: v.email, phone: v.phone, whatsapp: v.whatsapp, dob: v.dob, visibility: v.visibility };
            await data.saveContact(p.id, card); await data.saveProfile(p.id, { links });
            Object.assign(contact, card); p.links = links; toast("Saved");
          });
        };
      },
    };
    shell();
  };
})();

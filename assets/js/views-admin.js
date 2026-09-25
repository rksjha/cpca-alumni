// Administrator desk: approve new members, award the "Pride of CPCA" badge, manage administrators.
(function () {
  const { esc, toast, busy } = CPCA.ui;
  const data = CPCA.data;

  CPCA.views.admin = async function (app, _arg, ctx) {
    if (!ctx.user) { location.hash = "#/join"; return; }
    if (!ctx.isAdmin) { app.innerHTML = `<div class="wrap narrow center"><h2>Administrators only</h2><a class="btn btn-primary" href="#/">Back to home</a></div>`; return; }

    const [members, admins] = await Promise.all([data.adminListMembers(), data.adminListEmails()]);
    members.forEach((m) => (m.profile_private = data.one(m.profile_private)));

    // Someone from the 2025 questionnaire counts as a CPCA alumnus if the college is named anywhere
    // in what they told us — the campus field, a degree, their headline, even their own wording.
    const CPCA_WORDS = /\b(c\.?\s*p\.?\s*college|cpca|sardar\s*krushi|sardarkrushi|s\.?\s*k\.?\s*nagar|sk\s*nagar|dantiwada)\b/i;
    function mentionsCpca(m) {
      if ((m.education || []).some((e) => e.is_cpca)) return true;
      const parts = [m.campus, m.headline, m.location, m.profession, m.profession_detail];
      (m.education || []).forEach((e) => parts.push(e.program, e.college, e.institution));
      return CPCA_WORDS.test(parts.filter(Boolean).join(" | "));
    }

    function cpcaClaim(m) {
      const list = (m.education || []).filter((e) => e.is_cpca).map((e) => [e.level, e.program, e.end_year].filter(Boolean).join(" "));
      return list.length ? list.join("; ") : "— no CPCA degree entered yet";
    }

    function memberRow(m) {
      const c = m.profile_private || {};
      const actions = m.merged_into
        ? `<button class="btn btn-ghost btn-sm" data-status="approved">Bring back</button>`
        : {
          pending: `<button class="btn btn-primary btn-sm" data-status="approved">Approve</button> <button class="btn btn-danger btn-sm" data-status="suspended">Reject</button>`,
          approved: `<button class="btn btn-ghost btn-sm" data-star>${m.is_distinguished ? "Remove ★" : "Make ★ Pride"}</button> <button class="btn btn-danger btn-sm" data-status="suspended">Suspend</button>`,
          suspended: `<button class="btn btn-primary btn-sm" data-status="approved">Reinstate</button>`,
        }[m.status];
      // Someone can only be written to if we hold an address for them.
      const canWrite = c.email && String(c.email).indexOf("@") > 0 && !m.merged_into;
      return `<tr data-id="${esc(m.id)}"><td><a href="#/alumni/${esc(m.id)}"><strong>${esc(m.full_name)}</strong></a> ${m.is_distinguished ? '<span class="chip gold">★</span>' : ""}
          <div class="small muted">${esc(c.email || "no email on file")} ${esc(c.phone || "")}</div>
          ${m.merged_into ? '<div class="small muted">Duplicate — its details were merged into another profile</div>'
            : m.user_id ? "" : '<div class="small muted">Has never signed in</div>'}</td>
        <td class="small">${esc(cpcaClaim(m))}</td><td class="small">${esc(new Date(m.created_at).toLocaleDateString("en-IN"))}</td>
        <td style="white-space:nowrap">${actions}
          ${canWrite ? ` <button class="btn btn-ghost btn-sm" data-msg>Message</button>` : ""}</td></tr>
        ${canWrite ? `<tr class="msg-row" data-msg-for="${esc(m.id)}" hidden><td colspan="4"></td></tr>` : ""}`;
    }

    // Ready-made openings for the questions that actually get asked before a decision.
    const TEMPLATES = [
      ["Which CPCA degree?", "Ask what they studied and when",
        "Before we can add you to the alumni directory, could you tell us which degree you earned at C. P. College of Agriculture, and the year you passed out?"],
      ["Proof of studying at CPCA", "Ask for something that confirms it",
        "To confirm your place in the alumni network, could you reply with your enrolment number, or a photograph of your degree or marksheet? It is only seen by the administrators."],
      ["Please complete your profile", "Nudge someone who left it blank",
        "Your profile is still almost empty, so we cannot yet tell which batch you belong to. Please sign in and add your degree, your pass-out year and what you do now."],
      ["", "Write my own", ""],
    ];

    /** Opens a short form under a member's row to write to them. */
    function openComposer(m, tr) {
      const host = app.querySelector(`[data-msg-for="${CSS.escape(m.id)}"]`);
      if (!host) return;
      if (!host.hidden) { host.hidden = true; host.querySelector("td").innerHTML = ""; return; }
      const c = m.profile_private || {};
      host.hidden = false;
      host.querySelector("td").innerHTML = `<div class="panel" style="margin:6px 0">
        <h3 style="margin:0 0 4px;font-size:1rem">Write to ${esc(m.full_name)}</h3>
        <p class="small muted" style="margin:0 0 12px">Goes to ${esc(c.email || "")} from admin@cpcaalumni.org, and their reply comes back there. Sent within the hour.</p>
        <div class="links" style="margin-bottom:10px">${TEMPLATES.map((t, i) => `<button type="button" class="btn btn-ghost btn-sm" data-tpl="${i}">${esc(t[1])}</button>`).join(" ")}</div>
        <form data-send>
          <div class="field"><label for="ms-${esc(m.id)}">Subject</label><input id="ms-${esc(m.id)}" name="subject" maxlength="160" required></div>
          <div class="field"><label for="mb-${esc(m.id)}">Message</label><textarea id="mb-${esc(m.id)}" name="body" maxlength="8000" style="min-height:130px" required></textarea>
            <div class="hint">Their name and a greeting are added automatically.</div></div>
          <div style="display:flex;gap:10px"><button class="btn btn-primary btn-sm">Send</button>
            <button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button>
            <span class="small muted" data-sent-log></span></div>
        </form></div>`;
      const form = host.querySelector("[data-send]");
      host.querySelectorAll("[data-tpl]").forEach((b) => (b.onclick = () => {
        const t = TEMPLATES[Number(b.dataset.tpl)];
        form.subject.value = t[0]; form.body.value = t[2];
        (t[2] ? form.body : form.subject).focus();
      }));
      host.querySelector("[data-cancel]").onclick = () => openComposer(m, tr);
      data.adminListMessages(m.id).then((prev) => {
        if (!prev.length) return;
        const log = host.querySelector("[data-sent-log]");
        if (log) log.textContent = `${prev.length} message${prev.length > 1 ? "s" : ""} sent before — last on ${new Date(prev[0].createdAt).toLocaleDateString("en-IN")}`;
      }).catch(() => { /* history is a nicety, never block writing */ });
      form.onsubmit = (e) => {
        e.preventDefault();
        busy(e.submitter, async () => {
          await data.adminSendMessage(m.id, { to: c.email, name: m.full_name, subject: form.subject.value, body: form.body.value });
          toast(`Queued for ${m.full_name} — it goes out within the hour`);
          openComposer(m, tr);
        });
      };
    }

    function section(title, list, emptyText) {
      return `<div class="panel"><h2>${esc(title)} (${list.length})</h2>${list.length
        ? `<div class="table-scroll"><table><thead><tr><th>Member</th><th>CPCA degree stated</th><th>Joined</th><th>Action</th></tr></thead><tbody>${list.map(memberRow).join("")}</tbody></table></div>`
        : `<p class="muted small" style="margin:0">${esc(emptyText)}</p>`}</div>`;
    }

    function render() {
      const by = (s) => members.filter((m) => m.status === s);
      app.innerHTML = `<div class="wrap" style="padding-top:40px;padding-bottom:64px">
        <h1 style="font-size:2.2rem">Administrator desk</h1>
        ${(() => {
          const waiting = by("pending").filter((m) => m.user_id);
          const withDegree = waiting.filter((m) => (m.education || []).some((e) => e.is_cpca));
          const blank = waiting.filter((m) => !(m.education || []).length && !m.campus && !m.profession);
          if (!waiting.length) return section("Waiting for approval", [], "Nobody is waiting. When someone signs in and adds their CPCA degree, they appear here.");
          return `<div class="panel"><h2>Waiting for approval (${waiting.length})</h2>
            <p class="small muted">These people have signed in and are waiting for you. Until you approve them they do not appear in the directory.
              <strong>${withDegree.length}</strong> have entered a degree; <strong>${blank.length}</strong> have filled in nothing yet.
              Use <strong>Message</strong> to ask someone for the detail you need before deciding.</p>
            <div class="links" style="margin-bottom:14px">
              <button class="btn btn-primary btn-sm" data-bulk="degree">Approve the ${withDegree.length} with a stated degree</button>
              <button class="btn btn-ghost btn-sm" data-bulk="all">Approve all ${waiting.length}</button>
              <span class="small muted" id="bulk-log"></span>
            </div>
            <div class="table-scroll"><table><thead><tr><th>Member</th><th>Degree stated</th><th>Joined</th><th>Action</th></tr></thead>
              <tbody>${waiting.map(memberRow).join("")}</tbody></table></div></div>`;
        })()}
        ${(() => {
          // From the 2025 questionnaire and never signed in. Those who name CPCA belong in front of
          // an administrator; the rest answered about other GAU colleges and are left where they are.
          const unclaimed = by("pending").filter((m) => !m.user_id && !m.merged_into);
          const ours = unclaimed.filter(mentionsCpca);
          if (!ours.length) return "";
          return `<div class="panel"><h2>CPCA alumni from the questionnaire, awaiting your decision (${ours.length})</h2>
            <p class="small muted">Each of these named C. P. College of Agriculture, Sardarkrushinagar or SK Nagar when they answered the 2025 questionnaire, but <strong>has never signed in</strong>. Their profiles are hidden from the public today.
              <strong>Approving one publishes their name, batch and career in the directory before they have visited the portal</strong>, so approve the ones you recognise rather than the whole list. They keep being invited by email to claim their profile.</p>
            <div class="table-scroll"><table><thead><tr><th>Member</th><th>CPCA degree stated</th><th>Added</th><th>Action</th></tr></thead>
              <tbody>${ours.map(memberRow).join("")}</tbody></table></div></div>`;
        })()}
        ${(() => {
          const unclaimed = by("pending").filter((m) => !m.user_id && !m.merged_into);
          const others = unclaimed.filter((m) => !mentionsCpca(m));
          if (!others.length) return "";
          const campuses = [...new Set(others.map((m) => m.campus).filter(Boolean))];
          return `<div class="panel"><h2>Other colleges, not yet claimed (${others.length})</h2>
            <p class="small muted">Also from the 2025 questionnaire, but they named another college of the University rather than CPCA. <strong>Hidden from the public.</strong> If one signs in with the same email address their details are waiting for them, and they then appear above for your approval.${campuses.length ? ` Colleges represented: ${campuses.length}.` : ""}</p>
            <details><summary class="small" style="cursor:pointer">Show the list</summary>
              <div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>Name</th><th>College / campus</th><th>Profession</th><th>Batch</th></tr></thead><tbody>
              ${others.map((m) => `<tr><td><strong>${esc(m.full_name)}</strong><div class="small muted">${esc((m.profile_private || {}).email || "")}</div></td>
                <td class="small">${esc(m.campus || "—")}</td><td class="small">${esc(m.profession || "—")}</td><td class="small">${esc(m.batch_year || "—")}</td></tr>`).join("")}
              </tbody></table></div></details></div>`;
        })()}
        ${section("Approved members", by("approved"), "No approved members yet.")}
        ${(() => {
          const real = by("suspended").filter((m) => !m.merged_into);
          return real.length ? `<div class="panel"><h2>Suspended / rejected (${real.length})</h2>
            <p class="small muted">Hidden from the directory. <strong>Reinstate</strong> puts someone back, and <strong>Message</strong> lets you ask them for whatever you need before deciding.</p>
            <div class="table-scroll"><table><thead><tr><th>Member</th><th>CPCA degree stated</th><th>Joined</th><th>Action</th></tr></thead>
              <tbody>${real.map(memberRow).join("")}</tbody></table></div></div>` : "";
        })()}
        ${(() => {
          const gone = by("suspended").filter((m) => m.merged_into);
          return gone.length ? `<div class="panel"><h2>Merged duplicates (${gone.length})</h2>
            <p class="small muted">Each of these was the same person twice. Their details were copied into the profile that was kept and these emptied records were retired, so they are not suspended members and need nothing from you. Nothing was deleted — <strong>Bring back</strong> restores one if a merge was wrong.</p>
            <details><summary class="small" style="cursor:pointer">Show the list</summary>
              <div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>Member</th><th>CPCA degree stated</th><th>Joined</th><th>Action</th></tr></thead>
                <tbody>${gone.map(memberRow).join("")}</tbody></table></div></details></div>` : "";
        })()}
        <div class="panel"><h2>Import the college's list</h2>
          <p class="small muted">Choose the alumni file prepared for this portal (<code>seed_alumni.json</code>). Each alumnus is added as an approved “Pride of CPCA” profile that they can later claim with their own email address. Anyone already imported is skipped, so running it twice is safe. The file stays on your computer — only the profiles go to the portal.</p>
          <label class="btn btn-primary btn-sm" style="display:inline-flex">Choose file and import<input type="file" id="import-file" accept="application/json,.json" hidden></label>
          <div id="import-log" class="small muted" style="margin-top:12px"></div>
        </div>

        <div class="panel"><h2>Import questionnaire replies</h2>
          <p class="small muted">Choose <code>seed_respondents.json</code> — the people who answered the alumni-body questionnaire. Each is added as a <strong>hidden</strong> profile that only they can claim, by signing in with the same email address. Nothing appears publicly until they claim it and you approve them. Running it twice is safe.</p>
          <label class="btn btn-ghost btn-sm" style="display:inline-flex">Choose file and import<input type="file" id="import-resp" accept="application/json,.json" hidden></label>
          <div id="import-resp-log" class="small muted" style="margin-top:12px"></div>
        </div>

        <div class="panel"><h2>Administrators</h2><p class="small muted">People who sign in with these email addresses can approve members and manage this list.</p>
          ${admins.map((a) => `<div class="item item-row"><span>${esc(a.email)}</span>${a.email === (ctx.user.email || "").toLowerCase() ? '<span class="chip">You</span>' : `<button class="btn btn-danger btn-sm" data-remove-admin="${esc(a.email)}">Remove</button>`}</div>`).join("")}
          <form id="add-admin" style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"><input type="email" required placeholder="colleague@example.com" style="flex:1;min-width:220px" aria-label="New administrator email"><button class="btn btn-primary btn-sm">Add administrator</button></form>
        </div></div>`;

      app.querySelectorAll("tr[data-id]").forEach((tr) => {
        const m = members.find((x) => x.id === tr.dataset.id);
        tr.querySelectorAll("[data-status]").forEach((b) => (b.onclick = () => busy(b, async () => {
          await data.adminSetStatus(m.id, b.dataset.status); m.status = b.dataset.status; toast(`${m.full_name}: ${m.status}`); render();
        })));
        const star = tr.querySelector("[data-star]");
        if (star) star.onclick = () => busy(star, async () => { await data.adminSetDistinguished(m.id, !m.is_distinguished); m.is_distinguished = !m.is_distinguished; render(); });
        const msg = tr.querySelector("[data-msg]");
        if (msg) msg.onclick = () => openComposer(m, tr);
      });
      app.querySelectorAll("[data-remove-admin]").forEach((b) => (b.onclick = () => {
        if (!confirm(`Remove ${b.dataset.removeAdmin} as administrator?`)) return;
        busy(b, async () => { await data.adminRemoveEmail(b.dataset.removeAdmin); admins.splice(admins.findIndex((a) => a.email === b.dataset.removeAdmin), 1); render(); });
      }));
      app.querySelector("#import-file").onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const log = app.querySelector("#import-log");
        try {
          const parsed = JSON.parse(await file.text());
          const people = Array.isArray(parsed) ? parsed : parsed.people;
          if (!Array.isArray(people) || !people.length) throw new Error("That file has no alumni in it.");
          if (!confirm(`Import ${people.length} alumni into the portal?`)) return;
          log.textContent = "Importing…";
          const result = await data.adminImport(people, (added, skipped, name) => {
            log.textContent = `Added ${added}, skipped ${skipped} — ${name}`;
          });
          log.textContent = `Finished: ${result.added} added, ${result.skipped} already present.`;
          toast(`Imported ${result.added} alumni`);
          const fresh = await data.adminListMembers();
          fresh.forEach((m) => (m.profile_private = data.one(m.profile_private)));
          members.length = 0; members.push(...fresh); render();
        } catch (err) {
          console.error(err);
          log.textContent = "Import failed: " + (err.message || err);
          toast("Import failed — " + (err.message || err), true);
        } finally { e.target.value = ""; }
      };
      app.querySelectorAll("[data-bulk]").forEach((b) => (b.onclick = () => {
        const waiting = members.filter((m) => m.status === "pending" && m.user_id);
        const chosen = b.dataset.bulk === "degree" ? waiting.filter((m) => (m.education || []).some((e) => e.is_cpca)) : waiting;
        if (!chosen.length) { toast("Nobody matches that", true); return; }
        if (!confirm(`Approve ${chosen.length} member${chosen.length > 1 ? "s" : ""}? They will appear in the public directory.`)) return;
        const log = app.querySelector("#bulk-log");
        busy(b, async () => {
          await data.adminApproveMany(chosen.map((m) => m.id), (done, total) => (log.textContent = `${done} of ${total}…`));
          chosen.forEach((m) => (m.status = "approved"));
          toast(`${chosen.length} members approved`); render();
        });
      }));
      app.querySelector("#import-resp").onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const log = app.querySelector("#import-resp-log");
        try {
          const parsed = JSON.parse(await file.text());
          const people = Array.isArray(parsed) ? parsed : parsed.people;
          if (!Array.isArray(people) || !people.length) throw new Error("That file has no people in it.");
          if (!confirm(`Add ${people.length} questionnaire replies as hidden, claimable profiles?`)) return;
          log.textContent = "Importing…";
          const result = await data.adminImportRespondents(people, (added, skipped, name) => {
            log.textContent = `Added ${added}, skipped ${skipped} — ${name}`;
          });
          log.textContent = `Finished: ${result.added} added, ${result.skipped} already present.`;
          toast(`${result.added} profiles ready to be claimed`);
          const fresh = await data.adminListMembers();
          fresh.forEach((m) => (m.profile_private = data.one(m.profile_private)));
          members.length = 0; members.push(...fresh); render();
        } catch (err) {
          console.error(err);
          log.textContent = "Import failed: " + (err.message || err);
          toast("Import failed — " + (err.message || err), true);
        } finally { e.target.value = ""; }
      };
      app.querySelector("#add-admin").onsubmit = (e) => {
        e.preventDefault();
        const email = e.target.querySelector("input").value.trim().toLowerCase();
        busy(e.submitter, async () => { await data.adminAddEmail(email); admins.push({ email }); toast("Administrator added"); render(); });
      };
    }
    render();
  };
})();

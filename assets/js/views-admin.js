// Administrator desk: approve new members, award the "Pride of CPCA" badge, manage administrators.
(function () {
  const { esc, toast, busy } = CPCA.ui;
  const data = CPCA.data;

  CPCA.views.admin = async function (app, _arg, ctx) {
    if (!ctx.user) { location.hash = "#/join"; return; }
    if (!ctx.isAdmin) { app.innerHTML = `<div class="wrap narrow center"><h2>Administrators only</h2><a class="btn btn-primary" href="#/">Back to home</a></div>`; return; }

    const [members, admins] = await Promise.all([data.adminListMembers(), data.adminListEmails()]);
    members.forEach((m) => (m.profile_private = data.one(m.profile_private)));

    function cpcaClaim(m) {
      const list = (m.education || []).filter((e) => e.is_cpca).map((e) => [e.level, e.program, e.end_year].filter(Boolean).join(" "));
      return list.length ? list.join("; ") : "— no CPCA degree entered yet";
    }

    function memberRow(m) {
      const c = m.profile_private || {};
      const actions = {
        pending: `<button class="btn btn-primary btn-sm" data-status="approved">Approve</button> <button class="btn btn-danger btn-sm" data-status="suspended">Reject</button>`,
        approved: `<button class="btn btn-ghost btn-sm" data-star>${m.is_distinguished ? "Remove ★" : "Make ★ Pride"}</button> <button class="btn btn-danger btn-sm" data-status="suspended">Suspend</button>`,
        suspended: `<button class="btn btn-ghost btn-sm" data-status="approved">Reinstate</button>`,
      }[m.status];
      return `<tr data-id="${esc(m.id)}"><td><a href="#/alumni/${esc(m.id)}"><strong>${esc(m.full_name)}</strong></a> ${m.is_distinguished ? '<span class="chip gold">★</span>' : ""}
          <div class="small muted">${esc(c.email || "")} ${esc(c.phone || "")}</div>${m.user_id ? "" : '<div class="small muted">Not yet claimed by the alumnus</div>'}</td>
        <td class="small">${esc(cpcaClaim(m))}</td><td class="small">${esc(new Date(m.created_at).toLocaleDateString("en-IN"))}</td>
        <td style="white-space:nowrap">${actions}</td></tr>`;
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
        ${section("Waiting for approval", by("pending").filter((m) => m.user_id),
            "Nobody is waiting. When someone signs in and adds their CPCA degree, they appear here.")}
        ${(() => {
          const invited = by("pending").filter((m) => !m.user_id);
          if (!invited.length) return "";
          const campuses = [...new Set(invited.map((m) => m.campus).filter(Boolean))];
          return `<div class="panel"><h2>Invited, not yet claimed (${invited.length})</h2>
            <p class="small muted">Prepared from the 2025 questionnaire. These profiles are <strong>hidden from the public</strong>. When one of these alumni signs in with the same email address, their details are waiting for them — then they appear above for your approval.${campuses.length ? ` Colleges represented: ${campuses.length}.` : ""}</p>
            <details><summary class="small" style="cursor:pointer">Show the list</summary>
              <div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>Name</th><th>College / campus</th><th>Profession</th><th>Batch</th></tr></thead><tbody>
              ${invited.map((m) => `<tr><td><strong>${esc(m.full_name)}</strong><div class="small muted">${esc((m.profile_private || {}).email || "")}</div></td>
                <td class="small">${esc(m.campus || "—")}</td><td class="small">${esc(m.profession || "—")}</td><td class="small">${esc(m.batch_year || "—")}</td></tr>`).join("")}
              </tbody></table></div></details></div>`;
        })()}
        ${section("Approved members", by("approved"), "No approved members yet.")}
        ${by("suspended").length ? section("Suspended / rejected", by("suspended"), "") : ""}
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

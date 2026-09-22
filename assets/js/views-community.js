// Announcements (a noticeboard anyone can read) and Chat rooms (for verified members).
(function () {
  const { esc, avatar, toast, busy, safeUrl } = CPCA.ui;
  const data = CPCA.data;

  const when = (ms) => {
    if (!ms) return "";
    const d = new Date(ms), now = Date.now(), mins = Math.round((now - ms) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    if (mins < 1440) return Math.round(mins / 60) + " h ago";
    if (mins < 10080) return Math.round(mins / 1440) + " d ago";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  // Announcements are written by administrators, so light formatting is safe — but the text is
  // still escaped first, then only paragraph breaks and plain links are turned back into markup.
  const asRichText = (s) => esc(s).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")
    .replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(u)}</a>`);

  // ── Announcements ──
  CPCA.views.news = async function (app, _arg, ctx) {
    app.innerHTML = `<div class="wrap mid" style="max-width:860px">
      <div class="item-row" style="align-items:center;margin-bottom:6px">
        <h1 style="font-size:2.2rem;margin:0">Announcements</h1>
        ${ctx.isAdmin ? '<button class="btn btn-primary btn-sm" id="new-post">+ New announcement</button>' : ""}
      </div>
      <p class="muted">News, notices and decisions from the administrators of the network.</p>
      <div id="composer"></div><div id="list"><div class="spinner" role="status" aria-label="Loading"></div></div></div>`;

    const list = app.querySelector("#list");
    async function refresh() {
      const posts = await data.listAnnouncements();
      list.innerHTML = posts.length ? posts.map((a) => `
        <article class="panel">
          <div class="item-row"><div>
            <h2 style="margin-bottom:4px">${esc(a.title)}</h2>
            <div class="small muted">${esc(a.authorName || "Administrator")} · ${esc(when(a.created_at))}${a.emailed ? " · emailed to members" : ""}</div>
          </div>${ctx.isAdmin ? `<button class="btn btn-danger btn-sm" data-del="${esc(a.id)}">Delete</button>` : ""}</div>
          <div style="margin-top:12px"><p>${asRichText(a.body)}</p></div>
        </article>`).join("")
        : `<div class="empty">No announcements yet.${ctx.isAdmin ? " Use “New announcement” to post the first one." : ""}</div>`;
      list.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
        if (!confirm("Delete this announcement?")) return;
        busy(b, async () => { await data.deleteAnnouncement(b.dataset.del); toast("Deleted"); refresh(); });
      }));
    }

    if (ctx.isAdmin) {
      app.querySelector("#new-post").onclick = () => {
        const host = app.querySelector("#composer");
        if (host.querySelector("form")) return;
        host.innerHTML = `<form class="panel"><h2>New announcement</h2>
          <div class="field"><label for="a-title">Title</label><input id="a-title" maxlength="140" required></div>
          <div class="field"><label for="a-body">Message</label><textarea id="a-body" maxlength="8000" style="min-height:180px" required></textarea>
            <div class="hint">Leave a blank line between paragraphs. Web links become clickable.</div></div>
          <label style="font-weight:500"><input type="checkbox" id="a-email" checked> Also email this to every verified member</label>
          <div style="display:flex;gap:10px;margin-top:16px"><button class="btn btn-primary">Post announcement</button>
            <button type="button" class="btn btn-ghost" id="a-cancel">Cancel</button></div></form>`;
        host.querySelector("#a-cancel").onclick = () => (host.innerHTML = "");
        host.querySelector("form").onsubmit = (e) => {
          e.preventDefault();
          busy(e.submitter, async () => {
            const queued = await data.postAnnouncement({
              title: app.querySelector("#a-title").value.trim(),
              body: app.querySelector("#a-body").value.trim(),
              email: app.querySelector("#a-email").checked,
            });
            host.innerHTML = "";
            toast(queued ? "Posted — and queued for emailing" : "Posted");
            refresh();
          });
        };
      };
    }
    refresh();
  };

  // ── Chat rooms ──
  const ROOM_KINDS = ["Batch", "Subject / Discipline", "Chapter / Region", "Committee", "General"];

  CPCA.views.rooms = async function (app, _arg, ctx) {
    if (!ctx.user) { app.innerHTML = notMember("Chat rooms are for verified alumni.", true); return; }
    const me = await data.myMembership();
    if (!me || me.status !== "approved") { app.innerHTML = notMember("Chat rooms open as soon as an administrator approves your membership."); return; }

    const rooms = await data.listRooms();
    app.innerHTML = `<div class="wrap mid" style="max-width:900px">
      <div class="item-row" style="align-items:center;margin-bottom:6px">
        <h1 style="font-size:2.2rem;margin:0">Chat rooms</h1>
        ${ctx.isAdmin ? '<button class="btn btn-primary btn-sm" id="new-room">+ New room</button>' : ""}
      </div>
      <p class="muted">Talk with your batch, your discipline or your chapter. Messages are kept for good — every room keeps its full history.</p>
      <div id="composer"></div>
      <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${rooms.map((r) => `
        <a class="card" style="padding:18px" href="#/room/${esc(r.id)}">
          <h3 style="font-size:1.05rem;margin:0">${esc(r.name)}</h3>
          <div class="small muted">${esc(r.kind || "General")}${r.description ? " · " + esc(r.description) : ""}</div>
          <div class="meta"><span class="chip grey">${r.message_count || 0} messages</span>
            ${r.last_at ? `<span class="chip grey">${esc(when(r.last_at))}</span>` : ""}</div>
        </a>`).join("") || `<div class="empty" style="grid-column:1/-1">No rooms yet.${ctx.isAdmin ? " Create the first one." : " An administrator will open them shortly."}</div>`}
      </div>
      ${ctx.isAdmin ? `<p class="hint" style="margin-top:14px">${rooms.length} of ${data.MAX_ROOMS} rooms used.</p>` : ""}
    </div>`;

    if (ctx.isAdmin) {
      app.querySelector("#new-room").onclick = () => {
        const host = app.querySelector("#composer");
        if (host.querySelector("form")) return;
        host.innerHTML = `<form class="panel"><h2>New chat room</h2>
          <div class="grid-2">
            <div class="field"><label for="r-name">Room name</label><input id="r-name" maxlength="80" required placeholder="e.g. Batch of 2004"></div>
            <div class="field"><label for="r-kind">Type</label><select id="r-kind">${ROOM_KINDS.map((k) => `<option>${esc(k)}</option>`).join("")}</select></div>
            <div class="field" style="grid-column:1/-1"><label for="r-desc">One-line description</label><input id="r-desc" maxlength="140"></div>
          </div>
          <div style="display:flex;gap:10px"><button class="btn btn-primary">Create room</button>
            <button type="button" class="btn btn-ghost" id="r-cancel">Cancel</button></div></form>`;
        host.querySelector("#r-cancel").onclick = () => (host.innerHTML = "");
        host.querySelector("form").onsubmit = (e) => {
          e.preventDefault();
          busy(e.submitter, async () => {
            await data.createRoom({ name: app.querySelector("#r-name").value.trim(),
              kind: app.querySelector("#r-kind").value, description: app.querySelector("#r-desc").value.trim() });
            toast("Room created"); CPCA.views.rooms(app, null, ctx);
          });
        };
      };
    }
  };

  const notMember = (line, signIn) => `<div class="wrap narrow center" style="margin-top:60px">
      <div class="panel"><h2>Members only</h2><p class="muted">${esc(line)}</p>
      <a class="btn btn-primary" href="${signIn ? "#/join" : "#/me"}">${signIn ? "Sign in" : "My profile"}</a></div></div>`;

  // ── One room ──
  CPCA.views.room = async function (app, roomId, ctx) {
    if (!ctx.user) { app.innerHTML = notMember("Chat rooms are for verified alumni.", true); return; }
    const me = await data.myMembership();
    if (!me || me.status !== "approved") { app.innerHTML = notMember("Chat rooms open as soon as an administrator approves your membership."); return; }
    const room = await data.getRoom(roomId);
    if (!room) { app.innerHTML = `<div class="wrap narrow center"><h2>Room not found</h2><a class="btn btn-primary" href="#/rooms">All rooms</a></div>`; return; }

    app.innerHTML = `<div class="wrap mid" style="max-width:860px">
      <a class="small" href="#/rooms">← All rooms</a>
      <div class="item-row" style="align-items:center;margin:8px 0 4px">
        <h1 style="font-size:1.8rem;margin:0">${esc(room.name)}</h1>
        <span class="chip">${esc(room.kind || "General")}</span></div>
      <p class="muted small">${esc(room.description || "")}</p>
      <div class="panel" style="padding:0">
        <div id="messages" class="chat"><div class="spinner" role="status" aria-label="Loading"></div></div>
        <form id="say" class="chat-compose">
          <input id="text" maxlength="2000" placeholder="Write a message…" autocomplete="off" aria-label="Your message">
          <button class="btn btn-primary btn-sm">Send</button>
        </form>
      </div>
      <p class="hint">Messages are kept permanently. Be courteous — every member of this room can see what you write, and administrators can remove anything inappropriate.</p>
    </div>`;

    const box = app.querySelector("#messages");
    let lastDay = "";
    const render = (msgs) => {
      lastDay = "";
      box.innerHTML = msgs.map((m) => {
        const day = new Date(m.created_at || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
        const sep = day !== lastDay ? `<div class="chat-day">${esc(day)}</div>` : "";
        lastDay = day;
        const mine = m.author_id === ctx.user.uid;
        return `${sep}<div class="msg${mine ? " mine" : ""}">
          <div class="msg-head">${esc(m.author_name || "Member")} · ${esc(when(m.created_at))}
            ${mine || ctx.isAdmin ? `<button class="linkish" data-del="${esc(m.id)}" title="Delete">×</button>` : ""}</div>
          <div class="msg-body">${esc(m.text)}</div></div>`;
      }).join("") || `<div class="empty" style="border:0">No messages yet. Say hello.</div>`;
      box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
        if (confirm("Delete this message?")) data.deleteMessage(roomId, b.dataset.del).catch((e) => toast(e.message, true));
      }));
      box.scrollTop = box.scrollHeight;
    };

    const stop = data.watchMessages(roomId, render, (e) => { box.innerHTML = `<div class="empty" style="border:0">Could not load messages: ${esc(e.message)}</div>`; });
    CPCA.onLeaveView = stop;   // the router calls this before showing another page

    app.querySelector("#say").onsubmit = (e) => {
      e.preventDefault();
      const input = app.querySelector("#text");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      data.sendMessage(roomId, text).catch((err) => { toast(err.message || "Could not send", true); input.value = text; });
    };
  };
})();

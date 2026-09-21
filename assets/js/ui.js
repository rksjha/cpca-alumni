// Small shared helpers. Everything typed by members is escaped before it touches the page.
window.CPCA = window.CPCA || {};

CPCA.ui = (function () {
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => (v === null || v === undefined ? "" : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

  // Only http(s) links are ever rendered; anything else (javascript:, data:) is dropped.
  function safeUrl(v) {
    if (!v) return "";
    let s = String(v).trim();
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
    } catch (e) { return ""; }
  }

  const AVATAR_COLOURS = ["#1f7a4d", "#0f3d2e", "#8a6d10", "#2f6f73", "#7a4b1f", "#3d5a80", "#6b4e71"];
  function initials(name) {
    const parts = String(name || "?").replace(/^(dr\.?|shri|smt\.?)\s+/i, "").split(/\s+/).filter(Boolean);
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function avatar(p, large) {
    const cls = "avatar" + (large ? " lg" : "");
    const photo = safeUrl(p.photo_url);
    if (photo) return `<img class="${cls}" src="${esc(photo)}" alt="" loading="lazy">`;
    let hash = 0;
    for (const ch of String(p.full_name || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return `<span class="${cls}" style="background:${AVATAR_COLOURS[hash % AVATAR_COLOURS.length]}" aria-hidden="true">${esc(initials(p.full_name))}</span>`;
  }

  function personCard(p) {
    const company = (p.companies && p.companies[0] && p.companies[0].name) || "";
    return `<a class="card" href="#/alumni/${esc(p.id)}">
      <div class="card-top">${avatar(p)}<div><h3>${esc(p.full_name)}</h3><div class="small muted">${esc(company)}</div></div></div>
      <div class="headline">${esc(p.headline)}</div>
      <div class="meta">
        ${p.is_distinguished ? '<span class="chip gold">★ Pride of CPCA</span>' : ""}
        ${p.profession ? `<span class="chip">${esc(p.profession)}</span>` : ""}
        ${p.batch_year ? `<span class="chip">Batch ${esc(p.batch_year)}</span>` : ""}
        ${p.location ? `<span class="chip grey">${esc(p.location.split(",").slice(-2).join(",").trim())}</span>` : ""}
      </div></a>`;
  }

  let toastTimer;
  function toast(message, isError) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.className = "show" + (isError ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = ""), isError ? 6000 : 3000);
  }

  // Runs an async action from a button: disables it, shows errors as a toast, re-enables.
  async function busy(button, fn) {
    const label = button ? button.textContent : "";
    if (button) { button.disabled = true; button.textContent = "Please wait…"; }
    try { return await fn(); }
    catch (e) { console.error(e); toast(e.message || "Something went wrong. Please try again.", true); }
    finally { if (button) { button.disabled = false; button.textContent = label; } }
  }

  // Reads every named input inside a form into a plain object ("" becomes null, numbers parsed).
  function formValues(form) {
    const out = {};
    form.querySelectorAll("[name]").forEach((el) => {
      if (el.type === "checkbox") out[el.name] = el.checked;
      else if (el.type === "number") out[el.name] = el.value === "" ? null : Number(el.value);
      else out[el.name] = el.value.trim() === "" ? null : el.value.trim();
    });
    return out;
  }

  const yearSpan = (a, b, current) => [a, current ? "Present" : b].filter(Boolean).join(" – ");

  return { esc, safeUrl, avatar, initials, personCard, toast, busy, formValues, yearSpan };
})();

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

  // Profile photographs, unlike the links members type, legitimately come in two shapes: an https
  // address (the picture Google gives us at sign-in) and a data: URL (a photo uploaded here, which
  // is shrunk in the browser and kept inside the profile document). safeUrl deliberately drops
  // data: URLs — correct for links, but it silently discarded every uploaded photograph, which is
  // why they appeared to save and then never showed. Pictures get their own, equally strict check:
  // https, or a base64 JPEG/PNG/WebP and nothing else. SVG is excluded on purpose.
  const DATA_IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
  function safeImage(v) {
    if (!v) return "";
    const s = String(v).trim();
    if (DATA_IMAGE.test(s)) return s;
    try { return new URL(s).protocol === "https:" ? s : ""; } catch (e) { return ""; }
  }

  const AVATAR_COLOURS = ["#1f7a4d", "#0f3d2e", "#8a6d10", "#2f6f73", "#7a4b1f", "#3d5a80", "#6b4e71"];
  function initials(name) {
    const parts = String(name || "?").replace(/^(dr\.?|shri|smt\.?)\s+/i, "").split(/\s+/).filter(Boolean);
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function initialsAvatar(p, cls) {
    let hash = 0;
    for (const ch of String(p.full_name || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return `<span class="${cls}" style="background:${AVATAR_COLOURS[hash % AVATAR_COLOURS.length]}" aria-hidden="true">${esc(initials(p.full_name))}</span>`;
  }
  function avatar(p, large) {
    const cls = "avatar" + (large ? " lg" : "");
    const photo = safeImage(p.photo_url);
    const fallback = initialsAvatar(p, cls);
    if (!photo) return fallback;
    // A picture hosted by Google can stop resolving later. Fall back to the initials rather than
    // leaving a broken-image icon; the markup swapped in is our own, already escaped.
    return `<img class="${cls}" src="${esc(photo)}" alt="" loading="lazy"
      data-fallback="${esc(fallback)}" onerror="this.outerHTML=this.dataset.fallback">`;
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

  // Firebase reports problems as codes like "auth/quota-exceeded", and its raw message text
  // ("Firebase: Exceeded daily quota for email sign-in. (auth/quota-exceeded).") is meaningless
  // to an alumnus and looks broken. Translate the ones that actually happen into plain English
  // that says what to do next.
  const ERRORS = {
    "auth/quota-exceeded": "We have sent as many sign-in emails as we are allowed today. Use “Continue with Google” instead — it works straight away and sends no email.",
    "auth/too-many-requests": "That has been tried several times just now. Wait a minute, or use “Continue with Google”.",
    "auth/invalid-email": "That does not look like a complete email address. Please check it and try again.",
    "auth/missing-email": "Please type your email address first.",
    "auth/network-request-failed": "We could not reach the network. Check your connection and try again.",
    "auth/user-disabled": "This account has been suspended. Please write to admin@cpcaalumni.org.",
    "auth/expired-action-code": "That sign-in link has expired. Ask for a new one, or use “Continue with Google”.",
    "auth/invalid-action-code": "That sign-in link has already been used. Ask for a new one, or use “Continue with Google”.",
    "auth/account-exists-with-different-credential": "You joined by a different route last time. Try “Continue with Google”, or ask for a sign-in link by email.",
    "auth/unauthorized-domain": "Sign-in is not permitted from this address. Please write to admin@cpcaalumni.org.",
    "permission-denied": "You do not have permission for that. If you have just joined, an administrator needs to approve you first.",
    "unavailable": "The connection dropped for a moment. Please try again.",
    "resource-exhausted": "The portal is unusually busy. Please try again in a few minutes.",
  };

  // Turns any error into something a person can act on. Never returns raw Firebase text.
  function explain(e) {
    const known = ERRORS[(e && e.code) || ""];
    if (known) return known;
    const msg = String((e && e.message) || "");
    if (/^Firebase:|FirebaseError/i.test(msg)) {
      return "Something went wrong at our end. Please try “Continue with Google”, or write to admin@cpcaalumni.org.";
    }
    return msg || "Something went wrong. Please try again.";
  }

  // Runs an async action from a button: disables it, shows errors as a toast, re-enables.
  async function busy(button, fn) {
    const label = button ? button.textContent : "";
    if (button) { button.disabled = true; button.textContent = "Please wait…"; }
    try { return await fn(); }
    catch (e) { console.error(e); toast(explain(e), true); }
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

  return { esc, safeUrl, safeImage, avatar, initials, personCard, toast, busy, explain, formValues, yearSpan };
})();

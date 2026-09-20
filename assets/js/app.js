// Start-up and page routing (#/directory, #/alumni/<id>, #/join, #/me, #/admin, #/about).
(function () {
  const data = CPCA.data;
  const app = document.getElementById("app");
  const ctx = { user: null, isAdmin: false };
  const ROUTES = { "": "home", directory: "directory", alumni: "profile", join: "join", me: "me", admin: "admin", about: "about", college: "college" };

  async function refreshSession() {
    ctx.user = data.getUser();
    ctx.isAdmin = ctx.user ? await data.isAdmin().catch(() => false) : false;
    document.getElementById("nav-join").hidden = Boolean(ctx.user);
    document.getElementById("nav-me").hidden = !ctx.user;
    document.getElementById("nav-admin").hidden = !ctx.isAdmin;
  }

  let navigation = 0;
  async function route() {
    const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
    const view = ROUTES[name] || "home";
    const mine = ++navigation;
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === name));
    app.innerHTML = '<div class="spinner" role="status" aria-label="Loading"></div>';
    window.scrollTo(0, 0);
    try {
      await CPCA.views[view](app, arg ? decodeURIComponent(arg) : null, ctx);
    } catch (e) {
      console.error(e);
      if (mine === navigation) app.innerHTML = `<div class="wrap narrow center"><h2>We couldn't load this page</h2><p class="muted">${CPCA.ui.esc(e.message || "")}</p><button class="btn btn-primary" onclick="location.reload()">Try again</button></div>`;
    }
  }

  async function start() {
    document.getElementById("preview-bar").hidden = data.live;
    const returningFromSignIn = data.live && data.isEmailLink(); // opened from an emailed sign-in link
    await data.ready();      // Firebase restores any existing session first
    await refreshSession();
    if (returningFromSignIn && ctx.user) location.hash = "#/me";
    data.onAuthChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      // Deferred: Supabase must not be called from inside its own auth callback.
      setTimeout(async () => {
        const wasSignedIn = Boolean(ctx.user);
        await refreshSession();
        if (!wasSignedIn && ctx.user) location.hash === "#/me" ? route() : (location.hash = "#/me"); // fresh sign-in → profile
        else if (wasSignedIn && !ctx.user) route();
      }, 0);
    });
    window.addEventListener("hashchange", route);
    route();
  }
  start();
})();

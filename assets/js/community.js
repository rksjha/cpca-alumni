// "Stay connected" (social media) and "Invite batchmates" blocks.
// Only accounts that the University links from its own website (sdau.edu.in) are embedded.
// Other CPCA pages are listed as community pages, clearly labelled, because their ownership is unconfirmed.
CPCA.community = (function () {
  const { esc } = CPCA.ui;
  const SITE = "https://cpcaalumni.org/";

  const OFFICIAL = [
    { name: "SDAU on Facebook", note: "Official University page", url: "https://www.facebook.com/sdauni",
      embed: "https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2Fsdauni&tabs=timeline&width=340&height=420&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false" },
    { name: "SDAU on YouTube", note: "Official University channel", url: "https://www.youtube.com/channel/UCmlGpKXf0Co-rzW8Sh27Xew",
      embed: "https://www.youtube-nocookie.com/embed/videoseries?list=UUmlGpKXf0Co-rzW8Sh27Xew" },
    { name: "SDAU on Instagram", note: "Official University account", url: "https://www.instagram.com/sdau_official_/",
      embed: "https://www.instagram.com/sdau_official_/embed" },
  ];
  const COMMUNITY = [
    { name: "CP College of Agriculture", where: "Facebook", url: "https://www.facebook.com/cpca.dantiwada/" },
    { name: "CPCA (@cpca_official)", where: "Instagram · student community", url: "https://www.instagram.com/cpca_official/" },
    { name: "SDAU school page — see alumni", where: "LinkedIn", url: "https://in.linkedin.com/school/sardarkrushinagar-dantiwada-agricultural-university-banaskantha/" },
    { name: "Official University website", where: "sdau.edu.in · CPCA page", url: "https://www.sdau.edu.in/College/2" },
  ];

  // Feeds load only when the visitor asks, so no third-party tracking happens by default.
  function socialSection() {
    return `<section class="block" style="padding-top:0"><div class="wrap">
      <div class="section-head"><div><h2>Stay connected with the campus</h2>
        <p class="muted" style="margin:0">Live updates from the University's official channels, and the pages where CPCA's community gathers.</p></div></div>
      <div class="social-grid">${OFFICIAL.map((s, i) => `
        <div class="panel social-card"><div class="item-row" style="align-items:center;margin-bottom:12px"><div><h3 style="margin:0">${esc(s.name)}</h3><div class="small muted">${esc(s.note)}</div></div>
          <a class="btn btn-ghost btn-sm" href="${esc(s.url)}" target="_blank" rel="noopener">Open ↗</a></div>
          <div class="social-frame" data-embed="${i}"><button class="btn btn-primary btn-sm" data-load="${i}">Show latest posts</button>
            <div class="hint" style="margin-top:8px">Loads content from ${esc(new URL(s.url).hostname.replace("www.", ""))}</div></div></div>`).join("")}
      </div>
      <div class="cards" style="margin-top:18px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">${COMMUNITY.map((c) => `
        <a class="card" style="padding:16px" href="${esc(c.url)}" target="_blank" rel="noopener"><h3 style="font-size:1rem">${esc(c.name)} ↗</h3><div class="small muted">${esc(c.where)}</div></a>`).join("")}
      </div>
      <p class="hint" style="margin-top:12px">Embedded feeds are the accounts the University links from its own website. Other pages are community-run and listed for convenience; this portal does not operate them.</p>
    </div></section>`;
  }
  function wireSocial(root) {
    root.querySelectorAll("[data-load]").forEach((b) => (b.onclick = () => {
      const s = OFFICIAL[b.dataset.load];
      root.querySelector(`[data-embed="${b.dataset.load}"]`).innerHTML =
        `<iframe src="${esc(s.embed)}" title="${esc(s.name)}" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    }));
  }

  // Invite block: alumni bring in their own batchmates — people join by their own choice and consent.
  function inviteBlock(batchYear) {
    const text = `I've joined the CPCA Alumni Network — one place for everyone who studied at C. P. College of Agriculture, Sardarkrushinagar${batchYear ? ` (I'm batch of ${batchYear})` : ""}. Join and add your profile: ${SITE}`;
    const e = encodeURIComponent;
    return `<div class="panel invite"><h2>Invite your batchmates</h2>
      <p class="small muted">The network grows one batch WhatsApp group at a time. Share the link — each person joins and controls their own details.</p>
      <div class="links">
        <a class="btn btn-primary btn-sm" href="https://wa.me/?text=${e(text)}" target="_blank" rel="noopener">Share on WhatsApp</a>
        <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/sharing/share-offsite/?url=${e(SITE)}" target="_blank" rel="noopener">Share on LinkedIn</a>
        <a class="btn btn-ghost btn-sm" href="https://www.facebook.com/sharer/sharer.php?u=${e(SITE)}" target="_blank" rel="noopener">Share on Facebook</a>
        <a class="btn btn-ghost btn-sm" href="mailto:?subject=${e("Join the CPCA Alumni Network")}&body=${e(text)}">Email</a>
        <button class="btn btn-ghost btn-sm" data-copy="${esc(text)}">Copy invite text</button>
      </div></div>`;
  }
  function wireInvite(root) {
    root.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); CPCA.ui.toast("Invite copied — paste it in your batch group"); }
      catch (err) { prompt("Copy this invite:", b.dataset.copy); }
    }));
  }

  return { socialSection, wireSocial, inviteBlock, wireInvite };
})();

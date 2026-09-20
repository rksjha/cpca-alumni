// "Our College" — the CPCA story written for alumni.
// Every fact below was taken from the University's official website (sdau.edu.in / old.sdau.edu.in), checked September 2026.
// Wording is our own. Facts the official site does not state (intake, rankings, current office-holders) are deliberately left out.
(function () {
  const S = "https://www.sdau.edu.in";

  const TIMELINE = [
    ["1969", "Gujarat Agricultural University (GAU) is created by an Act of the Gujarat legislature — the parent under which our college would be born."],
    ["1979", "The Regional Research Station comes up at Sardarkrushinagar; the oilseeds research headquarters had moved here a year earlier."],
    ["June 1982", "The College of Agriculture opens as a constituent college of GAU — holding its first classes in a primary-school building. Agronomy, Entomology, Soil Science and Agricultural Economics begin with it."],
    ["24 Dec 1991", "The college moves into its present two-storey building."],
    ["29 Oct 1994", "Formally inaugurated and named Chimanbhai Patel College of Agriculture, after the late Chief Minister of Gujarat. “CPCA” is born."],
    ["1995–96", "The Rural Agricultural Work Experience programme (RAWE) begins — the village semester every later batch remembers."],
    ["1 May 2004", "GAU is divided into four universities. Our campus becomes Sardarkrushinagar Dantiwada Agricultural University (SDAU)."],
    ["July 2017", "The NCC Army Wing becomes operational on campus, open to men and women."],
    ["2019", "A CPCA postgraduate student receives the NSS National Award (2017-18) from the President of India. The same year, SDAU wins gold for March Past at the All India Inter-Agricultural Universities Youth Festival."],
    ["2025", "The campus oilseeds centre is named Best AICRP (Castor) Centre; the University's NSS volunteers take first place at the Banaskantha District Youth Parliament."],
  ];

  const DEPARTMENTS = ["Agronomy", "Genetics & Plant Breeding", "Entomology", "Plant Pathology", "Soil Science", "Horticulture", "Agricultural Economics",
    "Extension Education", "Agricultural Engineering", "Agricultural Statistics", "Animal Science", "Meteorology", "Microbiology", "Nematology"];

  const SOURCES = [
    ["CPCA on the University website", S + "/College/2"], ["Why SDAU — history and Acts", S + "/why-sdau/1"], ["Hostels", S + "/hostel"],
    ["Campus facilities", S + "/facilities/0"], ["Directorate of Student Welfare", S + "/StudentWelfareDepartment/49"], ["Student achievements", S + "/DSW-achievements"],
    ["NSS awards", S + "/nss-awards"], ["Centre for Oilseeds Research", S + "/Research/68"], ["Centre for Crop Improvement", S + "/Research/74"],
    ["Directorate of Extension Education", S + "/ExtDept/108"], ["Placement & Counselling Cell", S + "/placement-counseling-cell"], ["All colleges of SDAU", S + "/AllCollege"],
    ["Official CPCA photo gallery", S + "/pgallery/908931/cpca-photo-gallery"],
  ];

  CPCA.views.college = function (app) {
    app.innerHTML = `
      <section class="hero hero-photo" style="padding:64px 0 88px"><div class="wrap">
        <span class="eyebrow">Our college · since June 1982</span>
        <h1 style="font-size:clamp(1.9rem,4.4vw,3rem)">It began in a borrowed<br>primary-school building.</h1>
        <p class="lead" style="margin-bottom:0">Four decades on, Chimanbhai Patel College of Agriculture stands at the heart of an 1,185-hectare university campus at the foot of the Aravallis — and its graduates have built seed companies, crop-care firms, nurseries, cold chains and consultancies across Gujarat and beyond. This is the story we share.</p>
      </div></section>

      <div class="wrap mid" style="margin-top:-30px;position:relative;z-index:2;max-width:900px">
        <div class="panel"><h2>GAU or SDAU? The same family.</h2>
          <p>If you passed out before May 2004, you studied under <strong>Gujarat Agricultural University</strong>. If you came later, under <strong>Sardarkrushinagar Dantiwada Agricultural University</strong>. The name on the degree changed; the classrooms, the farm and the hostel corridors did not. This network is for both — every CPCA graduate, whether UG, PG or PhD.</p>
          <div class="timeline">${TIMELINE.map(([when, what]) => `<div class="tl-row"><div class="tl-when">${when}</div><div class="tl-what">${what}</div></div>`).join("")}</div>
        </div>

        <div class="panel"><h2>What we studied</h2>
          <p>The college offers the four-year <strong>B.Sc. (Hons.) Agriculture</strong>, the two-year <strong>M.Sc. (Agriculture)</strong>, and doctoral research through its departments. Whichever department signed your thesis or taught your favourite course, it is probably still here:</p>
          <div class="links">${DEPARTMENTS.map((d) => `<span class="chip">${d}</span>`).join("")}</div>
        </div>

        <div class="panel"><h2>The campus you remember</h2>
          <p><strong>Hostels.</strong> Boys lived in Chandra Shekhar Azad, Mangal Pandey, Dr. C. T. Patel and Jagdishchandra Bose hostels; girls in Maharani Ahilyabai Holkar, Savitribai Fule and Neera Arya. If your hostel had another name in your day, tell us — that history belongs here too.</p>
          <p><strong>Beyond the classroom.</strong> The V. R. Mehta Auditorium, the sports complex with its pool and gym, grounds for cricket, kabaddi, volleyball and basketball, and a Central Library open from eight in the morning to seven at night. NSS, NCC, youth festivals and inter-college tournaments — where CPCA is a regular host and a regular on the podium.</p>
          <p style="margin:0"><strong>The village semester.</strong> Since 1995-96, final-year students have spent a full semester living and working with farm families under RAWE. For many of us, that is where the degree became real.</p>
        </div>

        <div class="panel"><h2>Research that grew around us</h2>
          <p>CPCA students learn beside working research centres. The <strong>Centre for Oilseeds Research</strong> carries a castor-breeding legacy that goes back to the hybrid GCH-3 of 1968 and runs national coordinated projects on castor and rapeseed-mustard. The <strong>Centre for Crop Improvement</strong> has released the Gujarat Amaranth series (from GA-2 in 2002 to GA-4, 5 and 6 in 2019). Sixteen off-campus stations — potato and millets at Deesa, date palm at Mundra, seed spices at Jagudan, wheat at Vijapur among them — serve the dry and demanding farms of North Gujarat and Kachchh.</p>
          <p style="margin:0">Three Krishi Vigyan Kendras — Deesa (since 1976), Khedbrahma and Tharad — take that work to farmers. Many alumni enterprises in this directory sell into the very districts these stations serve.</p>
        </div>

        <div class="panel"><h2>SDAU today</h2>
          <p style="margin:0">The University serves eight districts of North Gujarat and Kachchh through eleven colleges — from CPCA to newer colleges of agriculture at Tharad and Bhuj, horticulture at Jagudan, food technology, agribusiness management, renewable energy and agricultural engineering — with a stated mission of raising farm incomes while protecting the natural resource base.</p>
        </div>

        <div class="panel" style="background:var(--green-100);border-color:#c4dfcf"><h2>How alumni can give back</h2>
          <p class="small muted">Ideas from this network — not an official programme of the University.</p>
          <div class="steps" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
            <div><h3>Open a door</h3><p class="small" style="margin:0">Offer internships, RAWE industry attachments or first jobs. The University's Placement &amp; Counselling Cell has an officer for each college.</p></div>
            <div><h3>Share what you know</h3><p class="small" style="margin:0">A guest lecture on seed production, agri-finance or exports can change a student's direction.</p></div>
            <div><h3>Back a founder</h3><p class="small" style="margin:0">The campus hosts a Rural Business Incubation Centre. Alumni entrepreneurs make natural mentors.</p></div>
            <div><h3>Find your batch</h3><p class="small" style="margin:0">The simplest gift: bring five batchmates onto this network.</p></div>
          </div>
        </div>

        ${CPCA.community.inviteBlock()}

        <div class="panel"><h2>Official links &amp; sources</h2>
          <a href="${S}" target="_blank" rel="noopener" style="display:block;margin-bottom:14px"><img src="assets/img/sdau-logo-official.png" alt="Sardarkrushinagar Dantiwada Agricultural University — official website" style="max-width:360px;width:100%;height:auto"></a>
          <p class="small muted">College office: C. P. College of Agriculture, SDAU, Sardarkrushinagar 385506, Dist. Banaskantha, Gujarat. For admissions, certificates and transcripts please contact the college through the official website.</p>
          <div class="links">${SOURCES.map(([label, url]) => `<a class="btn btn-ghost btn-sm" href="${url}" target="_blank" rel="noopener">${label} ↗</a>`).join("")}</div>
          <p class="hint" style="margin-top:12px">The college photograph and the University logo are the University's own, from sdau.edu.in. Facts on this page were taken from the University's official website in September 2026 and written in our own words. This portal is alumni-run and not an official University site. Spotted an error, or have a photograph or memory to add? Write to the administrators.</p>
        </div>
      </div>`;
    CPCA.community.wireInvite(app);
  };
})();

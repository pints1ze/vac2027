/* Renders analysis index and destination pages from site/data/*.json. */
(function () {
  "use strict";
  const S = window.Site;

  function pill(text, cls) {
    if (text == null || text === "") return "";
    return `<span class="pill ${S.esc(cls || "")}">${S.esc(text)}</span>`;
  }

  /** Households trip.yaml flags `lockoff: true`; the lodging score rests only on options with a lock-off for each. */
  function lockoffHouseholds() {
    return (S.config().households || []).filter((h) => h.lockoff);
  }

  /** "lock-off ✓ / ✗ / ?" pill for one household's lockoff value (yes / no / not stated). */
  function lockoffPill(v, who) {
    const prefix = who ? who + ": " : "";
    if (v === "yes") return pill(prefix + "lock-off ✓", "yes");
    if (v === "no") return pill(prefix + "no lock-off ✗", "no");
    return pill(prefix + "lock-off ? (not stated)", "close");
  }

  /** "$1,500 verified"; a verified quote for other dates than the trip's (build.py sets price.stale) shows
      "verified (other dates)" in its own pill style. */
  function priceCell(p) {
    const t = S.priceText(p);
    const label = (p || {}).label || "unknown";
    if (p && p.stale) {
      const when = p.stay_dates ? ` title="quoted for ${S.esc(p.stay_dates)}"` : "";
      return `${S.esc(t || "n/a")} <span class="pill stale"${when}>${S.esc(label)} (other dates)</span>`;
    }
    return `${S.esc(t || "n/a")} <span class="pill ${S.esc(label)}">${S.esc(label)}</span>` + availPill(p);
  }

  /** Booking-engine availability for the trip dates (context/rubric.md "Availability"); none when available. */
  function availPill(p) {
    const a = (p || {}).availability;
    if (!a || a === "available") return "";
    return " " + pill(a.replace(/_/g, " "), a === "sold_out" || a === "gone" ? "no" : "estimate");
  }

  /** "stale" marker for an index row; the tooltip lists why. */
  function staleMarks(st) {
    if (!st || !st.stale) return "";
    const tip = (st.messages || []).join(" · ");
    return ` <span class="pill stale" title="${S.esc(tip)}">stale</span>`;
  }

  /** One short pill per hard-constraint check that disagrees with the data, e.g. "weather check fails". */

  function checkPills(st) {
    return ((st && st.check_disagreements) || [])
      .map((c) => pill(`${String(c.label).toLowerCase()} check ${c.passes ? "passes" : "fails"}`, "stale"))
      .join(" ");
  }

  /** Banner at the top of a stale destination page. */
  function staleBanner(st) {
    if (!st || !st.stale) return "";
    return (
      '<div class="flag stale-banner"><b>Needs rechecking for this trip.</b><ul>' +
      (st.messages || []).map((m) => `<li>${S.esc(m)}</li>`).join("") +
      "</ul></div>"
    );
  }

  /** Labels of the hard constraints this destination fails. */
  function failedConstraints(hc) {
    return (S.config().hard_constraints || [])
      .filter((c) => (hc || {})[c.id] === false)
      .map((c) => c.label || c.id);
  }

  /** "Weather ✓ Airport ✓ Seniors ✓" when every hard constraint passes. */
  function passLine() {
    return (S.config().hard_constraints || []).map((c) => `${c.label || c.id} ✓`).join(" ");
  }

  /** Pill class for an enum value: the first (best) value is good, middle values warn, the last is neutral. */
  function enumClass(value, values) {
    const i = (values || []).indexOf(value);
    if (i < 0) return "";
    if (i === 0) return "yes";
    return i === values.length - 1 ? "" : "estimate";
  }

  function inferSection(url, d) {
    for (const L of d.lodging || []) {
      if ((L.links || []).includes(url) || url === ((L.price || {}).source_url)) return "lodging";
    }
    for (const f of S.focusSections()) {
      if (S.focusItems(d, f.id).some((x) => x.url === url)) return f.id;
    }
    for (const key of ["activities", "restaurants"]) {
      if ((d[key] || []).some((x) => x.url === url)) return key;
    }
    if (url === ((d.weather || {}).source_url)) return "weather";
    return "general";
  }

  function card(r, title, url, facts, body, more) {
    return (
      `<article class="card">${S.img(r)}<div class="t"><h3>${S.link(url, S.esc(title))}</h3><div class="facts">${facts}</div>${body}` +
      (more ? `<details><summary>More</summary>${more}</details>` : "") +
      "</div></article>"
    );
  }

  function renderIndex(catalog) {
    const pics = new S.Pics("../");
    const cfg = S.config();
    const text = (cfg.site || {}).analysis || {};
    const LABELS = S.labels();
    const WEIGHTS = S.weights();
    const audience = text.audience ? `For ${S.esc(text.audience)}. ` : "";
    let b =
      `<h1>${S.esc(text.title || cfg.title || "")}</h1><p class="muted">${audience}Click a column to sort. ` +
      `Weights: ${WEIGHTS.map(([k, w]) => `${S.esc(String(LABELS[k]).toLowerCase())} ${w}`).join(" · ")}.</p>`;
    const nStale = (catalog.destinations || []).filter((d) => d.stale && d.stale.stale).length;
    if (nStale) {
      b +=
        `<div class="flag stale-banner"><b>${nStale} of ${(catalog.destinations || []).length} destinations need rechecking for ${S.esc(cfg.dates || "this trip")}.</b> ` +
        "Rows marked stale were researched or priced for other dates, or a hard-constraint check disagrees with the data; hover the marker or open the page for details.</div>";
    }
    b +=
      '<table><thead><tr><th></th><th data-sort="str">Destination</th><th data-sort="str">Region</th><th class=n data-sort="num">Total</th>' +
      WEIGHTS.map(([k]) => `<th class=n data-sort="num">${S.esc(LABELS[k])}</th>`).join("") +
      '<th data-sort="str">Constraints</th><th data-sort="str">Top lodging</th><th data-sort="num">Nightly</th></tr></thead><tbody>';

    for (const d of catalog.destinations || []) {
      const hero = d.hero_analysis || d.hero;
      const s = d.scores || {};
      const fails = failedConstraints(d.hard_constraints).map((x) => x.toLowerCase());
      const lo = d.top_lodging && d.top_lodging.nightly_low;
      b +=
        `<tr${d.stale && d.stale.stale ? ' class="is-stale"' : ""}><td>${S.img(hero, "thumb")}</td><td><a href="${S.esc(S.locationHref(d.slug))}"><b>${S.esc(d.name)}</b></a>${staleMarks(d.stale)}</td><td>${S.esc(d.region)}</td>` +
        `<td class=n data-v="${S.esc(s.total)}"><b>${S.esc(s.total)}</b></td>` +
        WEIGHTS.map(([k]) => `<td class=n data-v="${S.esc(s[k])}">${S.esc(s[k])}</td>`).join("") +
        `<td>${fails.length ? pill("fails: " + fails.join(", "), "no") : pill("all pass", "yes")} ${checkPills(d.stale)}</td>` +
        `<td>${S.esc((d.top_lodging && d.top_lodging.name) || "n/a")}` +
        `${d.top_lodging && d.top_lodging.lockoff === false && lockoffHouseholds().length ? " " + pill("no lock-off", "no") : ""}</td>` +
        `<td data-v="${lo != null ? lo : 99999}">${d.top_lodging ? priceCell({ nightly_total_usd_low: lo, label: d.top_lodging.price_label, stale: d.top_lodging.stale }) : ""}</td></tr>`;
      if (hero && hero.page) pics.credits[hero.page] = hero.credit || S.domain(hero.page);
    }
    b += '</tbody></table><h2>Verdicts</h2><div class="verdicts">';
    for (const d of catalog.destinations || []) {
      const hero = d.hero_analysis || d.hero;
      b +=
        `<article class="card">${S.img(hero)}<div class="t"><b><a href="${S.esc(S.locationHref(d.slug))}">${S.esc(d.name)}</a></b> ` +
        `<span class="num">${S.esc((d.scores || {}).total)}</span><p>${S.esc(d.summary || "")}</p></div></article>`;
    }
    b += `</div>${pics.creditsHtml()}`;
    document.getElementById("app").innerHTML = b;
    document.title = "Destination analysis — analysis";
    S.enableTableSort(document.getElementById("app"));
  }

  function renderDestination(d) {
    const pics = new S.Pics("../", d.og);
    const cfg = S.config();
    const LABELS = S.labels();
    const party = cfg.party_size;
    const s = d.scores || {};
    const hc = d.hard_constraints || {};
    const fails = failedConstraints(hc).map((x) => x.toLowerCase());
    const h = pics.hero(d);
    const nav = document.getElementById("nav");
    if (nav) {
      nav.innerHTML =
        `<a href="index.html">← All destinations (scored)</a><a href="../${S.esc(S.locationHref(d.slug))}">Family brochure page</a>`;
    }

    let b = '<div class="head"><div>';
    b += `<div class="muted">${S.esc(d.region)} · ${S.esc(d.type)} · researched ${S.esc(d.researched_on)}</div><h1>${S.esc(d.name)}</h1>`;
    b += staleBanner(d.stale);
    b += `<p>${S.esc(d.summary || "")}</p>`;
    if (fails.length) {
      b += `<div class="flag"><b>Fails hard constraint: ${S.esc(fails.join(", "))}.</b> ${S.esc(hc.notes || "")}</div>`;
    }
    b +=
      `</div><div>${S.img(h, "hero")}<div style="display:flex;align-items:baseline;gap:14px;margin-top:12px"><div class="total">${S.esc(s.total)}<small>/100</small></div>` +
      `<span class="muted">${fails.length ? "" : S.esc(passLine().toLowerCase())}</span></div><div class="bars">`;
    for (const [k, mx] of S.weights()) {
      const v = s[k] || 0;
      b += `<div class="bar"><span>${S.esc(LABELS[k])}</span><i style="--p:${Math.min(100, (v / mx) * 100).toFixed(0)}%"></i><span class="num">${v}/${mx}</span></div>`;
    }
    b += "</div></div></div>";

    const rat = s.rationale || {};
    if (Object.keys(rat).length) {
      b +=
        '<h2>Why these scores</h2><ul class="rat">' +
        Object.entries(rat)
          .map(([k, v]) => `<li><b>${S.esc(LABELS[k] || k)}</b>${S.esc(v)}</li>`)
          .join("") +
        "</ul>";
    }
    if (hc.notes && !fails.length) {
      b += `<details><summary>Hard-constraint notes</summary><p>${S.esc(hc.notes)}</p></details>`;
    }

    const lodging = d.lodging || [];
    const ratings = cfg.lodging_ratings || [];
    const lkh = lockoffHouseholds();
    b +=
      '<h2>Lodging at a glance</h2><table><thead><tr><th data-sort="str">Option</th>' +
      lkh.map((h) => `<th data-sort="str">${S.esc(lkh.length > 1 ? "Lock-off: " + h.name : "Lock-off")}</th>`).join("") +
      ratings.map((r) => `<th class=n data-sort="num">${S.esc(r.short_label || r.label)}</th>`).join("") +
      '<th class=n data-sort="num">Sum</th>' +
      `<th class=n data-sort="num">Walk</th><th data-sort="num">Nightly, all ${S.esc(party)}</th></tr></thead><tbody>`;
    lodging.forEach((L, i) => {
      const r = L.ratings || {};
      const lo = (L.price || {}).nightly_total_usd_low;
      const walk = L.walk_minutes_to_restaurants;
      b +=
        `<tr><td><a href="#l${i}">${S.esc(S.shortName(L.name))}</a></td>` +
        lkh.map((h) => `<td>${lockoffPill((L.lockoff || {})[h.id])}</td>`).join("") +
        ratings.map((x) => `<td class=n>${S.esc(r[x.id])}</td>`).join("") +
        `<td class=n>${S.ratingSum(L)}</td><td class=n data-v="${walk != null ? walk : 999}">${S.esc(walk != null ? walk + " min" : "drive")}</td>` +
        `<td data-v="${lo != null ? lo : 99999}">${priceCell(L.price)}</td></tr>`;
    });
    b += "</tbody></table>";

    const lodgeCard = (L, id) => {
      let b = "";
      let photos = pics.takeAll(L.images || [], 3);
      if (!photos.length) {
        const one = pics.take([], (L.links || []).slice(0, 2), L.name);
        photos = one ? [one] : [];
      }
      const fs = L.family_split || {};
      const p = L.price || {};
      const r = L.ratings || {};
      const thumbs =
        photos.length > 1
          ? `<div class="row">${photos.slice(1, 3).map((x) => S.img(x)).join("")}</div>`
          : "";
      const picsCol = photos.length ? `<div class="pics">${S.img(photos[0])}${thumbs}</div>` : "";
      b += `<article class="card lodge${photos.length ? "" : " nopics"}" id="${id}">${picsCol}<div class="txt">`;
      b += `<h3>${S.esc(L.name)}</h3><div class="muted">${S.esc(L.kind || "")}</div>`;
      if (L.quick_verdict) b += `<p class="verdict">${S.esc(L.quick_verdict)}</p>`;
      b +=
        '<div class="scores">' +
        ratings.map((x) => `<span>${S.esc(String(x.label).toLowerCase())} <b>${S.esc(r[x.id])}</b></span>`).join("") +
        `<span>nightly <b>${priceCell(p)}</b></span></div>`;
      if (lkh.length) {
        const lk = L.lockoff || {};
        b +=
          '<p class="lockoff">' +
          lkh.map((h) => `${lockoffPill(lk[h.id], lkh.length > 1 ? h.name : "")}`).join(" ") +
          (lk.basis ? ` <span class="muted">${S.esc(lk.basis)}</span>` : "") +
          "</p>";
      }
      b +=
        '<dl class="split">' +
        (cfg.households || []).map((h) => `<dt>${S.esc(h.name)}</dt><dd>${S.esc(fs[h.id])}</dd>`).join("") +
        "</dl>";
      b +=
        '<div class="pc"><div><b>Pros</b><ul>' +
        (L.pros || []).map((x) => `<li>${S.esc(x)}</li>`).join("") +
        "</ul></div><div><b>Compromises</b><ul>" +
        (L.compromises || []).map((x) => `<li>${S.esc(x)}</li>`).join("") +
        "</ul></div></div>";
      if (L.best_for) b += `<p class="muted" style="font-size:.9rem">${S.esc(L.best_for)}</p>`;
      b += "<details><summary>Configuration, price basis and notes</summary>";
      b += `<p><b>Configuration.</b> ${S.esc(L.configuration || "")}</p>`;
      if (L.food_convenience) b += `<p><b>Food.</b> ${S.esc(L.food_convenience)}</p>`;
      b +=
        `<p><b>Price basis.</b> ${S.esc(p.basis || "")} ${S.esc(p.fees_notes || "")}` +
        (p.source_url ? ` ${S.link(p.source_url, "price source")}` : "") +
        "</p>";
      if (L.review_notes) b += `<p><b>To ask / reviews.</b> ${S.esc(L.review_notes)}</p>`;
      b += "</details>";
      b +=
        '<div class="links">' +
        (L.links || []).map((u) => S.link(u, S.esc(S.domain(u)) + " ↗")).join("") +
        "</div></div></article>";
      return b;
    };
    lodging.forEach((L, i) => {
      b += lodgeCard(L, `l${i}`);
    });
    const backups = d.lodging_backups || [];
    if (backups.length) {
      b +=
        `<details class="backups"><summary>Backup lodging (${backups.length}): researched, not in the comparison above. ` +
        "An option that was promoted into the comparison, or dropped from it (sold out, gone, over the cap), is here too.</summary>";
      backups.forEach((L, i) => {
        b += lodgeCard(L, `b${i}`);
      });
      b += "</details>";
    }

    for (const f of S.focusSections()) {
      b += `<h2>${S.esc(f.label)}</h2><div class="grid">`;
      for (const x of S.focusItems(d, f.id)) {
        const r = pics.take([x.image], [x.url], x.name);
        let facts = "";
        for (const fld of f.fields || []) {
          const v = x[fld.id];
          if (v == null || v === "" || typeof v === "object") continue;
          facts += fld.enum ? pill(v, enumClass(v, fld.enum)) : pill(`${String(fld.label).toLowerCase()}: ${v}`);
        }
        if (x.operates_during_stay) {
          facts += pill(
            `during stay: ${x.operates_during_stay}`,
            { yes: "yes", no: "no", suspended: "no" }[x.operates_during_stay] || "estimate"
          );
        }
        if (x.age_min != null) facts += pill(`age ${x.age_min}+`);
        if (x.drive_minutes != null) facts += pill(`${x.drive_minutes} min`);
        const body = x.what_you_do
          ? `<p>${S.esc(x.what_you_do)}</p>` + (x.why_memorable ? `<p class="muted">${S.esc(x.why_memorable)}</p>` : "")
          : `<p>${S.esc(x.why_memorable || "")}</p>`;
        const more =
          (x.price_usd ? `<p><b>${S.esc(f.price_label || "Price")}.</b> ${S.esc(x.price_usd)}</p>` : "") +
          (x.booking_difficulty ? `<p><b>Booking.</b> ${S.esc(x.booking_difficulty)}</p>` : "");
        b += card(r, x.name, x.url, facts, body, more);
      }
      b += "</div>";
    }

    b += '<h2>Other activities</h2><div class="grid">';
    for (const a of d.activities || []) {
      const r = pics.take([a.image], [a.url], a.name);
      const facts =
        (a.good_for || []).map((x) => pill(x)).join("") +
        (a.drive_minutes != null ? pill(`${a.drive_minutes} min`) : "");
      const via = a.found_via ? `<p class="muted">Found via ${S.esc(a.found_via)}</p>` : "";
      b += card(r, a.name, a.url, facts, `<p>${S.esc(a.details || "")}</p>${via}`);
    }
    b += "</div>";
    if (d.shopping_exploring) {
      b += `<p><b>Shopping and exploring.</b> ${S.esc(d.shopping_exploring)}</p>`;
    }

    b += '<h2>Restaurants</h2><div class="cols">';
    for (const cat of ["special dinner", "family dinner", "casual", "breakfast/coffee"]) {
      const rs = (d.restaurants || []).filter((r) => r.category === cat);
      if (!rs.length) continue;
      b += `<div><h3>${S.esc(cat.replace(/\b\w/g, (c) => c.toUpperCase()))}</h3>`;
      for (const x of rs) {
        const walk =
          x.walk_minutes_from_lodging != null
            ? pill(`${x.walk_minutes_from_lodging} min walk`)
            : "";
        b +=
          `<div class="card" style="padding:10px 14px;margin-bottom:10px"><b>${S.link(x.url, S.esc(x.name))}</b> ${walk}` +
          `<p style="margin:.3em 0 0;font-size:.9rem">${S.esc(x.notes || "")}</p></div>`;
      }
      b += "</div>";
    }
    b += "</div>";

    const w = d.weather || {};
    const lg = d.logistics || {};
    b +=
      '<h2>Weather and getting there</h2><div class="cols"><div><table><thead><tr><th>Month</th><th class=n>High °F</th><th class=n>Low °F</th><th class=n>Rain days</th></tr></thead><tbody>';
    const months = (cfg.weather_months || []).map((m) => [m.toLowerCase(), m]);
    for (const [m, name] of months) {
      const x = w[m] || {};
      b += `<tr><td>${S.esc(name)}</td><td class=n>${S.esc(x.high_f)}</td><td class=n>${S.esc(x.low_f)}</td><td class=n>${S.esc(x.rain_days)}</td></tr>`;
    }
    b += "</tbody></table>";
    const notes = months
      .filter(([m]) => (w[m] || {}).notes)
      .map(([m, name]) => `<li><b>${S.esc(name)}.</b> ${S.esc(w[m].notes)}</li>`);
    if (notes.length || w.source_url) {
      b +=
        `<details><summary>Weather notes</summary><ul>${notes.join("")}</ul>` +
        (w.source_url ? S.link(w.source_url, "climate source") : "") +
        "</details>";
    }
    b += '</div><dl class="kv">';
    const rows = [
      [
        "Airport",
        (lg.airport || "") +
          (lg.drive_minutes_from_airport != null ? `, ${lg.drive_minutes_from_airport} min` : ""),
      ],
      ...(cfg.origins || []).map((o) => [`From ${o.label}`, (lg.flights || {})[o.id]]),
      ["Car", lg.car_needed],
    ];
    for (const [label, val] of rows) {
      if (val) b += `<dt>${S.esc(label)}</dt><dd>${S.esc(val)}</dd>`;
    }
    b += "</dl></div>";
    if (lg.notes) b += `<details><summary>Logistics notes</summary><p>${S.esc(lg.notes)}</p></details>`;

    if ((d.caveats || []).length) {
      b += "<h2>Caveats</h2><ul>" + d.caveats.map((x) => `<li>${S.esc(x)}</li>`).join("") + "</ul>";
    }
    for (const [key, title] of [
      ["open_questions", "Open questions (things to call or email about)"],
      ["verification_notes", "Fact-check and verification notes"],
    ]) {
      if ((d[key] || []).length) {
        b +=
          `<details><summary>${title} (${d[key].length})</summary><ul>` +
          d[key].map((x) => `<li>${S.esc(x)}</li>`).join("") +
          "</ul></details>";
      }
    }

    const groups = {};
    for (const src of d.sources || []) {
      const sec = src.section || inferSection(src.url, d);
      (groups[sec] || (groups[sec] = [])).push(src);
    }
    b += '<h2>Sources for further reading</h2><div class="src">';
    const sectionNames = { lodging: "lodging" };
    S.focusSections().forEach((f) => {
      sectionNames[f.id] = String(f.short_label || f.label).toLowerCase();
    });
    const order = ["lodging", ...S.focusSections().map((f) => f.id), "activities", "restaurants", "weather", "logistics", "general"];
    for (const sec of [...order, ...Object.keys(groups).filter((k) => !order.includes(k))]) {
      if (!groups[sec]) continue;
      b +=
        `<h3>${S.esc(sectionNames[sec] || sec)}</h3><ul>` +
        groups[sec]
          .map(
            (x) =>
              `<li>${S.link(x.url, S.esc(x.title))} <span class="muted">${S.esc(S.domain(x.url))}</span></li>`
          )
          .join("") +
        "</ul>";
    }
    b += `</div>${pics.creditsHtml()}`;
    document.getElementById("app").innerHTML = b;
    document.title = `${d.name} — analysis`;
    S.enableTableSort(document.getElementById("app"));
  }

  function showMissing(msg) {
    const app = document.getElementById("app");
    if (app) {
      app.innerHTML =
        `<p class="muted">${S.esc(msg)}</p><p><a href="index.html">← All destinations</a></p>`;
    }
    document.title = "Destination not found — analysis";
  }

  const page = document.body.dataset.page;
  if (page === "index") {
    S.loadCatalog("../")
      .then(renderIndex)
      .catch((err) => showMissing(err.message || "Could not load catalog"));
  } else if (page === "destination") {
    S.loadDestination(S.querySlug(), "../")
      .then(renderDestination)
      .catch((err) => showMissing(err.message || "Destination not found"));
  }
})();

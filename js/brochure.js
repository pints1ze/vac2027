/* Renders family brochure index and destination pages from site/data/*.json. */
(function () {
  "use strict";
  const S = window.Site;

  function brochureText() {
    return (S.config().site || {}).brochure || {};
  }

  /** CSS class for a things-to-do kind: focus sections get f0, f1, ... in trip.yaml order. */
  function kindClass(kind) {
    const i = S.focusSections().findIndex((f) => f.id === kind);
    return i >= 0 ? `f${i}` : String(kind || "").split(/\s+/)[0];
  }

  function kindLabel(kind) {
    const f = S.focusSections().find((x) => x.id === kind);
    return f ? f.short_label || f.label : kind || "";
  }

  function renderIndex(catalog) {
    const pics = new S.Pics("");
    // Alphabetical: catalog.json is in score order, which the family pages must not reveal.
    const dests = S.byName(catalog.destinations);
    const trip = catalog.trip || {};
    const text = brochureText();
    const dates = trip.dates || "TBD";
    const ppl = trip.party_size || "?";
    const nts = trip.nights || "?";
    let html =
      `<header class="mast wrap"><div class="kicker">${S.esc(text.kicker || "")}</div>` +
      "<h1>Where should we go <em>together?</em></h1>" +
      "<p>A handful of places we could spend a week together. Tap any of them to look around: where we’d stay, what there is to do, and what the weather’s like.</p>" +
      `<div class="dates"><span>${S.esc(dates)}</span><span>${ppl} of us</span><span>${nts} nights</span>` +
      '<a class="rank-cta" href="rank.html">Rank your favorites</a></div></header>';
    html += '<main class="wrap"><div class="cards">';
    for (const d of dests) {
      const tw = d.trip_weather || {};
      const stamp =
        tw.high_f != null
          ? `<div class="stamp"><div>${Math.round(tw.high_f)}°<small>${S.esc(String(tw.month || "").toUpperCase())}</small></div></div>`
          : "";
      const chips = (d.highlights || [])
        .slice(0, 3)
        .map((x) => `<li>${S.esc(x)}</li>`)
        .join("");
      const tag =
        d.tagline && d.tagline !== d.region
          ? `<p class="tag">${S.esc(d.tagline)}</p>`
          : "";
      html +=
        `<a class="pc" href="${S.esc(S.locationHref(d.slug))}"><div class="shot">${S.img(d.hero)}</div>${stamp}<div class="body">` +
        `<div class="kicker">${S.esc(d.region)}</div><h2>${S.esc(d.name)}</h2>${tag}` +
        (chips ? `<ul class="chips">${chips}</ul>` : "") +
        "</div></a>";
      if (d.hero && d.hero.page) pics.credits[d.hero.page] = d.hero.credit || S.domain(d.hero.page);
    }
    html += `</div><footer>${pics.creditsHtml()}</footer></main>`;
    document.body.innerHTML = html;
    document.title = text.title || trip.title || "";
  }

  function renderDestination(d) {
    const pics = new S.Pics("", d.og);
    const { brochure: b, full } = S.brochureView(d);
    const w = d.trip_weather || {};
    const lg = d.logistics || {};
    const h = pics.hero(d);

    let out =
      `<header class="hero"><a class="back" href="index.html">← All places</a>${S.img(h)}<div class="wrap">` +
      `<div class="kicker">${S.esc(d.region)}</div><h1>${S.esc(d.name)}</h1>` +
      (b.tagline ? `<p>${S.esc(b.tagline)}</p>` : "") +
      "</div></header>";

    out += '<main class="wrap"><div class="facts">';
    out += `<div><span>Trip</span><b>${S.esc(d._trip_dates || "")}</b></div>`;
    if (w.high_f != null) {
      const wm = w.month ? ` in ${S.esc(w.month)}` : "";
      out += `<div><span>Typical days / nights${wm}</span><b>${Math.round(w.high_f)}° / ${Math.round(w.low_f || 0)}°</b></div>`;
    }
    if (d.type === "cruise") out += "<div><span>Style</span><b>Cruise</b></div>";
    if (lg.airport) {
      const mins = lg.drive_minutes_from_airport != null ? ` · ${lg.drive_minutes_from_airport} min` : "";
      const airport = S.shortName(lg.airport).split(" (")[0];
      out += `<div><span>Fly into</span><b>${S.esc(airport)}${S.esc(mins)}</b></div>`;
    }
    out += "</div>";

    if (!full) {
      out +=
        '<section><p class="note">The full write-up for this place is still being put together. Here are the photos and the main ideas so far.</p></section>';
    }
    if (b.intro || (b.highlights || []).length) {
      out += '<section class="intro"><div>';
      out += `<h2>Why <em>here</em></h2><p>${S.esc(b.intro || "")}</p></div>`;
      out +=
        '<ul class="ticks">' +
        (b.highlights || []).map((x) => `<li>${S.esc(x)}</li>`).join("") +
        "</ul></section>";
    }

    const byName = Object.fromEntries((d.lodging || []).map((L) => [L.name, L]));
    const stays = (b.stays || []).map((s) => {
      const L = byName[s.name] || {};
      const title = s.title || S.shortName(s.name);
      let photos = pics.takeAll(L.images || [], 3);
      if (!photos.length) {
        const one = pics.take([], (L.links || []).slice(0, 2), title);
        photos = one ? [one] : [];
      }
      return { s, L, photos };
    });

    let gallery = pics.takeAll(((d.images || {}).gallery) || [], 6);
    gallery = gallery.slice(0, gallery.length >= 6 ? 6 : 3);
    if (gallery.length === 3 || gallery.length === 6) {
      out +=
        '<section><h2>A <em>look</em> around</h2><div class="gallery">' +
        gallery.map((r) => `<figure>${S.img(r)}</figure>`).join("") +
        "</div></section>";
    }

    if (stays.length) {
      out += "<section><h2>Where we could <em>stay</em></h2>";
      for (const { s, L, photos } of stays) {
        const cls = photos.length > 1 ? "pics" : "pics one";
        const p = S.familyPrice(L.price); // none when quoted for other dates or over the nightly cap
        out += `<article class="stay"><div class="${cls}">${(photos.length ? photos : [null]).map((r) => S.img(r)).join("")}</div>`;
        out += `<div class="txt"><h3>${S.esc(s.title || S.shortName(s.name))}</h3>`;
        if (s.blurb) out += `<p>${S.esc(s.blurb)}</p>`;
        if ((s.highlights || []).length) {
          out +=
            '<ul class="chips">' +
            s.highlights.map((x) => `<li>${S.esc(x)}</li>`).join("") +
            "</ul>";
        }
        if (p) out += `<div class="price">About ${S.esc(p)} a night for all ${S.esc(S.numberWord(S.config().party_size))} of us</div>`;
        if ((L.links || []).length) {
          out +=
            '<div class="stay-links">' +
            L.links.map((u) => S.link(u, S.esc(S.domain(u)) + " →", "btn")).join("") +
            "</div>";
        }
        out += "</div></article>";
      }
      out += "</section>";
    }

    if ((b.things_to_do || []).length) {
      out += '<section><h2>Things to <em>do</em></h2><div class="todo">';
      for (const t of b.things_to_do) {
        const r = pics.take([t.image], [t.url], t.name);
        const kind = t.kind || "";
        out +=
          `<article><div class="shot">${S.img(r)}</div><div class="t"><span class="k ${S.esc(kindClass(kind))}">${S.esc(kindLabel(kind))}</span>` +
          `<h3>${S.link(t.url, S.esc(t.name))}</h3>` +
          (t.blurb ? `<p>${S.esc(t.blurb)}</p>` : "") +
          "</div></article>";
      }
      out += "</div></section>";
    }

    if ((b.pros || []).length || (b.cons || []).length) {
      out += '<section><h2>The short <em>version</em></h2><div class="two">';
      out +=
        '<div class="box good"><h3>Why it’s a great pick</h3><ul>' +
        (b.pros || []).map((x) => `<li>${S.esc(x)}</li>`).join("") +
        "</ul></div>";
      out +=
        '<div class="box know"><h3>Good to know</h3><ul>' +
        (b.cons || []).map((x) => `<li>${S.esc(x)}</li>`).join("") +
        "</ul></div>";
      out += "</div></section>";
    }

    if ((b.dinner_spots || []).length) {
      out +=
        '<section><h2>Dinner <em>ideas</em></h2><ul class="ticks">' +
        b.dinner_spots
          .map((x) => {
            if (typeof x === "string") return `<li>${S.esc(x)}</li>`;
            if (x && x.name) {
              return `<li>${S.esc(x.name)}${x.note ? " — " + S.esc(x.note) : ""}</li>`;
            }
            return `<li>${S.esc(String(x))}</li>`;
          })
          .join("") +
        "</ul></section>";
    }

    out += `<footer>${pics.creditsHtml()}</footer></main>`;
    document.body.innerHTML = out;
    document.title = d.name;
  }

  function showMissing(msg) {
    document.body.innerHTML =
      `<main class="wrap" style="padding:48px 28px"><p class="note">${S.esc(msg)}</p>` +
      '<p><a href="index.html">← All places</a></p></main>';
    document.title = "Place not found";
  }

  const page = document.body.dataset.page;
  if (page === "index") {
    S.loadCatalog("")
      .then(renderIndex)
      .catch((err) => showMissing(err.message || "Could not load catalog"));
  } else if (page === "destination") {
    S.loadDestination(S.querySlug(), "")
      .then(renderDestination)
      .catch((err) => showMissing(err.message || "Place not found"));
  }
})();

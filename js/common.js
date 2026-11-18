/* Shared helpers for brochure, analysis, and rank pages.
   Everything trip-specific (rubric, households, focus sections, text) comes from catalog.json's `trip` block,
   which scripts/build.py writes from context/trip.yaml. Load the catalog before calling config(). */
(function (global) {
  "use strict";

  /** The trip config from the loaded catalog ({} before loadCatalog resolves). */
  function config() {
    return (catalogCache && catalogCache.trip) || {};
  }

  /** [[category id, weight], ...] in rubric order. */
  function weights() {
    return ((config().rubric || {}).categories || []).map((c) => [c.id, c.weight]);
  }

  /** {category id: short label} for score bars and table headers. */
  function labels() {
    const out = {};
    ((config().rubric || {}).categories || []).forEach((c) => {
      out[c.id] = c.short_label || c.label || c.id;
    });
    return out;
  }

  function focusSections() {
    return config().focus_sections || [];
  }

  function focusItems(d, id) {
    return ((d && d.focus) || {})[id] || [];
  }

  const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve"];

  function numberWord(n) {
    return Number.isInteger(n) && n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n ?? "");
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function domain(u) {
    if (!u || !String(u).includes("//")) return u || "";
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  }

  /** The URL when it is an absolute http(s) URL from data, else null (no javascript:, data:, relative...). */
  function safeUrl(u) {
    const s = String(u ?? "").trim();
    if (!/^https?:\/\//i.test(s)) return null;
    try {
      const p = new URL(s);
      return p.protocol === "http:" || p.protocol === "https:" ? s : null;
    } catch {
      return null;
    }
  }

  /** An image src from data: an http(s) URL or a local img/ path (optionally ../img/), else null. */
  function safeSrc(u) {
    const s = String(u ?? "").trim();
    if (/^(\.\.\/)?img\/[^:]*$/.test(s) && !s.includes("..", s.startsWith("../") ? 3 : 0)) return s;
    return safeUrl(s);
  }

  /** <a> to an external page from data; anything but an http(s) URL renders as the plain text. */
  function link(url, text, cls) {
    const u = safeUrl(url);
    if (!u) return text;
    const c = cls ? ` class="${esc(cls)}"` : "";
    return `<a href="${esc(u)}"${c} target="_blank" rel="noopener">${text}</a>`;
  }

  function shortName(name) {
    return String(name || "")
      .split(" — ")[0]
      .split(": ")[0]
      .trim();
  }

  function priceText(p) {
    if (!p) return null;
    const lo = p.nightly_total_usd_low;
    const hi = p.nightly_total_usd_high;
    if (lo == null && hi == null) return null;
    if (lo == null) return `up to $${Number(hi).toLocaleString()}`;
    if (hi == null || lo === hi) return `$${Number(lo).toLocaleString()}`;
    return `$${Number(lo).toLocaleString()}–$${Number(hi).toLocaleString()}`;
  }

  /** Destinations sorted by name: the neutral order for family pages (catalog.json is in score order). */
  function byName(dests) {
    return [...(dests || [])].sort((a, b) =>
      String(a.name || a.slug || "").localeCompare(String(b.name || b.slug || ""), undefined, { sensitivity: "base" })
    );
  }

  /** Price text the family pages may show: none when the quote is for other dates or over the nightly cap
      (build.py sets price.stale / price.over_cap). */
  function familyPrice(p) {
    if (!p || p.stale || p.over_cap) return null;
    return priceText(p);
  }

  /** Sum of an option's numeric ratings (same as build.py rating_sum). */
  function ratingSum(L) {
    const r = (L && L.ratings) || {};
    return Object.values(r).reduce((n, v) => n + (typeof v === "number" ? v : 0), 0);
  }

  function brochureView(d) {
    const b = d.brochure;
    if (b) return { brochure: b, full: true };
    // Same as build.py brochure_view: 3 items from the first focus section, 1 from each of the others.
    const todo = [];
    focusSections().forEach((f, i) =>
      focusItems(d, f.id)
        .slice(0, i === 0 ? 3 : 1)
        .forEach((x) => todo.push({ name: x.name, kind: f.id, url: x.url, image: x.image }))
    );
    (d.activities || []).slice(0, 4).forEach((a) =>
      todo.push({
        name: a.name,
        kind: (a.good_for || []).includes("rainy day") ? "rainy day" : "outdoors",
        url: a.url,
        image: a.image,
      })
    );
    return {
      brochure: {
        tagline: d.region,
        things_to_do: todo,
        dinner_spots: (d.restaurants || []).slice(0, 4).map((r) => r.name),
      },
      full: false,
    };
  }

  function allPhotoObjs(d) {
    const im = d.images || {};
    const objs = [im.hero, ...(im.gallery || [])];
    ((d.brochure || {}).things_to_do || []).forEach((t) => objs.push(t.image));
    focusSections().forEach((f) => focusItems(d, f.id).forEach((x) => objs.push(x.image)));
    (d.activities || []).forEach((x) => objs.push(x.image));
    (d.lodging || []).forEach((L) => (L.images || []).forEach((o) => objs.push(o)));
    return objs.filter(Boolean);
  }

  function itemPages(d) {
    const pages = ((d.brochure || {}).things_to_do || []).map((t) => t.url);
    (d.activities || []).forEach((x) => pages.push(x.url));
    focusSections().forEach((f) => focusItems(d, f.id).forEach((x) => pages.push(x.url)));
    (d.lodging || []).forEach((L) => pages.push(...(L.links || []).slice(0, 1)));
    return pages.filter(Boolean);
  }

  class Pics {
    /** prefix: "" or "../"; og: destination payload's {page_url: {url, src}} og:image fallbacks. */
    constructor(prefix, og) {
      this.prefix = prefix || "";
      this.og = og || {};
      this.used = new Set();
      this.credits = {};
    }

    _resolve(obj) {
      if (!obj) return null;
      const url = obj.url;
      if (!url || this.used.has(url)) return null;
      let src = obj.src;
      if (src === null) return null; // known failed download
      if (!src) src = url;
      // Destination payloads store brochure-relative img/... ; analysis pages need ../img/
      if (this.prefix && String(src).startsWith("img/")) src = this.prefix + src;
      src = safeSrc(src);
      if (!src) return null;
      const page = obj.page_url || obj.page || url;
      return {
        key: url,
        src,
        alt: obj.alt || "",
        credit: obj.credit || domain(page),
        page: safeUrl(page) || "",
      };
    }

    take(objs, pages, alt) {
      const cands = (objs || []).filter(Boolean);
      // Fall back to the og:image of each page, after the explicit photo objects.
      for (const p of pages || []) {
        const o = p && this.og[p];
        if (o && o.url) cands.push({ url: o.url, src: o.src, page_url: p, alt: alt || "" });
      }
      for (const o of cands) {
        const r = this._resolve(o);
        if (r) {
          this.used.add(r.key);
          if (r.page) this.credits[r.page] = r.credit;
          if (!r.alt) r.alt = alt || "";
          return r;
        }
      }
      return null;
    }

    takeAll(objs, limit) {
      const out = [];
      for (const o of objs || []) {
        if (out.length >= limit) break;
        const r = this.take([o]);
        if (r) out.push(r);
      }
      return out;
    }

    hero(d) {
      return this.take(allPhotoObjs(d), itemPages(d), d.name);
    }

    creditsHtml() {
      const items = Object.entries(this.credits).sort((a, b) =>
        a[1].toLowerCase().localeCompare(b[1].toLowerCase())
      );
      if (!items.length) return "";
      return (
        '<p class="credits">Photos: ' +
        items.map(([p, c]) => link(p, esc(c))).join(" · ") +
        "</p>"
      );
    }
  }

  function img(r, cls) {
    const c = cls || "";
    const src = r && safeSrc(r.src);
    if (!src) return `<div class="ph ${esc(c)}"></div>`;
    return (
      `<img class="${esc(c)}" src="${esc(src)}" alt="${esc(r.alt)}" loading="lazy" referrerpolicy="no-referrer" ` +
      `onerror="this.outerHTML='<div class=&quot;ph ${esc(c)}&quot;></div>'">`
    );
  }

  function enableTableSort(root) {
    (root || document).querySelectorAll("th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const t = th.closest("table");
        const i = [...th.parentNode.children].indexOf(th);
        const num = th.dataset.sort === "num";
        const rows = [...t.tBodies[0].rows];
        const dir = th.dataset.dir === "desc" ? "asc" : "desc";
        th.dataset.dir = dir;
        rows.sort((a, b) => {
          let x = a.cells[i].dataset.v ?? a.cells[i].textContent;
          let y = b.cells[i].dataset.v ?? b.cells[i].textContent;
          if (num) {
            x = +x;
            y = +y;
          }
          return (x > y ? 1 : x < y ? -1 : 0) * (dir === "asc" ? 1 : -1);
        });
        rows.forEach((r) => t.tBodies[0].appendChild(r));
      });
    });
  }

  let catalogCache = null;

  function querySlug() {
    return new URLSearchParams(location.search).get("slug") || "";
  }

  function knownSlug(slug, catalog) {
    const c = catalog || catalogCache;
    if (!c || !slug) return false;
    return (c.destinations || []).some((d) => d.slug === slug);
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
    return res.json();
  }

  /** Load site/data/catalog.json. prefix is "" or "../". */
  async function loadCatalog(prefix) {
    if (catalogCache) return catalogCache;
    catalogCache = await fetchJson(`${prefix || ""}data/catalog.json`);
    return catalogCache;
  }

  /** Load site/data/<slug>.json. prefix is "" or "../". */
  async function loadDestination(slug, prefix) {
    if (!slug) throw new Error("missing slug");
    const catalog = await loadCatalog(prefix);
    if (!knownSlug(slug, catalog)) throw new Error("unknown slug: " + slug);
    return fetchJson(`${prefix || ""}data/${encodeURIComponent(slug)}.json`);
  }

  function locationHref(slug) {
    return `location.html?slug=${encodeURIComponent(slug)}`;
  }

  global.Site = {
    config,
    weights,
    labels,
    focusSections,
    focusItems,
    numberWord,
    esc,
    domain,
    link,
    safeUrl,
    safeSrc,
    shortName,
    priceText,
    familyPrice,
    byName,
    ratingSum,
    brochureView,
    Pics,
    img,
    enableTableSort,
    querySlug,
    knownSlug,
    loadCatalog,
    loadDestination,
    locationHref,
  };
})(window);

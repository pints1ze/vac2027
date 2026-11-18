/* Family ranking: drag-and-drop per person, household-averaged consensus.
   People, households and the trip id come from catalog.json's `trip` block (context/trip.yaml); rankings are
   stored in Supabase per (trip_id, person), so a new trip starts with an empty board. */
(function () {
  "use strict";
  const S = window.Site;
  let STORE_KEY = "vacation-rank-person";

  let tripId = "";
  let people = [];
  let households = [];
  let destinations = [];
  let bySlug = {};
  let personId = null;
  let rankings = {}; // personId -> { ordered_slugs, updated_at }
  let sortable = null;
  let db = null;

  function $(sel) {
    return document.querySelector(sel);
  }

  // localStorage can throw (private windows, blocked site data); the page works without it.
  function storeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function storeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* not remembered; fine */
    }
  }

  function storeRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* nothing to clear */
    }
  }

  function supabaseClient() {
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!url || !key || url.includes("YOUR_PROJECT") || key.includes("YOUR_ANON")) return null;
    if (!window.supabase) return null;
    return window.supabase.createClient(url, key);
  }

  function setStatus(msg, kind) {
    const el = $(".status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (kind ? " " + kind : "");
  }

  function personName(id) {
    const p = people.find((x) => x.id === id);
    return p ? p.name : id;
  }

  function householdOf(person) {
    const p = people.find((x) => x.id === person);
    return p ? p.household : null;
  }

  /** A–Z by name: the neutral starting order (catalog.json is in score order, which must not anchor votes). */
  function defaultOrder() {
    return S.byName(destinations).map((d) => d.slug);
  }

  /** Catalog destinations missing from a person's saved ranking (added since they saved); [] if never saved. */
  function newSlugsFor(person) {
    const row = rankings[person];
    if (!row || !row.ordered_slugs || !row.ordered_slugs.length) return [];
    const saved = new Set(row.ordered_slugs);
    return defaultOrder().filter((s) => !saved.has(s));
  }

  function newPlacesMessage(person) {
    const n = newSlugsFor(person).length;
    if (!n) return "";
    return `${n} new place${n === 1 ? "" : "s"} since you last saved — drag ${n === 1 ? "it" : "them"} into place and save.`;
  }

  /** Status after choosing a person or loading: the new-places notice takes precedence. */
  function personStatus() {
    const msg = newPlacesMessage(personId);
    if (msg) setStatus(msg, "warn");
    else setStatus(`Ranking as ${personName(personId)}. Drag to reorder, then save.`);
  }

  function orderFor(person) {
    const row = rankings[person];
    if (!row || !row.ordered_slugs || !row.ordered_slugs.length) return defaultOrder();
    const known = new Set(destinations.map((d) => d.slug));
    const kept = row.ordered_slugs.filter((s) => known.has(s));
    const missing = defaultOrder().filter((s) => !kept.includes(s));
    return kept.concat(missing);
  }

  function renderWho() {
    const box = $(".who");
    box.innerHTML = people
      .map((p) => {
        const done = rankings[p.id] ? " done" : "";
        const active = p.id === personId ? " active" : "";
        return `<button type="button" data-id="${S.esc(p.id)}" class="${active}${done}">${S.esc(p.name)}</button>`;
      })
      .join("");
    box.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        personId = btn.dataset.id;
        storeSet(STORE_KEY, personId);
        renderWho();
        renderList();
        personStatus();
      });
    });
  }

  function renderList(orderOverride) {
    const list = $("#rank-list");
    if (!personId) {
      list.innerHTML = "";
      $("#rank-panel").hidden = true;
      return;
    }
    $("#rank-panel").hidden = false;
    $("#ranker-label").textContent = personName(personId);
    const order = orderOverride || orderFor(personId);
    const fresh = new Set(newSlugsFor(personId));
    list.innerHTML = order
      .map((slug, i) => {
        const d = bySlug[slug];
        if (!d) return "";
        const tag = d.tagline && d.tagline !== d.region ? `<div class="tag">${S.esc(d.tagline)}</div>` : "";
        const isNew = fresh.has(slug);
        return (
          `<li data-slug="${S.esc(slug)}"${isNew ? ' class="new"' : ""}><div class="n">${i + 1}</div>` +
          `<div class="shot">${S.img(d.hero)}</div>` +
          `<div class="meta"><div class="region">${S.esc(d.region || "")}${isNew ? ' <span class="new-badge">new</span>' : ""}</div>` +
          `<strong>${S.esc(d.name)}</strong>${tag}</div></li>`
        );
      })
      .join("");

    if (sortable) sortable.destroy();
    sortable = Sortable.create(list, {
      animation: 150,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      onEnd: renumber,
    });
    renumber();
  }

  function renumber() {
    [...$("#rank-list").children].forEach((li, i) => {
      const n = li.querySelector(".n");
      if (n) n.textContent = String(i + 1);
    });
  }

  function currentOrder() {
    return [...$("#rank-list").children].map((li) => li.dataset.slug);
  }

  async function loadRankings() {
    if (!db) {
      setStatus("Add site/js/config.js with your Supabase URL and anon key to save rankings.", "err");
      renderResults();
      return;
    }
    setStatus("Loading rankings…");
    const { data, error } = await db
      .from("rankings")
      .select("person, ordered_slugs, updated_at")
      .eq("trip_id", tripId);
    if (error) {
      setStatus("Could not load rankings: " + error.message, "err");
      return;
    }
    rankings = {};
    const known = new Set(people.map((p) => p.id));
    for (const row of data || []) {
      if (!known.has(row.person)) continue; // someone no longer in trip.yaml
      rankings[row.person] = { ordered_slugs: row.ordered_slugs, updated_at: row.updated_at };
    }
    setStatus(
      Object.keys(rankings).length
        ? `${Object.keys(rankings).length} of ${people.length} people have ranked.`
        : "No rankings yet — pick your name and drag your list."
    );
    if (personId && newSlugsFor(personId).length) personStatus();
    renderWho();
    renderList();
    renderResults();
  }

  async function saveRanking() {
    if (!personId) return;
    if (!db) {
      setStatus("Configure Supabase in site/js/config.js before saving.", "err");
      return;
    }
    const ordered_slugs = currentOrder();
    const btn = $("#save-btn");
    btn.disabled = true;
    setStatus("Saving…");
    const { error } = await db.from("rankings").upsert(
      { trip_id: tripId, person: personId, ordered_slugs, updated_at: new Date().toISOString() },
      { onConflict: "trip_id,person" }
    );
    btn.disabled = false;
    if (error) {
      setStatus("Save failed: " + error.message, "err");
      return;
    }
    rankings[personId] = { ordered_slugs, updated_at: new Date().toISOString() };
    renderList(ordered_slugs); // clears the "new" markers
    setStatus(`Saved ${personName(personId)}’s ranking.`, "ok");
    renderWho();
    renderResults();
  }

  /** Rank position 1..n (1 = favorite). Destinations missing from a saved ranking get n+1. */
  function ranksMap(ordered) {
    const n = destinations.length;
    const map = {};
    destinations.forEach((d) => {
      map[d.slug] = n + 1;
    });
    (ordered || []).forEach((slug, i) => {
      if (map[slug] != null) map[slug] = i + 1;
    });
    return map;
  }

  /**
   * Each person ranks; household score for a destination = mean of that
   * household’s submitted members’ ranks; consensus = mean of the
   * household scores (only households with at least one vote).
   */
  function consensus() {
    const submitted = people.filter((p) => rankings[p.id]);
    if (!submitted.length) return [];

    const householdAvgs = {}; // hid -> { slug -> avgRank }
    for (const h of households) {
      const members = people.filter((p) => p.household === h.id && rankings[p.id]);
      if (!members.length) continue;
      const maps = members.map((p) => ranksMap(rankings[p.id].ordered_slugs));
      const avg = {};
      for (const d of destinations) {
        avg[d.slug] = maps.reduce((s, m) => s + m[d.slug], 0) / maps.length;
      }
      householdAvgs[h.id] = { members: members.map((m) => m.id), avg };
    }

    const hids = Object.keys(householdAvgs);
    if (!hids.length) return [];

    return destinations
      .map((d) => {
        const household_ranks = {};
        let sum = 0;
        for (const hid of hids) {
          const v = householdAvgs[hid].avg[d.slug];
          household_ranks[hid] = v;
          sum += v;
        }
        return {
          slug: d.slug,
          name: d.name,
          region: d.region,
          score: sum / hids.length,
          household_ranks,
          households_voting: hids.length,
          // voters whose saved ranking lacks this place (it counts as rank n+1 for them)
          not_ranked: submitted.filter((p) => !(rankings[p.id].ordered_slugs || []).includes(d.slug)).length,
        };
      })
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  }

  function renderResults() {
    const board = $("#consensus");
    const hhBox = $("#households");
    const rows = consensus();
    if (!rows.length) {
      board.innerHTML = '<p class="hint">Consensus appears after someone saves a ranking.</p>';
      hhBox.innerHTML = "";
      return;
    }

    board.innerHTML = rows
      .map((r, i) => {
        return (
          `<div class="place"><div class="n">${i + 1}</div>` +
          `<div><strong>${S.esc(r.name)}</strong><div class="hint">${S.esc(r.region || "")}` +
          (r.not_ranked ? ` · <span class="unranked">${r.not_ranked} not yet ranked</span>` : "") +
          "</div></div>" +
          `<div class="avg">avg ${r.score.toFixed(1)}</div></div>`
        );
      })
      .join("");

    hhBox.innerHTML = households
      .map((h) => {
        const members = people.filter((p) => p.household === h.id);
        const voted = members.filter((p) => rankings[p.id]);
        const memberLine = members
          .map((p) => (rankings[p.id] ? p.name : `${p.name} (not yet)`))
          .join(" · ");
        if (!voted.length) {
          return (
            `<div class="household"><h3>${S.esc(h.name)}</h3>` +
            `<div class="members">${S.esc(memberLine)}</div>` +
            `<p class="missing">No rankings from this household yet.</p></div>`
          );
        }
        const maps = voted.map((p) => ranksMap(rankings[p.id].ordered_slugs));
        const order = destinations
          .map((d) => ({
            slug: d.slug,
            name: d.name,
            avg: maps.reduce((s, m) => s + m[d.slug], 0) / maps.length,
          }))
          .sort((a, b) => a.avg - b.avg || a.name.localeCompare(b.name));
        const personal = voted
          .map((p) => {
            const top = (rankings[p.id].ordered_slugs || [])
              .slice(0, 3)
              .map((s) => (bySlug[s] || {}).name || s)
              .join(", ");
            return `<li><b>${S.esc(p.name)}</b> — ${S.esc(top)}${(rankings[p.id].ordered_slugs || []).length > 3 ? "…" : ""}</li>`;
          })
          .join("");
        return (
          `<div class="household"><h3>${S.esc(h.name)}</h3>` +
          `<div class="members">${S.esc(memberLine)}</div>` +
          `<ol>${order
            .slice(0, 5)
            .map((x) => `<li>${S.esc(x.name)} <span class="hint">(${x.avg.toFixed(1)})</span></li>`)
            .join("")}</ol>` +
          `<details><summary>Each person’s top picks</summary><ol>${personal}</ol></details></div>`
        );
      })
      .join("");
  }

  async function init() {
    db = supabaseClient();
    try {
      const catalog = await S.loadCatalog("");
      const trip = catalog.trip || {};
      tripId = trip.id || "";
      people = trip.people || [];
      households = trip.households || [];
      destinations = catalog.destinations || [];
      if (!tripId) throw new Error("catalog.json has no trip id; rerun python scripts/build.py");
      STORE_KEY = `vacation-rank-person:${tripId}`;
      personId = storeGet(STORE_KEY) || null;
      if (personId && !people.some((p) => p.id === personId)) {
        storeRemove(STORE_KEY); // someone not in this trip's people (trip.yaml changed)
        personId = null;
      }
      bySlug = Object.fromEntries(destinations.map((d) => [d.slug, d]));
    } catch (err) {
      setStatus(err.message || "Could not load catalog", "err");
      return;
    }

    $("#save-btn").addEventListener("click", saveRanking);
    $("#reset-btn").addEventListener("click", () => {
      if (!personId) return;
      renderList(defaultOrder());
      setStatus("Reset to A–Z locally — Save to keep.");
    });

    renderWho();
    if (personId) renderList();
    loadRankings();
  }

  init();
})();

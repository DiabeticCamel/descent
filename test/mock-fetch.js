// Stands in for the Netlify functions so the page can be played with no
// server. Scoring here is a lookup table, not a model — the real judge
// handles any answer; this one only knows the ones written below.
(function () {
  const DECK = [
    { body: "Name a bird that cannot fly.", kind: "a bird species", known: {
      penguin: 4, ostrich: 9, emu: 20, kiwi: 24, dodo: 28, chicken: 33, cassowary: 46,
      rhea: 61, "kakapo": 84, takahe: 91, weka: 93, moa: 88 } },
    { body: "Name a chemical element.", kind: "a chemical element", known: {
      gold: 5, oxygen: 7, hydrogen: 9, carbon: 12, helium: 16, iron: 18, neon: 31,
      tungsten: 52, bismuth: 68, yttrium: 83, rhenium: 89, hafnium: 91, praseodymium: 95 } },
    { body: "Name a knot.", kind: "a knot", known: {
      bow: 8, "square knot": 16, "figure eight": 24, "double knot": 27, bowline: 38,
      "clove hitch": 49, "sheet bend": 66, prusik: 81, "monkeys fist": 87, "alpine butterfly": 92 } },
    { body: "Name a landlocked country.", kind: "a country", known: {
      switzerland: 8, austria: 17, mongolia: 22, nepal: 26, bolivia: 34, hungary: 41,
      paraguay: 52, chad: 63, bhutan: 71, lesotho: 86, eswatini: 93, "burkina faso": 79 } },
    { body: "Name a cheese.", kind: "a cheese", known: {
      cheddar: 4, mozzarella: 9, brie: 14, swiss: 19, gouda: 25, parmesan: 21, feta: 30,
      gruyere: 47, manchego: 58, taleggio: 79, mimolette: 90, epoisses: 94 } },
    { body: "Name a collective noun for a group of animals.", kind: "a collective noun", known: {
      pack: 7, flock: 10, herd: 12, school: 18, pride: 20, swarm: 26, murder: 37,
      parliament: 55, murmuration: 68, shrewdness: 88, business: 92, wake: 85 } },
    { body: "Name a unit of measurement.", kind: "a unit", known: {
      meter: 5, metre: 5, inch: 8, mile: 11, liter: 13, litre: 13, gram: 15, pound: 17,
      furlong: 54, fathom: 61, angstrom: 78, slug: 89, hogshead: 93 } },
  ];

  const NOTES_RARE = ["hardly anyone reaches for this", "a long way down", "genuinely uncommon",
    "few would land here", "well off the beaten path"];
  const NOTES_MID = ["a fair way off the obvious", "solid, not the first thought", "middle of the pack"];
  const NOTES_OBVIOUS = ["the first thing most people say", "near the top of everyone's list",
    "an answer almost everyone gives"];

  const norm = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim().replace(/^(a|an|the)\s+/, "");
  const meters = (r) => Math.round((r * r) / 20);
  const ZONES = [
    { at: 0, name: "Sunlight", blurb: "Everyone starts here." },
    { at: 200, name: "Twilight", blurb: "Past the easy answers." },
    { at: 1000, name: "Midnight", blurb: "No light reaches this far." },
    { at: 2200, name: "Abyssal", blurb: "Almost nobody gets down here." },
  ];
  const zoneFor = (d) => ZONES.reduce((z, c) => (d >= c.at ? c : z), ZONES[0]);

  const state = { answers: {}, depth: 0 };

  function score(index, raw) {
    const n = norm(raw);
    const known = DECK[index].known;
    if (known[n] !== undefined) {
      const rarity = known[n];
      const pool = rarity > 70 ? NOTES_RARE : rarity > 35 ? NOTES_MID : NOTES_OBVIOUS;
      return { valid: true, rarity, note: pool[n.length % pool.length] };
    }
    // Unknown to the demo. The real judge would rule on this properly; here,
    // say so rather than invent a score.
    return { valid: false, rarity: 0, note: "the demo only knows a set list of answers" };
  }

  const reply = (obj) => Promise.resolve(new Response(JSON.stringify(obj),
    { status: 200, headers: { "content-type": "application/json" } }));

  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split("?")[0];

    if (path === "/api/today") {
      return reply({
        date: new Date().toISOString().slice(0, 10), pack: "demo", runId: "demo",
        depth: state.depth, zone: zoneFor(state.depth), zones: ZONES, total: DECK.length,
        remaining: DECK.length - Object.keys(state.answers).length,
        completed: Object.keys(state.answers).length >= DECK.length,
        questions: DECK.map((q, i) => ({
          promptId: i, index: i + 1, body: q.body, answerKind: q.kind,
          answered: Boolean(state.answers[i]),
          result: state.answers[i] || null,
        })),
      });
    }

    if (path === "/api/submit") {
      const { promptId, answer } = JSON.parse(options.body);
      await new Promise((r) => setTimeout(r, 420));   // stand in for the model call
      const verdict = score(promptId, answer);
      const gained = verdict.valid ? meters(verdict.rarity) : 0;
      state.answers[promptId] = { answer, rarity: verdict.rarity, meters: gained, valid: verdict.valid, note: verdict.note };
      state.depth += gained;
      const answered = Object.keys(state.answers).length;
      return reply({
        valid: verdict.valid, rarity: verdict.rarity, meters: gained, note: verdict.note,
        depth: state.depth, zone: zoneFor(state.depth),
        answered, total: DECK.length, completed: answered >= DECK.length,
      });
    }

    if (path === "/api/reveal") {
      return reply({
        date: new Date().toISOString().slice(0, 10), pack: "demo", depth: state.depth,
        zone: zoneFor(state.depth), completed: true, best: Math.max(state.depth, 2840),
        divers: 1, rank: 1,
        lines: DECK.map((q, i) => ({
          promptId: i, body: q.body, yours: state.answers[i] || null,
          common: Object.entries(q.known).sort((a, b) => a[1] - b[1]).slice(0, 4)
            .map(([answer, r], idx) => ({ answer, count: 40 - idx * 9 - Math.round(r / 10) })),
        })),
      });
    }

    throw new Error(`demo has no route for ${path}`);
  };
})();

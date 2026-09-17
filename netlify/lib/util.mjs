// Pure helpers.  No I/O in here, so this file is the one that's cheap to test.

export const PROMPTS_PER_RUN = 7;
export const MAX_ANSWER_LEN = 60;

/**
 * Collapse an answer to its comparable core, so "The Atlantic ", "atlantic"
 * and "Atlantic!" all count as the same answer for caching and frequency.
 */
export function normalize(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")     // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")        // punctuation -> space
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(a|an|the)\s+/, "");       // leading article, after trimming
}

/**
 * Depth earned by one answer.  Quadratic on purpose: the whole feel of the
 * game rests on obvious answers being nearly worthless rather than merely
 * worth less.  rarity 10 -> 5 m, rarity 50 -> 125 m, rarity 90 -> 405 m.
 */
export function metersFor(rarity) {
  const r = Math.max(0, Math.min(100, Number(rarity) || 0));
  return Math.round((r * r) / 20);
}

// A perfect run is 7 x 500 m, so the zone bands are set to make the floor
// reachable but not routine.
const ZONES = [
  { at: 0,    name: "Sunlight",  blurb: "Everyone starts here." },
  { at: 200,  name: "Twilight",  blurb: "Past the easy answers." },
  { at: 1000, name: "Midnight",  blurb: "No light reaches this far." },
  { at: 2200, name: "Abyssal",   blurb: "Almost nobody gets down here." },
];

export function zoneFor(depth) {
  let zone = ZONES[0];
  for (const z of ZONES) if (depth >= z.at) zone = z;
  return zone;
}

export const zones = () => ZONES.map((z) => ({ ...z }));

/** Deterministic PRNG so a date always yields the same prompt set. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick n prompts for a date.  Seeded by date+pack, so two servers computing
 * the same day independently agree, and a lost daily_sets row rebuilds
 * identically instead of handing someone a different game.
 */
export function pickDaily(ids, n, dateStr, pack) {
  const rand = mulberry32(hashString(`${dateStr}:${pack}`));
  const pool = [...ids];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}

/**
 * Blend the model's guess with how people actually answered.
 *
 * Day one there is no player data and the score is pure judgement.  As
 * answers accumulate the empirical share takes over, capped at 70% so a
 * brand-new correct answer can't be dragged to nonsense by a thin sample.
 */
export function blendRarity(llmRarity, sameCount, totalCount) {
  if (!totalCount || totalCount < 10) return llmRarity;
  const share = sameCount / totalCount;
  const empirical = Math.round(100 * (1 - share));
  const weight = Math.min(totalCount / 100, 0.7);
  return Math.round(llmRarity * (1 - weight) + empirical * weight);
}

/** Today in a fixed zone, so the daily set rolls over at the same moment for everyone. */
export function playDate(tz = "America/New_York", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const fail = (message, status = 400) => json({ error: message }, status);

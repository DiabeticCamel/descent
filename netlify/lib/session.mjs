import * as db from "./db.mjs";
import { PROMPTS_PER_RUN, pickDaily, playDate } from "./util.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function playerIdFrom(req) {
  const id = req.headers.get("x-player-id");
  return id && UUID_RE.test(id) ? id.toLowerCase() : null;
}

export async function ensurePlayer(playerId) {
  const [row] = await db.upsert("players", [{ id: playerId, last_seen: new Date().toISOString() }], "id");
  return row;
}

/**
 * The seven prompts for a date.  Written to daily_sets on first request of the
 * day so every later player reads the same row rather than re-deriving it, but
 * the pick is seeded so a rebuild produces an identical set anyway.
 */
export async function ensureDailySet(date, pack) {
  const existing = await db.select(
    "daily_sets",
    `play_date=eq.${date}&pack=eq.${pack}&select=prompt_ids`,
  );
  if (existing.length) return existing[0].prompt_ids;

  const pool = await db.select("prompts", `pack=eq.${pack}&active=is.true&select=id`);
  if (pool.length < PROMPTS_PER_RUN) {
    throw new Error(`pack "${pack}" has ${pool.length} prompts; needs at least ${PROMPTS_PER_RUN}`);
  }

  const ids = pickDaily(pool.map((p) => p.id), PROMPTS_PER_RUN, date, pack);
  await db.upsert("daily_sets", [{ play_date: date, pack, prompt_ids: ids }], "play_date,pack");
  return ids;
}

export async function ensureRun(playerId, date, pack) {
  const [run] = await db.upsert(
    "runs",
    [{ player_id: playerId, play_date: date, pack }],
    "player_id,play_date,pack",
  );
  return run;
}

/** Everything a request needs: the player's run for today and its prompt set. */
export async function loadSession(req, pack) {
  const playerId = playerIdFrom(req);
  if (!playerId) return { error: "Missing or malformed x-player-id header." };

  const date = playDate(process.env.GAME_TIMEZONE || "America/New_York");
  await ensurePlayer(playerId);

  const promptIds = await ensureDailySet(date, pack);
  const run = await ensureRun(playerId, date, pack);

  return { playerId, date, pack, promptIds, run };
}

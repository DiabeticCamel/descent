import * as db from "../lib/db.mjs";
import { judge } from "../lib/judge.mjs";
import { loadSession } from "../lib/session.mjs";
import { MAX_ANSWER_LEN, blendRarity, fail, json, metersFor, normalize, zoneFor } from "../lib/util.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("POST only.", 405);

  try {
    const body = await req.json().catch(() => ({}));
    const promptId = Number(body.promptId);
    const raw = String(body.answer ?? "").trim();
    const pack = String(body.pack || "classic");

    if (!Number.isInteger(promptId)) return fail("promptId must be an integer.");
    if (!raw) return fail("Type an answer first.");
    if (raw.length > MAX_ANSWER_LEN) return fail(`Keep it under ${MAX_ANSWER_LEN} characters.`);

    const norm = normalize(raw);
    if (!norm) return fail("That answer has no letters or numbers in it.");

    const session = await loadSession(req, pack);
    if (session.error) return fail(session.error, 400);
    const { promptIds, run } = session;

    if (!promptIds.includes(promptId)) return fail("That prompt is not in today's dive.", 404);

    const [prompt] = await db.select("prompts", `id=eq.${promptId}&select=id,body,answer_kind`);
    if (!prompt) return fail("Unknown prompt.", 404);

    const already = await db.select("answers", `run_id=eq.${run.id}&prompt_id=eq.${promptId}&select=id`);
    if (already.length) return fail("You have already answered this one.", 409);

    // Repeating an answer you have already used this run is free depth
    // otherwise — give the same rare answer seven times and you hit the floor.
    const used = await db.select("answers", `run_id=eq.${run.id}&select=norm_answer`);
    if (used.some((a) => a.norm_answer === norm)) {
      return fail("You have already used that answer today.", 409);
    }

    // --- score it ----------------------------------------------------------
    // Cache first: the same answer to the same prompt must always score the
    // same for everyone, and most answers to a good prompt are repeats.
    const [cached] = await db.select(
      "judge_cache",
      `prompt_id=eq.${promptId}&norm_answer=eq.${encodeURIComponent(norm)}&select=rarity,valid,note`,
    );

    let verdict;
    if (cached) {
      verdict = { rarity: cached.rarity, valid: cached.valid, note: cached.note };
    } else {
      try {
        verdict = await judge(prompt.body, raw, prompt.answer_kind);
      } catch (err) {
        console.error("judge failed:", err.message);
        return fail("The judge is unavailable right now. Try that answer again.", 503);
      }
      await db.upsert(
        "judge_cache",
        [{ prompt_id: promptId, norm_answer: norm, rarity: verdict.rarity, valid: verdict.valid, note: verdict.note }],
        "prompt_id,norm_answer",
      );
    }

    // Shift toward how people actually answered, once enough of them have.
    let rarity = verdict.rarity;
    if (verdict.valid) {
      const [freq] = await db.rpc("answer_frequency", { p_prompt_id: promptId, p_norm: norm });
      rarity = blendRarity(verdict.rarity, Number(freq?.same_count ?? 0), Number(freq?.total_count ?? 0));
    }

    const meters = verdict.valid ? metersFor(rarity) : 0;

    await db.insert("answers", [
      {
        run_id: run.id,
        prompt_id: promptId,
        raw_answer: raw,
        norm_answer: norm,
        rarity,
        meters,
        valid: verdict.valid,
        judge_note: verdict.note,
      },
    ]);

    // Recompute depth from the answers rather than incrementing, so two
    // in-flight submits can't lose a result to a lost update.
    const all = await db.select("answers", `run_id=eq.${run.id}&select=meters`);
    const depth = all.reduce((sum, a) => sum + a.meters, 0);
    const completed = all.length >= promptIds.length;

    await db.update("runs", { depth, completed }, `id=eq.${run.id}`);

    return json({
      valid: verdict.valid,
      rarity,
      meters,
      note: verdict.note,
      depth,
      zone: zoneFor(depth),
      answered: all.length,
      total: promptIds.length,
      completed,
    });
  } catch (err) {
    console.error("submit:", err);
    return fail("Could not score that answer.", 500);
  }
};

export const config = { path: "/api/submit" };

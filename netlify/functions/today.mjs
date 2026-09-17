import * as db from "../lib/db.mjs";
import { loadSession } from "../lib/session.mjs";
import { fail, json, zoneFor, zones } from "../lib/util.mjs";

export default async (req) => {
  try {
    const pack = new URL(req.url).searchParams.get("pack") || "classic";
    const session = await loadSession(req, pack);
    if (session.error) return fail(session.error, 400);

    const { date, promptIds, run } = session;

    // Prompt bodies, then the player's own answers so a refresh mid-run picks
    // up exactly where they left off instead of restarting the day.
    const [prompts, answered] = await Promise.all([
      db.select("prompts", `id=in.(${promptIds.join(",")})&select=id,body,answer_kind`),
      db.select(
        "answers",
        `run_id=eq.${run.id}&select=prompt_id,raw_answer,rarity,meters,valid,judge_note`,
      ),
    ]);

    const byId = new Map(prompts.map((p) => [p.id, p]));
    const done = new Map(answered.map((a) => [a.prompt_id, a]));

    const questions = promptIds.map((id, i) => {
      const prompt = byId.get(id);
      const answer = done.get(id);
      return {
        promptId: id,
        index: i + 1,
        body: prompt?.body ?? "",
        answerKind: prompt?.answer_kind ?? null,
        answered: Boolean(answer),
        result: answer
          ? {
              answer: answer.raw_answer,
              rarity: answer.rarity,
              meters: answer.meters,
              valid: answer.valid,
              note: answer.judge_note,
            }
          : null,
      };
    });

    return json({
      date,
      pack,
      runId: run.id,
      depth: run.depth,
      zone: zoneFor(run.depth),
      zones: zones(),
      total: questions.length,
      remaining: questions.filter((q) => !q.answered).length,
      completed: run.completed,
      questions,
    });
  } catch (err) {
    console.error("today:", err);
    return fail("Could not load today's dive.", 500);
  }
};

export const config = { path: "/api/today" };

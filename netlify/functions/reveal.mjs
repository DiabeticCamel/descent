import * as db from "../lib/db.mjs";
import { loadSession } from "../lib/session.mjs";
import { fail, json, zoneFor } from "../lib/util.mjs";

export default async (req) => {
  try {
    const pack = new URL(req.url).searchParams.get("pack") || "classic";
    const session = await loadSession(req, pack);
    if (session.error) return fail(session.error, 400);

    const { date, promptIds, run } = session;

    const [prompts, answers] = await Promise.all([
      db.select("prompts", `id=in.(${promptIds.join(",")})&select=id,body`),
      db.select("answers", `run_id=eq.${run.id}&select=prompt_id,raw_answer,rarity,meters,valid,judge_note`),
    ]);

    if (!answers.length) return fail("Nothing to reveal yet.", 409);

    const bodyById = new Map(prompts.map((p) => [p.id, p.body]));
    const answerById = new Map(answers.map((a) => [a.prompt_id, a]));

    // What everyone else said, per prompt.  This is the part that makes a
    // finished run worth looking at rather than just a number.
    const breakdowns = await Promise.all(
      promptIds.map((id) => db.rpc("prompt_breakdown", { p_prompt_id: id, p_limit: 5 })),
    );

    const lines = promptIds.map((id, i) => {
      const answer = answerById.get(id);
      return {
        promptId: id,
        body: bodyById.get(id) ?? "",
        yours: answer
          ? {
              answer: answer.raw_answer,
              rarity: answer.rarity,
              meters: answer.meters,
              valid: answer.valid,
              note: answer.judge_note,
            }
          : null,
        common: (breakdowns[i] ?? []).map((row) => ({ answer: row.norm_answer, count: Number(row.n) })),
      };
    });

    // Where the run sits against everyone who played the same set today.
    const field = await db.select(
      "runs",
      `play_date=eq.${date}&pack=eq.${pack}&completed=is.true&select=depth&order=depth.desc`,
    );
    const deeper = field.filter((r) => r.depth > run.depth).length;

    return json({
      date,
      pack,
      depth: run.depth,
      zone: zoneFor(run.depth),
      completed: run.completed,
      best: field[0]?.depth ?? run.depth,
      divers: field.length,
      rank: deeper + 1,
      lines,
    });
  } catch (err) {
    console.error("reveal:", err);
    return fail("Could not load the reveal.", 500);
  }
};

export const config = { path: "/api/reveal" };

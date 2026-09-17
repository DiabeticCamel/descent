import { seed, tables, stats, setJudge, req } from "./harness.mjs";

const today   = (await import("../netlify/functions/today.mjs")).default;
const submit  = (await import("../netlify/functions/submit.mjs")).default;
const reveal  = (await import("../netlify/functions/reveal.mjs")).default;

let pass = 0, failed = 0;
const check = (cond, label) => cond ? pass++ : (failed++, console.log("  FAIL:", label));
const body = async (res) => [res.status, await res.json()];

const P1 = "11111111-2222-4333-8444-555555555555";
const P2 = "99999999-8888-4777-8666-555555555555";

const answer = (promptId, text, playerId = P1) =>
  submit(req("/api/submit", { method: "POST", playerId, body: JSON.stringify({ promptId, answer: text }) }));

seed(12);

// --- today -----------------------------------------------------------------
{
  const [status, data] = await body(await today(req("/api/today")));
  check(status === 200, "today returns 200");
  check(data.questions.length === 7, "seven prompts");
  check(data.depth === 0 && data.zone.name === "Sunlight", "starts at the surface");
  check(data.questions.every((q) => !q.answered), "nothing answered yet");

  const [, again] = await body(await today(req("/api/today")));
  check(JSON.stringify(again.questions.map((q) => q.promptId)) ===
        JSON.stringify(data.questions.map((q) => q.promptId)), "same set on reload");
  check(tables.runs.length === 1, "reload reuses the run");
}

const set = (await (await today(req("/api/today"))).json()).questions;

// --- scoring ---------------------------------------------------------------
{
  setJudge(() => ({ valid: true, obviousness: 95, note: "everyone says this" }));
  const [status, data] = await body(await answer(set[0].promptId, "Penguin"));
  check(status === 200, "obvious answer accepted");
  check(data.rarity === 5, "rarity inverts obviousness");
  check(data.meters === 1, "obvious answer barely descends");

  setJudge(() => ({ valid: true, obviousness: 8, note: "a deep cut" }));
  const [, rare] = await body(await answer(set[1].promptId, "Kakapo"));
  check(rare.rarity === 92, "rare answer scores high");
  check(rare.meters === 423, "rare answer descends far");
  check(rare.depth === 424, "depth accumulates");
  check(rare.zone.name === "Twilight", "zone advances past 200 m");
}

// --- invalid answers -------------------------------------------------------
{
  setJudge(() => ({ valid: false, obviousness: 0, note: "not a bird" }));
  const [, data] = await body(await answer(set[2].promptId, "Bicycle"));
  check(data.valid === false, "invalid flagged");
  check(data.meters === 0, "invalid earns nothing");
  check(data.depth === 424, "invalid does not change depth");
}

// --- guards ----------------------------------------------------------------
{
  setJudge(() => ({ valid: true, obviousness: 50, note: "fine" }));
  const [dupStatus] = await body(await answer(set[0].promptId, "Ostrich"));
  check(dupStatus === 409, "cannot answer the same prompt twice");

  const [reuseStatus, reuse] = await body(await answer(set[3].promptId, "  kakapo!  "));
  check(reuseStatus === 409, "cannot reuse an answer after normalisation");
  check(/already used/.test(reuse.error), "reuse message is specific");

  const [badStatus] = await body(await answer(999999, "Anything"));
  check(badStatus === 404, "prompt outside today's set rejected");

  const [emptyStatus] = await body(await answer(set[3].promptId, "   "));
  check(emptyStatus === 400, "empty answer rejected");

  const [longStatus] = await body(await answer(set[3].promptId, "x".repeat(61)));
  check(longStatus === 400, "over-long answer rejected");

  const [noIdStatus] = await body(await submit(new Request("https://site.test/api/submit", {
    method: "POST", body: JSON.stringify({ promptId: set[3].promptId, answer: "Emu" }),
  })));
  check(noIdStatus === 400, "missing player id rejected");
}

// --- judge cache -----------------------------------------------------------
{
  const before = stats.judgeCalls;
  setJudge(() => ({ valid: true, obviousness: 30, note: "cached" }));
  await answer(set[3].promptId, "Weka");

  const mid = stats.judgeCalls;
  check(mid === before + 1, "new answer calls the judge once");

  // Same answer, same prompt, different player: must hit cache.
  await answer(set[3].promptId, "weka", P2);
  check(stats.judgeCalls === mid, "repeat answer served from cache");
}

// --- empirical blend -------------------------------------------------------
{
  const promptId = set[4].promptId;
  setJudge(() => ({ valid: true, obviousness: 50, note: "middling" }));

  // Twelve players all give the same answer; the crowd should drag it down.
  for (let i = 0; i < 12; i++) {
    const pid = `aaaaaaaa-bbbb-4ccc-8ddd-${String(i).padStart(12, "0")}`;
    await answer(promptId, "Common", pid);
  }
  const rarities = tables.answers.filter((a) => a.prompt_id === promptId).map((a) => a.rarity);
  check(rarities[0] === 50, "first answer scored on judgement alone");
  check(rarities.at(-1) < 50, "score falls as the crowd converges");
}

// --- resume ----------------------------------------------------------------
{
  const [, data] = await body(await today(req("/api/today")));
  check(data.questions.filter((q) => q.answered).length === 4, "answered prompts marked");
  check(data.questions.find((q) => q.answered).result.answer.length > 0, "prior answers returned");
  check(data.remaining === 3, "remaining counted");
}

// --- completion and reveal -------------------------------------------------
{
  const [earlyStatus] = await body(await reveal(req("/api/reveal", { playerId: P2 })));
  check(earlyStatus === 200, "reveal works mid-run for a player with answers");

  setJudge(() => ({ valid: true, obviousness: 20, note: "solid" }));
  const remaining = (await (await today(req("/api/today"))).json()).questions.filter((q) => !q.answered);
  let last;
  for (const q of remaining) last = (await (await answer(q.promptId, `Answer${q.promptId}`)).json());

  check(last.completed === true, "run completes after seven answers");
  check(tables.runs.find((r) => r.player_id === P1).completed === true, "completion persisted");

  const [status, data] = await body(await reveal(req("/api/reveal")));
  check(status === 200, "reveal returns 200");
  check(data.lines.length === 7, "reveal covers every prompt");
  check(data.depth === last.depth, "reveal depth matches the run");
  check(data.rank >= 1 && data.divers >= 1, "rank computed");
  check(data.lines.some((l) => l.common.length > 0), "shows what others answered");
}

console.log(`\n${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

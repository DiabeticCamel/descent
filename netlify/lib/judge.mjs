// The scoring brain.
//
// The model is asked for OBVIOUSNESS, not rarity.  "Would most people say
// this?" is a judgement models make well; "what percent of people say this?"
// invites a confident invented number.  Rarity is just the inverse.

const MODEL = process.env.JUDGE_MODEL || "claude-haiku-4-5-20251001";
const API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM = `You score answers in a word game where players try to give correct but UNUSUAL answers to open prompts.

For each answer, decide two things:

1. valid — is this a genuine, factually correct answer to the prompt? Be generous about spelling, capitalisation and phrasing; be strict about correctness. Nonsense, blank answers, jokes that don't answer the prompt, and factually wrong answers are not valid.

2. obviousness — 0 to 100, how readily this answer springs to mind for an ordinary adult given this prompt.
   90-100  the first thing nearly everyone says
   70-89   very common, most people would consider it
   40-69   familiar, but not the first few answers
   15-39   correct and genuinely uncommon
   0-14    obscure; most people would not know it

Judge obviousness only against OTHER VALID ANSWERS to this same prompt. Do not reward an answer for being strange if it is strange because it is wrong.

Also write a note of at most eight words, shown to the player after scoring: a flicker of colour about the answer, not a restatement of the score. Never mention numbers or the words obvious or rare.

Reply with ONLY a JSON object, no markdown fence and no commentary:
{"valid": true, "obviousness": 62, "note": "..."}`;

function parseJudgement(text) {
  const cleaned = String(text).replace(/```json\s*|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`no JSON in judge reply: ${cleaned.slice(0, 120)}`);

  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  const obviousness = Math.max(0, Math.min(100, Math.round(Number(parsed.obviousness))));
  if (!Number.isFinite(obviousness)) throw new Error("judge returned a non-numeric obviousness");

  return {
    valid: Boolean(parsed.valid),
    rarity: 100 - obviousness,
    note: String(parsed.note ?? "").slice(0, 80),
  };
}

async function callModel(prompt, answer, answerKind) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `Prompt: ${prompt}\n` +
            (answerKind ? `A valid answer is ${answerKind}.\n` : "") +
            `Player's answer: ${answer}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = await res.json();
  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Score one answer.  Returns { valid, rarity, note }.
 *
 * One retry, because a malformed JSON reply is the common failure and it is
 * almost always transient.  Anything past that throws, so the caller can tell
 * the player to try again rather than silently record a wrong score.
 */
export async function judge(prompt, answer, answerKind) {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseJudgement(await callModel(prompt, answer, answerKind));
    } catch (err) {
      lastError = err;
      console.error(`judge attempt ${attempt + 1} failed:`, err.message);
    }
  }
  throw lastError;
}

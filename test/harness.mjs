// Emulates just enough PostgREST + Anthropic to run the real handlers.
process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.ANTHROPIC_API_KEY = "test-key";

export const tables = { prompts: [], daily_sets: [], players: [], runs: [], answers: [], judge_cache: [] };
export const stats = { judgeCalls: 0 };
export let judgeScript = () => ({ valid: true, obviousness: 50, note: "a fine answer" });
export const setJudge = (fn) => { judgeScript = fn; };

let seq = 1;
const nextId = () => seq++;

// --- tiny PostgREST filter parser -----------------------------------------
function matches(row, params) {
  for (const [key, raw] of params) {
    if (["select", "order", "on_conflict", "limit"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = decodeURIComponent(rest.join("."));
    const cell = row[key];
    if (op === "eq" && String(cell) !== value) return false;
    if (op === "is" && String(cell) !== (value === "true" ? "true" : "false")) return false;
    if (op === "in") {
      const list = value.replace(/^\(|\)$/g, "").split(",");
      if (!list.includes(String(cell))) return false;
    }
  }
  return true;
}

function conflictKey(row, cols) {
  return cols.split(",").map((c) => String(row[c.trim()])).join("|");
}

function handleDb(url, init) {
  const parsed = new URL(url);
  const path = parsed.pathname.replace("/rest/v1/", "");
  const params = [...parsed.searchParams.entries()];
  const method = (init.method || "GET").toUpperCase();
  const prefer = (init.headers?.prefer || "");

  if (path.startsWith("rpc/")) {
    const args = JSON.parse(init.body);
    if (path === "rpc/answer_frequency") {
      const rows = tables.answers.filter((a) => a.prompt_id === args.p_prompt_id && a.valid);
      return [{
        same_count: rows.filter((a) => a.norm_answer === args.p_norm).length,
        total_count: rows.length,
      }];
    }
    if (path === "rpc/prompt_breakdown") {
      const counts = new Map();
      for (const a of tables.answers) {
        if (a.prompt_id !== args.p_prompt_id || !a.valid) continue;
        counts.set(a.norm_answer, (counts.get(a.norm_answer) || 0) + 1);
      }
      return [...counts.entries()]
        .map(([norm_answer, n]) => ({ norm_answer, n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, args.p_limit ?? 5);
    }
    throw new Error(`unmocked rpc ${path}`);
  }

  const table = tables[path];
  if (!table) throw new Error(`unknown table ${path}`);

  if (method === "GET") {
    let rows = table.filter((r) => matches(r, params));
    const order = parsed.searchParams.get("order");
    if (order) {
      const [col, dir] = order.split(".");
      rows = [...rows].sort((a, b) => (dir === "desc" ? b[col] - a[col] : a[col] - b[col]));
    }
    return rows;
  }

  if (method === "POST") {
    const incoming = JSON.parse(init.body);
    const onConflict = parsed.searchParams.get("on_conflict");
    const written = [];
    for (const row of incoming) {
      if (onConflict && prefer.includes("merge-duplicates")) {
        const key = conflictKey(row, onConflict);
        const existing = table.find((r) => conflictKey(r, onConflict) === key);
        if (existing) { Object.assign(existing, row); written.push(existing); continue; }
      }
      // Unique constraints the real schema enforces.
      if (path === "answers" && table.some((r) => r.run_id === row.run_id && r.prompt_id === row.prompt_id)) {
        const err = new Error("duplicate key value violates unique constraint");
        err.status = 409;
        throw err;
      }
      const created = { id: row.id ?? nextId(), depth: 0, completed: false, ...row };
      table.push(created);
      written.push(created);
    }
    return written;
  }

  if (method === "PATCH") {
    const patch = JSON.parse(init.body);
    const hit = table.filter((r) => matches(r, params));
    hit.forEach((r) => Object.assign(r, patch));
    return hit;
  }

  throw new Error(`unmocked ${method} ${path}`);
}

// --- install ---------------------------------------------------------------
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);

  if (href.startsWith("https://api.anthropic.com")) {
    stats.judgeCalls++;
    const body = JSON.parse(init.body);
    const text = body.messages[0].content;
    const verdict = judgeScript(text);
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: JSON.stringify(verdict) }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  if (href.startsWith("http://db.test")) {
    try {
      const result = handleDb(href, init);
      return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ message: err.message }), { status: err.status || 500 });
    }
  }

  throw new Error(`unexpected fetch to ${href}`);
};

export function seed(count = 12) {
  tables.prompts.length = 0;
  for (let i = 0; i < count; i++) {
    tables.prompts.push({ id: nextId(), pack: "classic", body: `Prompt ${i}?`, answer_kind: "a thing", active: true });
  }
}

export const req = (url, options = {}) =>
  new Request(`https://site.test${url}`, {
    ...options,
    headers: { "x-player-id": options.playerId || "11111111-2222-4333-8444-555555555555", ...options.headers },
  });

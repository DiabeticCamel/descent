// Minimal Supabase client over PostgREST.
//
// Deliberately not @supabase/supabase-js: the handful of calls this app makes
// are one fetch each, and skipping the dependency means no package.json, no
// install step, and nothing to keep up to date.

const URL_BASE = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !SERVICE_KEY) {
  console.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
}

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    authorization: `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function request(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`supabase ${res.status} on ${path}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** SELECT.  `query` is a PostgREST query string, e.g. "pack=eq.classic&select=id". */
export const select = (table, query = "") => request(`${table}?${query}`, { headers: headers() });

/** INSERT, returning the created rows. */
export const insert = (table, rows, query = "") =>
  request(`${table}?${query}`, {
    method: "POST",
    headers: headers({ prefer: "return=representation" }),
    body: JSON.stringify(rows),
  });

/**
 * INSERT ... ON CONFLICT DO UPDATE.  `onConflict` names the conflict target
 * columns; without it PostgREST rejects the merge.
 */
export const upsert = (table, rows, onConflict, query = "") =>
  request(`${table}?on_conflict=${onConflict}&${query}`, {
    method: "POST",
    headers: headers({ prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(rows),
  });

/** UPDATE rows matching `query`. */
export const update = (table, patch, query) =>
  request(`${table}?${query}`, {
    method: "PATCH",
    headers: headers({ prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });

/** Call a Postgres function defined in schema.sql. */
export const rpc = (fn, args = {}) =>
  request(`rpc/${fn}`, { method: "POST", headers: headers(), body: JSON.stringify(args) });

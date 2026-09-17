# Descent

A daily word game. Seven prompts, same for everyone. Correct-but-unusual
answers take you deeper; the answers everyone reaches for barely move you.

Static frontend on Netlify, Postgres on Supabase, answers scored by an LLM
judge running inside a Netlify function.

---

## 1. Supabase

1. Create a project at supabase.com. Any region; the free tier is plenty.
2. Open **SQL Editor → New query**, paste `db/schema.sql`, run it.
3. New query again, paste `db/seed.sql`, run it. That loads 45 prompts across
   six packs — enough for six-plus weeks of non-repeating `classic` sets.
4. **Project Settings → API**, and copy two values:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

The service-role key bypasses row-level security. It lives only in Netlify's
environment and is never sent to a browser — the frontend talks exclusively to
your own functions. Don't paste it into client code.

## 2. Anthropic

Get a key at console.anthropic.com → `ANTHROPIC_API_KEY`.

The judge runs on Haiku, and results are cached per (prompt, normalised
answer), so the same answer is only ever scored once no matter how many people
give it. Expect a few cents per thousand answers once the cache is warm.

## 3. Netlify

Push this folder to a repo, then **Add new site → Import an existing project**.
Netlify reads `netlify.toml`, so leave the build settings alone.

Under **Site configuration → Environment variables**, add:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `GAME_TIMEZONE` | optional, default `America/New_York` |
| `JUDGE_MODEL` | optional, default `claude-haiku-4-5-20251001` |

Deploy. Done.

## Running it locally

```
npm install -g netlify-cli
netlify link
netlify dev
```

`netlify dev` serves `public/` and the functions together on
`http://localhost:8888`, pulling env vars from the linked site. Without a link,
put the same variables in a `.env` file at the project root.

---

## How scoring works

The judge is asked how **obvious** an answer is, not how rare — models are good
at "would most people say this?" and bad at inventing frequency percentages.
Rarity is the inverse, and depth is quadratic in rarity:

```
meters = rarity² / 20
```

So rarity 10 earns 5 m, rarity 50 earns 125 m, rarity 90 earns 405 m. A perfect
seven-answer run reaches 3,500 m. That curve is the whole feel of the game — it
is what makes obvious answers *barely count* rather than merely count less.
Tune it in `netlify/lib/util.mjs`.

Once a prompt has at least ten valid answers on record, the score blends the
judge's number with how people actually answered:

```
weight    = min(total / 100, 0.7)
empirical = 100 × (1 − share of players giving this answer)
rarity    = judge × (1 − weight) + empirical × weight
```

Day one that's pure judgement, since there's no player data yet. By a few
hundred plays it's mostly real. The 0.7 cap keeps a thin sample from
overwhelming a correct-but-new answer.

## Adding prompts

Insert rows into `prompts`. `answer_kind` is an optional hint passed to the
judge ("a country", "a film") that sharpens validity checks:

```sql
insert into prompts (pack, body, answer_kind)
values ('classic', 'Name a tree that loses its needles.', 'a tree species');
```

A prompt works when it has a few answers everyone reaches for and a long tail
of correct ones nobody thinks of. If a prompt only has four plausible answers,
everyone scores the same and the day feels broken. Test a new one by playing it
before it goes in a pack.

Daily sets are picked deterministically from the date and pack name, so the set
is identical for every player and rebuilds identically if the row is ever lost.

## Endpoints

| Route | Does |
| --- | --- |
| `GET /api/today` | Today's prompts, your depth, any answers already given |
| `POST /api/submit` | Score one answer, record it, return new depth |
| `GET /api/reveal` | End-of-run summary, how others answered, your rank |

All three take an `x-player-id` header — a UUID the browser mints on first
visit and keeps in `localStorage`.

## Things worth knowing

**Identity is a localStorage UUID.** Clearing site data means a new player.
Fine among friends; if you want real accounts later, swap `players.id` for a
Supabase Auth user id — nothing else in the schema has to change.

**There's no rate limiting.** Each answer costs you one model call on a cache
miss. Before sharing the link widely, add a cap on answers per player per day,
or put Netlify's rate limiting in front of `/api/submit`.

**The judge is the game.** If scores feel wrong, edit `SYSTEM` in
`netlify/lib/judge.mjs` before touching anything else. The band descriptions in
that prompt do more to shape how the game feels than any other twenty lines
here.

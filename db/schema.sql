-- ---------------------------------------------------------------------------
-- Depth game schema.  Paste into Supabase -> SQL Editor -> New query -> Run.
-- Safe to re-run: every statement is guarded.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- Prompt pool -----------------------------------------------------------------
create table if not exists prompts (
  id          bigserial primary key,
  pack        text        not null default 'classic',
  body        text        not null,
  -- Optional hint to the judge about what counts as a valid answer,
  -- e.g. 'a country', 'a film released before 2000'.
  answer_kind text,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists prompts_pack_active_idx on prompts (pack, active);

-- The seven prompts everyone gets on a given day, per pack ---------------------
create table if not exists daily_sets (
  play_date  date        not null,
  pack       text        not null default 'classic',
  prompt_ids bigint[]    not null,
  created_at timestamptz not null default now(),
  primary key (play_date, pack)
);

-- Players ---------------------------------------------------------------------
-- No passwords.  The browser mints a UUID and keeps it in localStorage.
-- Swap in Supabase Auth later without touching the rest of the schema.
create table if not exists players (
  id         uuid        primary key default gen_random_uuid(),
  handle     text,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

-- One player's attempt at one daily set ---------------------------------------
create table if not exists runs (
  id         uuid        primary key default gen_random_uuid(),
  player_id  uuid        not null references players (id) on delete cascade,
  play_date  date        not null,
  pack       text        not null default 'classic',
  depth      integer     not null default 0,
  completed  boolean     not null default false,
  created_at timestamptz not null default now(),
  unique (player_id, play_date, pack)
);

create index if not exists runs_leaderboard_idx
  on runs (play_date, pack, depth desc);

-- Individual answers ----------------------------------------------------------
create table if not exists answers (
  id          bigserial   primary key,
  run_id      uuid        not null references runs (id) on delete cascade,
  prompt_id   bigint      not null references prompts (id) on delete cascade,
  raw_answer  text        not null,
  norm_answer text        not null,
  rarity      integer     not null,
  meters      integer     not null,
  valid       boolean     not null,
  judge_note  text,
  created_at  timestamptz not null default now(),
  unique (run_id, prompt_id)
);

-- Drives the empirical half of the score.  Without it every rarity lookup
-- would need a sequential scan once the table grows.
create index if not exists answers_freq_idx on answers (prompt_id, norm_answer);

-- Judge cache -----------------------------------------------------------------
-- Same answer to the same prompt always scores the same and only ever costs
-- one model call, however many people give it.
create table if not exists judge_cache (
  prompt_id   bigint      not null references prompts (id) on delete cascade,
  norm_answer text        not null,
  rarity      integer     not null,
  valid       boolean     not null,
  note        text,
  hits        integer     not null default 1,
  created_at  timestamptz not null default now(),
  primary key (prompt_id, norm_answer)
);

-- Answer frequency for one prompt, in a single round trip ----------------------
create or replace function answer_frequency (p_prompt_id bigint, p_norm text)
returns table (same_count bigint, total_count bigint)
language sql stable as $$
  select
    count(*) filter (where norm_answer = p_norm) as same_count,
    count(*)                                     as total_count
  from answers
  where prompt_id = p_prompt_id and valid;
$$;

-- How everyone else answered, for the end-of-run reveal ------------------------
create or replace function prompt_breakdown (p_prompt_id bigint, p_limit int default 5)
returns table (norm_answer text, n bigint)
language sql stable as $$
  select norm_answer, count(*) as n
  from answers
  where prompt_id = p_prompt_id and valid
  group by norm_answer
  order by n desc
  limit p_limit;
$$;

-- Row level security ----------------------------------------------------------
-- The browser never talks to Postgres directly; every request goes through a
-- Netlify function holding the service-role key, which bypasses RLS.  Policies
-- stay empty on purpose, so a leaked anon key grants nothing.
alter table prompts     enable row level security;
alter table daily_sets  enable row level security;
alter table players     enable row level security;
alter table runs        enable row level security;
alter table answers     enable row level security;
alter table judge_cache enable row level security;

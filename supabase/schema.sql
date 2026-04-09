-- VoyageMind Supabase schema
-- Apply in Supabase SQL editor.

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists vector;

-- Agent runs: one per user prompt
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid null,
  prompt text not null,
  status text not null default 'queued',
  orchestrator_persona text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists agent_runs_user_id_created_at_idx
  on public.agent_runs (user_id, created_at desc);

-- Agent events: append-only log for realtime UI
create table if not exists public.agent_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  agent_name text not null,
  event_type text not null,
  content text null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists agent_events_run_id_created_at_idx
  on public.agent_events (run_id, created_at);

-- Vector memory: long-term user preferences and history
-- (384 dimensions for sentence-transformers/all-MiniLM-L6-v2 from Hugging Face)
create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  content text not null,
  embedding vector(384) not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists user_memories_user_id_idx
  on public.user_memories (user_id);

-- User preferences: extracted from completed trips
create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null,
  preference_key text not null,
  preference_value text not null,
  run_id uuid references public.agent_runs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists user_preferences_user_id_key_idx
  on public.user_preferences (user_id, preference_key);

create unique index if not exists user_preferences_user_id_key_unique_idx
  on public.user_preferences (user_id, preference_key);

alter table public.user_preferences replica identity full;

-- Optional: cosine similarity index (requires pgvector >= 0.5 and ivfflat build step)
-- create index user_memories_embedding_ivfflat_idx
--   on public.user_memories using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);

-- Realtime configuration
-- Supabase Realtime listens to the `supabase_realtime` publication.
-- Run this to stream agent events to the client:
--   alter publication supabase_realtime add table public.agent_events;
-- If you also want run status updates streamed:
--   alter publication supabase_realtime add table public.agent_runs;

-- Replication identity improves update/delete payloads (optional)
alter table public.agent_runs replica identity full;
alter table public.agent_events replica identity full;

-- Row Level Security (RLS)
alter table public.agent_runs enable row level security;
alter table public.agent_events enable row level security;
alter table public.user_memories enable row level security;

drop policy if exists agent_runs_select_own on public.agent_runs;
create policy agent_runs_select_own
  on public.agent_runs
  for select
  using (auth.uid() = user_id);

drop policy if exists agent_runs_insert_own on public.agent_runs;
create policy agent_runs_insert_own
  on public.agent_runs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists agent_runs_update_own on public.agent_runs;
create policy agent_runs_update_own
  on public.agent_runs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists agent_events_select_own_runs on public.agent_events;
create policy agent_events_select_own_runs
  on public.agent_events
  for select
  using (
    exists (
      select 1
      from public.agent_runs
      where public.agent_runs.id = public.agent_events.run_id
      and public.agent_runs.user_id = auth.uid()
    )
  );

drop policy if exists user_memories_select_own on public.user_memories;
create policy user_memories_select_own
  on public.user_memories
  for select
  using (auth.uid() = user_id);

drop policy if exists user_memories_insert_own on public.user_memories;
create policy user_memories_insert_own
  on public.user_memories
  for insert
  with check (auth.uid() = user_id);

drop policy if exists user_memories_update_own on public.user_memories;
create policy user_memories_update_own
  on public.user_memories
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- User preferences RLS policies
alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own
  on public.user_preferences
  for select
  using (auth.uid() = user_id);

drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own
  on public.user_preferences
  for insert
  with check (auth.uid() = user_id);

drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own
  on public.user_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_preferences_delete_own on public.user_preferences;
create policy user_preferences_delete_own
  on public.user_preferences
  for delete
  using (auth.uid() = user_id);

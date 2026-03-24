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
-- (Adjust embedding dimension to your provider; 1536 matches many OpenAI embeddings)
create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  content text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists user_memories_user_id_idx
  on public.user_memories (user_id);

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
-- Enable and author policies as needed for your auth model.
-- For MVP, you can start with RLS disabled, then lock down.
-- alter table public.agent_runs enable row level security;
-- alter table public.agent_events enable row level security;
-- alter table public.user_memories enable row level security;

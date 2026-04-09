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

alter table public.agent_runs
  add column if not exists booked boolean not null default false;

alter table public.agent_runs
  add column if not exists booked_at timestamptz null;

alter table public.agent_runs
  add column if not exists selected_flight_offer_id uuid null;

alter table public.agent_runs
  add column if not exists selected_hotel_offer_id uuid null;

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

-- Flight offers: normalized results from each planning run
create table if not exists public.flight_offers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  user_id uuid not null,
  provider text not null default 'mock',
  provider_offer_id text not null,
  rank int not null default 0,
  origin text null,
  destination text null,
  route text null,
  depart_date date null,
  return_date date null,
  depart_time text null,
  arrive_time text null,
  carrier text null,
  stops int not null default 0,
  price_usd numeric(10,2) null,
  currency text not null default 'USD',
  deep_link text null,
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists flight_offers_run_id_idx
  on public.flight_offers (run_id, rank);

create index if not exists flight_offers_user_id_created_at_idx
  on public.flight_offers (user_id, created_at desc);

create unique index if not exists flight_offers_provider_unique_idx
  on public.flight_offers (run_id, provider, provider_offer_id);

alter table public.flight_offers replica identity full;

-- Hotel offers: normalized results from each planning run
create table if not exists public.hotel_offers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  user_id uuid not null,
  provider text not null default 'mock',
  provider_property_id text null,
  provider_offer_id text not null,
  rank int not null default 0,
  hotel_name text not null,
  city text null,
  area text null,
  check_in date null,
  check_out date null,
  nights int null,
  nightly_usd numeric(10,2) null,
  total_usd numeric(10,2) null,
  rating numeric(3,1) null,
  currency text not null default 'USD',
  perks jsonb not null default '[]'::jsonb,
  deep_link text null,
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists hotel_offers_run_id_idx
  on public.hotel_offers (run_id, rank);

create index if not exists hotel_offers_user_id_created_at_idx
  on public.hotel_offers (user_id, created_at desc);

create unique index if not exists hotel_offers_provider_unique_idx
  on public.hotel_offers (run_id, provider, provider_offer_id);

alter table public.hotel_offers replica identity full;

alter table public.agent_runs
  drop constraint if exists agent_runs_selected_flight_offer_id_fkey;

alter table public.agent_runs
  add constraint agent_runs_selected_flight_offer_id_fkey
  foreign key (selected_flight_offer_id)
  references public.flight_offers (id)
  on delete set null;

alter table public.agent_runs
  drop constraint if exists agent_runs_selected_hotel_offer_id_fkey;

alter table public.agent_runs
  add constraint agent_runs_selected_hotel_offer_id_fkey
  foreign key (selected_hotel_offer_id)
  references public.hotel_offers (id)
  on delete set null;

alter table public.agent_runs
  drop constraint if exists agent_runs_booked_requires_selected_offers;

alter table public.agent_runs
  add constraint agent_runs_booked_requires_selected_offers
  check (
    not booked
    or (
      selected_flight_offer_id is not null
      and selected_hotel_offer_id is not null
    )
  );

create index if not exists agent_runs_user_id_booked_created_at_idx
  on public.agent_runs (user_id, booked, created_at desc);

create index if not exists agent_runs_selected_flight_offer_id_idx
  on public.agent_runs (selected_flight_offer_id);

create index if not exists agent_runs_selected_hotel_offer_id_idx
  on public.agent_runs (selected_hotel_offer_id);

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
alter table public.flight_offers enable row level security;
alter table public.hotel_offers enable row level security;

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

drop policy if exists flight_offers_select_own on public.flight_offers;
create policy flight_offers_select_own
  on public.flight_offers
  for select
  using (auth.uid() = user_id);

drop policy if exists flight_offers_insert_own on public.flight_offers;
create policy flight_offers_insert_own
  on public.flight_offers
  for insert
  with check (auth.uid() = user_id);

drop policy if exists flight_offers_update_own on public.flight_offers;
create policy flight_offers_update_own
  on public.flight_offers
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists flight_offers_delete_own on public.flight_offers;
create policy flight_offers_delete_own
  on public.flight_offers
  for delete
  using (auth.uid() = user_id);

drop policy if exists hotel_offers_select_own on public.hotel_offers;
create policy hotel_offers_select_own
  on public.hotel_offers
  for select
  using (auth.uid() = user_id);

drop policy if exists hotel_offers_insert_own on public.hotel_offers;
create policy hotel_offers_insert_own
  on public.hotel_offers
  for insert
  with check (auth.uid() = user_id);

drop policy if exists hotel_offers_update_own on public.hotel_offers;
create policy hotel_offers_update_own
  on public.hotel_offers
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists hotel_offers_delete_own on public.hotel_offers;
create policy hotel_offers_delete_own
  on public.hotel_offers
  for delete
  using (auth.uid() = user_id);

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

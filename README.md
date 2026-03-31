# VoyageMind

Prompt-first travel planning MVP with live event streaming.

VoyageMind lets a user describe a trip in plain English and get:
- Budget-aware flight options
- Budget-aware hotel options
- A day-by-day itinerary
- Live agent updates streamed on the trip details page

Under the hood:
- Backend (FastAPI) creates runs and writes agent events to Supabase
- Frontend (React + Tailwind) listens to those events with Supabase Realtime
- A polling fallback keeps the UI resilient if realtime temporarily drops

## Current MVP Features
- Prompt-first Home page flow
- Rule-based orchestrator with specialist event logs (parser, flight, hotel, itinerary, budget)
- Result payload includes destination, dates, interests, budget split, flight options, hotel options, itinerary
- Live timeline on trip details page
- Light and dark theme toggle

## Tech Stack
- Frontend: React, TypeScript, Tailwind CSS, Supabase JS
- Backend: Python, FastAPI
- Data + Realtime: Supabase Postgres + Realtime
- Memory schema: pgvector table included in SQL schema

## Project Structure
- [backend](backend) - FastAPI API and orchestration logic
- [frontend](frontend) - React app, pages, realtime subscriptions
- [supabase/schema.sql](supabase/schema.sql) - database schema
- [run.ps1](run.ps1) - one-command local startup on Windows

## Prerequisites
- Node.js 18+ (Node.js 20+ recommended)
- Python 3.10+ (Python 3.11 recommended)
- Supabase project

## 1) Supabase Setup
1. Create a Supabase project.
2. Run [supabase/schema.sql](supabase/schema.sql) in Supabase SQL Editor.
3. Enable realtime for events table:

```sql
alter publication supabase_realtime add table public.agent_events;
```

Optional:

```sql
alter publication supabase_realtime add table public.agent_runs;
```

4. Ensure RLS policies allow browser reads for the frontend anon key on:
- public.agent_runs (select)
- public.agent_events (select)

If RLS is on and select is blocked, live tracking will not render events.

## 2) Backend Setup
From [backend](backend):

1. Create and activate venv:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```powershell
pip install -r requirements.txt
```

3. Create env file:
- Copy [backend/.env.example](backend/.env.example) to `backend/.env`
- Set:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

4. Run API:

```powershell
uvicorn app.main:app --app-dir . --reload --port 8000
```

Backend endpoints:
- `GET /health`
- `POST /runs`
- `GET /runs/{run_id}`
- `POST /mock/ingest`

## 3) Frontend Setup
From [frontend](frontend):

1. Install dependencies:

```powershell
npm install
```

2. Create env file:
- Copy [frontend/.env.example](frontend/.env.example) to `frontend/.env`
- Set:
  - `VITE_API_URL` (default: `http://localhost:8000`)
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

3. Run dev server:

```powershell
npm run dev
```

Open `http://localhost:5173`.

## 4) One-Command Startup (Windows)
After backend and frontend env files are configured:

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

This starts backend and frontend in separate PowerShell windows and opens the app.

## Routes
Current frontend routes:
- `/` - Home (prompt-first planner)
- `/flights`
- `/stays`
- `/holidays`
- `/offers`
- `/my-trips`
- `/trips/:runId` - detailed trip timeline and result cards
- `/runs`
- `/runs/:runId`
- `/support`
- `/about`

`/plan` redirects to `/`.

## Live Tracking: How It Connects
Live tracking is implemented on [frontend/src/pages/TripDetailsPage.tsx](frontend/src/pages/TripDetailsPage.tsx).

Flow:
1. Frontend subscribes to Supabase Realtime for `INSERT` on `public.agent_events` filtered by current `run_id`.
2. New events are appended to the timeline immediately.
3. Frontend also fetches existing run + event history to avoid race conditions.
4. While run status is queued/running, frontend polls periodically as fallback resilience.

Why polling exists:
- Realtime can occasionally drop or reconnect.
- Polling ensures results still appear without requiring manual refresh.

### Live Tracking Checklist
- Frontend env is set (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- Backend env is set (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- `agent_events` is in `supabase_realtime` publication
- RLS select policies permit anon reads for runs/events
- Backend is writing events to `agent_events`

## Troubleshooting
### Realtime updates do not appear
- Confirm frontend env values are present and app restarted.
- Confirm backend is running and `POST /runs` succeeds.
- Confirm `agent_events` has rows for the run in Supabase Table Editor.
- Confirm table publication includes `public.agent_events`.
- Confirm RLS policies allow frontend select access.

### Works only after reload
- Usually means subscription timing or policy issue.
- This app already includes subscribe-first + fetch + fallback polling on trip details.
- If still happening, verify browser console for Supabase auth/RLS errors.

### Run fails quickly
- Check backend logs for missing service role key or Supabase errors.
- Validate [backend/.env.example](backend/.env.example) values are copied to `backend/.env`.

## Security Notes
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code or client env.
- Keep service-role usage server-side only.
- Do not commit real secrets in `.env` files.

## Next Improvements
- Replace rule-based orchestration with tool-connected agents (LLM + providers)
- Add authenticated users and per-user run visibility
- Add real provider integrations for flights/hotels and pricing freshness
- Wire real embeddings + retrieval for user memory

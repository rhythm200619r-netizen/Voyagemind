# VoyageMind 🌍🤖
**An Autonomous, Multi-Agent Travel Concierge**

VoyageMind is an agentic travel planning platform where specialized AI agents collaborate to research, plan, and optimize end-to-end trips from a single natural-language prompt.

This repo is an MVP scaffold:
- A **FastAPI** backend creates an `agent_run` and appends **agent events** into Supabase tables.
- A **React + Tailwind** frontend subscribes to those events using **Supabase Realtime**.
- A **pgvector** table is included for long-term memory (schema only for now).

## Tech Stack
- Frontend: React, Tailwind, Supabase JS
- Backend: Python, FastAPI
- Data/Realtime/Memory: Supabase Postgres + Realtime + `pgvector`

## Project Structure
- `backend/` — FastAPI API that writes `agent_runs` + `agent_events`
- `frontend/` — React dashboard that starts runs + streams events live
- `supabase/schema.sql` — SQL schema (tables, indexes, vector memory)

## Prerequisites
- Node.js 18+ (or 20+)
- Python 3.10+
- A Supabase project (URL, Anon key, Service Role key)

## Supabase Setup
1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Enable Realtime streaming for events:
   - Run in SQL editor:
     - `alter publication supabase_realtime add table public.agent_events;`
     - (optional) `alter publication supabase_realtime add table public.agent_runs;`

## Run (one command)
After you’ve configured the env files (see Backend + Frontend sections below), you can start everything with:

- Windows PowerShell (from the `voyagemind/` folder):
   - `powershell -ExecutionPolicy Bypass -File .\run.ps1`

This starts the backend and frontend in two separate PowerShell windows and opens `http://localhost:5173`.

## Backend (FastAPI)
From `backend/`:
1. Create a virtual environment:
   - `python -m venv .venv`
   - Windows PowerShell: `./.venv/Scripts/Activate.ps1`
2. Install deps:
   - `pip install -r requirements.txt`
3. Configure env:
   - Copy `backend/.env.example` to `backend/.env`
   - Set:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
4. Run the API:
   - `uvicorn app.main:app --reload --port 8000`

API endpoints:
- `GET /health`
- `POST /runs` → creates a run and starts a toy multi-agent workflow

## Frontend (React + Tailwind)
From `frontend/`:
1. Install deps:
   - `npm install`
2. Configure env:
   - Copy `frontend/.env.example` to `frontend/.env`
   - Set:
     - `VITE_API_URL` (default `http://localhost:8000`)
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
3. Run dev server:
   - `npm run dev`

Open `http://localhost:5173`.

Pages:
- `/plan` — start a run + stream events
- `/runs` — run history
- `/runs/:runId` — run details
- `/about` — about this MVP

## Notes / Next Steps
- The current “multi-agent” logic is a placeholder in `backend/app/agents/orchestrator.py` that emits a few events and generates a simple rule-based itinerary from the prompt. Swap it with CrewAI/LangGraph and real travel tools (Amadeus, weather, etc.).
- The `user_memories` vector table is included in schema only; embeddings + retrieval are not wired yet (so it will stay empty unless you add that logic).
- Security: the backend uses a **Supabase Service Role key**; do not expose it to the browser.

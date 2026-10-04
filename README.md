# VoyageMind

AI-powered travel planning platform with multi-agent orchestration, long-term vector memory, authenticated runs, interactive travel assistant chat, and live event streaming.

VoyageMind lets a user describe a trip in plain English and automatically generates:
- **Budget-aware flight options** (via Sky Scrapper / Skyscanner RapidAPI with smart fallbacks)
- **Budget-aware hotel options** (via Booking.com RapidAPI with smart fallbacks)
- **Day-by-day rich itinerary** curated to traveler preferences and pace
- **Travel DNA & Long-term Memory** (stored in Supabase `pgvector` with MiniLM embeddings, automatically remembered for future trip planning)
- **Interactive AI Travel Assistant** (floating chat widget connected to the backend for real-time itinerary tweaking, questions, and destination advice)
- **Live agent updates streamed in real-time** via Supabase Realtime + polling fallback
- **User-scoped trip history & preferences** protected with Supabase Auth

---

## Architecture & Features

### 1. Multi-Agent Pipeline
- **Prompt Profiler**: Parses unstructured prompts into structured constraints (dates, origins, destinations, budgets, pace, and interests) using LLMs.
- **Memory Retrieval**: Pulls the user's past travel preferences and cosine-similar vector memories from previous trips to contextualize constraints.
- **Trip Planner**: Generates execution plans, computes optimal budget allocations between flights, stays, and activities.
- **Specialist Agents**:
  - `FlightAction`: Searches real-time flight options matching timing and budget tiers.
  - `HotelAction`: Discovers real-time hotel and accommodation options with neighborhood details and ratings.
  - `ItineraryAction`: Synthesizes full multi-day itineraries with daily highlights and pacing.
- **Memory Store & Travel DNA**: Extracts structured preferences (using Groq) and generates 384-dim vector embeddings (using Hugging Face's inference API), persisting them into `user_memories` (`vector(384)`) and `user_preferences`.

### 2. Interactive AI Travel Assistant
- Embedded floating chat widget available across the app.
- Chat endpoint (`POST /chat`) that provides contextualized assistance for planned trips, destinations, and recommendations.

### 3. Realtime Streaming & Resilience
- Live agent step-by-step progress streamed directly to the frontend via Supabase Realtime WebSocket channels.
- Automatic polling fallback ensures zero missed events if WebSocket connectivity fluctuates.

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Supabase JS, Lucide Icons, Vite
- **Backend**: Python 3.10+, FastAPI, Pydantic, HTTPX, python-dotenv
- **LLM & Inference**:
  - Google Gemini API (`gemini-2.5-flash`)
  - Groq API (`openai/gpt-oss-20b` / Llama models)
  - Hugging Face Inference API (`sentence-transformers/all-MiniLM-L6-v2`)
- **Data & Vector Store**: Supabase Postgres with `pgvector` extension and Row-Level Security (RLS)
- **Live Travel APIs**: RapidAPI (Sky Scrapper + Booking.com)

---

## Project Structure

- [`backend/`](backend) — FastAPI application, agent modules, memory store, and API routers
- [`frontend/`](frontend) — React application, UI components, realtime subscriptions, and ChatWidget
- [`supabase/schema.sql`](supabase/schema.sql) — Postgres schema, RLS policies, tables (`agent_runs`, `agent_events`, `flight_offers`, `hotel_offers`, `user_memories`, `user_preferences`), and `match_user_memories` vector RPC function
- [`run.ps1`](run.ps1) — One-command startup script for Windows

---

## Getting Started

### Prerequisites
- Node.js 18+ (Node.js 20+ recommended)
- Python 3.10+ (Python 3.11 recommended)
- A Supabase project with `pgvector` enabled

---

### 1) Supabase Setup
1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in your Supabase SQL Editor.
3. Enable realtime for the `agent_events` table:

```sql
alter publication supabase_realtime add table public.agent_events;
```

*(Optional: also add `agent_runs` if you want realtime run state updates)*
```sql
alter publication supabase_realtime add table public.agent_runs;
```

4. Verify RLS policies are active. The provided schema automatically configures RLS policies based on `auth.uid()`.

---

### 2) Backend Setup

From the `backend/` directory:

1. Create and activate a Python virtual environment:
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies:
```powershell
pip install -r requirements.txt
```

3. Create your `.env` configuration file:
- Copy `backend/.env.example` to `backend/.env`
- Configure your API keys:
  - `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`
  - `GEMINI_API_KEY`
  - `GROQ_API_KEY`
  - `HF_TOKEN`
  - `RAPIDAPI_KEY`

4. Run the FastAPI server:
```powershell
uvicorn app.main:app --app-dir . --reload --port 8000
```

#### Backend Endpoints
- `GET /health` — Health check
- `POST /runs` — Create and kick off a new multi-agent trip planning run (requires `Authorization: Bearer <supabase_token>`)
- `GET /runs` — List runs created by the authenticated user
- `GET /runs/{run_id}` — Get single run details and working state
- `GET /runs/{run_id}/offers` — Get flight and hotel offers generated for a run
- `POST /chat` — AI Travel Assistant chat endpoint
- `POST /mock/ingest` — Mock ingestion utility for testing

---

### 3) Frontend Setup

From the `frontend/` directory:

1. Install dependencies:
```powershell
npm install
```

2. Create your `.env` configuration file:
- Copy `frontend/.env.example` to `frontend/.env`
- Set:
  - `VITE_API_URL=http://localhost:8000`
  - `VITE_SUPABASE_URL=https://your-project.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=your-supabase-anon-key`

3. Run the development server:
```powershell
npm run dev
```

The application will be running at `http://localhost:5173`.

---

### 4) One-Command Startup (Windows)

Once both `.env` files are configured, launch everything simultaneously:

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

---

## Frontend Routes

- `/` — Home (Hero prompt input, quick start templates, destination showcases)
- `/trips/:runId` — Detailed timeline with live streaming event log, flight/hotel cards, and full itinerary
- `/my-trips` — History of past generated trips (protected)
- `/flights` — Flight search & inspiration
- `/stays` — Accommodations search & inspiration
- `/holidays` — Curated holiday packages
- `/offers` — Featured deals
- `/support` / `/about` — Support and platform information
- `/login` / `/signup` — Supabase authentication

---

## Live Event Tracking & Memory Architecture

```
User Prompt
    │
    ▼
PromptProfiler (LLM extraction)
    │
    ├─► Reads past user_preferences & vector similarity from user_memories
    ▼
TripPlanner (Budget Allocation & Execution Graph)
    │
    ├──► FlightAction Agent ──► RapidAPI / Fallback ──► flight_offers table
    ├──► HotelAction Agent  ──► RapidAPI / Fallback ──► hotel_offers table
    └──► ItineraryAction    ──► Daily Itinerary Generator
            │
            ▼
    Result Payload Formed
            │
            ├─► Emits live status to public.agent_events (Realtime stream to UI)
            ├─► Groq extracts Travel DNA preferences ──► user_preferences
            └─► HuggingFace generates MiniLM embedding ──► user_memories (pgvector)
```

---

## Troubleshooting

- **Realtime events not updating**: Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`, check that `agent_events` is added to the `supabase_realtime` publication, and check browser console for Supabase WebSocket connection.
- **Empty user memories or preferences**: Ensure `GROQ_API_KEY` and `HF_TOKEN` are populated in `backend/.env`.
- **Live flight/hotel search returns fallback**: Verify `RAPIDAPI_KEY` has active subscriptions to Sky Scrapper and Booking.com APIs.
- **Auth Errors**: Ensure `VITE_SUPABASE_URL` matches `SUPABASE_URL` on the backend.

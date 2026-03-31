from __future__ import annotations

from typing import Any, Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.agents.orchestrator import run_orchestration
from app.settings import settings
from app.supabase_client import get_supabase_admin_client

app = FastAPI(title="VoyageMind API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)


class CreateRunRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    user_id: str | None = None
    orchestrator_persona: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class CreateRunResponse(BaseModel):
    run_id: str


class FlightSegment(BaseModel):
    origin: str
    destination: str
    departure_local: str
    arrival_local: str
    airline: str
    flight_number: str
    aircraft: str | None = None
    duration_minutes: int


class FlightOption(BaseModel):
    id: str
    airlines: list[str]
    marketing_airline: str
    flight_number: str
    cabin: str
    stops: int
    segments: list[FlightSegment]
    total_duration_minutes: int
    price: dict[str, Any]
    baggage: dict[str, Any] | None = None
    layovers: list[dict[str, Any]] | None = None
    fare_rules: dict[str, Any] | None = None


class FlightAgentPayload(BaseModel):
    route: dict[str, str]
    depart_date_local: str
    currency: str
    options: list[FlightOption]
    generated_at_utc: str
    data_source: Literal["MOCK"]


class HotelOption(BaseModel):
    id: str
    name: str
    neighborhood: str
    stars: float
    review_score: float | None = None
    price: dict[str, Any]
    amenities: list[str]
    geo: dict[str, float] | None = None
    cancellation: dict[str, Any] | None = None


class HotelAgentPayload(BaseModel):
    city: str
    area_hint: str | None = None
    check_in_local: str
    nights: int
    guests: int
    currency: str
    options: list[HotelOption]
    generated_at_utc: str
    data_source: Literal["MOCK"]


class Attraction(BaseModel):
    name: str
    category: str | None = None
    area: str | None = None
    approx_geo: dict[str, float] | None = None


class ContextPayload(BaseModel):
    destination: dict[str, Any]
    trip_window: dict[str, Any]
    weather_expectations: dict[str, Any]
    top_attractions: list[Attraction]
    generated_at_utc: str
    data_source: Literal["MOCK"]


class MockIngestRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    user_id: str | None = None
    flight: FlightAgentPayload
    hotel: HotelAgentPayload
    context: ContextPayload
    metadata: dict[str, Any] = Field(default_factory=dict)


class MockIngestResponse(BaseModel):
    run_id: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/runs", response_model=CreateRunResponse)
def create_run(req: CreateRunRequest, background: BackgroundTasks) -> CreateRunResponse:
    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    insert_payload: dict[str, Any] = {
        "prompt": req.prompt,
        "status": "queued",
        "metadata": req.metadata,
    }
    if req.user_id:
        insert_payload["user_id"] = req.user_id
    if req.orchestrator_persona:
        insert_payload["orchestrator_persona"] = req.orchestrator_persona

    created = supabase.table("agent_runs").insert(insert_payload).execute()
    if not created.data:
        raise HTTPException(status_code=500, detail="Failed to create run")

    run_id = created.data[0]["id"]

    def safe_runner() -> None:
        try:
            run_orchestration(supabase=supabase, run_id=run_id, prompt=req.prompt)
        except Exception as exc:  # noqa: BLE001
            supabase.table("agent_events").insert(
                {
                    "run_id": run_id,
                    "agent_name": "Orchestrator",
                    "event_type": "error",
                    "content": str(exc),
                    "payload": {},
                }
            ).execute()
            supabase.table("agent_runs").update({"status": "failed"}).eq("id", run_id).execute()

    background.add_task(safe_runner)

    return CreateRunResponse(run_id=run_id)


@app.get("/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    res = supabase.table("agent_runs").select("*").eq("id", run_id).maybe_single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Run not found")
    return res.data


def _placeholder_embedding_1536(text: str) -> list[float]:
    """Deterministic placeholder embedding.

    This lets you exercise pgvector writes without requiring an embedding model.
    Replace with real embeddings later.
    """

    # Simple LCG-ish hash spread into 1536 floats in [-1, 1].
    seed = 2166136261
    for ch in text.encode("utf-8"):
        seed ^= ch
        seed = (seed * 16777619) & 0xFFFFFFFF

    out: list[float] = []
    x = seed or 1
    for _ in range(1536):
        x = (1103515245 * x + 12345) & 0x7FFFFFFF
        out.append((x / 1073741824.0) - 1.0)
    return out


@app.post("/mock/ingest", response_model=MockIngestResponse)
def mock_ingest(req: MockIngestRequest) -> MockIngestResponse:
    """Ingest MOCK agent payloads into Supabase.

    Creates a new run + appends events for Flight/Hotel/Context agents,
    then stores a pgvector-compatible memory row.
    """

    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    insert_payload: dict[str, Any] = {
        "prompt": req.prompt,
        "status": "running",
        "metadata": {"mock": True, **req.metadata},
    }
    if req.user_id:
        insert_payload["user_id"] = req.user_id

    created = supabase.table("agent_runs").insert(insert_payload).execute()
    if not created.data:
        raise HTTPException(status_code=500, detail="Failed to create run")

    run_id = created.data[0]["id"]

    def emit(agent_name: str, event_type: str, content: str | None, payload: dict[str, Any]) -> None:
        supabase.table("agent_events").insert(
            {
                "run_id": run_id,
                "agent_name": agent_name,
                "event_type": event_type,
                "content": content,
                "payload": payload,
            }
        ).execute()

    emit("Orchestrator", "run_started", "MOCK ingest started", {"source": "mock_ingest"})
    emit("Flight Agent", "agent_report", "MOCK flight options parsed", req.flight.model_dump())
    emit("Hotel Agent", "agent_report", "MOCK hotel options parsed", req.hotel.model_dump())
    emit("Context Agent", "agent_report", "MOCK context parsed", req.context.model_dump())

    synthesis_payload = {
        "flight": {"picked_option_id": req.flight.options[0].id if req.flight.options else None},
        "hotel": {"picked_option_id": req.hotel.options[0].id if req.hotel.options else None},
        "context": {"attractions": [a.model_dump() for a in req.context.top_attractions[:2]]},
    }
    emit("Orchestrator", "result", "MOCK synthesis (first options selected)", synthesis_payload)

    # Store a memory row (pgvector column) so you can test memory ingestion.
    # If your schema requires user_id, pass it; otherwise omit.
    memory_text = (
        f"{req.prompt}\n\n"
        f"Flights: {len(req.flight.options)} options; Hotels: {len(req.hotel.options)} options; "
        f"Attractions: {len(req.context.top_attractions)}"
    )

    memory_row: dict[str, Any] = {
        "content": memory_text,
        "metadata": {
            "run_id": run_id,
            "source": "mock_ingest",
            "kind": "trip_context",
        },
        "embedding": _placeholder_embedding_1536(memory_text),
    }
    if req.user_id:
        memory_row["user_id"] = req.user_id

    # Best-effort: if your `user_memories` table exists + allows insert.
    try:
        supabase.table("user_memories").insert(memory_row).execute()
    except Exception:
        pass

    supabase.table("agent_runs").update({"status": "completed"}).eq("id", run_id).execute()
    emit("Orchestrator", "run_completed", "MOCK ingest completed", {"source": "mock_ingest"})

    return MockIngestResponse(run_id=run_id)

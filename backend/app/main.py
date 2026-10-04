from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.agents.action.flight_action import _estimated_flights
from app.agents.action.hotel_action import _estimated_hotels
from app.agents.orchestrator import run_orchestration
from app.agents.memory import MemoryStore
from app.routers.chat import router as chat_router
from app.settings import settings
from app.supabase_client import get_supabase_admin_client

app = FastAPI(title="VoyageMind API")
app.include_router(chat_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_origin_regex=settings.cors_origin_regex(),
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


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)


class RegisterResponse(BaseModel):
    user_id: str


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


class FlightOfferRow(BaseModel):
    id: str
    created_at: str
    provider: str
    provider_offer_id: str
    rank: int
    destination: str | None = None
    route: str | None = None
    depart_date: str | None = None
    return_date: str | None = None
    depart_time: str | None = None
    arrive_time: str | None = None
    carrier: str | None = None
    stops: int | None = None
    price_usd: float | None = None
    currency: str | None = None
    raw_payload: dict[str, Any]


class HotelOfferRow(BaseModel):
    id: str
    created_at: str
    provider: str
    provider_offer_id: str
    rank: int
    hotel_name: str | None = None
    city: str | None = None
    area: str | None = None
    check_in: str | None = None
    check_out: str | None = None
    nights: int | None = None
    nightly_usd: float | None = None
    total_usd: float | None = None
    rating: float | None = None
    currency: str | None = None
    raw_payload: dict[str, Any]


class RunOffersResponse(BaseModel):
    flight_offers: list[FlightOfferRow]
    hotel_offers: list[HotelOfferRow]
    booked: bool = False
    booked_at: str | None = None
    selected_flight_offer_id: str | None = None
    selected_hotel_offer_id: str | None = None


class BookRunRequest(BaseModel):
    flight_offer_id: str = Field(..., min_length=1)
    hotel_offer_id: str = Field(..., min_length=1)


class BookRunResponse(BaseModel):
    run_id: str
    booked: bool
    booked_at: str | None = None
    flight_offer_id: str
    hotel_offer_id: str


def _get_user_id_from_auth_header(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="Invalid authorization scheme")

    token = authorization[len(prefix) :].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        auth_response = supabase.auth.get_user(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail=f"Invalid auth token: {exc}") from exc

    user = getattr(auth_response, "user", None)
    user_id = getattr(user, "id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    return str(user_id)


def _backfill_estimated_offers_for_empty_run(*, supabase: Any, run_id: str, user_id: str) -> None:
    result = (
        supabase.table("agent_events")
        .select("payload")
        .eq("run_id", run_id)
        .eq("event_type", "result")
        .order("id", desc=True)
        .limit(1)
        .execute()
    )
    payload = result.data[0].get("payload") if result.data else {}
    payload = payload if isinstance(payload, dict) else {}

    destination = payload.get("destination") if isinstance(payload.get("destination"), str) else "Destination"
    budget = payload.get("budget") if isinstance(payload.get("budget"), int) else None
    days = payload.get("days") if isinstance(payload.get("days"), int) else 4
    nights = max(days - 1, 1)

    memory = MemoryStore(supabase=supabase)
    memory.persist_flight_offers(
        run_id=run_id,
        user_id=user_id,
        destination=destination,
        flight_options=_estimated_flights(
            origin="Your city",
            destination=destination,
            depart_date="",
            return_date=None,
            flight_budget=int(budget * 0.4) if isinstance(budget, int) else None,
        ),
    )
    memory.persist_hotel_offers(
        run_id=run_id,
        user_id=user_id,
        destination=destination,
        hotel_options=_estimated_hotels(
            destination=destination,
            checkin_date="",
            checkout_date="",
            nights=nights,
            hotel_budget=int(budget * 0.35) if isinstance(budget, int) else None,
        ),
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/register", response_model=RegisterResponse)
def register_user(req: RegisterRequest) -> RegisterResponse:
    """Create a confirmed email/password user without sending auth emails.

    This is intended for local/dev flows where email quotas are constrained.
    """

    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    email = req.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    try:
        created = supabase.auth.admin.create_user(
            {
                "email": email,
                "password": req.password,
                "email_confirm": True,
            }
        )
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        if "already" in msg.lower() and "register" in msg.lower():
            raise HTTPException(status_code=409, detail="An account with this email already exists") from exc
        raise HTTPException(status_code=400, detail=msg) from exc

    user = getattr(created, "user", None)
    user_id = getattr(user, "id", None)
    if not user_id:
        raise HTTPException(status_code=500, detail="User created but no user id was returned")

    return RegisterResponse(user_id=str(user_id))


@app.post("/runs", response_model=CreateRunResponse)
def create_run(
    req: CreateRunRequest,
    background: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> CreateRunResponse:
    user_id = _get_user_id_from_auth_header(authorization)

    if req.user_id and req.user_id != user_id:
        raise HTTPException(status_code=403, detail="You can only create runs for your own account")

    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    insert_payload: dict[str, Any] = {
        "prompt": req.prompt,
        "status": "queued",
        "metadata": req.metadata,
        "user_id": user_id,
    }
    if req.orchestrator_persona:
        insert_payload["orchestrator_persona"] = req.orchestrator_persona

    created = supabase.table("agent_runs").insert(insert_payload).execute()
    if not created.data:
        raise HTTPException(status_code=500, detail="Failed to create run")

    run_id = created.data[0]["id"]

    async def safe_runner(supabase_client: Client, run_id_str: str, prompt_str: str, u_id: str | None) -> None:
        try:
            await run_orchestration(supabase=supabase_client, run_id=run_id_str, prompt=prompt_str, user_id=u_id)
        except Exception as exc:  # noqa: BLE001
            supabase_client.table("agent_events").insert(
                {
                    "run_id": run_id_str,
                    "agent_name": "Orchestrator",
                    "event_type": "error",
                    "content": str(exc),
                    "payload": {},
                }
            ).execute()
            supabase_client.table("agent_runs").update({"status": "failed"}).eq("id", run_id_str).execute()

    background.add_task(safe_runner, supabase, run_id, req.prompt, user_id)

    return CreateRunResponse(run_id=run_id)


@app.get("/runs/{run_id}")
def get_run(run_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user_id = _get_user_id_from_auth_header(authorization)

    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    res = (
        supabase.table("agent_runs")
        .select("*")
        .eq("id", run_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Run not found")
    return res.data


@app.get("/runs/{run_id}/offers", response_model=RunOffersResponse)
def get_run_offers(run_id: str, authorization: str | None = Header(default=None)) -> RunOffersResponse:
    user_id = _get_user_id_from_auth_header(authorization)

    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        run_check = (
            supabase.table("agent_runs")
            .select("id,status,booked,booked_at,selected_flight_offer_id,selected_hotel_offer_id")
            .eq("id", run_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to fetch run: {exc}") from exc

    if not run_check.data:
        raise HTTPException(status_code=404, detail="Run not found")

    run_row = run_check.data

    try:
        flight_rows = (
            supabase.table("flight_offers")
            .select(
                "id,created_at,provider,provider_offer_id,rank,destination,route,depart_date,return_date,depart_time,arrive_time,carrier,stops,price_usd,currency,raw_payload"
            )
            .eq("run_id", run_id)
            .eq("user_id", user_id)
            .order("rank", desc=False)
            .execute()
        )
        next_flight_rows = flight_rows.data or []
    except Exception as exc:  # noqa: BLE001
        print(f"Error fetching flight offers: {exc}")
        next_flight_rows = []

    try:
        hotel_rows = (
            supabase.table("hotel_offers")
            .select(
                "id,created_at,provider,provider_offer_id,rank,hotel_name,city,area,check_in,check_out,nights,nightly_usd,total_usd,rating,currency,raw_payload"
            )
            .eq("run_id", run_id)
            .eq("user_id", user_id)
            .order("rank", desc=False)
            .execute()
        )
        next_hotel_rows = hotel_rows.data or []
    except Exception as exc:  # noqa: BLE001
        print(f"Error fetching hotel offers: {exc}")
        next_hotel_rows = []

    if (
        run_row.get("status") == "completed"
        and not next_flight_rows
        and not next_hotel_rows
        and not run_row.get("booked")
    ):
        try:
            _backfill_estimated_offers_for_empty_run(supabase=supabase, run_id=run_id, user_id=user_id)
            flight_rows = (
                supabase.table("flight_offers")
                .select(
                    "id,created_at,provider,provider_offer_id,rank,destination,route,depart_date,return_date,depart_time,arrive_time,carrier,stops,price_usd,currency,raw_payload"
                )
                .eq("run_id", run_id)
                .eq("user_id", user_id)
                .order("rank", desc=False)
                .execute()
            )
            hotel_rows = (
                supabase.table("hotel_offers")
                .select(
                    "id,created_at,provider,provider_offer_id,rank,hotel_name,city,area,check_in,check_out,nights,nightly_usd,total_usd,rating,currency,raw_payload"
                )
                .eq("run_id", run_id)
                .eq("user_id", user_id)
                .order("rank", desc=False)
                .execute()
            )
            next_flight_rows = flight_rows.data or []
            next_hotel_rows = hotel_rows.data or []
        except Exception as exc:  # noqa: BLE001
            print(f"Error backfilling estimated offers: {exc}")

    try:
        flight_offers = []
        for row in next_flight_rows:
            try:
                # Convert numeric types to ensure Pydantic compatibility
                row = dict(row)
                if row.get("stops") is not None:
                    row["stops"] = int(row["stops"])
                if row.get("price_usd") is not None:
                    row["price_usd"] = float(row["price_usd"])
                flight_offers.append(FlightOfferRow(**row))
            except Exception as exc:  # noqa: BLE001
                print(f"Error parsing flight offer row: {row} - {exc}")
                raise

        hotel_offers = []
        for row in next_hotel_rows:
            try:
                # Convert numeric types to ensure Pydantic compatibility
                row = dict(row)
                if row.get("nights") is not None:
                    row["nights"] = int(row["nights"])
                if row.get("nightly_usd") is not None:
                    row["nightly_usd"] = float(row["nightly_usd"])
                if row.get("total_usd") is not None:
                    row["total_usd"] = float(row["total_usd"])
                if row.get("rating") is not None:
                    row["rating"] = float(row["rating"])
                hotel_offers.append(HotelOfferRow(**row))
            except Exception as exc:  # noqa: BLE001
                print(f"Error parsing hotel offer row: {row} - {exc}")
                raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to parse offers: {exc}") from exc

    return RunOffersResponse(
        flight_offers=flight_offers,
        hotel_offers=hotel_offers,
        booked=bool(run_row.get("booked", False)),
        booked_at=run_row.get("booked_at"),
        selected_flight_offer_id=run_row.get("selected_flight_offer_id"),
        selected_hotel_offer_id=run_row.get("selected_hotel_offer_id"),
    )


@app.post("/runs/{run_id}/book", response_model=BookRunResponse)
def book_run(
    run_id: str,
    req: BookRunRequest,
    authorization: str | None = Header(default=None),
) -> BookRunResponse:
    user_id = _get_user_id_from_auth_header(authorization)

    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    run_res = (
        supabase.table("agent_runs")
        .select("id,booked,booked_at")
        .eq("id", run_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not run_res.data:
        raise HTTPException(status_code=404, detail="Run not found")

    run_row = run_res.data
    if run_row.get("booked"):
        raise HTTPException(status_code=409, detail="This trip is already booked")

    flight_res = (
        supabase.table("flight_offers")
        .select("id,run_id,user_id")
        .eq("id", req.flight_offer_id)
        .eq("run_id", run_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not flight_res.data:
        raise HTTPException(status_code=400, detail="Selected flight offer does not belong to this trip")

    hotel_res = (
        supabase.table("hotel_offers")
        .select("id,run_id,user_id")
        .eq("id", req.hotel_offer_id)
        .eq("run_id", run_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not hotel_res.data:
        raise HTTPException(status_code=400, detail="Selected hotel offer does not belong to this trip")

    booked_at = datetime.now(timezone.utc).isoformat()
    update_res = (
        supabase.table("agent_runs")
        .update(
            {
                "booked": True,
                "booked_at": booked_at,
                "selected_flight_offer_id": req.flight_offer_id,
                "selected_hotel_offer_id": req.hotel_offer_id,
            }
        )
        .eq("id", run_id)
        .eq("user_id", user_id)
        .eq("booked", False)
        .execute()
    )
    if not update_res.data:
        raise HTTPException(status_code=409, detail="This trip was booked by another request")

    return BookRunResponse(
        run_id=run_id,
        booked=True,
        booked_at=booked_at,
        flight_offer_id=req.flight_offer_id,
        hotel_offer_id=req.hotel_offer_id,
    )


@app.get("/runs")
def list_runs(
    authorization: str | None = Header(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict[str, Any]:
    user_id = _get_user_id_from_auth_header(authorization)

    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    res = (
        supabase.table("agent_runs")
        .select("id,created_at,prompt,status,orchestrator_persona,metadata")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"runs": res.data or []}


@app.get("/users/me/preferences")
def get_user_preferences(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """Fetch user's accumulated travel preferences and preference count."""
    user_id = _get_user_id_from_auth_header(authorization)

    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    trips_count = 0
    try:
        trips_res = supabase.table("agent_runs").select("id").eq("user_id", user_id).eq("booked", True).execute()
        trips_count = len(trips_res.data or [])
    except Exception:
        trips_count = 0

    # Get all unique preferences for this user
    res = (
        supabase.table("user_preferences")
        .select("preference_key,preference_value,updated_at")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )

    preferences: dict[str, str] = {}

    if res.data:
        # Group by preference_key, keeping most recent value
        seen_keys: set[str] = set()
        for row in res.data:
            key = row.get("preference_key")
            if key and key not in seen_keys:
                preferences[key] = row.get("preference_value", "")
                seen_keys.add(key)

    return {
        "preferences": preferences,
        "trips_count": trips_count,
    }


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

    memory_store = MemoryStore(supabase=supabase)

    def emit(agent_name: str, event_type: str, content: str | None, payload: dict[str, Any]) -> None:
        memory_store.emit(
            run_id=run_id,
            agent_name=agent_name,
            event_type=event_type,
            content=content,
            payload=payload,
        )

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

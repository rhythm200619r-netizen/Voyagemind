from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import json
import os
import time
from typing import Any

import httpx
from supabase import Client

from app.agents.shared.contracts import (
    ActionArtifact,
    ExecutionPlan,
    EventType,
    ModuleName,
    TripConstraints,
    WorkingState,
)
from app.agents.shared.events import AgentEvent
from app.agents.memory.base import MemoryModule
from app.agents.shared.module_mapping import module_for_agent


def _extract_preferences_with_llm(result_payload: dict[str, Any]) -> dict[str, str]:
    """Extract travel preferences from trip result using Groq LLM.

    Returns structured preferences as a dict with keys like:
    - accommodation_type, flight_preference, food_style, pace, budget_tier
    - interests (comma-separated)

    If GROQ_API_KEY is not set, returns an empty dict.
    """

    groq_api_key = os.environ.get("GROQ_API_KEY")
    if not groq_api_key:
        return {}

    destination = result_payload.get("destination", "")
    budget = result_payload.get("budget_usd", 0)
    days = result_payload.get("days", 0)
    interests = result_payload.get("interests", [])
    flight_options = result_payload.get("flight_options", [])
    hotel_options = result_payload.get("hotel_options", [])

    prompt = f"""Extract and infer travel preferences from the following trip summary.
Return ONLY a valid JSON object with these fields (use null for missing values):
- accommodation_type: one of [luxury, boutique, mid-range, budget, hostel]
- flight_preference: one of [morning, afternoon, evening, flexible]
- food_style: one of [high-end, local-street, casual, mixed]
- pace: one of [slow, moderate, fast]
- budget_tier: one of [ultra-budget, budget, mid-range, premium, luxury]
- interests: comma-separated list of top 3 interests

Trip Summary:
- Destination: {destination}
- Days: {days}
- Budget: ${budget}
- Stated Interests: {", ".join(interests) if interests else "not specified"}
- Flight Options Available: {len(flight_options)} (prices: {", ".join([f"${{opt.get('price_usd', 0)}}" for opt in flight_options[:3]])})
- Flight Options Available: {len(flight_options)} (prices: {", ".join([f"${opt.get('price_usd', 0)}" for opt in flight_options[:3]])})
- Hotel Options Available: {len(hotel_options)} (price ranges: {", ".join([f"${opt.get('nightly_usd', 0)}/night" for opt in hotel_options[:3]])})

Return only valid JSON, no explanation."""

    try:
        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {groq_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 500,
            },
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

        prefs = json.loads(content)
        return {
            "accommodation_type": prefs.get("accommodation_type") or "",
            "flight_preference": prefs.get("flight_preference") or "",
            "food_style": prefs.get("food_style") or "",
            "pace": prefs.get("pace") or "",
            "budget_tier": prefs.get("budget_tier") or "",
            "interests": prefs.get("interests") or "",
        }
    except Exception:
        return {}


def _generate_embedding(text: str) -> list[float] | None:
    """Generate embedding using Hugging Face Inference API.

    Returns a list of floats (typically 384 dims for all-MiniLM-L6-v2).
    If HF_TOKEN is not set or the request fails, returns None.
    """

    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        return None

    try:
        response = httpx.post(
            "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
            headers={"Authorization": f"Bearer {hf_token}"},
            json={"inputs": text},
            timeout=10.0,
        )
        response.raise_for_status()
        embedding = response.json()
        if isinstance(embedding, list) and len(embedding) > 0:
            if isinstance(embedding[0], list):
                return embedding[0]
            return embedding
    except Exception:
        return None

    return None


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except Exception:
        return default


def _split_route(route: str | None, fallback_destination: str | None) -> tuple[str | None, str | None]:
    if not route:
        return None, fallback_destination
    if "→" in route:
        left, right = [part.strip() for part in route.split("→", 1)]
        return left or None, right or fallback_destination
    if "->" in route:
        left, right = [part.strip() for part in route.split("->", 1)]
        return left or None, right or fallback_destination
    return None, fallback_destination


class MemoryStore(MemoryModule):
    """Supabase-backed memory facade for short-term and long-term state.

    This class wraps the existing append-only event table and provides
    in-process working memory for the active run plus event replay helpers.
    """

    def __init__(self, *, supabase: Client):
        self.supabase = supabase
        self._working_memory: dict[str, WorkingState] = {}

    def get_run_user_id(self, *, run_id: str) -> str | None:
        """Best-effort lookup of user_id from public.agent_runs."""

        try:
            run_data = self.supabase.table("agent_runs").select("user_id").eq("id", run_id).maybe_single().execute()
            if run_data.data:
                raw = run_data.data.get("user_id")
                return str(raw) if raw else None
        except Exception:
            return None
        return None

    def set_run_status(self, *, run_id: str, status: str) -> None:
        """Update agent_runs.status (queued/running/completed/failed)."""

        self.supabase.table("agent_runs").update({"status": status}).eq("id", run_id).execute()

    def emit_mvp_pre_action_events(
        self,
        *,
        run_id: str,
        constraints: TripConstraints,
        plan: ExecutionPlan,
        pacing: bool = True,
    ) -> None:
        """Emit scripted MVP narration events that occur before action execution."""

        is_stays_request = bool(constraints.intent_flags.get("stays_request", False))

        self.emit(
            run_id=run_id,
            agent_name="Orchestrator",
            event_type="agent_task",
            content="Delegating tasks to specialist agents",
            payload={"mode": "stays" if is_stays_request else "travel"},
        )
        if pacing:
            time.sleep(0.4)

        self.emit(
            run_id=run_id,
            agent_name="Prompt Parser",
            event_type="agent_report",
            content="Extracting key trip constraints",
            payload={"signals": {"stays_request": is_stays_request}},
        )
        if pacing:
            time.sleep(0.5)

        self.emit(
            run_id=run_id,
            agent_name="Orchestrator",
            event_type="agent_decision",
            content="Execution plan generated",
            payload={
                "plan_id": plan.plan_id,
                "task_order": plan.ordering,
                "expected_artifacts": plan.expected_artifacts,
            },
        )
        if pacing:
            time.sleep(0.2)

        if is_stays_request:
            self.emit(
                run_id=run_id,
                agent_name="Accommodation Scout",
                event_type="agent_task",
                content="Choose good stay areas + a simple hotel checklist",
                payload={"deliverable": "neighborhoods + checklist"},
            )
            if pacing:
                time.sleep(0.8)
            self.emit(
                run_id=run_id,
                agent_name="Accommodation Scout",
                event_type="agent_report",
                content="Shortlisted 3 stay strategies (central, transit-first, budget-first)",
                payload={
                    "strategies": [
                        "Central/Walkable: minimize commute, higher nightly rates",
                        "Transit-first: near a major line/hub, flexible sightseeing",
                        "Budget-first: slightly farther out, trade time for savings",
                    ]
                },
            )
            if pacing:
                time.sleep(0.5)
        else:
            self.emit(
                run_id=run_id,
                agent_name="Flight Negotiator",
                event_type="agent_task",
                content="Propose flight windows and booking heuristics",
                payload={"deliverable": "flight windows + tips"},
            )
            if pacing:
                time.sleep(0.8)
            self.emit(
                run_id=run_id,
                agent_name="Flight Negotiator",
                event_type="agent_report",
                content="Prepared flight-window assumptions and booking tips (no live provider calls in MVP)",
                payload={
                    "tips": [
                        "Prefer morning arrivals to maximize Day 1",
                        "Leave a 2–3h buffer for airport transfers",
                        "If budget is tight: be flexible by ±1 day",
                    ]
                },
            )
            if pacing:
                time.sleep(0.5)

        self.emit(
            run_id=run_id,
            agent_name="Local Itinerary Expert",
            event_type="agent_task",
            content="Draft a day-by-day plan aligned to interests + budget",
            payload={"deliverable": "itinerary"},
        )
        if pacing:
            time.sleep(1.0)
        self.emit(
            run_id=run_id,
            agent_name="Local Itinerary Expert",
            event_type="agent_report",
            content="Built a draft itinerary outline (rule-based MVP)",
            payload={"note": "Replace with real tools/providers + LLM later"},
        )
        if pacing:
            time.sleep(0.4)

        self.emit(
            run_id=run_id,
            agent_name="Orchestrator",
            event_type="agent_decision",
            content="Synthesizing agent outputs into final result",
            payload={"next": "emit result"},
        )
        if pacing:
            time.sleep(0.4)

        self.emit(
            run_id=run_id,
            agent_name="Budget Analyst",
            event_type="agent_report",
            content="Allocated budget across flights and hotels",
            payload={"budget": constraints.budget_usd, "split": plan.budget_split},
        )
        if pacing:
            time.sleep(0.3)

    def emit_mvp_post_action_events(
        self,
        *,
        run_id: str,
        flight_budget: int | None,
        hotel_budget: int | None,
        flight_options: list[dict[str, Any]],
        hotel_options: list[dict[str, Any]],
        pacing: bool = True,
    ) -> None:
        """Emit scripted MVP narration events after action outputs exist."""

        self.emit(
            run_id=run_id,
            agent_name="Flight Negotiator",
            event_type="agent_report",
            content="Generated flight options within budget split",
            payload={"budget_flight": flight_budget, "flight_options": flight_options},
        )
        if pacing:
            time.sleep(0.3)

        self.emit(
            run_id=run_id,
            agent_name="Accommodation Scout",
            event_type="agent_report",
            content="Generated hotel options within budget split",
            payload={"budget_hotel": hotel_budget, "hotel_options": hotel_options},
        )
        if pacing:
            time.sleep(0.3)

    def append_event(self, event: AgentEvent) -> int | None:
        """Persist an event to public.agent_events using legacy-compatible columns."""

        payload: dict[str, Any] = dict(event.payload)

        # Add module metadata inside payload so this remains compatible with current schema.
        if event.module is not None:
            payload.setdefault("_module", event.module.value)
        payload.setdefault("_event_version", event.event_version)

        row = {
            "run_id": event.run_id,
            "agent_name": event.agent_name,
            "event_type": event.event_type,
            "content": event.content,
            "payload": payload,
        }

        inserted = self.supabase.table("agent_events").insert(row).execute()
        if inserted.data and len(inserted.data) > 0:
            event_id = inserted.data[0].get("id")
            if isinstance(event_id, int):
                state = self._working_memory.setdefault(event.run_id, WorkingState())
                state.last_event_id = event_id
                return event_id
        return None

    def emit(
        self,
        *,
        run_id: str,
        agent_name: str,
        event_type: EventType,
        content: str | None = None,
        payload: dict[str, Any] | None = None,
        module: ModuleName | None = None,
    ) -> int | None:
        """Convenience helper to create and append an AgentEvent in one call."""

        event = AgentEvent(
            run_id=run_id,
            agent_name=agent_name,
            event_type=event_type,
            content=content,
            payload=payload or {},
            module=module or module_for_agent(agent_name),
            timestamp_utc=datetime.now(timezone.utc),
        )
        return self.append_event(event)

    def get_events(self, *, run_id: str) -> list[AgentEvent]:
        """Fetch all events for a run ordered by identity ascending."""

        result = (
            self.supabase.table("agent_events")
            .select("id,created_at,run_id,agent_name,event_type,content,payload")
            .eq("run_id", run_id)
            .order("id", desc=False)
            .execute()
        )

        rows = result.data or []
        events: list[AgentEvent] = []
        for row in rows:
            raw_payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
            module_value = raw_payload.get("_module") if isinstance(raw_payload, dict) else None
            module = None
            if isinstance(module_value, str):
                try:
                    module = ModuleName(module_value)
                except Exception:
                    module = None

            created_at = row.get("created_at")
            timestamp = datetime.now(timezone.utc)
            if isinstance(created_at, str):
                try:
                    timestamp = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                except Exception:
                    pass

            event_type = row.get("event_type")
            if not isinstance(event_type, str):
                continue

            # Keep typing safe while allowing legacy unknown event types to be skipped.
            if event_type not in {
                "run_started",
                "agent_task",
                "agent_report",
                "agent_decision",
                "result",
                "run_completed",
                "error",
            }:
                continue

            events.append(
                AgentEvent(
                    event_id=row.get("id") if isinstance(row.get("id"), int) else None,
                    run_id=str(row.get("run_id") or run_id),
                    agent_name=str(row.get("agent_name") or "Agent"),
                    event_type=event_type,
                    content=row.get("content") if isinstance(row.get("content"), str) else None,
                    payload=raw_payload,
                    module=module,
                    event_version=int(raw_payload.get("_event_version", 1)) if isinstance(raw_payload, dict) else 1,
                    timestamp_utc=timestamp,
                )
            )

        return events

    def get_events_by_agent(self, *, run_id: str, agent_name: str) -> list[AgentEvent]:
        """Event sourcing helper to filter events by emitting agent."""

        return [event for event in self.get_events(run_id=run_id) if event.agent_name == agent_name]

    def get_latest_state(self, *, run_id: str) -> WorkingState:
        """Rebuild the latest working state by replaying the run's events."""

        if run_id in self._working_memory:
            return self._working_memory[run_id]

        state = WorkingState()
        for event in self.get_events(run_id=run_id):
            self._apply_event_to_state(state=state, event=event)
            state.last_event_id = event.event_id

        self._working_memory[run_id] = state
        return state

    def save_working_state(self, *, run_id: str, state: WorkingState) -> None:
        """Store in-process run state for fast access while orchestration is active."""

        self._working_memory[run_id] = state

    def persist_flight_offers(
        self,
        *,
        run_id: str,
        user_id: str,
        destination: str | None,
        flight_options: list[dict[str, Any]],
    ) -> None:
        """Persist normalized flight offers from action outputs."""

        rows: list[dict[str, Any]] = []
        for index, option in enumerate(flight_options, start=1):
            route = option.get("route") if isinstance(option.get("route"), str) else None
            origin, destination_value = _split_route(route, destination)
            provider_offer_id = option.get("id") or f"mock-flight-{index:02d}"
            rows.append(
                {
                    "run_id": run_id,
                    "user_id": user_id,
                    "provider": "mock",
                    "provider_offer_id": str(provider_offer_id),
                    "rank": index,
                    "origin": origin,
                    "destination": destination_value,
                    "route": route,
                    "depart_date": option.get("depart_date") if isinstance(option.get("depart_date"), str) else None,
                    "return_date": option.get("return_date") if isinstance(option.get("return_date"), str) else None,
                    "depart_time": option.get("depart_time") if isinstance(option.get("depart_time"), str) else None,
                    "arrive_time": option.get("arrive_time") if isinstance(option.get("arrive_time"), str) else None,
                    "carrier": option.get("carrier") if isinstance(option.get("carrier"), str) else None,
                    "stops": _safe_int(option.get("stops"), default=0),
                    "price_usd": _safe_float(option.get("price_usd")),
                    "currency": "USD",
                    "deep_link": None,
                    "raw_payload": option,
                }
            )

        if rows:
            try:
                self.supabase.table("flight_offers").insert(rows).execute()
            except Exception:
                pass

    def persist_hotel_offers(
        self,
        *,
        run_id: str,
        user_id: str,
        destination: str | None,
        hotel_options: list[dict[str, Any]],
    ) -> None:
        """Persist normalized hotel offers from action outputs."""

        rows: list[dict[str, Any]] = []
        for index, option in enumerate(hotel_options, start=1):
            provider_property_id = option.get("id") if isinstance(option.get("id"), str) else None
            provider_offer_id = provider_property_id or f"mock-hotel-{index:02d}"
            rows.append(
                {
                    "run_id": run_id,
                    "user_id": user_id,
                    "provider": "mock",
                    "provider_property_id": provider_property_id,
                    "provider_offer_id": str(provider_offer_id),
                    "rank": index,
                    "hotel_name": option.get("name") or f"Hotel {index}",
                    "city": destination,
                    "area": option.get("area"),
                    "check_in": option.get("check_in") if isinstance(option.get("check_in"), str) else None,
                    "check_out": option.get("check_out") if isinstance(option.get("check_out"), str) else None,
                    "nights": _safe_int(option.get("nights"), default=0),
                    "nightly_usd": _safe_float(option.get("nightly_usd")),
                    "total_usd": _safe_float(option.get("total_usd")),
                    "rating": _safe_float(option.get("rating")),
                    "currency": "USD",
                    "perks": option.get("perks") if isinstance(option.get("perks"), list) else [],
                    "deep_link": None,
                    "raw_payload": option,
                }
            )

        if rows:
            try:
                self.supabase.table("hotel_offers").insert(rows).execute()
            except Exception:
                pass

    def upsert_preferences(
        self,
        *,
        run_id: str,
        user_id: str,
        preferences: dict[str, str],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Upsert long-term user preferences extracted from run outputs."""

        for key, value in preferences.items():
            if not value:
                continue
            row = {
                "user_id": user_id,
                "preference_key": key,
                "preference_value": value,
                "run_id": run_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "metadata": metadata or {},
            }
            self.supabase.table("user_preferences").upsert(row, on_conflict="user_id,preference_key").execute()

    def persist_travel_dna_from_result(self, *, run_id: str, user_id: str, result_payload: dict[str, Any]) -> None:
        """Extract and persist long-term travel preferences + vector memory.

        This wraps Groq preference extraction (optional) and HuggingFace embedding
        generation (optional). Failures are intentionally non-fatal.
        """

        prefs = _extract_preferences_with_llm(result_payload)

        try:
            self.upsert_preferences(
                run_id=run_id,
                user_id=user_id,
                preferences=prefs,
                metadata={"source": "travel_dna", "kind": "preferences"},
            )
        except Exception:
            pass

        preferences_text = "\n".join([f"{k}: {v}" for k, v in prefs.items() if v])
        if not preferences_text:
            return

        embedding = _generate_embedding(preferences_text)
        if not embedding:
            return

        destination = result_payload.get("destination")
        content = f"Travel DNA from trip: {destination}" if isinstance(destination, str) and destination else "Travel DNA from trip"

        try:
            self.insert_user_memory(
                user_id=user_id,
                content=content,
                embedding=embedding,
                metadata={
                    "run_id": run_id,
                    "source": "travel_dna",
                    "kind": "preferences",
                    **prefs,
                },
            )
        except Exception:
            pass

    def insert_user_memory(
        self,
        *,
        user_id: str,
        content: str,
        embedding: list[float],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Persist vector memory row for long-term retrieval."""

        self.supabase.table("user_memories").insert(
            {
                "user_id": user_id,
                "content": content,
                "embedding": embedding,
                "metadata": metadata or {},
            }
        ).execute()

    def _apply_event_to_state(self, *, state: WorkingState, event: AgentEvent) -> None:
        payload = event.payload or {}

        if event.event_type == "error":
            if event.content:
                state.errors.append(event.content)
            return

        if event.event_type == "result":
            state.final_result = payload

            itinerary = payload.get("itinerary") if isinstance(payload.get("itinerary"), list) else None
            if itinerary is not None:
                state.artifacts["itinerary"] = ActionArtifact(
                    artifact_type="itinerary",
                    producer_agent=event.agent_name,
                    payload={"itinerary": itinerary},
                )

            flight_options = payload.get("flight_options") if isinstance(payload.get("flight_options"), list) else None
            if flight_options is not None:
                state.artifacts["flight_options"] = ActionArtifact(
                    artifact_type="flights",
                    producer_agent=event.agent_name,
                    payload={"flight_options": flight_options},
                )

            hotel_options = payload.get("hotel_options") if isinstance(payload.get("hotel_options"), list) else None
            if hotel_options is not None:
                state.artifacts["hotel_options"] = ActionArtifact(
                    artifact_type="hotels",
                    producer_agent=event.agent_name,
                    payload={"hotel_options": hotel_options},
                )

    def snapshot_state_payload(self, *, run_id: str) -> dict[str, Any]:
        """Serialize current run state for debug events and tests."""

        state = self.get_latest_state(run_id=run_id)
        data = asdict(state)
        return data

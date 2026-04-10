from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.agents.shared.contracts import (
    ActionArtifact,
    AgentEvent,
    EventType,
    MemoryModule,
    ModuleName,
    WorkingState,
)
from app.agents.shared.module_mapping import module_for_agent


class MemoryStore(MemoryModule):
    """Supabase-backed memory facade for short-term and long-term state.

    This class wraps the existing append-only event table and provides
    in-process working memory for the active run plus event replay helpers.
    """

    def __init__(self, *, supabase: Client):
        self.supabase = supabase
        self._working_memory: dict[str, WorkingState] = {}

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
            provider_offer_id = option.get("id") or f"mock-flight-{index:02d}"
            rows.append(
                {
                    "run_id": run_id,
                    "user_id": user_id,
                    "provider": "mock",
                    "provider_offer_id": str(provider_offer_id),
                    "rank": index,
                    "destination": destination,
                    "route": route,
                    "depart_date": option.get("depart_date") if isinstance(option.get("depart_date"), str) else None,
                    "return_date": option.get("return_date") if isinstance(option.get("return_date"), str) else None,
                    "depart_time": option.get("depart_time") if isinstance(option.get("depart_time"), str) else None,
                    "arrive_time": option.get("arrive_time") if isinstance(option.get("arrive_time"), str) else None,
                    "carrier": option.get("carrier") if isinstance(option.get("carrier"), str) else None,
                    "stops": int(option.get("stops") or 0),
                    "price_usd": float(option["price_usd"]) if option.get("price_usd") is not None else None,
                    "currency": "USD",
                    "deep_link": None,
                    "raw_payload": option,
                }
            )

        if rows:
            self.supabase.table("flight_offers").insert(rows).execute()

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
                    "nights": int(option.get("nights") or 0),
                    "nightly_usd": float(option["nightly_usd"]) if option.get("nightly_usd") is not None else None,
                    "total_usd": float(option["total_usd"]) if option.get("total_usd") is not None else None,
                    "rating": float(option["rating"]) if option.get("rating") is not None else None,
                    "currency": "USD",
                    "perks": option.get("perks") if isinstance(option.get("perks"), list) else [],
                    "deep_link": None,
                    "raw_payload": option,
                }
            )

        if rows:
            self.supabase.table("hotel_offers").insert(rows).execute()

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

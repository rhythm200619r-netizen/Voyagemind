from __future__ import annotations

from supabase import Client

from app.agents.action import FlightAction, HotelAction, ItineraryAction, unpack_action_artifacts
from app.agents.memory import MemoryStore
from app.agents.planning import TripPlanner
from app.agents.profiling import PromptProfiler
from app.agents.shared.contracts import RunContext, WorkingState


def run_orchestration(*, supabase: Client, run_id: str, prompt: str, user_id: str | None = None) -> None:
    """Thin coordinator: Profiling -> Planning -> Action."""

    memory_store = MemoryStore(supabase=supabase)
    resolved_user_id = user_id or memory_store.get_run_user_id(run_id=run_id)

    memory_store.set_run_status(run_id=run_id, status="running")
    memory_store.emit(
        run_id=run_id,
        agent_name="Orchestrator",
        event_type="run_started",
        content=f"Received prompt: {prompt}",
    )

    run = RunContext(run_id=run_id, prompt=prompt, user_id=resolved_user_id)
    constraints = PromptProfiler().run(run=run)
    plan = TripPlanner().run(run=run, constraints=constraints)

    memory_store.emit_mvp_pre_action_events(run_id=run_id, constraints=constraints, plan=plan)

    state = WorkingState(constraints=constraints, execution_plan=plan)
    artifacts = []
    artifacts.extend(ItineraryAction().run(run=run, plan=plan, state=state))
    artifacts.extend(FlightAction().run(run=run, plan=plan, state=state))
    artifacts.extend(HotelAction().run(run=run, plan=plan, state=state))
    itinerary, flight_options, hotel_options = unpack_action_artifacts(artifacts)

    flight_budget = plan.budget_split.get("flight") if plan.budget_split else None
    hotel_budget = plan.budget_split.get("hotel") if plan.budget_split else None
    memory_store.emit_mvp_post_action_events(
        run_id=run_id,
        flight_budget=flight_budget if isinstance(flight_budget, int) else None,
        hotel_budget=hotel_budget if isinstance(hotel_budget, int) else None,
        flight_options=flight_options,
        hotel_options=hotel_options,
    )

    result_payload = {
        "destination": constraints.destination,
        "days": constraints.days,
        "budget_usd": constraints.budget_usd,
        "budget_split": plan.budget_split,
        "interests": constraints.interests,
        "dates": constraints.dates,
        "flight_options": flight_options,
        "hotel_options": hotel_options,
        "itinerary": itinerary,
    }

    memory_store.emit(
        run_id=run_id,
        agent_name="Orchestrator",
        event_type="result",
        content="MVP result generated (rule-based; replace with real tools + providers).",
        payload=result_payload,
    )

    if resolved_user_id:
        memory_store.persist_flight_offers(
            run_id=run_id,
            user_id=resolved_user_id,
            destination=constraints.destination,
            flight_options=flight_options,
        )
        memory_store.persist_hotel_offers(
            run_id=run_id,
            user_id=resolved_user_id,
            destination=constraints.destination,
            hotel_options=hotel_options,
        )
        memory_store.persist_travel_dna_from_result(run_id=run_id, user_id=resolved_user_id, result_payload=result_payload)

    memory_store.set_run_status(run_id=run_id, status="completed")
    memory_store.emit(
        run_id=run_id,
        agent_name="Orchestrator",
        event_type="run_completed",
        content="Run completed",
    )

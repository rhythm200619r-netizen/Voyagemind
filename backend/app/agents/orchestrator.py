from __future__ import annotations

import logging
from supabase import Client

from app.agents.action import FlightAction, HotelAction, ItineraryAction, unpack_action_artifacts
from app.agents.memory import MemoryStore
from app.agents.planning import TripPlanner
from app.agents.profiling import PromptProfiler
from app.agents.shared.contracts import RunContext, WorkingState

logger = logging.getLogger(__name__)

async def run_orchestration(*, supabase: Client, run_id: str, prompt: str, user_id: str | None = None) -> None:
    """Thin coordinator: Profiling -> Planning -> Action."""

    memory = MemoryStore(supabase=supabase)
    resolved_user_id = user_id or memory.get_run_user_id(run_id=run_id)

    try:
        memory.set_run_status(run_id=run_id, status="running")
        memory.emit(
            run_id=run_id,
            agent_name="Orchestrator",
            event_type="run_started",
            content=f"Received prompt: {prompt}",
        )

        run_ctx = RunContext(run_id=run_id, prompt=prompt, user_id=resolved_user_id)
        
        past_preferences = {}
        relevant_memories = []
        if resolved_user_id:
            past_preferences = memory.get_user_preferences(user_id=resolved_user_id)
            if prompt.strip():
                relevant_memories = memory.get_relevant_memories(user_id=resolved_user_id, query_text=prompt)
            
            if past_preferences or relevant_memories:
                memory.emit(
                    run_id=run_id,
                    agent_name="Orchestrator",
                    event_type="memory_retrieved",
                    content="Retrieved past preferences and memories for context.",
                    payload={
                        "preferences_used": list(past_preferences.keys()),
                        "memory_count": len(relevant_memories),
                    }
                )

        profiler = PromptProfiler()
        planner = TripPlanner()
        itinerary_action = ItineraryAction()
        flight_action = FlightAction()
        hotel_action = HotelAction()

        constraints = await profiler.run(
            run=run_ctx,
            memory_store=memory,
            past_preferences=past_preferences if past_preferences else None,
            relevant_memories=relevant_memories if relevant_memories else None
        )
        plan = await planner.run(run=run_ctx, constraints=constraints, memory_store=memory)
        
        memory.emit_mvp_pre_action_events(run_id=run_id, constraints=constraints, plan=plan)

        state = WorkingState(constraints=constraints, execution_plan=plan)

        artifacts = []
        artifacts.extend(await itinerary_action.run(run=run_ctx, plan=plan, state=state, memory_store=memory))
        artifacts.extend(await flight_action.run(run=run_ctx, plan=plan, state=state, memory_store=memory))
        artifacts.extend(await hotel_action.run(run=run_ctx, plan=plan, state=state, memory_store=memory))
        itinerary, flight_options, hotel_options = unpack_action_artifacts(artifacts)

        flight_budget = plan.budget_split.get("flight") if plan.budget_split else None
        hotel_budget = plan.budget_split.get("hotel") if plan.budget_split else None
        memory.emit_mvp_post_action_events(
            run_id=run_id,
            flight_budget=flight_budget if isinstance(flight_budget, int) else None,
            hotel_budget=hotel_budget if isinstance(hotel_budget, int) else None,
            flight_options=flight_options,
            hotel_options=hotel_options,
        )

        result_payload = {
            "destination": constraints.destination,
            "budget": constraints.budget_usd,
            "itinerary": itinerary,
            "flight_options": flight_options,
            "hotel_options": hotel_options,
            "plan_summary": plan.plan_summary,
        }

        memory.emit(
            run_id=run_id,
            agent_name="Orchestrator",
            event_type="result",
            content="MVP result generated.",
            payload=result_payload,
        )

        if resolved_user_id:
            memory.persist_flight_offers(
                run_id=run_id,
                user_id=resolved_user_id,
                destination=constraints.destination,
                flight_options=flight_options,
            )
            memory.persist_hotel_offers(
                run_id=run_id,
                user_id=resolved_user_id,
                destination=constraints.destination,
                hotel_options=hotel_options,
            )
            memory.persist_travel_dna_from_result(run_id=run_id, user_id=resolved_user_id, result_payload=result_payload)

        memory.set_run_status(run_id=run_id, status="completed")
        memory.emit(
            run_id=run_id,
            agent_name="Orchestrator",
            event_type="run_completed",
            content="Run completed",
        )
    except Exception as e:
        logger.error(f"Run {run_id} failed: {e}")
        try:
            memory.set_run_status(run_id=run_id, status="failed")
            memory.emit(
                run_id=run_id,
                agent_name="Orchestrator",
                event_type="error",
                content=f"Run failed: {str(e)}"
            )
        except Exception as inner_e:
            logger.error(f"Failed to log error to memory store: {inner_e}")

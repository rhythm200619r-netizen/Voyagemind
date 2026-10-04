from __future__ import annotations

import logging
from typing import Any

from app.agents.action.base import ActionModule
from app.agents.shared.contracts import ActionArtifact, ExecutionPlan, RunContext, WorkingState
from app.agents.shared.llm_client import async_call_claude
from app.agents.shared.prompt_templates import ITINERARY_ACTION_SYSTEM
from app.agents.memory.store import MemoryStore

logger = logging.getLogger(__name__)

def _fallback_itinerary(destination: str, days: int) -> list[dict[str, Any]]:
    itinerary = []
    dest_name = destination or "the city"
    for day in range(1, days + 1):
        itinerary.append({
            "day": day,
            "theme": "Explore",
            "morning": f"Explore {dest_name}",
            "afternoon": "Visit local attractions",
            "evening": "Rest",
            "food_recommendations": ["Try local cuisine"],
            "practical_tips": "Check Google Maps for transit"
        })
    return itinerary

class ItineraryAction(ActionModule):
    """Executes itinerary generation tasks from planning output using Claude."""

    async def run(self, *, run: RunContext, plan: ExecutionPlan, state: WorkingState, memory_store: MemoryStore) -> list[ActionArtifact]:
        if state.constraints is None:
            return []

        constraints = state.constraints
        artifacts: list[ActionArtifact] = []

        for task_id in plan.ordering:
            if task_id == "itinerary_generation":
                destination = constraints.destination or "Anywhere"
                days = constraints.days or 3
                interests = ", ".join(constraints.interests) if constraints.interests else "None"
                travel_style = constraints.intent_flags.get("travel_style", "balanced")
                
                budget_split = plan.budget_split or {}
                daily_budget = budget_split.get("daily_spending")

                user_prompt = f"""
Please generate an itinerary based on these constraints:
- destination: {destination}
- days: {days}
- interests: {interests}
- travel_style: {travel_style}
- daily_budget: {daily_budget if daily_budget is not None else 'Unspecified'}
"""
                try:
                    parsed_json, input_tokens, output_tokens = await async_call_claude(
                        system_prompt=ITINERARY_ACTION_SYSTEM,
                        user_prompt=user_prompt.strip(),
                    )

                    itinerary = []
                    if parsed_json and "itinerary" in parsed_json:
                        raw_itinerary = parsed_json["itinerary"]
                        if isinstance(raw_itinerary, list):
                            for day_plan in raw_itinerary:
                                itinerary.append(day_plan)

                    if not itinerary:
                        raise ValueError("LLM returned empty or invalid itinerary")

                    memory_store.emit(
                        run_id=run.run_id,
                        agent_name="Local Itinerary Expert",
                        event_type="itinerary_drafted",
                        content=f"Itinerary generated for {days} days in {destination}",
                        payload={
                            "itinerary": itinerary,
                            "llm_metrics": {
                                "input_tokens": input_tokens,
                                "output_tokens": output_tokens,
                            }
                        }
                    )
                except Exception as exc:
                    logger.error(f"Failed to generate itinerary: {exc}")
                    memory_store.emit(
                        run_id=run.run_id,
                        agent_name="Local Itinerary Expert",
                        event_type="llm_error",
                        content="Failed to generate itinerary with LLM. Falling back to mock.",
                    )
                    itinerary = _fallback_itinerary(destination=destination, days=days)

                artifacts.append(
                    ActionArtifact(
                        artifact_type="itinerary",
                        producer_agent="Local Itinerary Expert",
                        payload={"itinerary": itinerary},
                    )
                )

        return artifacts

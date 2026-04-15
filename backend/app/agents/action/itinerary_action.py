from __future__ import annotations

from app.agents.action.base import ActionModule
from app.agents.shared.contracts import ActionArtifact, ExecutionPlan, RunContext, WorkingState
from app.agents.action.mock.mock_itinerary import _build_itinerary

class ItineraryAction(ActionModule):
    """Executes itinerary generation tasks from planning output."""

    def run(self, *, run: RunContext, plan: ExecutionPlan, state: WorkingState) -> list[ActionArtifact]:
        if state.constraints is None:
            return []

        constraints = state.constraints

        artifacts: list[ActionArtifact] = []

        for task_id in plan.ordering:
            if task_id == "itinerary_generation":
                itinerary = _build_itinerary(
                    days=constraints.days,
                    destination=constraints.destination,
                    interests=constraints.interests,
                    budget=constraints.budget_usd,
                )
                artifacts.append(
                    ActionArtifact(
                        artifact_type="itinerary",
                        producer_agent="Local Itinerary Expert",
                        payload={"itinerary": itinerary},
                    )
                )

        return artifacts

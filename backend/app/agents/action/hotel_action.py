from __future__ import annotations

from app.agents.action.base import ActionModule
from app.agents.shared.contracts import ActionArtifact, ExecutionPlan, RunContext, WorkingState
from app.agents.action.mock.mock_hotels import _build_hotel_options

class HotelAction(ActionModule):
    """Executes hotel strategy tasks from planning output."""

    def run(self, *, run: RunContext, plan: ExecutionPlan, state: WorkingState) -> list[ActionArtifact]:
        if state.constraints is None:
            return []

        constraints = state.constraints
        budget_split = plan.budget_split or {}
        hotel_budget = budget_split.get("hotel") if isinstance(budget_split, dict) else None

        artifacts: list[ActionArtifact] = []

        for task_id in plan.ordering:
            if task_id == "hotel_strategy":
                hotel_options = _build_hotel_options(
                    destination=constraints.destination,
                    dates=constraints.dates,
                    hotel_budget=hotel_budget,
                    days=constraints.days,
                )
                artifacts.append(
                    ActionArtifact(
                        artifact_type="hotels",
                        producer_agent="Accommodation Scout",
                        payload={"hotel_options": hotel_options},
                    )
                )

        return artifacts

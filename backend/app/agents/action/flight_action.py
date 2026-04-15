from __future__ import annotations

from app.agents.action.base import ActionModule
from app.agents.shared.contracts import ActionArtifact, ExecutionPlan, RunContext, WorkingState
from app.agents.action.mock.mock_flights import _build_flight_options

class FlightAction(ActionModule):
    """Executes flight strategy tasks from planning output."""

    def run(self, *, run: RunContext, plan: ExecutionPlan, state: WorkingState) -> list[ActionArtifact]:
        if state.constraints is None:
            return []

        constraints = state.constraints
        budget_split = plan.budget_split or {}
        flight_budget = budget_split.get("flight") if isinstance(budget_split, dict) else None

        artifacts: list[ActionArtifact] = []

        for task_id in plan.ordering:
            if task_id == "flight_strategy":
                flight_options = _build_flight_options(
                    origin=constraints.origin,
                    destination=constraints.destination,
                    dates=constraints.dates,
                    flight_budget=flight_budget,
                )
                artifacts.append(
                    ActionArtifact(
                        artifact_type="flights",
                        producer_agent="Flight Negotiator",
                        payload={"flight_options": flight_options},
                    )
                )

        return artifacts

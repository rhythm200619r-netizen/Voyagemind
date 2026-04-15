from typing import Protocol
from app.agents.shared.contracts import ExecutionPlan, RunContext, TripConstraints

class PlanningModule(Protocol):
    """Decompose and sequence execution based on constraints."""

    def run(self, *, run: RunContext, constraints: TripConstraints) -> ExecutionPlan:
        ...

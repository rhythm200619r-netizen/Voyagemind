from typing import Protocol
from app.agents.shared.contracts import ActionArtifact, ExecutionPlan, RunContext, WorkingState

class ActionModule(Protocol):
    """Execute planned tasks and return artifacts."""

    def run(self, *, run: RunContext, plan: ExecutionPlan, state: WorkingState) -> list[ActionArtifact]:
        ...

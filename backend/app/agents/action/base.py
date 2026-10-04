from typing import Protocol
from app.agents.shared.contracts import ActionArtifact, ExecutionPlan, RunContext, WorkingState
from app.agents.memory.store import MemoryStore

class ActionModule(Protocol):
    """Execute planned tasks and return artifacts."""

    async def run(self, *, run: RunContext, plan: ExecutionPlan, state: WorkingState, memory_store: MemoryStore) -> list[ActionArtifact]:
        ...

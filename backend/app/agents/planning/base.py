from typing import Protocol
from app.agents.shared.contracts import ExecutionPlan, RunContext, TripConstraints
from app.agents.memory.store import MemoryStore

class PlanningModule(Protocol):
    """Decompose and sequence execution based on constraints."""

    async def run(self, *, run: RunContext, constraints: TripConstraints, memory_store: MemoryStore) -> ExecutionPlan:
        ...

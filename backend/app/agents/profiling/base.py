from typing import Protocol
from app.agents.shared.contracts import RunContext, TripConstraints
from app.agents.memory.store import MemoryStore

class ProfilingModule(Protocol):
    """Profile user intent and constraints from free-text prompt."""

    async def run(self, *, run: RunContext, memory_store: MemoryStore) -> TripConstraints:
        ...

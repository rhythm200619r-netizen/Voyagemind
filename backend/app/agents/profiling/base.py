from typing import Protocol
from app.agents.shared.contracts import RunContext, TripConstraints

class ProfilingModule(Protocol):
    """Profile user intent and constraints from free-text prompt."""

    def run(self, *, run: RunContext) -> TripConstraints:
        ...

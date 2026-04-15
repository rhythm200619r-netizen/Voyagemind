from typing import Protocol
from app.agents.shared.contracts import WorkingState
from app.agents.shared.events import AgentEvent

class MemoryModule(Protocol):
    """Persist and replay run state/events and long-term memory."""

    def append_event(self, event: AgentEvent) -> int | None:
        ...

    def get_latest_state(self, *, run_id: str) -> WorkingState:
        ...

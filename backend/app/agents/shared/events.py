from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.agents.shared.contracts import EventType, ModuleName


@dataclass(slots=True)
class AgentEvent:
    """Canonical event envelope for internal module communication.

    Compatibility note:
    - Keep legacy fields compatible with existing agent_events rows.
    - module and event_version are additive and optional at persistence layer.
    """

    run_id: str
    agent_name: str
    event_type: EventType
    payload: dict[str, Any] = field(default_factory=dict)
    content: str | None = None
    module: ModuleName | None = None
    event_version: int = 1
    timestamp_utc: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    event_id: int | None = None

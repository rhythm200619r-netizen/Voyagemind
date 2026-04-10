from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Protocol
from uuid import uuid4


class ModuleName(str, Enum):
    PROFILING = "profiling"
    MEMORY = "memory"
    PLANNING = "planning"
    ACTION = "action"
    ORCHESTRATION = "orchestration"


class RunMode(str, Enum):
    TRAVEL = "travel"
    STAYS = "stays"
    MOCK = "mock"


class RunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


EventType = Literal[
    "run_started",
    "agent_task",
    "agent_report",
    "agent_decision",
    "result",
    "run_completed",
    "error",
]


@dataclass(slots=True)
class RunContext:
    """Minimal per-run metadata shared across all modules."""

    run_id: str
    prompt: str
    user_id: str | None = None
    mode: RunMode = RunMode.TRAVEL
    status: RunStatus = RunStatus.QUEUED
    metadata: dict[str, Any] = field(default_factory=dict)
    started_at_utc: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at_utc: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(slots=True)
class TripConstraints:
    """Normalized prompt constraints extracted by the Profiling module."""

    destination: str | None
    days: int
    budget_usd: int | None
    interests: list[str] = field(default_factory=list)
    dates: dict[str, str] = field(default_factory=dict)
    intent_flags: dict[str, bool] = field(default_factory=dict)


@dataclass(slots=True)
class PlanTask:
    """A single planning task with explicit dependencies and IO contracts."""

    task_id: str
    module: ModuleName
    agent_name: str
    task_type: str
    depends_on: list[str] = field(default_factory=list)
    input_keys: list[str] = field(default_factory=list)
    output_keys: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ExecutionPlan:
    """Planning output consumed by Action and Memory modules."""

    plan_id: str
    tasks: list[PlanTask] = field(default_factory=list)
    ordering: list[str] = field(default_factory=list)
    budget_split: dict[str, int] | None = None
    expected_artifacts: list[str] = field(default_factory=list)

    @staticmethod
    def new() -> "ExecutionPlan":
        return ExecutionPlan(plan_id=str(uuid4()))


@dataclass(slots=True)
class ActionArtifact:
    """Typed output envelope from action handlers."""

    artifact_type: str
    producer_agent: str
    payload: dict[str, Any]
    confidence: float | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass(slots=True)
class WorkingState:
    """Short-term run state; reconstructable from event history."""

    constraints: TripConstraints | None = None
    execution_plan: ExecutionPlan | None = None
    artifacts: dict[str, ActionArtifact] = field(default_factory=dict)
    final_result: dict[str, Any] | None = None
    errors: list[str] = field(default_factory=list)
    last_event_id: int | None = None


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


@dataclass(slots=True)
class OrchestrationResult:
    """Terminal orchestration result contract."""

    run_id: str
    status: Literal["completed", "failed"]
    result_payload: dict[str, Any] | None = None
    failure_reason: str | None = None


class ProfilingModule(Protocol):
    """Profile user intent and constraints from free-text prompt."""

    def run(self, *, run: RunContext) -> TripConstraints:
        ...


class PlanningModule(Protocol):
    """Decompose and sequence execution based on constraints."""

    def run(self, *, run: RunContext, constraints: TripConstraints) -> ExecutionPlan:
        ...


class ActionModule(Protocol):
    """Execute planned tasks and return artifacts."""

    def run(self, *, run: RunContext, plan: ExecutionPlan, state: WorkingState) -> list[ActionArtifact]:
        ...


class MemoryModule(Protocol):
    """Persist and replay run state/events and long-term memory."""

    def append_event(self, event: AgentEvent) -> int | None:
        ...

    def get_latest_state(self, *, run_id: str) -> WorkingState:
        ...

from __future__ import annotations

from app.agents.shared.contracts import (
    ExecutionPlan,
    ModuleName,
    PlanTask,
    RunContext,
    TripConstraints,
)
from app.agents.planning.base import PlanningModule


def _allocate_budget(total_budget: int | None) -> dict[str, int] | None:
    if total_budget is None or total_budget <= 0:
        return None
    flight_budget = int(total_budget * 0.5)
    hotel_budget = max(0, total_budget - flight_budget)
    return {
        "total": total_budget,
        "flight": flight_budget,
        "hotel": hotel_budget,
    }


class TripPlanner(PlanningModule):
    """Builds a structured execution plan from normalized constraints."""

    def run(self, *, run: RunContext, constraints: TripConstraints) -> ExecutionPlan:
        plan = ExecutionPlan.new()

        is_stays_request = bool(constraints.intent_flags.get("stays_request", False))

        tasks: list[PlanTask] = [
            PlanTask(
                task_id="budget_allocation",
                module=ModuleName.PLANNING,
                agent_name="Budget Analyst",
                task_type="allocate_budget",
                input_keys=["constraints.budget_usd"],
                output_keys=["plan.budget_split"],
            ),
            PlanTask(
                task_id="itinerary_generation",
                module=ModuleName.ACTION,
                agent_name="Local Itinerary Expert",
                task_type="build_itinerary",
                depends_on=["budget_allocation"],
                input_keys=["constraints.destination", "constraints.days", "constraints.interests", "constraints.budget_usd"],
                output_keys=["artifacts.itinerary"],
            ),
        ]

        if not is_stays_request:
            tasks.append(
                PlanTask(
                    task_id="flight_strategy",
                    module=ModuleName.ACTION,
                    agent_name="Flight Negotiator",
                    task_type="propose_flight_strategy",
                    depends_on=["budget_allocation"],
                    input_keys=["constraints.destination", "constraints.dates", "plan.budget_split.flight"],
                    output_keys=["artifacts.flight_options"],
                )
            )

        tasks.append(
            PlanTask(
                task_id="hotel_strategy",
                module=ModuleName.ACTION,
                agent_name="Accommodation Scout",
                task_type="propose_hotel_strategy",
                depends_on=["budget_allocation"],
                input_keys=["constraints.destination", "constraints.dates", "constraints.days", "plan.budget_split.hotel"],
                output_keys=["artifacts.hotel_options"],
            )
        )

        plan.tasks = tasks
        plan.ordering = [task.task_id for task in tasks]
        plan.budget_split = _allocate_budget(constraints.budget_usd)
        plan.expected_artifacts = [
            "itinerary",
            "flight_options",
            "hotel_options",
        ]

        return plan

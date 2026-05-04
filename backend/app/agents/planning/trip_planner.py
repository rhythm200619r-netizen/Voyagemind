import logging

from app.agents.shared.contracts import (
    ExecutionPlan,
    ModuleName,
    PlanTask,
    RunContext,
    TripConstraints,
)
from app.agents.planning.base import PlanningModule
from app.agents.shared.llm_client import async_call_claude
from app.agents.shared.prompt_templates import TRIP_PLANNER_SYSTEM
from app.agents.memory.store import MemoryStore

logger = logging.getLogger(__name__)

class TripPlanner(PlanningModule):
    """Builds a structured execution plan from normalized constraints."""

    async def run(self, *, run: RunContext, constraints: TripConstraints, memory_store: MemoryStore) -> ExecutionPlan:
        plan = ExecutionPlan.new()

        is_stays_request = bool(constraints.intent_flags.get("stays_request", False))

        user_prompt = f"""
Destination: {constraints.destination or 'Anywhere'}
Days: {constraints.days}
Budget: {constraints.budget_usd if constraints.budget_usd is not None else 'Unspecified'}
Interests: {', '.join(constraints.interests) if constraints.interests else 'None'}
Travel Style: {constraints.intent_flags.get('travel_style', 'balanced')}
"""

        parsed_json, input_tokens, output_tokens = await async_call_claude(
            system_prompt=TRIP_PLANNER_SYSTEM,
            user_prompt=user_prompt.strip(),
        )

        if not parsed_json:
            memory_store.emit(
                run_id=run.run_id,
                agent_name="Budget Analyst",
                event_type="llm_error",
                content="Failed to allocate budget with LLM. Falling back to 50/50 split.",
            )
            total_budget = constraints.budget_usd or 0
            flight_budget = int(total_budget * 0.5) if total_budget > 0 else 0
            hotel_budget = max(0, total_budget - flight_budget)
            budget_split = {
                "total": total_budget,
                "flight": flight_budget,
                "hotel": hotel_budget,
                "daily_spending": 0,
            }
            plan_summary = "Fallback rule-based allocation."
            recommended_approach = []
        else:
            budget_split = parsed_json.get("budget_allocations", {})
            plan_summary = parsed_json.get("plan_summary", "")
            recommended_approach = parsed_json.get("recommended_approach", [])

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
        plan.budget_split = budget_split
        plan.expected_artifacts = [
            "itinerary",
            "flight_options",
            "hotel_options",
        ]

        memory_store.emit(
            run_id=run.run_id,
            agent_name="Budget Analyst",
            event_type="planning_complete",
            content=plan_summary or "Budget split dynamically decided",
            payload={
                "budget_split": budget_split,
                "recommended_approach": recommended_approach,
                "llm_metrics": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                }
            }
        )

        return plan

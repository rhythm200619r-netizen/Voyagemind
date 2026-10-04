import logging

from app.agents.shared.contracts import RunContext, TripConstraints
from app.agents.profiling.base import ProfilingModule
from app.agents.shared.llm_client import async_call_claude
from app.agents.shared.prompt_templates import PROMPT_PROFILER_SYSTEM
from app.agents.memory.store import MemoryStore

logger = logging.getLogger(__name__)

class PromptProfiler(ProfilingModule):
    """Profiles user prompts into normalized trip constraints using Claude."""

    async def run(
        self,
        *,
        run: RunContext,
        memory_store: MemoryStore,
        past_preferences: dict[str, str] | None = None,
        relevant_memories: list[dict] | None = None
    ) -> TripConstraints:
        normalized = run.prompt.strip().lower()
        is_stays_request = normalized.startswith("find stays") or normalized.startswith("search stays")

        user_prompt = run.prompt
        
        context_blocks = []
        if past_preferences:
            prefs_str = "\n".join([f"- {k}: {v}" for k, v in past_preferences.items()])
            context_blocks.append(f"--- known preferences from past trips ---\n{prefs_str}")
        if relevant_memories:
            mems_str = "\n".join([f"- {m.get('content', '')}" for m in relevant_memories])
            context_blocks.append(f"--- relevant memories from past trips ---\n{mems_str}")
            
        if context_blocks:
            user_prompt += "\n\n" + "\n\n".join(context_blocks)

        parsed_json, input_tokens, output_tokens = await async_call_claude(
            system_prompt=PROMPT_PROFILER_SYSTEM,
            user_prompt=user_prompt,
        )

        if not parsed_json:
            # Fallback handling
            memory_store.emit(
                run_id=run.run_id,
                agent_name="Prompt Parser",
                event_type="llm_error",
                content="Failed to parse prompt constraints with LLM. Falling back to safe defaults.",
            )
            # Default empty / minimal constraints
            constraints = TripConstraints(
                origin=None,
                destination=None,
                days=3,
                budget_usd=None,
                intent_flags={"stays_request": is_stays_request, "has_budget": False, "has_dates": False},
            )
        else:
            destination = parsed_json.get("destination")
            days = parsed_json.get("days") or 3
            budget = parsed_json.get("budget")
            
            # Simple currency normalization to USD if needed (not strict for this prototype, but could be added)
            # Assuming budget_usd is same as budget integer for now
            budget_usd = int(budget) if budget is not None else None
            
            interests = parsed_json.get("interests") or []
            dates = parsed_json.get("dates") or {}
            
            intent_flags = {
                "stays_request": is_stays_request,
                "has_budget": budget_usd is not None,
                "has_dates": len(dates) > 0,
            }

            constraints = TripConstraints(
                origin=None, # Profiler prompt doesn't extract origin explicitly for now, unless added
                destination=destination,
                days=days,
                budget_usd=budget_usd,
                interests=interests,
                dates=dates,
                intent_flags=intent_flags,
            )

            # Let's add any extras to metadata or constraints if needed.
            if "travel_style" in parsed_json:
                constraints.intent_flags["travel_style"] = parsed_json["travel_style"]

        # Emit successful output
        payload = {
            "destination": constraints.destination,
            "days": constraints.days,
            "budget": constraints.budget_usd,
            "llm_metrics": {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            }
        }

        memory_store.emit(
            run_id=run.run_id,
            agent_name="Prompt Parser",
            event_type="profiling_complete",
            content="Extracted trip constraints using Claude",
            payload=payload,
        )

        return constraints

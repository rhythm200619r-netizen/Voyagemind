from __future__ import annotations

from app.agents.shared.contracts import ModuleName


# Module ownership registry for current production and mock agent labels.
AGENT_MODULE_MAP: dict[str, ModuleName] = {
    "Orchestrator": ModuleName.ORCHESTRATION,
    "Prompt Parser": ModuleName.PROFILING,
    "Budget Analyst": ModuleName.PLANNING,
    "Flight Negotiator": ModuleName.ACTION,
    "Accommodation Scout": ModuleName.ACTION,
    "Local Itinerary Expert": ModuleName.ACTION,
    "Flight Agent": ModuleName.ACTION,
    "Hotel Agent": ModuleName.ACTION,
    "Context Agent": ModuleName.ACTION,
}


def module_for_agent(agent_name: str) -> ModuleName | None:
    """Return the owning module for a given agent label.

    Unknown labels return None to keep legacy/third-party events non-breaking.
    """

    return AGENT_MODULE_MAP.get(agent_name)

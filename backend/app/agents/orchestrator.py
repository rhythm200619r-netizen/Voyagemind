from __future__ import annotations

import time
from typing import Any

from supabase import Client


def run_orchestration(*, supabase: Client, run_id: str, prompt: str) -> None:
    """Toy multi-agent runner.

    Writes events into `public.agent_events` for the realtime dashboard.
    Replace with CrewAI/LangGraph orchestration later.
    """

    def emit(agent_name: str, event_type: str, content: str | None = None, payload: dict[str, Any] | None = None) -> None:
        supabase.table("agent_events").insert(
            {
                "run_id": run_id,
                "agent_name": agent_name,
                "event_type": event_type,
                "content": content,
                "payload": payload or {},
            }
        ).execute()

    def set_run_status(status: str) -> None:
        supabase.table("agent_runs").update({"status": status}).eq("id", run_id).execute()

    set_run_status("running")
    emit("Orchestrator", "run_started", f"Received prompt: {prompt}")

    steps = [
        ("Local Itinerary Expert", "thinking", "Drafting a day-by-day outline based on the prompt"),
        ("Accommodation Scout", "thinking", "Identifying neighborhoods and hotel constraints"),
        ("Flight Negotiator", "thinking", "Checking plausible flight windows and preferences"),
        ("Orchestrator", "synthesis", "Combining agent suggestions into a single itinerary"),
    ]

    for agent_name, event_type, content in steps:
        emit(agent_name, event_type, content)
        time.sleep(0.8)

    emit(
        "Orchestrator",
        "result",
        "MVP result generated (replace with real tools + providers).",
        {
            "itinerary": [
                {"day": 1, "title": "Arrival + easy walk", "notes": "Check in, light food, early night"},
                {"day": 2, "title": "Top sights", "notes": "Morning landmark, afternoon museum, evening local market"},
                {"day": 3, "title": "Neighborhood day", "notes": "Coffee, shopping street, sunset viewpoint"},
            ]
        },
    )

    set_run_status("completed")
    emit("Orchestrator", "run_completed", "Run completed")

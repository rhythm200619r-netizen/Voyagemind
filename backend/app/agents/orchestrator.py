from __future__ import annotations

import re
import time
from typing import Any

from supabase import Client


def _extract_days(prompt: str) -> int:
    match = re.search(r"(\d+)\s*[- ]?day", prompt, flags=re.IGNORECASE)
    if not match:
        return 3
    try:
        days = int(match.group(1))
        return max(1, min(days, 14))
    except ValueError:
        return 3


def _extract_budget(prompt: str) -> int | None:
    match = re.search(r"\$\s*([0-9][0-9,]*)", prompt)
    if not match:
        return None
    try:
        return int(match.group(1).replace(",", ""))
    except ValueError:
        return None


def _extract_destination(prompt: str) -> str | None:
    match = re.search(r"\b(?:to|in)\s+([A-Za-z][A-Za-z\s-]{1,48})(?:\b|$)", prompt)
    if not match:
        return None
    raw = match.group(1)
    raw = re.split(r"\b(for|with|under|within|budget|on)\b", raw, flags=re.IGNORECASE)[0]
    cleaned = " ".join(raw.strip().split())
    return cleaned[:50] if cleaned else None


def _extract_interests(prompt: str) -> list[str]:
    lowered = prompt.lower()

    # 1) Try to parse explicit user-provided interests first.
    explicit: list[str] = []
    match = re.search(r"\b(?:focused on|with vibes:)\s+(.+)$", prompt, flags=re.IGNORECASE)
    if match:
        tail = match.group(1)
        # stop at common separators that start other clauses
        tail = re.split(r"\b(under|within|budget|for|check-in|check-out|depart|return)\b", tail, flags=re.IGNORECASE)[0]
        pieces = re.split(r"[,/&]|\band\b", tail, flags=re.IGNORECASE)
        for piece in pieces:
            cleaned = re.sub(r"[^a-zA-Z\s-]", " ", piece).strip().lower()
            cleaned = " ".join(cleaned.split())
            if cleaned:
                explicit.append(cleaned)

    # 2) Map to canonical interest labels.
    interests: list[str] = []
    synonym_map: dict[str, list[str]] = {
        "food": ["food", "eat", "ramen", "sushi", "cafe", "coffee", "dessert", "street food"],
        "museums": ["museum", "museums", "gallery", "art"],
        "shopping": ["shop", "shopping", "market", "thrift"],
        "nature": ["nature", "park", "hike", "hiking", "garden", "outdoors"],
        "adventure": ["adventure", "adventurous", "trek", "trekking", "rafting", "zipline"],
        "nightlife": ["nightlife", "bar", "club", "izakaya"],
        "history": ["history", "temple", "shrines", "shrine", "castle"],
    }

    def add_label(label: str) -> None:
        if label not in interests:
            interests.append(label)

    # prefer explicit interests (if provided)
    if explicit:
        for token in explicit[:8]:
            for label, keys in synonym_map.items():
                if any(k in token for k in keys):
                    add_label(label)
    else:
        for label, keys in synonym_map.items():
            if any(k in lowered for k in keys):
                add_label(label)

    return interests


def _extract_dates(prompt: str) -> dict[str, str]:
    # Use YYYY-MM-DD strings from the UI date pickers.
    patterns = {
        "depart": r"\bdepart\s+(\d{4}-\d{2}-\d{2})\b",
        "return": r"\breturn\s+(\d{4}-\d{2}-\d{2})\b",
        "check_in": r"\bcheck-in\s+(\d{4}-\d{2}-\d{2})\b",
        "check_out": r"\bcheck-out\s+(\d{4}-\d{2}-\d{2})\b",
    }
    found: dict[str, str] = {}
    for key, pat in patterns.items():
        match = re.search(pat, prompt, flags=re.IGNORECASE)
        if match:
            found[key] = match.group(1)
    return found


def _build_itinerary(*, days: int, destination: str | None, interests: list[str], budget: int | None) -> list[dict[str, Any]]:
    place = destination or "your destination"

    def pick_title(day: int) -> str:
        if day == 1:
            return f"Arrival + first bites in {place}"
        if day == days:
            return f"Last looks + departure" if days > 1 else f"Quick highlights"
        if "adventure" in interests:
            return "Adventure + active exploring"
        if "museums" in interests:
            return "Museums + iconic sights"
        if "nature" in interests:
            return "Parks + scenic strolls"
        if "shopping" in interests:
            return "Neighborhood shopping"
        return "Top sights + local vibes"

    def pick_notes(day: int) -> str:
        parts: list[str] = []
        if day == 1:
            parts.append("Check in and take an easy walk to get oriented")
            if "food" in interests:
                parts.append("Find a nearby specialty spot for a first meal")
            parts.append("Early night to reset")
        else:
            if "museums" in interests:
                parts.append("Morning museum/gallery; book tickets if needed")
            if "adventure" in interests:
                parts.append("Add one adventure activity (easy hike / viewpoint / activity slot)")
            parts.append("Afternoon landmark + neighborhood exploration")
            if "food" in interests:
                parts.append("Evening food crawl (2–3 stops)")
            if "nightlife" in interests and day < days:
                parts.append("Optional late-night bar/izakaya")
            if day == days:
                parts.append("Leave time for transit and a buffer before departure")

        if budget is not None:
            if budget < 800:
                parts.append("Budget tip: prioritize free sights + transit day passes")
            elif budget < 1500:
                parts.append("Budget tip: mix 1 paid highlight with mostly free activities")
            else:
                parts.append("Budget tip: consider a splurge meal or guided tour")

        return "; ".join(parts)

    itinerary: list[dict[str, Any]] = []
    for day in range(1, days + 1):
        itinerary.append({"day": day, "title": pick_title(day), "notes": pick_notes(day)})
    return itinerary


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

    normalized = prompt.strip().lower()
    is_stays_request = normalized.startswith("find stays") or normalized.startswith("search stays")

    # Agentic = multiple roles with clear tasks + short, user-visible reports.
    emit(
        "Orchestrator",
        "agent_task",
        "Delegating tasks to specialist agents",
        {"mode": "stays" if is_stays_request else "travel"},
    )
    time.sleep(0.4)

    emit(
        "Prompt Parser",
        "agent_report",
        "Extracting key trip constraints",
        {"signals": {"stays_request": is_stays_request}},
    )
    time.sleep(0.5)

    if is_stays_request:
        emit(
            "Accommodation Scout",
            "agent_task",
            "Choose good stay areas + a simple hotel checklist",
            {"deliverable": "neighborhoods + checklist"},
        )
        time.sleep(0.8)
        emit(
            "Accommodation Scout",
            "agent_report",
            "Shortlisted 3 stay strategies (central, transit-first, budget-first)",
            {
                "strategies": [
                    "Central/Walkable: minimize commute, higher nightly rates",
                    "Transit-first: near a major line/hub, flexible sightseeing",
                    "Budget-first: slightly farther out, trade time for savings",
                ]
            },
        )
        time.sleep(0.5)
    else:
        emit(
            "Flight Negotiator",
            "agent_task",
            "Propose flight windows and booking heuristics",
            {"deliverable": "flight windows + tips"},
        )
        time.sleep(0.8)
        emit(
            "Flight Negotiator",
            "agent_report",
            "Prepared flight-window assumptions and booking tips (no live provider calls in MVP)",
            {
                "tips": [
                    "Prefer morning arrivals to maximize Day 1",
                    "Leave a 2–3h buffer for airport transfers",
                    "If budget is tight: be flexible by ±1 day",
                ]
            },
        )
        time.sleep(0.5)

    emit(
        "Local Itinerary Expert",
        "agent_task",
        "Draft a day-by-day plan aligned to interests + budget",
        {"deliverable": "itinerary"},
    )
    time.sleep(1.0)
    emit(
        "Local Itinerary Expert",
        "agent_report",
        "Built a draft itinerary outline (rule-based MVP)",
        {"note": "Replace with real tools/providers + LLM later"},
    )
    time.sleep(0.4)

    emit(
        "Orchestrator",
        "agent_decision",
        "Synthesizing agent outputs into final result",
        {"next": "emit result"},
    )
    time.sleep(0.4)

    days = _extract_days(prompt)
    destination = _extract_destination(prompt)
    budget = _extract_budget(prompt)
    interests = _extract_interests(prompt)
    dates = _extract_dates(prompt)
    itinerary = _build_itinerary(days=days, destination=destination, interests=interests, budget=budget)

    emit(
        "Orchestrator",
        "result",
        "MVP result generated (rule-based; replace with real tools + providers).",
        {
            "destination": destination,
            "days": days,
            "budget_usd": budget,
            "interests": interests,
            "dates": dates,
            "itinerary": itinerary,
        },
    )

    set_run_status("completed")
    emit("Orchestrator", "run_completed", "Run completed")

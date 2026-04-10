from __future__ import annotations

import hashlib
import json
import os
import re
import time
from typing import Any

import requests
from supabase import Client

from app.agents.action import TripActionEngine
from app.agents.memory import MemoryStore
from app.agents.planning import TripPlanner
from app.agents.profiling import PromptProfiler
from app.agents.shared.contracts import RunContext, WorkingState


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


def _split_budget(total_budget: int | None) -> dict[str, int] | None:
    if total_budget is None or total_budget <= 0:
        return None
    # Default: simple 50/50 split.
    flight_budget = int(total_budget * 0.5)
    hotel_budget = max(0, total_budget - flight_budget)
    return {"total": total_budget, "flight": flight_budget, "hotel": hotel_budget}


def _build_flight_options(*, destination: str | None, dates: dict[str, str], flight_budget: int | None) -> list[dict[str, Any]]:
    if destination is None:
        return []

    depart = dates.get("depart")
    ret = dates.get("return")

    # Price bands scale loosely with budget; still works if budget missing.
    base = 420
    if flight_budget is not None:
        base = max(160, min(int(flight_budget * 0.9), 1400))

    options: list[dict[str, Any]] = []
    candidates = [
        ("EconoFlex", base - 60, 1, "07:30", "12:05"),
        ("SkySaver", base, 1, "10:10", "15:00"),
        ("PrimeAir", base + 120, 0, "14:20", "19:05"),
    ]

    for carrier, price, stops, depart_time, arrive_time in candidates:
        if flight_budget is not None and price > flight_budget:
            continue
        options.append(
            {
                "carrier": carrier,
                "route": f"Origin → {destination}",
                "depart_date": depart,
                "return_date": ret,
                "depart_time": depart_time,
                "arrive_time": arrive_time,
                "stops": stops,
                "price_usd": price,
            }
        )

    return options


def _build_hotel_options(*, destination: str | None, dates: dict[str, str], hotel_budget: int | None, days: int) -> list[dict[str, Any]]:
    if destination is None:
        return []

    check_in = dates.get("check_in")
    check_out = dates.get("check_out")

    # Approx nights: if no explicit stay dates, assume days-1 nights (min 1).
    nights = 1
    if days and days > 1:
        nights = days - 1

    # Choose a per-night target based on budget.
    per_night_cap: int | None = None
    if hotel_budget is not None:
        per_night_cap = max(50, int(hotel_budget / max(1, nights)))

    base = 120
    if per_night_cap is not None:
        base = max(60, min(int(per_night_cap * 0.9), 420))

    candidates = [
        (f"{destination} Central Stay", "Central", base + 20, 8.6, ["Walkable", "Great transit"]),
        (f"{destination} Transit Hub Hotel", "Transit hub", base, 8.2, ["Easy connections", "Value"]),
        (f"{destination} Budget Comfort", "Budget area", base - 25, 7.8, ["Simple", "Good reviews"]),
    ]

    options: list[dict[str, Any]] = []
    for name, area, nightly, rating, perks in candidates:
        total = nightly * nights
        if hotel_budget is not None and total > hotel_budget:
            continue
        options.append(
            {
                "name": name,
                "area": area,
                "check_in": check_in,
                "check_out": check_out,
                "nights": nights,
                "nightly_usd": nightly,
                "total_usd": total,
                "rating": rating,
                "perks": perks,
            }
        )

    return options


def _extract_preferences_with_llm(
    result_payload: dict[str, Any],
) -> dict[str, str]:
    """Extract travel preferences from trip result using Groq LLM.

    Returns structured preferences as a dict with keys like:
    - accommodation_type, flight_preference, food_style, pace, budget_tier
    - interests (comma-separated)
    """

    groq_api_key = os.environ.get("GROQ_API_KEY")
    if not groq_api_key:
        # Fallback: return empty preferences
        return {}

    destination = result_payload.get("destination", "")
    budget = result_payload.get("budget_usd", 0)
    days = result_payload.get("days", 0)
    interests = result_payload.get("interests", [])
    flight_options = result_payload.get("flight_options", [])
    hotel_options = result_payload.get("hotel_options", [])

    prompt = f"""Extract and infer travel preferences from the following trip summary.
Return ONLY a valid JSON object with these fields (use null for missing values):
- accommodation_type: one of [luxury, boutique, mid-range, budget, hostel]
- flight_preference: one of [morning, afternoon, evening, flexible]
- food_style: one of [high-end, local-street, casual, mixed]
- pace: one of [slow, moderate, fast]
- budget_tier: one of [ultra-budget, budget, mid-range, premium, luxury]
- interests: comma-separated list of top 3 interests

Trip Summary:
- Destination: {destination}
- Days: {days}
- Budget: ${budget}
- Stated Interests: {", ".join(interests) if interests else "not specified"}
- Flight Options Available: {len(flight_options)} (prices: {", ".join([f"${opt.get('price_usd', 0)}" for opt in flight_options[:3]])})
- Hotel Options Available: {len(hotel_options)} (price ranges: {", ".join([f"${opt.get('nightly_usd', 0)}/night" for opt in hotel_options[:3]])})

Return only valid JSON, no explanation."""

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {groq_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 500,
            },
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

        # Parse JSON from response
        prefs = json.loads(content)
        return {
            "accommodation_type": prefs.get("accommodation_type") or "",
            "flight_preference": prefs.get("flight_preference") or "",
            "food_style": prefs.get("food_style") or "",
            "pace": prefs.get("pace") or "",
            "budget_tier": prefs.get("budget_tier") or "",
            "interests": prefs.get("interests") or "",
        }
    except Exception:
        # Silently fail on LLM errors; preferences are optional
        return {}


def _generate_embedding(text: str) -> list[float] | None:
    """Generate embedding using Hugging Face Inference API.

    Returns 384-dimensional embedding for sentence-transformers/all-MiniLM-L6-v2.
    Returns None on failure.
    """

    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        return None

    try:
        response = requests.post(
            "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
            headers={"Authorization": f"Bearer {hf_token}"},
            json={"inputs": text},
            timeout=10,
        )
        response.raise_for_status()
        embedding = response.json()
        if isinstance(embedding, list) and len(embedding) > 0:
            # If response is list of lists, take first element
            if isinstance(embedding[0], list):
                return embedding[0]
            return embedding
    except Exception:
        pass

    return None


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except Exception:
        return default


def _split_route(route: str | None, fallback_destination: str | None) -> tuple[str | None, str | None]:
    if not route:
        return None, fallback_destination
    if "→" in route:
        left, right = [part.strip() for part in route.split("→", 1)]
        return left or None, right or fallback_destination
    if "->" in route:
        left, right = [part.strip() for part in route.split("->", 1)]
        return left or None, right or fallback_destination
    return None, fallback_destination


def _persist_flight_offers(
    *,
    supabase: Client,
    run_id: str,
    user_id: str | None,
    destination: str | None,
    flight_options: list[dict[str, Any]],
) -> None:
    if not user_id or not flight_options:
        return

    rows: list[dict[str, Any]] = []
    for index, option in enumerate(flight_options, start=1):
        route = option.get("route")
        origin, destination_value = _split_route(route if isinstance(route, str) else None, destination)
        depart_date = option.get("depart_date")
        return_date = option.get("return_date")
        provider_offer_id = option.get("id") or f"mock-flight-{index:02d}"

        rows.append(
            {
                "run_id": run_id,
                "user_id": user_id,
                "provider": "mock",
                "provider_offer_id": str(provider_offer_id),
                "rank": index,
                "origin": origin,
                "destination": destination_value,
                "route": route,
                "depart_date": depart_date if isinstance(depart_date, str) else None,
                "return_date": return_date if isinstance(return_date, str) else None,
                "depart_time": option.get("depart_time") if isinstance(option.get("depart_time"), str) else None,
                "arrive_time": option.get("arrive_time") if isinstance(option.get("arrive_time"), str) else None,
                "carrier": option.get("carrier") if isinstance(option.get("carrier"), str) else None,
                "stops": _safe_int(option.get("stops"), default=0),
                "price_usd": _safe_float(option.get("price_usd")),
                "currency": "USD",
                "deep_link": None,
                "raw_payload": option,
            }
        )

    try:
        supabase.table("flight_offers").insert(rows).execute()
    except Exception:
        pass


def _persist_hotel_offers(
    *,
    supabase: Client,
    run_id: str,
    user_id: str | None,
    destination: str | None,
    hotel_options: list[dict[str, Any]],
) -> None:
    if not user_id or not hotel_options:
        return

    rows: list[dict[str, Any]] = []
    for index, option in enumerate(hotel_options, start=1):
        provider_property_id = option.get("id") if isinstance(option.get("id"), str) else None
        provider_offer_id = provider_property_id or f"mock-hotel-{index:02d}"
        check_in = option.get("check_in")
        check_out = option.get("check_out")

        rows.append(
            {
                "run_id": run_id,
                "user_id": user_id,
                "provider": "mock",
                "provider_property_id": provider_property_id,
                "provider_offer_id": str(provider_offer_id),
                "rank": index,
                "hotel_name": option.get("name") or f"Hotel {index}",
                "city": destination,
                "area": option.get("area"),
                "check_in": check_in if isinstance(check_in, str) else None,
                "check_out": check_out if isinstance(check_out, str) else None,
                "nights": _safe_int(option.get("nights"), default=0),
                "nightly_usd": _safe_float(option.get("nightly_usd")),
                "total_usd": _safe_float(option.get("total_usd")),
                "rating": _safe_float(option.get("rating")),
                "currency": "USD",
                "perks": option.get("perks") or [],
                "deep_link": None,
                "raw_payload": option,
            }
        )

    try:
        supabase.table("hotel_offers").insert(rows).execute()
    except Exception:
        pass


def _unpack_action_artifacts(action_artifacts: list[Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Extract itinerary/flight/hotel payloads from Action artifacts."""

    itinerary: list[dict[str, Any]] = []
    flight_options: list[dict[str, Any]] = []
    hotel_options: list[dict[str, Any]] = []

    for artifact in action_artifacts:
        payload = artifact.payload if hasattr(artifact, "payload") and isinstance(artifact.payload, dict) else {}
        if artifact.artifact_type == "itinerary":
            itinerary = payload.get("itinerary") if isinstance(payload.get("itinerary"), list) else []
        elif artifact.artifact_type == "flights":
            flight_options = payload.get("flight_options") if isinstance(payload.get("flight_options"), list) else []
        elif artifact.artifact_type == "hotels":
            hotel_options = payload.get("hotel_options") if isinstance(payload.get("hotel_options"), list) else []

    return itinerary, flight_options, hotel_options


def run_orchestration(*, supabase: Client, run_id: str, prompt: str, user_id: str | None = None) -> None:
    """Toy multi-agent runner.

    Writes events into `public.agent_events` for the realtime dashboard.
    Replace with CrewAI/LangGraph orchestration later.
    """

    memory_store = MemoryStore(supabase=supabase)
    profiler = PromptProfiler()
    planner = TripPlanner()
    action_engine = TripActionEngine()

    def emit(agent_name: str, event_type: str, content: str | None = None, payload: dict[str, Any] | None = None) -> None:
        memory_store.emit(
            run_id=run_id,
            agent_name=agent_name,
            event_type=event_type,
            content=content,
            payload=payload or {},
        )

    def set_run_status(status: str) -> None:
        supabase.table("agent_runs").update({"status": status}).eq("id", run_id).execute()

    # If user_id not provided, fetch from run
    if not user_id:
        try:
            run_data = supabase.table("agent_runs").select("user_id").eq("id", run_id).maybe_single().execute()
            if run_data.data:
                user_id = run_data.data.get("user_id")
        except Exception:
            pass

    set_run_status("running")
    emit("Orchestrator", "run_started", f"Received prompt: {prompt}")

    run_context = RunContext(run_id=run_id, prompt=prompt, user_id=user_id)
    constraints = profiler.run(run=run_context)
    execution_plan = planner.run(run=run_context, constraints=constraints)
    is_stays_request = bool(constraints.intent_flags.get("stays_request", False))

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

    emit(
        "Orchestrator",
        "agent_decision",
        "Execution plan generated",
        {
            "plan_id": execution_plan.plan_id,
            "task_order": execution_plan.ordering,
            "expected_artifacts": execution_plan.expected_artifacts,
        },
    )
    time.sleep(0.2)

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

    days = constraints.days
    destination = constraints.destination
    budget = constraints.budget_usd
    interests = constraints.interests
    dates = constraints.dates

    budget_split = execution_plan.budget_split

    emit(
        "Budget Analyst",
        "agent_report",
        "Allocated budget across flights and hotels",
        {"budget": budget, "split": budget_split},
    )
    time.sleep(0.3)

    flight_budget = budget_split["flight"] if budget_split else None
    hotel_budget = budget_split["hotel"] if budget_split else None

    action_artifacts = action_engine.run(
        run=run_context,
        plan=execution_plan,
        state=WorkingState(constraints=constraints, execution_plan=execution_plan),
    )

    itinerary, flight_options, hotel_options = _unpack_action_artifacts(action_artifacts)

    emit(
        "Flight Negotiator",
        "agent_report",
        "Generated flight options within budget split",
        {"budget_flight": flight_budget, "flight_options": flight_options},
    )
    time.sleep(0.3)

    emit(
        "Accommodation Scout",
        "agent_report",
        "Generated hotel options within budget split",
        {"budget_hotel": hotel_budget, "hotel_options": hotel_options},
    )
    time.sleep(0.3)

    emit(
        "Orchestrator",
        "result",
        "MVP result generated (rule-based; replace with real tools + providers).",
        {
            "destination": destination,
            "days": days,
            "budget_usd": budget,
            "budget_split": budget_split,
            "interests": interests,
            "dates": dates,
            "flight_options": flight_options,
            "hotel_options": hotel_options,
            "itinerary": itinerary,
        },
    )

    if user_id:
        try:
            memory_store.persist_flight_offers(
                run_id=run_id,
                user_id=user_id,
                destination=destination,
                flight_options=flight_options,
            )
        except Exception:
            pass

        try:
            memory_store.persist_hotel_offers(
                run_id=run_id,
                user_id=user_id,
                destination=destination,
                hotel_options=hotel_options,
            )
        except Exception:
            pass

    # Extract and store travel preferences
    if user_id:
        result_payload = {
            "destination": destination,
            "days": days,
            "budget_usd": budget,
            "budget_split": budget_split,
            "interests": interests,
            "flight_options": flight_options,
            "hotel_options": hotel_options,
            "itinerary": itinerary,
        }

        prefs = _extract_preferences_with_llm(result_payload)

        try:
            memory_store.upsert_preferences(
                run_id=run_id,
                user_id=user_id,
                preferences=prefs,
                metadata={"source": "travel_dna", "kind": "preferences"},
            )
        except Exception:
            pass

        # Generate combined embedding of all preferences for vector search
        preferences_text = "\n".join([f"{k}: {v}" for k, v in prefs.items() if v])
        if preferences_text:
            embedding = _generate_embedding(preferences_text)
            if embedding:
                try:
                    memory_store.insert_user_memory(
                        user_id=user_id,
                        content=f"Travel DNA from trip: {destination}",
                        embedding=embedding,
                        metadata={
                            "run_id": run_id,
                            "source": "travel_dna",
                            "kind": "preferences",
                            **prefs,
                        },
                    )
                except Exception:
                    pass

    set_run_status("completed")
    emit("Orchestrator", "run_completed", "Run completed")

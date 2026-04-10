from __future__ import annotations

from typing import Any

from app.agents.shared.contracts import ActionArtifact, ActionModule, ExecutionPlan, RunContext, WorkingState


def _build_itinerary(*, days: int, destination: str | None, interests: list[str], budget: int | None) -> list[dict[str, Any]]:
    place = destination or "your destination"

    def pick_title(day: int) -> str:
        if day == 1:
            return f"Arrival + first bites in {place}"
        if day == days:
            return "Last looks + departure" if days > 1 else "Quick highlights"
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


def _build_flight_options(*, destination: str | None, dates: dict[str, str], flight_budget: int | None) -> list[dict[str, Any]]:
    if destination is None:
        return []

    depart = dates.get("depart")
    ret = dates.get("return")

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

    nights = 1
    if days and days > 1:
        nights = days - 1

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


class TripActionEngine(ActionModule):
    """Executes action tasks from planning output and returns typed artifacts."""

    def run(self, *, run: RunContext, plan: ExecutionPlan, state: WorkingState) -> list[ActionArtifact]:
        if state.constraints is None:
            return []

        constraints = state.constraints
        budget_split = plan.budget_split or {}
        flight_budget = budget_split.get("flight") if isinstance(budget_split, dict) else None
        hotel_budget = budget_split.get("hotel") if isinstance(budget_split, dict) else None

        artifacts: list[ActionArtifact] = []

        for task_id in plan.ordering:
            if task_id == "itinerary_generation":
                itinerary = _build_itinerary(
                    days=constraints.days,
                    destination=constraints.destination,
                    interests=constraints.interests,
                    budget=constraints.budget_usd,
                )
                artifacts.append(
                    ActionArtifact(
                        artifact_type="itinerary",
                        producer_agent="Local Itinerary Expert",
                        payload={"itinerary": itinerary},
                    )
                )

            elif task_id == "flight_strategy":
                flight_options = _build_flight_options(
                    destination=constraints.destination,
                    dates=constraints.dates,
                    flight_budget=flight_budget,
                )
                artifacts.append(
                    ActionArtifact(
                        artifact_type="flights",
                        producer_agent="Flight Negotiator",
                        payload={"flight_options": flight_options},
                    )
                )

            elif task_id == "hotel_strategy":
                hotel_options = _build_hotel_options(
                    destination=constraints.destination,
                    dates=constraints.dates,
                    hotel_budget=hotel_budget,
                    days=constraints.days,
                )
                artifacts.append(
                    ActionArtifact(
                        artifact_type="hotels",
                        producer_agent="Accommodation Scout",
                        payload={"hotel_options": hotel_options},
                    )
                )

        return artifacts

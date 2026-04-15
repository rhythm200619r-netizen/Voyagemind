from __future__ import annotations
from typing import Any

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

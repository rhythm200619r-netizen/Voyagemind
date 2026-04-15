from __future__ import annotations
from typing import Any

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

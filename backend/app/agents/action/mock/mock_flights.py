from __future__ import annotations
from typing import Any

def _build_flight_options(
    *,
    origin: str | None,
    destination: str | None,
    dates: dict[str, str],
    flight_budget: int | None,
) -> list[dict[str, Any]]:
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
        origin_label = origin or "Origin"
        options.append(
            {
                "carrier": carrier,
                "route": f"{origin_label} → {destination}",
                "depart_date": depart,
                "return_date": ret,
                "depart_time": depart_time,
                "arrive_time": arrive_time,
                "stops": stops,
                "price_usd": price,
            }
        )

    return options

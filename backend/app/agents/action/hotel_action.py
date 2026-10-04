from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

import httpx

from app.agents.action.base import ActionModule
from app.agents.shared.contracts import ActionArtifact, ExecutionPlan, HotelOption, RunContext, WorkingState
from app.agents.shared.llm_client import async_call_claude
from app.agents.shared.prompt_templates import HOTEL_ACTION_SYSTEM
from app.agents.memory.store import MemoryStore
from app.settings import settings

logger = logging.getLogger(__name__)

# ── Booking.com (RapidAPI) constants ──────────────────────────────────────
_BOOKING_HOST = "booking-com.p.rapidapi.com"
_BOOKING_SEARCH_URL = f"https://{_BOOKING_HOST}/v1/hotels/search"
_BOOKING_TIMEOUT = 20.0


def _estimated_hotels(
    *,
    destination: str,
    checkin_date: str,
    checkout_date: str,
    nights: int,
    hotel_budget: int | None,
) -> list[dict[str, Any]]:
    nightly_anchor = max(int((hotel_budget or 420) / max(nights, 1)), 55)
    return [
        {
            "id": "estimated-hotel-central",
            "name": f"{destination} Central Stay",
            "area": "Central district",
            "check_in": checkin_date or None,
            "check_out": checkout_date or None,
            "nights": nights,
            "nightly_usd": nightly_anchor,
            "total_usd": nightly_anchor * nights,
            "rating": 4.4,
            "perks": ["Walkable area", "Breakfast options", "Free cancellation"],
        },
        {
            "id": "estimated-hotel-boutique",
            "name": f"{destination} Boutique House",
            "area": "Dining and culture area",
            "check_in": checkin_date or None,
            "check_out": checkout_date or None,
            "nights": nights,
            "nightly_usd": int(nightly_anchor * 1.16),
            "total_usd": int(nightly_anchor * 1.16) * nights,
            "rating": 4.6,
            "perks": ["Local character", "Highly rated", "Transit nearby"],
        },
        {
            "id": "estimated-hotel-value",
            "name": f"{destination} Value Base",
            "area": "Transit-first area",
            "check_in": checkin_date or None,
            "check_out": checkout_date or None,
            "nights": nights,
            "nightly_usd": int(nightly_anchor * 0.82),
            "total_usd": int(nightly_anchor * 0.82) * nights,
            "rating": 4.1,
            "perks": ["Best price", "Easy commute", "Flexible dates"],
        },
    ]


def _normalize_provider_hotels(
    *,
    hotels: list[HotelOption],
    destination: str,
    checkin_date: str,
    checkout_date: str,
    nights: int,
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, hotel in enumerate(hotels, start=1):
        nightly = float(hotel.get("price_per_night_usd") or 0)
        normalized.append(
            {
                "id": f"booking-hotel-{index}",
                "name": str(hotel.get("name") or f"{destination} hotel"),
                "area": str(hotel.get("address") or destination),
                "check_in": checkin_date or None,
                "check_out": checkout_date or None,
                "nights": nights,
                "nightly_usd": nightly,
                "total_usd": round(nightly * max(nights, 1), 2),
                "rating": hotel.get("review_score"),
                "perks": ["Provider result", "Compare cancellation terms"],
                "deep_link": hotel.get("url"),
            }
        )
    return normalized


def _calc_nights(checkin: str, checkout: str) -> int:
    """Return the number of nights between two YYYY-MM-DD date strings."""
    try:
        d_in = datetime.strptime(checkin, "%Y-%m-%d")
        d_out = datetime.strptime(checkout, "%Y-%m-%d")
        diff = (d_out - d_in).days
        return max(diff, 1)
    except (ValueError, TypeError):
        return 1


async def _fetch_hotels(
    *,
    destination: str,
    checkin_date: str,
    checkout_date: str,
    adults: int = 1,
) -> tuple[list[HotelOption], int]:
    """Call Booking.com API to get real hotel listings.

    Returns a tuple of (up to 5 HotelOption dicts, number of nights).
    Raises on any network / parsing error so the caller can fall back.
    """
    nights = _calc_nights(checkin_date, checkout_date)

    headers = {
        "X-RapidAPI-Key": settings.rapidapi_key,
        "X-RapidAPI-Host": _BOOKING_HOST,
    }

    async with httpx.AsyncClient(timeout=_BOOKING_TIMEOUT) as client:
        resp = await client.get(
            _BOOKING_SEARCH_URL,
            headers=headers,
            params={
                "dest_id": destination,
                "dest_type": "city",
                "checkin_date": checkin_date,
                "checkout_date": checkout_date,
                "adults_number": str(adults),
                "room_number": "1",
                "order_by": "popularity",
                "filter_by_currency": "USD",
                "page_number": "0",
                "units": "metric",
                "locale": "en-us",
            },
        )
        resp.raise_for_status()
        body = resp.json()

    results = body.get("result", [])[:5]
    hotels: list[HotelOption] = []
    for h in results:
        try:
            total_price = float(h.get("min_total_price", 0))
            hotels.append(
                HotelOption(
                    name=h.get("hotel_name", ""),
                    stars=int(h.get("class", 0)),
                    review_score=float(h.get("review_score", 0)),
                    price_per_night_usd=round(total_price / max(nights, 1), 2),
                    address=h.get("address", ""),
                    url=h.get("url", ""),
                )
            )
        except (KeyError, TypeError, ValueError) as parse_err:
            logger.warning("Skipping unparseable hotel result: %s", parse_err)

    return hotels, nights


class HotelAction(ActionModule):
    """Executes hotel strategy tasks using real Booking.com data + Claude narration."""

    async def run(self, *, run: RunContext, plan: ExecutionPlan, state: WorkingState, memory_store: MemoryStore) -> list[ActionArtifact]:
        if state.constraints is None:
            return []

        constraints = state.constraints
        budget_split = plan.budget_split or {}
        hotel_budget = budget_split.get("hotel") if isinstance(budget_split, dict) else None

        artifacts: list[ActionArtifact] = []

        for task_id in plan.ordering:
            if task_id == "hotel_strategy":
                destination = constraints.destination or "Anywhere"
                nights_fallback = max((constraints.days or 3) - 1, 1)
                interests = ", ".join(constraints.interests) if constraints.interests else "None"
                travel_style = constraints.intent_flags.get("travel_style", "balanced")

                dates = constraints.dates if constraints.dates else {}
                checkin_date = dates.get("depart", "")
                checkout_date = dates.get("return", "")

                # ── Try real Booking.com data ─────────────────────────
                hotels: list[dict[str, Any]] = []
                nights = nights_fallback
                source = "booking_com"

                try:
                    if not settings.rapidapi_key:
                        raise ValueError("RAPIDAPI_KEY not configured")

                    if not checkin_date or not checkout_date:
                        raise ValueError("No checkin/checkout dates available for hotel search")

                    provider_hotels, nights = await _fetch_hotels(
                        destination=destination,
                        checkin_date=checkin_date,
                        checkout_date=checkout_date,
                    )
                    if not provider_hotels:
                        raise ValueError("Booking.com returned no results")

                    hotels = _normalize_provider_hotels(
                        hotels=provider_hotels,
                        destination=destination,
                        checkin_date=checkin_date,
                        checkout_date=checkout_date,
                        nights=nights,
                    )
                    logger.info("Booking.com returned %d hotels for %s (%d nights)", len(hotels), destination, nights)

                except Exception as exc:
                    logger.warning("Booking.com unavailable, using estimated hotel options: %s", exc)
                    hotels = _estimated_hotels(
                        destination=destination,
                        checkin_date=checkin_date,
                        checkout_date=checkout_date,
                        nights=nights,
                        hotel_budget=hotel_budget if isinstance(hotel_budget, int) else None,
                    )
                    source = "estimated"

                # ── Build LLM narration prompt ────────────────────────
                if hotels:
                    prompt_addition = f"""
Here are real hotel options from Booking.com for this trip:
{json.dumps(hotels, indent=2)}

Based on these real options and the hotel budget of ${hotel_budget} USD,
recommend the best 1-2 hotels and briefly explain why.
Keep the response under 80 words.
"""
                else:
                    prompt_addition = """
Live hotel data is temporarily unavailable. Use the estimated options below
as selectable placeholders and explain how to verify rates before booking.
"""

                user_prompt = f"""
Please generate a hotel strategy based on these constraints:
- destination: {destination}
- nights: {nights}
- budget_allocation: {hotel_budget if hotel_budget is not None else 'Unspecified'}
- interests: {interests}
- travel_style: {travel_style}

{prompt_addition}
"""
                try:
                    parsed_json, input_tokens, output_tokens = await async_call_claude(
                        system_prompt=HOTEL_ACTION_SYSTEM,
                        user_prompt=user_prompt.strip(),
                    )

                    if not parsed_json:
                        raise ValueError("LLM returned empty hotel strategy")

                    narration = parsed_json

                except Exception as exc:
                    logger.error("Failed to generate hotel narration: %s", exc)
                    narration = {
                        "neighborhood_recommendations": [
                            {"name": "City Center", "why": "Best access to major attractions."}
                        ],
                        "what_to_look_for": "Look for hotels with free cancellation.",
                        "proximity_advice": "Stay near main transit hubs.",
                        "amenity_priorities": ["Free Wi-Fi", "24-hour front desk"],
                    }
                    input_tokens, output_tokens = 0, 0

                # ── Emit event + return artifact ──────────────────────
                payload: dict[str, Any] = {
                    "hotel_options": hotels,
                    "hotels": hotels,
                    "narration": narration,
                    "source": source,
                    "llm_metrics": {
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                    },
                }

                memory_store.emit(
                    run_id=run.run_id,
                    agent_name="Accommodation Scout",
                    event_type="hotel_strategy_ready",
                    content=f"Hotel strategy ready for {destination}",
                    payload=payload,
                )

                artifacts.append(
                    ActionArtifact(
                        artifact_type="hotels",
                        producer_agent="Accommodation Scout",
                        payload=payload,
                    )
                )

        return artifacts

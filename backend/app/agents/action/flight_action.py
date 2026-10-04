from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.agents.action.base import ActionModule
from app.agents.shared.contracts import ActionArtifact, ExecutionPlan, FlightOption, RunContext, WorkingState
from app.agents.shared.llm_client import async_call_claude
from app.agents.shared.prompt_templates import FLIGHT_ACTION_SYSTEM
from app.agents.memory.store import MemoryStore
from app.settings import settings

logger = logging.getLogger(__name__)

# ── Sky Scrapper (RapidAPI) constants ─────────────────────────────────────
_SKY_HOST = "sky-scrapper.p.rapidapi.com"
_SKY_AIRPORT_URL = f"https://{_SKY_HOST}/api/v1/flights/searchAirport"
_SKY_FLIGHTS_URL = f"https://{_SKY_HOST}/api/v1/flights/searchFlights"
_SKY_TIMEOUT = 20.0


def _estimated_flights(
    *,
    origin: str,
    destination: str,
    depart_date: str,
    return_date: str | None,
    flight_budget: int | None,
) -> list[dict[str, Any]]:
    base_price = max(int((flight_budget or 650) * 0.82), 240)
    route = f"{origin} -> {destination}"
    return [
        {
            "id": "estimated-flight-flex",
            "carrier": "Flexible fare search",
            "route": route,
            "depart_date": depart_date or None,
            "return_date": return_date or None,
            "depart_time": "08:35",
            "arrive_time": "14:10",
            "stops": 1,
            "price_usd": base_price,
            "note": "Best balance of price and arrival timing.",
        },
        {
            "id": "estimated-flight-direct",
            "carrier": "Direct-first option",
            "route": route,
            "depart_date": depart_date or None,
            "return_date": return_date or None,
            "depart_time": "11:20",
            "arrive_time": "16:05",
            "stops": 0,
            "price_usd": int(base_price * 1.18),
            "note": "Less airport time if the fare stays within budget.",
        },
        {
            "id": "estimated-flight-value",
            "carrier": "Value connection",
            "route": route,
            "depart_date": depart_date or None,
            "return_date": return_date or None,
            "depart_time": "21:45",
            "arrive_time": "09:30",
            "stops": 1,
            "price_usd": int(base_price * 0.9),
            "note": "Cheapest estimate, with a longer transfer window.",
        },
    ]


def _normalize_provider_flight_options(
    *,
    flights: list[FlightOption],
    origin: str,
    destination: str,
    depart_date: str,
    return_date: str | None,
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, flight in enumerate(flights, start=1):
        departure = str(flight.get("departure") or "")
        arrival = str(flight.get("arrival") or "")
        normalized.append(
            {
                "id": f"sky-flight-{index}",
                "carrier": str(flight.get("airline") or "Flight option"),
                "route": f"{origin} -> {destination}",
                "depart_date": depart_date or None,
                "return_date": return_date or None,
                "depart_time": departure[11:16] if len(departure) >= 16 else None,
                "arrive_time": arrival[11:16] if len(arrival) >= 16 else None,
                "stops": flight.get("stops"),
                "price_usd": flight.get("price_usd"),
                "duration_minutes": flight.get("duration_minutes"),
            }
        )
    return normalized


async def _resolve_sky_id(client: httpx.AsyncClient, city: str, headers: dict[str, str]) -> tuple[str, str]:
    """Resolve a city name to Skyscanner skyId + entityId via the searchAirport endpoint."""
    resp = await client.get(
        _SKY_AIRPORT_URL,
        headers=headers,
        params={"query": city, "locale": "en-US"},
    )
    resp.raise_for_status()
    data = resp.json().get("data", [])
    if not data:
        raise ValueError(f"No airport results for '{city}'")
    return data[0]["skyId"], data[0]["entityId"]


async def _fetch_flights(
    *,
    origin: str,
    destination: str,
    depart_date: str,
    adults: int = 1,
) -> list[FlightOption]:
    """Call Sky Scrapper APIs to get real Skyscanner flight data.

    Returns a list of up to 5 FlightOption dicts.
    Raises on any network / parsing error so the caller can fall back.
    """
    headers = {
        "X-RapidAPI-Key": settings.rapidapi_key,
        "X-RapidAPI-Host": _SKY_HOST,
    }

    async with httpx.AsyncClient(timeout=_SKY_TIMEOUT) as client:
        # Step 1 — resolve both cities to skyId / entityId
        origin_sky_id, origin_entity_id = await _resolve_sky_id(client, origin, headers)
        dest_sky_id, dest_entity_id = await _resolve_sky_id(client, destination, headers)

        # Step 2 — search flights
        resp = await client.get(
            _SKY_FLIGHTS_URL,
            headers=headers,
            params={
                "originSkyId": origin_sky_id,
                "destinationSkyId": dest_sky_id,
                "originEntityId": origin_entity_id,
                "destinationEntityId": dest_entity_id,
                "date": depart_date,
                "adults": str(adults),
                "currency": "USD",
                "countryCode": "US",
                "market": "en-US",
            },
        )
        resp.raise_for_status()
        body = resp.json()

    # Step 3 — parse top 5 itineraries
    itineraries = body.get("data", {}).get("itineraries", [])[:5]
    flights: list[FlightOption] = []
    for item in itineraries:
        try:
            leg = item["legs"][0]
            flights.append(
                FlightOption(
                    airline=leg["carriers"]["marketing"][0]["name"],
                    departure=leg["departure"],
                    arrival=leg["arrival"],
                    duration_minutes=leg["durationInMinutes"],
                    stops=leg["stopCount"],
                    price_usd=item["price"]["raw"],
                )
            )
        except (KeyError, IndexError, TypeError) as parse_err:
            logger.warning("Skipping unparseable itinerary: %s", parse_err)

    return flights


class FlightAction(ActionModule):
    """Executes flight strategy tasks using real Sky Scrapper data + Claude narration."""

    async def run(self, *, run: RunContext, plan: ExecutionPlan, state: WorkingState, memory_store: MemoryStore) -> list[ActionArtifact]:
        if state.constraints is None:
            return []

        constraints = state.constraints
        budget_split = plan.budget_split or {}
        flight_budget = budget_split.get("flight") if isinstance(budget_split, dict) else None

        artifacts: list[ActionArtifact] = []

        for task_id in plan.ordering:
            if task_id == "flight_strategy":
                destination = constraints.destination or "Anywhere"
                origin = constraints.origin or "New York"
                dates = constraints.dates if constraints.dates else {}
                depart_date = dates.get("depart", "")
                travel_style = constraints.intent_flags.get("travel_style", "balanced")

                # ── Try real Sky Scrapper data ────────────────────────
                flights: list[dict[str, Any]] = []
                source = "sky_scrapper"

                try:
                    if not settings.rapidapi_key:
                        raise ValueError("RAPIDAPI_KEY not configured")

                    if not depart_date:
                        raise ValueError("No departure date available for flight search")

                    provider_flights = await _fetch_flights(
                        origin=origin,
                        destination=destination,
                        depart_date=depart_date,
                    )
                    if not provider_flights:
                        raise ValueError("Sky Scrapper returned no itineraries")

                    flights = _normalize_provider_flight_options(
                        flights=provider_flights,
                        origin=origin,
                        destination=destination,
                        depart_date=depart_date,
                        return_date=dates.get("return"),
                    )
                    logger.info("Sky Scrapper returned %d flights for %s -> %s", len(flights), origin, destination)

                except Exception as exc:
                    logger.warning("Sky Scrapper unavailable, using estimated flight options: %s", exc)
                    flights = _estimated_flights(
                        origin=origin,
                        destination=destination,
                        depart_date=depart_date,
                        return_date=dates.get("return"),
                        flight_budget=flight_budget if isinstance(flight_budget, int) else None,
                    )
                    source = "estimated"

                # ── Build LLM narration prompt ────────────────────────
                if flights:
                    prompt_addition = f"""
Here are real flight options from Skyscanner for this trip:
{json.dumps(flights, indent=2)}

Based on these real options and the flight budget of ${flight_budget} USD,
recommend the best 1-2 flights and briefly explain why.
Keep the response under 80 words.
"""
                else:
                    prompt_addition = """
Live flight data is temporarily unavailable. Use the estimated options below
as selectable placeholders and explain how to verify prices before booking.
"""

                user_prompt = f"""
Please generate a flight strategy based on these constraints:
- destination: {destination}
- origin: {origin}
- dates: {dates}
- budget_allocation: {flight_budget if flight_budget is not None else 'Unspecified'}
- travel_style: {travel_style}

{prompt_addition}
"""
                try:
                    parsed_json, input_tokens, output_tokens = await async_call_claude(
                        system_prompt=FLIGHT_ACTION_SYSTEM,
                        user_prompt=user_prompt.strip(),
                    )

                    if not parsed_json:
                        raise ValueError("LLM returned empty flight strategy")

                    narration = parsed_json

                except Exception as exc:
                    logger.error("Failed to generate flight narration: %s", exc)
                    narration = {
                        "booking_strategy": "Book as early as possible.",
                        "best_time_to_book": "6-8 weeks in advance.",
                        "layover_advice": "Direct flights preferred when in budget.",
                        "airline_suggestions": ["Check Google Flights for best rates"],
                    }
                    input_tokens, output_tokens = 0, 0

                # ── Emit event + return artifact ──────────────────────
                payload: dict[str, Any] = {
                    "flight_options": flights,
                    "flights": flights,
                    "narration": narration,
                    "source": source,
                    "llm_metrics": {
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                    },
                }

                memory_store.emit(
                    run_id=run.run_id,
                    agent_name="Flight Negotiator",
                    event_type="flight_strategy_ready",
                    content=f"Flight strategy ready for {destination}",
                    payload=payload,
                )

                artifacts.append(
                    ActionArtifact(
                        artifact_type="flights",
                        producer_agent="Flight Negotiator",
                        payload=payload,
                    )
                )

        return artifacts

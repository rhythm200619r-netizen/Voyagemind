from app.agents.action.flight_action import FlightAction
from app.agents.action.hotel_action import HotelAction
from app.agents.action.itinerary_action import ItineraryAction
from typing import Any
from app.agents.shared.contracts import ActionArtifact

def unpack_action_artifacts(action_artifacts: list[ActionArtifact]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Extract itinerary/flight/hotel payloads from Action artifacts."""

    itinerary: list[dict[str, Any]] = []
    flight_options: list[dict[str, Any]] = []
    hotel_options: list[dict[str, Any]] = []

    for artifact in action_artifacts:
        payload = artifact.payload if isinstance(getattr(artifact, "payload", None), dict) else {}
        if artifact.artifact_type == "itinerary":
            itinerary = payload.get("itinerary") if isinstance(payload.get("itinerary"), list) else []
        elif artifact.artifact_type == "flights":
            options = payload.get("flight_options")
            if not isinstance(options, list):
                options = payload.get("flights")
            flight_options = options if isinstance(options, list) else []
        elif artifact.artifact_type == "hotels":
            options = payload.get("hotel_options")
            if not isinstance(options, list):
                options = payload.get("hotels")
            hotel_options = options if isinstance(options, list) else []

    return itinerary, flight_options, hotel_options

__all__ = ["FlightAction", "HotelAction", "ItineraryAction", "unpack_action_artifacts"]

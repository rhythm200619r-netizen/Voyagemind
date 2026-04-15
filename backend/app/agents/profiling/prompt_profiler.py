from __future__ import annotations

from datetime import date
import re

from app.agents.shared.contracts import RunContext, TripConstraints
from app.agents.profiling.base import ProfilingModule


def _extract_days(prompt: str) -> int | None:
    match = re.search(r"(\d+)\s*[- ]?day", prompt, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        days = int(match.group(1))
        return max(1, min(days, 14))
    except ValueError:
        return None


def _parse_iso_date(value: str | None) -> date | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _infer_days_from_dates(dates: dict[str, str]) -> int | None:
    depart = _parse_iso_date(dates.get("depart"))
    ret = _parse_iso_date(dates.get("return"))
    if depart and ret:
        delta = (ret - depart).days + 1
        if delta <= 0:
            return None
        return max(1, min(delta, 14))

    check_in = _parse_iso_date(dates.get("check_in"))
    check_out = _parse_iso_date(dates.get("check_out"))
    if check_in and check_out:
        delta = (check_out - check_in).days + 1
        if delta <= 0:
            return None
        return max(1, min(delta, 14))

    return None


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
    raw = re.split(
        r"\b(for|with|under|within|budget|on|depart|return|check-in|check-out|checkin|checkout)\b",
        raw,
        flags=re.IGNORECASE,
    )[0]
    cleaned = " ".join(raw.strip().split())
    return cleaned[:50] if cleaned else None


def _extract_origin(prompt: str) -> str | None:
    match = re.search(r"\bfrom\s+([A-Za-z][A-Za-z\s-]{0,48}?)(?:\s+to\b|$)", prompt, flags=re.IGNORECASE)
    if not match:
        return None
    raw = match.group(1)
    raw = re.split(
        r"\b(for|with|under|within|budget|on|depart|return|check-in|check-out|checkin|checkout)\b",
        raw,
        flags=re.IGNORECASE,
    )[0]
    cleaned = " ".join(raw.strip().split())
    return cleaned[:50] if cleaned else None


def _extract_interests(prompt: str) -> list[str]:
    lowered = prompt.lower()

    explicit: list[str] = []
    match = re.search(r"\b(?:focused on|with vibes:)\s+(.+)$", prompt, flags=re.IGNORECASE)
    if match:
        tail = match.group(1)
        tail = re.split(r"\b(under|within|budget|for|check-in|check-out|depart|return)\b", tail, flags=re.IGNORECASE)[0]
        pieces = re.split(r"[,/&]|\band\b", tail, flags=re.IGNORECASE)
        for piece in pieces:
            cleaned = re.sub(r"[^a-zA-Z\s-]", " ", piece).strip().lower()
            cleaned = " ".join(cleaned.split())
            if cleaned:
                explicit.append(cleaned)

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


class PromptProfiler(ProfilingModule):
    """Profiles user prompts into normalized trip constraints."""

    def run(self, *, run: RunContext) -> TripConstraints:
        normalized = run.prompt.strip().lower()
        is_stays_request = normalized.startswith("find stays") or normalized.startswith("search stays")

        budget = _extract_budget(run.prompt)
        dates = _extract_dates(run.prompt)

        explicit_days = _extract_days(run.prompt)
        inferred_days = _infer_days_from_dates(dates) if explicit_days is None else None
        days = explicit_days or inferred_days or 3

        return TripConstraints(
            origin=_extract_origin(run.prompt),
            destination=_extract_destination(run.prompt),
            days=days,
            budget_usd=budget,
            interests=_extract_interests(run.prompt),
            dates=dates,
            intent_flags={
                "stays_request": is_stays_request,
                "has_budget": budget is not None,
                "has_dates": len(dates) > 0,
            },
        )

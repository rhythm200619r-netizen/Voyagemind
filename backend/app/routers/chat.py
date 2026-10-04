"""Lightweight travel chat endpoint powered by a local Ollama SLM (Phi-3 Mini).

This is intentionally decoupled from the planning orchestrator — it answers
quick travel questions (visas, weather, packing, destinations) without
triggering the multi-agent pipeline.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])

OLLAMA_BASE = "http://localhost:11434"
OLLAMA_CHAT_URL = f"{OLLAMA_BASE}/v1/chat/completions"
OLLAMA_MODEL = "phi3:mini"
OLLAMA_TIMEOUT = 30.0

SYSTEM_PROMPT = (
    "You are a friendly travel assistant on VoyageMind. "
    "Answer travel questions concisely — visas, weather, packing, "
    "destinations, local tips, cultural advice. "
    "Do NOT generate full trip plans; the planning tool handles that separately. "
    "Keep answers under 120 words unless the user asks for more detail. "
    "Always be warm, helpful and specific."
)

FALLBACK_REPLY = "I'm temporarily offline. Please try again in a moment!"


# ── Request / Response schemas ────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)


class ChatResponse(BaseModel):
    reply: str


# ── Endpoint ──────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """Send user messages to Phi-3 Mini via Ollama and return the reply."""

    # Build the messages payload with system prompt prepended
    ollama_messages: list[dict[str, str]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
    ]
    for msg in req.messages:
        ollama_messages.append({"role": msg.role, "content": msg.content})

    payload: dict[str, Any] = {
        "model": OLLAMA_MODEL,
        "messages": ollama_messages,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
            response = await client.post(OLLAMA_CHAT_URL, json=payload)
            response.raise_for_status()

        data = response.json()
        reply = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", FALLBACK_REPLY)
        )
        return ChatResponse(reply=reply.strip())

    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        logger.warning("Ollama unreachable: %s", exc)
        return ChatResponse(reply=FALLBACK_REPLY)

    except Exception as exc:  # noqa: BLE001
        logger.error("Chat endpoint error: %s: %s", type(exc).__name__, exc)
        return ChatResponse(reply=FALLBACK_REPLY)

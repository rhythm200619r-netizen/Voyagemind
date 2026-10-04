import json
import logging
import re
import time
from typing import Any

import httpx
from app.settings import settings

logger = logging.getLogger(__name__)

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"
GEMINI_MODEL = "gemini-3.1-flash-lite"


async def async_call_claude(
    system_prompt: str,
    user_prompt: str,
    model: str = GEMINI_MODEL,
    temperature: float = 0.0,
    max_tokens: int = 1500,
) -> tuple[dict[str, Any], int, int]:
    """Call the Gemini API and attempt to parse the response as JSON.

    Returns:
        tuple containing:
            - Parsed JSON payload as a dictionary.
            - Input token usage.
            - Output token usage.
    """
    if not settings.gemini_api_key:
        logger.error("GEMINI_API_KEY not set in .env")
        return {}, 0, 0

    full_messages = []
    if system_prompt:
        full_messages.append({"role": "system", "content": system_prompt})
    if user_prompt:
        full_messages.append({"role": "user", "content": user_prompt})

    payload = {
        "model": GEMINI_MODEL,
        "messages": full_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{GEMINI_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.gemini_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        content = data["choices"][0]["message"]["content"]
        
        # Strip markdown backticks if present
        content = re.sub(r"^```(?:json)?\s*", "", content, flags=re.MULTILINE)
        content = re.sub(r"```\s*$", "", content, flags=re.MULTILINE)
        content = content.strip()
        
        try:
            parsed_json = json.loads(content)
            usage = data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            return parsed_json, input_tokens, output_tokens
        except json.JSONDecodeError as json_exc:
            logger.error(f"Failed to parse LLM JSON response: {json_exc}. Raw content: {content}")
            return {}, 0, 0
            
    except Exception as exc:
        logger.error(f"LLM CALL FAILED: {type(exc).__name__}: {exc}")
        return {}, 0, 0

import json
import logging
import os
import re
from typing import Any

from anthropic import AsyncAnthropic

logger = logging.getLogger(__name__)

_client: AsyncAnthropic | None = None

def get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            logger.error("ANTHROPIC_API_KEY environment variable is not set")
        _client = AsyncAnthropic(api_key=api_key)
    return _client


async def async_call_claude(
    system_prompt: str,
    user_prompt: str,
    model: str = "claude-3-5-sonnet-20241022",
    temperature: float = 0.0,
    max_tokens: int = 1500,
) -> tuple[dict[str, Any], int, int]:
    """Call the Claude API and attempt to parse the response as JSON.

    Returns:
        tuple containing:
            - Parsed JSON payload as a dictionary.
            - Input token usage.
            - Output token usage.
    """
    client = get_client()

    try:
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ],
        )

        content = response.content[0].text
        
        # Strip markdown backticks if present
        content = re.sub(r"^```(?:json)?\s*", "", content, flags=re.MULTILINE)
        content = re.sub(r"```\s*$", "", content, flags=re.MULTILINE)
        content = content.strip()
        
        try:
            parsed_json = json.loads(content)
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            return parsed_json, input_tokens, output_tokens
        except json.JSONDecodeError as json_exc:
            logger.error(f"Failed to parse Claude JSON response: {json_exc}. Raw content: {content}")
            return {}, 0, 0
            
    except Exception as exc:
        logger.error(f"Claude API call failed: {exc}")
        return {}, 0, 0


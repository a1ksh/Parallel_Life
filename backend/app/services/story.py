import asyncio
import json
import logging
import os
import re
from time import monotonic

import httpx
from pydantic import ConfigDict, StringConstraints, create_model
from typing_extensions import Annotated

from app.models.schemas import NPCState
from app.services.ai_limits import POLICY

logger = logging.getLogger("uvicorn.error.parallel_life.ai")
PROVIDER_URL = "https://api.openai.com/v1/responses"

OUTPUT_MODELS = {
    kind: create_model(kind, __config__=ConfigDict(extra="forbid", strict=True), **{
        field: (Annotated[str, StringConstraints(strip_whitespace=True, min_length=low, max_length=high)], ...)
        for field, (low, high) in spec["fields"].items()
    })
    for kind, spec in POLICY["outputs"].items()
}

NOTICES = {
    "disabled": "Demo mode: using the authored story.",
    "rate_limited": "Live AI is at its usage limit. You can keep playing with the scripted story.",
    "unavailable": "Live AI couldn’t respond. You can keep playing with the scripted story.",
}


def scene_context(scene: dict) -> dict:
    return {**{key: scene[key] for key in ("index", "title", "body", "when", "location", "npcs", "last_event")},
            "choices": [option[0] for option in scene["choices"]]}


def conversation_context(state: NPCState, latest: str) -> dict:
    recent = [message.model_dump(include={"role", "text"}) for message in state.messages[-6:]]
    older = [(index, item.text) for index, item in enumerate(state.messages[:-6]) if item.role == "player"]
    terms = set(re.findall(r"[a-z0-9]{4,}", latest.lower()))
    ranked = sorted(older, key=lambda turn: (
        len(terms.intersection(re.findall(r"[a-z0-9]{4,}", turn[1].lower()))), turn[0]
    ), reverse=True)[:4]
    return {"recent": recent, "earlier_player_statements": [text[:160] for _, text in sorted(ranked)]}


async def generate(kind: str, context: dict, blocked: str | None) -> tuple[dict | None, str | None]:
    if blocked:
        logger.info("ai kind=%s result=%s", kind, blocked)
        return None, blocked
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        return None, "disabled"
    model_type = OUTPUT_MODELS[kind]
    model = os.environ.get("OPENAI_MODEL", "").strip() or POLICY["model"]
    # Keep the wire schema portable; Pydantic enforces strict character bounds on the returned text.
    schema = {"type": "object", "additionalProperties": False,
              "properties": {field: {"type": "string"} for field in model_type.model_fields},
              "required": list(model_type.model_fields)}
    payload = {
        "model": model, "store": False, "max_output_tokens": POLICY["outputs"][kind]["tokens"],
        "instructions": f'{POLICY["base_rules"]} {POLICY["instructions"][kind]}',
        "input": json.dumps(context, ensure_ascii=False),
        "text": {"format": {"type": "json_schema", "name": kind, "strict": True, "schema": schema}},
    }
    started = monotonic()
    result, status, usage = None, "invalid_output", {}
    try:
        async with asyncio.timeout(POLICY["timeout_ms"] / 1000):
            async with httpx.AsyncClient() as client:
                response = await client.post(PROVIDER_URL, json=payload, headers={"Authorization": f"Bearer {key}"})
                response.raise_for_status()
        data = response.json()
        usage = data.get("usage") or {}
        if data.get("status") == "completed":
            content = [item for output in data.get("output", []) if output.get("type") == "message"
                       for item in output.get("content", [])]
            texts = [item["text"] for item in content if item.get("type") == "output_text"]
            if len(texts) == 1 and not any(item.get("type") == "refusal" for item in content):
                result = model_type.model_validate_json(texts[0]).model_dump()
                status = "live"
    except httpx.HTTPStatusError as error:
        status = f"http_{error.response.status_code}"
    except (TimeoutError, httpx.TimeoutException):
        status = "timeout"
    except httpx.HTTPError:
        status = "transport_error"
    except (ValueError, TypeError, KeyError, AttributeError):
        pass
    usage = usage if isinstance(usage, dict) else {}
    logger.info("ai kind=%s result=%s ms=%d input_tokens=%s output_tokens=%s", kind, status,
                (monotonic() - started) * 1000,
                *(usage.get(field) if type(usage.get(field)) is int else None
                  for field in ("input_tokens", "output_tokens")))
    return result, None if result else "unavailable"


async def npc_reply(npc: dict, state: NPCState, scene: dict, events: list[dict], player: str,
                    timeline: dict, blocked: str | None):
    context = conversation_context(state, player)
    generated, reason = await generate("npc_reply", {
        "npc": npc, "trust": state.trust, "timeline": timeline, "scene": scene_context(scene),
        "events": events, **context, "text": player,
    }, blocked)
    if generated:
        return generated["reply"], "live", None
    outcome = events[-1]["outcome"] if events else None
    if re.search(r"\b(remember|earlier|before|last time)\b", player, re.I):
        previous = next((item.text for item in reversed(state.messages) if item.role == "player"), None)
        if previous:
            return f"I remember your earlier message: “{previous[:120]}” {outcome or npc['support']}", "scripted", reason
        if outcome:
            return f"Here’s what I remember from this part of the story: {outcome} {npc['support']}", "scripted", reason
    if re.search(r"\b(your goal|your plans?|what (do|did) you (want|need)|why are you)\b", player, re.I):
        return f"What I’m working toward is simple: {npc['goal'][0].lower()}{npc['goal'][1:]} {npc['support']}", "scripted", reason
    if outcome and not state.messages:
        return f"{outcome} {npc['support']}", "scripted", reason
    return npc["support"] if state.trust >= 65 or state.messages else npc["voice"], "scripted", reason

"""Sliding-window state machine для AI-подсказок по комнате.

Хранит компактную семантическую сводку по текущему собеседованию
в Redis (`room:{id}:hint_state`) и обновляется после каждой итерации
пайплайна подсказок (skip / hit). State используется как вход для
heuristic-prefilter и LLM-классификатора, чтобы не дублировать
подсказки и держать модель в контексте текущей темы.
"""
from __future__ import annotations

import json
import time
from typing import Any

from app.services.redis_service import get_redis

STATE_TTL_SECONDS = 14400  # 4 часа
RECENT_HINTS_LIMIT = 5


def _state_key(room_id: str) -> str:
    return f"room:{room_id}:hint_state"


def _empty_state() -> dict[str, Any]:
    return {
        "currentTopic": None,
        "recentHints": [],
        "redCount": 0,
        "yellowCount": 0,
        "greenCount": 0,
        "lastHintAt": 0.0,
        "totalCandidateUtterances": 0,
        "skippedSinceLastHint": 0,
    }


async def get_state(room_id: str) -> dict[str, Any]:
    r = await get_redis()
    raw = await r.get(_state_key(room_id))
    if not raw:
        return _empty_state()
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return _empty_state()
        merged = _empty_state()
        merged.update(data)
        return merged
    except (json.JSONDecodeError, TypeError):
        return _empty_state()


async def _save_state(room_id: str, state: dict[str, Any]) -> None:
    r = await get_redis()
    await r.set(_state_key(room_id), json.dumps(state), ex=STATE_TTL_SECONDS)


async def update_after_skip(room_id: str) -> None:
    state = await get_state(room_id)
    state["totalCandidateUtterances"] = int(state.get("totalCandidateUtterances", 0)) + 1
    state["skippedSinceLastHint"] = int(state.get("skippedSinceLastHint", 0)) + 1
    await _save_state(room_id, state)


async def update_after_hint(
    room_id: str,
    title: str,
    color: str,
    topic: str | None = None,
) -> None:
    state = await get_state(room_id)
    now = time.time()

    state["totalCandidateUtterances"] = int(state.get("totalCandidateUtterances", 0)) + 1
    state["lastHintAt"] = now
    state["skippedSinceLastHint"] = 0

    if topic and topic.strip():
        state["currentTopic"] = topic.strip()[:80]

    recent = list(state.get("recentHints", []))
    recent.append({"title": (title or "")[:120], "ts": now})
    state["recentHints"] = recent[-RECENT_HINTS_LIMIT:]

    if color == "red":
        state["redCount"] = int(state.get("redCount", 0)) + 1
    elif color == "yellow":
        state["yellowCount"] = int(state.get("yellowCount", 0)) + 1
    elif color == "green":
        state["greenCount"] = int(state.get("greenCount", 0)) + 1

    await _save_state(room_id, state)


async def reset_state(room_id: str) -> None:
    r = await get_redis()
    await r.delete(_state_key(room_id))

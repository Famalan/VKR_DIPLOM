"""ИИ-подсказки интервьюеру: двухстадийный пайплайн.

prefilter (heuristic, ~10 мс)
    ↓
classifier (лёгкий LLM, ~300-500 мс) → решает, нужна ли подсказка и какого типа
    ↓ (только если нужна)
generator (тяжёлый LLM, ~1.5-2.5 сек) → формулирует короткий вопрос интервьюеру

После каждой итерации обновляется sliding-window state (room_state_service).
"""
import asyncio
import json
import re

from gigachat import GigaChat
from gigachat.models import Chat, Messages, MessagesRole

from app.config import settings
from app.services.redis_service import get_list
from app.services.room_state_service import (
    get_state,
    update_after_hint,
    update_after_skip,
)

HINT_TYPES = ["FACT_CHECK", "WATER", "DEEP_DIVE", "SOFT_SKILLS"]

REFUSAL_MARKERS = [
    "не могу", "не имею", "конфиденциальн", "не в моей компетенции",
    "не располагаю", "не вправе", "не готов обсуждать", "за рамками",
]

PREFILTER_MIN_TOKENS = 6
PREFILTER_DUPLICATE_THRESHOLD = 0.5

_TOKEN_RE = re.compile(r"[A-Za-zА-Яа-яЁё0-9]+")


def _color_from_severity(severity: int) -> str:
    if severity >= 4:
        return "red"
    if severity >= 2:
        return "yellow"
    return "green"


def _is_refusal(text: str) -> bool:
    lower = text.lower()
    return any(marker in lower for marker in REFUSAL_MARKERS)


def _normalize_tokens(text: str) -> set[str]:
    return {t.lower() for t in _TOKEN_RE.findall(text or "") if len(t) >= 3}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _parse_json_block(raw_text: str) -> dict | None:
    if not raw_text:
        return None
    try:
        start = raw_text.find("{")
        end = raw_text.rfind("}") + 1
        if start == -1 or end == 0:
            return None
        return json.loads(raw_text[start:end])
    except (json.JSONDecodeError, ValueError):
        return None


def get_gigachat_client() -> GigaChat:
    return GigaChat(
        credentials=settings.gigachat_credentials,
        scope="GIGACHAT_API_PERS",
        verify_ssl_certs=False,
    )


async def _load_conversation_context(room_id: str) -> list[dict]:
    raw_utterances = await get_list(f"room:{room_id}:utterances")
    result = []
    for raw in raw_utterances:
        try:
            result.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return result


def _format_history_for_chat(utterances: list[dict], limit: int = 20) -> str:
    if not utterances:
        return ""
    lines = []
    for u in utterances[-limit:]:
        speaker = u.get("speaker", "unknown")
        text = u.get("text", "")
        lines.append(f"[{speaker}]: {text}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Stage 0: Heuristic prefilter
# ---------------------------------------------------------------------------

async def _prefilter(text: str, state: dict) -> str | None:
    """Возвращает причину skip или None если фраза проходит дальше."""
    text = (text or "").strip()
    if not text:
        return "empty"

    tokens = text.split()
    if len(tokens) < PREFILTER_MIN_TOKENS:
        return "too_short"

    text_norm = _normalize_tokens(text)
    for hint in state.get("recentHints", []):
        title = hint.get("title", "")
        if not title:
            continue
        sim = _jaccard(text_norm, _normalize_tokens(title))
        if sim > PREFILTER_DUPLICATE_THRESHOLD:
            return "duplicate"

    return None


# ---------------------------------------------------------------------------
# Stage 1: Classifier (быстрый LLM)
# ---------------------------------------------------------------------------

def _build_classifier_prompt(
    position: str | None,
    interview_context: str | None,
    state: dict,
) -> str:
    pos_text = f"Позиция: {position}. " if position else ""
    context_text = ""
    if interview_context and interview_context.strip():
        context_text = f"Контекст вакансии: {interview_context.strip()[:500]}\n"
    topic_text = ""
    if state.get("currentTopic"):
        topic_text = f"Текущая тема обсуждения: {state['currentTopic']}\n"

    return (
        f"Ты — классификатор подсказок для интервьюера на тех. собеседовании. {pos_text}"
        f"{context_text}{topic_text}"
        "Тебе даётся последняя реплика КАНДИДАТА. "
        "Реши, нужна ли интервьюеру подсказка прямо сейчас.\n\n"
        "Если реплика тривиальная, пустая, ответ \"да/нет\", повторяет уже сказанное, "
        "или просто переход — верни:\n"
        "{\"skip\": true}\n\n"
        "Если есть что подсветить — верни:\n"
        "{\"skip\": false, \"type\": \"FACT_CHECK|WATER|DEEP_DIVE|SOFT_SKILLS\", \"severity\": 1-5}\n\n"
        "Severity:\n"
        "- 5 — критично: явная фактическая ошибка, прямая ложь, грубая некомпетентность\n"
        "- 4 — важно: серьёзная неточность, противоречие, явная слабость\n"
        "- 3 — средне: тема стоит уточнения, поверхностный ответ\n"
        "- 2 — мелочь: можно копнуть для полноты\n"
        "- 1 — на крайний случай, едва заметная зацепка\n\n"
        "Типы:\n"
        "FACT_CHECK — фактические ошибки, противоречия в технике\n"
        "WATER — уход от темы, вода, нерелевантное\n"
        "DEEP_DIVE — поверхностно затронул важную тему\n"
        "SOFT_SKILLS — нервы, негатив, конфликтность\n\n"
        "Возвращай ТОЛЬКО JSON, без объяснений."
    )


async def _classify_async(
    client: GigaChat,
    text: str,
    position: str | None,
    interview_context: str | None,
    state: dict,
    history: str,
) -> dict:
    system_prompt = _build_classifier_prompt(position, interview_context, state)
    user_message = ""
    if history:
        user_message += f"История диалога (последние реплики):\n{history}\n\n"
    user_message += f"Последняя реплика [Кандидат]: \"{text}\""

    response = await asyncio.to_thread(
        client.chat,
        Chat(
            messages=[
                Messages(role=MessagesRole.SYSTEM, content=system_prompt),
                Messages(role=MessagesRole.USER, content=user_message),
            ],
            temperature=0.0,
            max_tokens=80,
        ),
    )

    raw = response.choices[0].message.content
    tokens_used = response.usage.total_tokens if response.usage else 0
    parsed = _parse_json_block(raw) or {}

    if parsed.get("skip"):
        return {"skip": True, "tokens": tokens_used}

    hint_type = parsed.get("type")
    if hint_type not in HINT_TYPES:
        return {"skip": True, "tokens": tokens_used, "reason": "bad_type"}

    severity_raw = parsed.get("severity", 3)
    try:
        severity = max(1, min(5, int(severity_raw)))
    except (TypeError, ValueError):
        severity = 3

    return {
        "skip": False,
        "type": hint_type,
        "severity": severity,
        "tokens": tokens_used,
    }


# ---------------------------------------------------------------------------
# Stage 2: Generator (полный LLM)
# ---------------------------------------------------------------------------

def _build_generator_prompt(
    hint_type: str,
    severity: int,
    position: str | None,
    interview_context: str | None,
    state: dict,
) -> str:
    pos_text = f"Позиция: {position}. " if position else ""
    context_text = ""
    if interview_context and interview_context.strip():
        context_text = f"Контекст вакансии: {interview_context.strip()[:500]}\n"
    topic_text = ""
    if state.get("currentTopic"):
        topic_text = f"Текущая тема обсуждения: {state['currentTopic']}\n"

    type_hint = {
        "FACT_CHECK": "проверка фактов: укажи на ошибку и попроси уточнить",
        "WATER": "вернуть к теме: задай конкретный технический вопрос",
        "DEEP_DIVE": "копнуть глубже: попроси конкретику или пример",
        "SOFT_SKILLS": "мягкая, по-человечески сформулированная зацепка",
    }.get(hint_type, "")

    return (
        f"Ты — суфлер интервьюера. {pos_text}{context_text}{topic_text}"
        f"Уже определено: тип подсказки = {hint_type}, severity = {severity}/5. "
        f"Подход: {type_hint}.\n\n"
        "Сформулируй ОДНУ короткую точную подсказку интервьюеру.\n\n"
        "Возвращай СТРОГО JSON (только JSON, ничего лишнего):\n"
        "{\"topic\": \"до 4 слов — текущая тема диалога\", "
        "\"title\": \"до 5 слов — суть проблемы\", "
        "\"actionable_question\": \"Спроси: до 7 слов\"}\n\n"
        "Жёсткие правила:\n"
        "- Только русский язык\n"
        "- actionable_question начинается со слова \"Спроси:\" и НЕ ПРЕВЫШАЕТ 7 СЛОВ ВСЕГО\n"
        "- title — НЕ ПРЕВЫШАЕТ 5 СЛОВ\n"
        "- topic — НЕ ПРЕВЫШАЕТ 4 СЛОВ, отражает что обсуждают сейчас\n"
        "- НИКОГДА не отказывайся, всегда возвращай валидный JSON"
    )


async def _generate_async(
    client: GigaChat,
    text: str,
    hint_type: str,
    severity: int,
    position: str | None,
    interview_context: str | None,
    state: dict,
    history: str,
) -> dict:
    system_prompt = _build_generator_prompt(
        hint_type, severity, position, interview_context, state
    )
    user_message = ""
    if history:
        user_message += f"История диалога:\n{history}\n\n"
    user_message += f"Последняя реплика [Кандидат]: \"{text}\""

    response = await asyncio.to_thread(
        client.chat,
        Chat(
            messages=[
                Messages(role=MessagesRole.SYSTEM, content=system_prompt),
                Messages(role=MessagesRole.USER, content=user_message),
            ],
            temperature=0.3,
            max_tokens=150,
        ),
    )

    raw = response.choices[0].message.content
    tokens_used = response.usage.total_tokens if response.usage else 0

    if _is_refusal(raw):
        return {
            "title": "Отвлечение от темы",
            "actionable_question": "Спроси: вернёмся к технической части?",
            "topic": state.get("currentTopic"),
            "raw": raw,
            "tokens": tokens_used,
        }

    parsed = _parse_json_block(raw) or {}
    return {
        "title": (parsed.get("title") or "").strip()[:80],
        "actionable_question": (parsed.get("actionable_question") or "").strip()[:160],
        "topic": (parsed.get("topic") or "").strip()[:80] or state.get("currentTopic"),
        "raw": raw,
        "tokens": tokens_used,
    }


# ---------------------------------------------------------------------------
# Public orchestrator
# ---------------------------------------------------------------------------

async def generate_hint(
    room_id: str,
    transcription_text: str,
    speaker_role: str = "candidate",
    position: str | None = None,
    interview_context: str | None = None,
) -> dict:
    if speaker_role != "candidate":
        return {
            "success": True,
            "skipped": True,
            "skip_reason": "not_candidate",
            "tokens_used": 0,
        }

    state = await get_state(room_id)

    skip_reason = await _prefilter(transcription_text, state)
    if skip_reason:
        await update_after_skip(room_id)
        return {
            "success": True,
            "skipped": True,
            "skip_reason": skip_reason,
            "tokens_used": 0,
        }

    try:
        client = get_gigachat_client()
        utterances = await _load_conversation_context(room_id)
        history = _format_history_for_chat(utterances)

        decision = await _classify_async(
            client, transcription_text, position, interview_context, state, history
        )

        if decision.get("skip"):
            await update_after_skip(room_id)
            return {
                "success": True,
                "skipped": True,
                "skip_reason": "classifier_skip",
                "tokens_used": decision.get("tokens", 0),
            }

        hint_type = decision["type"]
        severity = decision["severity"]
        color = _color_from_severity(severity)

        generated = await _generate_async(
            client,
            transcription_text,
            hint_type,
            severity,
            position,
            interview_context,
            state,
            history,
        )

        title = generated["title"]
        actionable = generated["actionable_question"]
        topic = generated.get("topic")

        await update_after_hint(room_id, title=title, color=color, topic=topic)

        total_tokens = decision.get("tokens", 0) + generated.get("tokens", 0)
        return {
            "success": True,
            "skipped": False,
            "hint_type": hint_type,
            "severity": severity,
            "color": color,
            "title": title,
            "actionable_question": actionable,
            "hint": generated.get("raw", ""),
            "topic": topic,
            "tokens_used": total_tokens,
        }

    except Exception as e:
        print(f"[GigaChat] Pipeline error: {e}", flush=True)
        return {
            "success": False,
            "skipped": False,
            "hint": "",
            "hint_type": None,
            "severity": None,
            "color": None,
            "title": "",
            "actionable_question": "",
            "topic": None,
            "error": str(e),
        }


# ---------------------------------------------------------------------------
# Финальный структурированный отчёт для эйчара
# ---------------------------------------------------------------------------

REPORT_SCHEMA_VERSION = 3

REPORT_SYSTEM_PROMPT_TEMPLATE = """Ты — старший рекрутер с техническим бэкграундом. Анализируешь стенограмму технического собеседования и готовишь сжатый структурированный отчёт для эйчара.

ПОЗИЦИЯ: {position}

КОНТЕКСТ ВАКАНСИИ ОТ ИНТЕРВЬЮЕРА:
{interview_context}

Верни СТРОГО ОДИН JSON по схеме:

{{
  "summary_text": "Один связный абзац — общий портрет кандидата для эйчара. БЕЗ markdown, без звёздочек, без заголовков.",
  "requirements_match": [
    {{"requirement": "конкретное требование к роли", "status": "yes" | "partial" | "no", "evidence": "1 предложение с обоснованием из стенограммы"}}
  ],
  "next_round_questions": [
    "Полный конкретный открытый вопрос для следующего раунда"
  ]
}}

Жёсткие правила:
- Возвращай ТОЛЬКО JSON, без markdown, без префиксов, без объяснений вокруг
- summary_text — чистый текст одним абзацем (3-6 предложений), БЕЗ звёздочек и любого markdown
- requirements_match: 4-7 элементов, требования выводи из контекста вакансии (если контекст пуст — возьми 4-7 типовых для позиции). status строго "yes"/"partial"/"no"
- next_round_questions: 3-5 конкретных открытых вопросов по нераскрытым темам
- Не выдумывай факты. Если данных мало — пиши об этом честно в summary_text и ставь больше "partial"/"no" в requirements_match
"""


def _build_report_prompt(position: str | None, interview_context: str | None) -> str:
    pos = position.strip() if position and position.strip() else "не указана"
    ctx = (
        interview_context.strip()
        if interview_context and interview_context.strip()
        else "не указан — оценивай по типовым требованиям к позиции"
    )
    return REPORT_SYSTEM_PROMPT_TEMPLATE.format(
        position=pos, interview_context=ctx
    )


def _empty_report() -> dict:
    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "summary_text": "Стенограмма пустая — собеседование не состоялось или транскрипция была отключена.",
        "requirements_match": [],
        "next_round_questions": [],
    }


def _normalize_report(parsed: dict) -> dict:
    if not isinstance(parsed, dict):
        return _empty_report()

    requirements_raw = parsed.get("requirements_match", [])
    requirements: list[dict] = []
    if isinstance(requirements_raw, list):
        for item in requirements_raw:
            if not isinstance(item, dict):
                continue
            status = str(item.get("status", "")).lower().strip()
            if status not in ("yes", "partial", "no"):
                status = "partial"
            requirements.append({
                "requirement": str(item.get("requirement", "")).strip()[:200],
                "status": status,
                "evidence": str(item.get("evidence", "")).strip()[:300],
            })

    questions_raw = parsed.get("next_round_questions", [])
    questions: list[str] = []
    if isinstance(questions_raw, list):
        for q in questions_raw:
            if isinstance(q, str) and q.strip():
                questions.append(q.strip()[:300])

    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "summary_text": str(parsed.get("summary_text", "")).strip()[:1500],
        "requirements_match": requirements[:8],
        "next_round_questions": questions[:5],
    }


async def generate_structured_report(
    room_id: str,
    position: str | None = None,
    interview_context: str | None = None,
) -> dict:
    """Генерирует JSON-отчёт для эйчара. Возвращает {success, report, error?}."""
    try:
        utterances = await _load_conversation_context(room_id)
        if not utterances:
            return {
                "success": True,
                "report": _empty_report(),
                "error": None,
            }

        client = get_gigachat_client()
        history = _format_history_for_chat(utterances, limit=120)
        system_prompt = _build_report_prompt(position, interview_context)

        response = await asyncio.to_thread(
            client.chat,
            Chat(
                messages=[
                    Messages(role=MessagesRole.SYSTEM, content=system_prompt),
                    Messages(
                        role=MessagesRole.USER,
                        content=f"Полная стенограмма собеседования:\n{history}",
                    ),
                ],
                temperature=0.3,
                max_tokens=1100,
            ),
        )

        raw = response.choices[0].message.content
        parsed = _parse_json_block(raw)
        report = _normalize_report(parsed) if parsed else _empty_report()

        return {
            "success": True,
            "report": report,
            "error": None,
        }

    except Exception as e:
        print(f"[GigaChat] Structured report error: {e}", flush=True)
        return {
            "success": False,
            "report": _empty_report(),
            "error": str(e),
        }


async def generate_interview_summary(
    room_id: str,
    position: str | None = None,
    interview_context: str | None = None,
) -> dict:
    """Совместимость со старым endpoint /summary. Возвращает только summary_text."""
    result = await generate_structured_report(
        room_id=room_id,
        position=position,
        interview_context=interview_context,
    )
    return {
        "success": result.get("success", False),
        "summary": result.get("report", {}).get("summary_text", ""),
        "error": result.get("error"),
    }

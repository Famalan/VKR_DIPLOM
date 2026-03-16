import json

from gigachat import GigaChat
from gigachat.models import Chat, Messages, MessagesRole

from app.config import settings
from app.services.redis_service import get_list

HINT_TYPES = ["FACT_CHECK", "WATER", "DEEP_DIVE", "SOFT_SKILLS"]
SKIP_TYPE = "SKIP"


def _build_system_prompt(position: str | None = None) -> str:
    pos_text = f"Позиция: {position}. " if position else ""

    return f"""Ты — суфлер для Senior-интервьюера на техническом собеседовании. {pos_text}Твоя задача — анализировать ТОЛЬКО ответы КАНДИДАТА и давать ОДИН короткий, точный совет интервьюеру.

В истории диалога реплики обозначены так:
- [Интервьюер]: — это вопросы интервьюера, их НЕ нужно анализировать
- [Кандидат]: — это ответы кандидата, анализируй ТОЛЬКО их

Анализируй ответы кандидата на предмет:
1. FACT_CHECK — кандидат несет техническую чушь или противоречит себе
2. WATER — кандидат льет воду, уходит от темы, не отвечает на вопрос
3. DEEP_DIVE — кандидат поверхностно затронул важную тему, стоит копнуть глубже
4. SOFT_SKILLS — кандидат нервничает, негативит про прошлую работу, конфликтует

Правила:
- Отвечай ТОЛЬКО на русском языке
- Заголовок — максимум 5 слов
- Вопрос — максимум 20 слов, начинай со "Спроси:"
- Учитывай историю диалога, НЕ повторяй уже заданные интервьюером вопросы
- Фокусируйся на технических аспектах
- Если последняя реплика принадлежит интервьюеру, а не кандидату — верни {{"type": "SKIP"}}

Ответ СТРОГО в формате JSON (и ничего кроме JSON):
{{"type": "FACT_CHECK", "title": "Краткий заголовок", "actionable_question": "Спроси: конкретный вопрос"}}"""


SUMMARY_PROMPT = """Проанализируй ВСЕ ответы кандидата на собеседовании и составь подробное резюме.

Формат:
**Сильные стороны** (2-3 пункта с конкретными примерами из ответов)
**Зоны развития** (2-3 пункта с конкретными примерами)
**Ключевые темы** (перечисли технологии и темы, которые обсуждались)
**Рекомендация**: hire / maybe / no hire + обоснование в 2-3 предложениях"""


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


def _format_history_for_chat(utterances: list[dict]) -> str:
    if not utterances:
        return ""

    lines = []
    for u in utterances[-20:]:
        speaker = u.get("speaker", "unknown")
        text = u.get("text", "")
        lines.append(f"[{speaker}]: {text}")

    return "\n".join(lines)


def _parse_hint_json(raw_text: str) -> dict | None:
    try:
        start = raw_text.find("{")
        end = raw_text.rfind("}") + 1
        if start == -1 or end == 0:
            return None
        return json.loads(raw_text[start:end])
    except (json.JSONDecodeError, ValueError):
        return None


async def generate_hint(
    room_id: str,
    transcription_text: str,
    speaker_role: str = "candidate",
    position: str | None = None,
) -> dict:
    try:
        client = get_gigachat_client()

        utterances = await _load_conversation_context(room_id)
        history = _format_history_for_chat(utterances)

        system_prompt = _build_system_prompt(position)

        role_label = "Кандидат" if speaker_role == "candidate" else "Интервьюер"
        user_message = ""
        if history:
            user_message += f"История диалога:\n{history}\n\n"
        user_message += f'Последняя реплика [{role_label}]: "{transcription_text}"'

        response = client.chat(
            Chat(
                messages=[
                    Messages(role=MessagesRole.SYSTEM, content=system_prompt),
                    Messages(role=MessagesRole.USER, content=user_message),
                ],
                temperature=0.7,
                max_tokens=250,
            )
        )

        raw_text = response.choices[0].message.content
        parsed = _parse_hint_json(raw_text)

        if parsed and parsed.get("type") == SKIP_TYPE:
            return {
                "success": True,
                "skipped": True,
                "hint": "",
                "hint_type": None,
                "title": "",
                "actionable_question": "",
                "tokens_used": response.usage.total_tokens if response.usage else 0,
            }

        if parsed and parsed.get("type") in HINT_TYPES:
            return {
                "success": True,
                "skipped": False,
                "hint_type": parsed["type"],
                "title": parsed.get("title", ""),
                "actionable_question": parsed.get("actionable_question", ""),
                "hint": raw_text,
                "tokens_used": response.usage.total_tokens if response.usage else 0,
            }

        hint_type = None
        for t in HINT_TYPES:
            if t in raw_text[:50]:
                hint_type = t
                break

        return {
            "success": True,
            "skipped": False,
            "hint_type": hint_type,
            "title": "",
            "actionable_question": raw_text,
            "hint": raw_text,
            "tokens_used": response.usage.total_tokens if response.usage else 0,
        }

    except Exception as e:
        print(f"[GigaChat] Error: {e}")
        return {
            "success": False,
            "skipped": False,
            "hint": "",
            "hint_type": None,
            "title": "",
            "actionable_question": "",
            "error": str(e),
        }


async def generate_interview_summary(room_id: str) -> dict:
    try:
        client = get_gigachat_client()

        utterances = await _load_conversation_context(room_id)
        if not utterances:
            return {
                "success": False,
                "summary": "",
                "error": "No transcriptions found for this room",
            }

        history = _format_history_for_chat(utterances)

        response = client.chat(
            Chat(
                messages=[
                    Messages(role=MessagesRole.SYSTEM, content=SUMMARY_PROMPT),
                    Messages(
                        role=MessagesRole.USER,
                        content=f"Полная стенограмма собеседования:\n{history}",
                    ),
                ],
                temperature=0.5,
                max_tokens=700,
            )
        )

        return {
            "success": True,
            "summary": response.choices[0].message.content,
        }

    except Exception as e:
        print(f"[GigaChat] Summary error: {e}")
        return {
            "success": False,
            "summary": "",
            "error": str(e),
        }

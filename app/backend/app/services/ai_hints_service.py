import json

from gigachat import GigaChat
from gigachat.models import Chat, Messages, MessagesRole

from app.config import settings
from app.services.redis_service import get_list


def _build_system_prompt(position: str | None = None) -> str:
    pos_text = f"Позиция: {position}. " if position else ""

    return f"""Ты — помощник интервьюера на техническом собеседовании. {pos_text}

Проанализируй последние ответы кандидата и дай КРАТКУЮ подсказку интервьюеру.

Типы подсказок (укажи один в начале ответа):
- УТОЧНЕНИЕ: кандидат говорил расплывчато — предложи конкретный уточняющий вопрос
- ПРОБЕЛ: кандидат упомянул технологию но не объяснил опыт — попроси подробности
- STAR: ответ без конкретного результата — попроси цифры, факты, метрики

Формат ответа (СТРОГО):
[ТИП] Оценка: краткая оценка ответа (1 предложение)
Подсказка: конкретный вопрос для интервьюера (1-2 предложения)

Правила:
- Отвечай ТОЛЬКО на русском языке
- Будь краток — максимум 4 строки
- Учитывай весь контекст беседы, не повторяй уже заданные вопросы
- НЕ оценивай личность, только содержание ответа
- Фокусируйся на технических аспектах"""


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


async def generate_hint(
    room_id: str,
    transcription_text: str,
    position: str | None = None,
) -> dict:
    try:
        client = get_gigachat_client()

        utterances = await _load_conversation_context(room_id)
        history = _format_history_for_chat(utterances)

        system_prompt = _build_system_prompt(position)

        user_message = ""
        if history:
            user_message += f"История диалога:\n{history}\n\n"
        user_message += f'Последний ответ кандидата: "{transcription_text}"'

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

        hint_text = response.choices[0].message.content

        hint_type = None
        for t in ["УТОЧНЕНИЕ", "ПРОБЕЛ", "STAR"]:
            if t in hint_text[:30]:
                hint_type = t
                break

        return {
            "success": True,
            "hint": hint_text,
            "hint_type": hint_type,
            "tokens_used": response.usage.total_tokens if response.usage else 0,
        }

    except Exception as e:
        print(f"[GigaChat] Error: {e}")
        return {
            "success": False,
            "hint": "",
            "hint_type": None,
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

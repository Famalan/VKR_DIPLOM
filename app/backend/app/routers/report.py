from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.ai_hints_service import REPORT_SCHEMA_VERSION, generate_structured_report
from app.services.hint_service import get_hints_by_room
from app.services.room_service import get_room_by_id, save_report_data
from app.services.utterance_service import get_utterances_by_room

router = APIRouter()


def _compute_duration_seconds(
    created_at: datetime | None,
    ended_at: datetime | None,
    utterances: list,
) -> int:
    """Возвращает длительность в секундах. Логика:
    1) если есть ended_at — (ended_at - created_at)
    2) иначе если есть utterances — (last_utt - first_utt)
    3) иначе 0
    Никогда не используем datetime.utcnow() — это давало 183 минуты.
    """
    if created_at and ended_at and ended_at > created_at:
        return int((ended_at - created_at).total_seconds())

    times = [u.created_at for u in utterances if u.created_at]
    if len(times) >= 2:
        delta = max(times) - min(times)
        return max(0, int(delta.total_seconds()))

    return 0


def _color_from_severity(color: str | None, severity: int | None) -> str | None:
    if color in ("red", "yellow", "green"):
        return color
    if severity is None:
        return None
    if severity >= 4:
        return "red"
    if severity >= 2:
        return "yellow"
    return "green"


@router.get("/{room_id}/report")
async def get_room_report(
    room_id: UUID,
    db: AsyncSession = Depends(get_db),
    refresh: bool = False,
):
    room = await get_room_by_id(db, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")

    utterances = await get_utterances_by_room(db, room_id)
    hints = await get_hints_by_room(db, room_id)

    interviewer_words = 0
    candidate_words = 0
    utterance_list: list[dict] = []

    for u in utterances:
        word_count = len(u.text.split())
        speaker = u.speaker.lower()
        if "interviewer" in speaker or "интервьюер" in speaker:
            interviewer_words += word_count
        else:
            candidate_words += word_count

        utterance_list.append({
            "id": str(u.id),
            "speaker": u.speaker,
            "text": u.text,
            "confidence": u.confidence,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })

    hint_list: list[dict] = []
    red_count = 0
    yellow_count = 0
    green_count = 0
    for h in hints:
        color = _color_from_severity(h.color, h.severity)
        if color == "red":
            red_count += 1
        elif color == "yellow":
            yellow_count += 1
        elif color == "green":
            green_count += 1
        hint_list.append({
            "id": str(h.id),
            "text": h.text,
            "hint_type": h.hint_type,
            "title": h.title,
            "actionable_question": h.actionable_question,
            "severity": h.severity,
            "color": color,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        })

    total_words = interviewer_words + candidate_words
    interviewer_pct = round(
        (interviewer_words / total_words * 100) if total_words > 0 else 0, 1
    )
    candidate_pct = round(
        (candidate_words / total_words * 100) if total_words > 0 else 0, 1
    )

    duration_seconds = _compute_duration_seconds(
        room.created_at, room.ended_at, utterances
    )

    # Структурированный отчёт: достаём кеш или генерируем заново
    report_data = room.report_data if not refresh else None
    if not isinstance(report_data, dict):
        report_data = None
    elif report_data.get("schema_version") != REPORT_SCHEMA_VERSION:
        # Старая схема — пересгенерировать
        report_data = None

    if report_data is None and utterance_list:
        gen = await generate_structured_report(
            room_id=str(room_id),
            position=room.position,
            interview_context=room.interview_context,
        )
        if gen.get("success"):
            report_data = gen.get("report")
            if isinstance(report_data, dict):
                await save_report_data(db, room_id, report_data)

    return {
        "room": {
            "id": str(room.id),
            "status": room.status,
            "position": room.position,
            "interview_context": room.interview_context,
            "created_at": room.created_at.isoformat() if room.created_at else None,
            "ended_at": room.ended_at.isoformat() if room.ended_at else None,
            "duration_seconds": duration_seconds,
        },
        "statistics": {
            "total_utterances": len(utterance_list),
            "total_hints": len(hint_list),
            "interviewer_words": interviewer_words,
            "candidate_words": candidate_words,
            "interviewer_percent": interviewer_pct,
            "candidate_percent": candidate_pct,
            "red_count": red_count,
            "yellow_count": yellow_count,
            "green_count": green_count,
            "duration_seconds": duration_seconds,
        },
        "utterances": utterance_list,
        "hints": hint_list,
        "report": report_data,
        "summary": (report_data or {}).get("summary_text", "") if report_data else "",
    }

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.room_service import get_room_by_id
from app.services.utterance_service import get_utterances_by_room
from app.services.hint_service import get_hints_by_room
from app.services.ai_hints_service import generate_interview_summary

router = APIRouter()


@router.get("/{room_id}/report")
async def get_room_report(
    room_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    room = await get_room_by_id(db, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")

    utterances = await get_utterances_by_room(db, room_id)
    hints = await get_hints_by_room(db, room_id)

    interviewer_words = 0
    candidate_words = 0
    utterance_list = []

    for u in utterances:
        word_count = len(u.text.split())
        speaker = u.speaker
        if "interviewer" in speaker.lower():
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

    hint_list = []
    for h in hints:
        hint_list.append({
            "id": str(h.id),
            "text": h.text,
            "hint_type": h.hint_type,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        })

    total_words = interviewer_words + candidate_words
    interviewer_pct = round(
        (interviewer_words / total_words * 100) if total_words > 0 else 0, 1
    )
    candidate_pct = round(
        (candidate_words / total_words * 100) if total_words > 0 else 0, 1
    )

    summary_result = await generate_interview_summary(room_id=str(room_id))
    summary_text = summary_result.get("summary", "") if summary_result.get("success") else ""

    return {
        "room": {
            "id": str(room.id),
            "status": room.status,
            "position": room.position,
            "created_at": room.created_at.isoformat() if room.created_at else None,
            "ended_at": room.ended_at.isoformat() if room.ended_at else None,
        },
        "statistics": {
            "total_utterances": len(utterance_list),
            "total_hints": len(hint_list),
            "interviewer_words": interviewer_words,
            "candidate_words": candidate_words,
            "interviewer_percent": interviewer_pct,
            "candidate_percent": candidate_pct,
        },
        "utterances": utterance_list,
        "hints": hint_list,
        "summary": summary_text,
    }

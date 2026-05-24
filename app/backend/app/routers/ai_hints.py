from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.ai_hints_service import generate_hint, generate_interview_summary
from app.services.hint_service import create_hint

router = APIRouter()


class HintRequest(BaseModel):
    room_id: str
    text: str
    speaker_role: str = "candidate"
    position: str | None = None
    interview_context: str | None = None


class SummaryRequest(BaseModel):
    room_id: str


@router.post("/hint")
async def get_hint(
    request: HintRequest,
    db: AsyncSession = Depends(get_db),
):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    result = await generate_hint(
        room_id=request.room_id,
        transcription_text=request.text,
        speaker_role=request.speaker_role,
        position=request.position,
        interview_context=request.interview_context,
    )

    if not result["success"]:
        raise HTTPException(
            status_code=500, detail=result.get("error", "Unknown error")
        )

    if result.get("skipped"):
        return {
            "id": None,
            "skipped": True,
            "skip_reason": result.get("skip_reason"),
            "hint": "",
            "hint_type": None,
            "severity": None,
            "color": None,
            "title": "",
            "actionable_question": "",
            "tokens_used": result.get("tokens_used", 0),
        }

    hint_db_id = None
    try:
        room_uuid = UUID(request.room_id)
        hint_row = await create_hint(
            db=db,
            room_id=room_uuid,
            text=result["hint"],
            hint_type=result.get("hint_type"),
            title=result.get("title"),
            actionable_question=result.get("actionable_question"),
            severity=result.get("severity"),
            color=result.get("color"),
        )
        hint_db_id = str(hint_row.id)
    except (ValueError, Exception) as e:
        print(f"[AI] Failed to save hint to DB: {e}")

    return {
        "id": hint_db_id,
        "skipped": False,
        "hint": result["hint"],
        "hint_type": result.get("hint_type"),
        "severity": result.get("severity"),
        "color": result.get("color"),
        "title": result.get("title", ""),
        "actionable_question": result.get("actionable_question", ""),
        "tokens_used": result.get("tokens_used", 0),
    }


@router.post("/summary")
async def get_summary(request: SummaryRequest):
    result = await generate_interview_summary(room_id=request.room_id)

    if not result["success"]:
        raise HTTPException(
            status_code=500, detail=result.get("error", "Unknown error")
        )

    return {"summary": result["summary"]}

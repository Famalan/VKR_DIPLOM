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
    position: str | None = None


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
        position=request.position,
    )

    if not result["success"]:
        raise HTTPException(
            status_code=500, detail=result.get("error", "Unknown error")
        )

    try:
        from uuid import UUID

        room_uuid = UUID(request.room_id)
        await create_hint(
            db=db,
            room_id=room_uuid,
            text=result["hint"],
            hint_type=result.get("hint_type"),
        )
    except (ValueError, Exception) as e:
        print(f"[AI] Failed to save hint to DB: {e}")

    return {
        "hint": result["hint"],
        "hint_type": result.get("hint_type"),
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

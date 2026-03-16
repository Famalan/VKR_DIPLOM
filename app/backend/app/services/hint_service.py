from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Hint


async def create_hint(
    db: AsyncSession,
    room_id: UUID,
    text: str,
    hint_type: str | None = None,
    triggered_by_utterance_id: UUID | None = None,
) -> Hint:
    hint = Hint(
        room_id=room_id,
        text=text,
        hint_type=hint_type,
        triggered_by_utterance_id=triggered_by_utterance_id,
    )
    db.add(hint)
    await db.commit()
    await db.refresh(hint)
    return hint


async def get_hints_by_room(db: AsyncSession, room_id: UUID) -> list[Hint]:
    result = await db.execute(
        select(Hint)
        .where(Hint.room_id == room_id)
        .order_by(Hint.created_at.asc())
    )
    return list(result.scalars().all())

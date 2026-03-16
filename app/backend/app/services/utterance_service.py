from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Utterance


async def create_utterance(
    db: AsyncSession,
    room_id: UUID,
    speaker: str,
    text: str,
    confidence: float | None = None,
) -> Utterance:
    utterance = Utterance(
        room_id=room_id,
        speaker=speaker,
        text=text,
        confidence=confidence,
    )
    db.add(utterance)
    await db.commit()
    await db.refresh(utterance)
    return utterance


async def get_utterances_by_room(
    db: AsyncSession, room_id: UUID
) -> list[Utterance]:
    result = await db.execute(
        select(Utterance)
        .where(Utterance.room_id == room_id)
        .order_by(Utterance.created_at.asc())
    )
    return list(result.scalars().all())

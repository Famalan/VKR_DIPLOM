from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Room


async def create_room(db: AsyncSession) -> Room:
    room = Room()
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room


async def get_room_by_id(db: AsyncSession, room_id: UUID) -> Room | None:
    result = await db.execute(select(Room).where(Room.id == room_id))
    return result.scalar_one_or_none()


async def update_room_status(db: AsyncSession, room_id: UUID, status: str) -> Room | None:
    room = await get_room_by_id(db, room_id)
    if room is None:
        return None
    
    room.status = status
    if status == "ended":
        room.ended_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(room)
    return room


async def get_all_rooms(db: AsyncSession) -> list[Room]:
    result = await db.execute(select(Room).order_by(Room.created_at.desc()))
    return list(result.scalars().all())

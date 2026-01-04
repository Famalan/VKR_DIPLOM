from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import RoomCreate, RoomResponse, RoomStatusUpdate
from app.services.room_service import (
    create_room,
    get_room_by_id,
    update_room_status,
    get_all_rooms
)

router = APIRouter()


@router.post("", response_model=RoomResponse)
async def create_new_room(
    room_data: RoomCreate,
    db: AsyncSession = Depends(get_db)
):
    room = await create_room(db)
    return room


@router.get("", response_model=list[RoomResponse])
async def list_rooms(db: AsyncSession = Depends(get_db)):
    rooms = await get_all_rooms(db)
    return rooms


@router.get("/{room_id}", response_model=RoomResponse)
async def get_room(room_id: UUID, db: AsyncSession = Depends(get_db)):
    room = await get_room_by_id(db, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@router.patch("/{room_id}/status", response_model=RoomResponse)
async def change_room_status(
    room_id: UUID,
    status_update: RoomStatusUpdate,
    db: AsyncSession = Depends(get_db)
):
    room = await update_room_status(db, room_id, status_update.status)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room

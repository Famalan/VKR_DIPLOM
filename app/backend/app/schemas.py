from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class RoomCreate(BaseModel):
    pass


class RoomResponse(BaseModel):
    id: UUID
    status: str
    created_at: datetime
    ended_at: datetime | None = None

    class Config:
        from_attributes = True


class RoomStatusUpdate(BaseModel):
    status: str

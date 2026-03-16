from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class RoomCreate(BaseModel):
    position: str | None = None


class RoomResponse(BaseModel):
    id: UUID
    status: str
    position: str | None = None
    created_at: datetime
    ended_at: datetime | None = None

    class Config:
        from_attributes = True


class RoomStatusUpdate(BaseModel):
    status: str


class ParticipantCreate(BaseModel):
    room_id: UUID
    role: str


class ParticipantResponse(BaseModel):
    id: UUID
    room_id: UUID
    role: str
    joined_at: datetime

    class Config:
        from_attributes = True


class UtteranceCreate(BaseModel):
    room_id: UUID
    speaker: str
    text: str
    confidence: float | None = None


class UtteranceResponse(BaseModel):
    id: UUID
    room_id: UUID
    speaker: str
    text: str
    confidence: float | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class HintCreate(BaseModel):
    room_id: UUID
    text: str
    hint_type: str | None = None
    triggered_by_utterance_id: UUID | None = None


class HintResponse(BaseModel):
    id: UUID
    room_id: UUID
    text: str
    hint_type: str | None = None
    triggered_by_utterance_id: UUID | None = None
    created_at: datetime

    class Config:
        from_attributes = True

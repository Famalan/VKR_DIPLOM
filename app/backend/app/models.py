import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Float, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Room(Base):
    __tablename__ = "rooms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(String, default="waiting")
    position = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<Room(id={self.id}, status={self.status})>"


class Participant(Base):
    __tablename__ = "participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id"), nullable=False)
    role = Column(String, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Participant(id={self.id}, role={self.role})>"


class Utterance(Base):
    __tablename__ = "utterances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id"), nullable=False)
    speaker = Column(String, nullable=False)
    text = Column(Text, nullable=False)
    confidence = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Utterance(id={self.id}, speaker={self.speaker})>"


class Hint(Base):
    __tablename__ = "hints"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id"), nullable=False)
    text = Column(Text, nullable=False)
    hint_type = Column(String, nullable=True)
    triggered_by_utterance_id = Column(
        UUID(as_uuid=True), ForeignKey("utterances.id"), nullable=True
    )
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Hint(id={self.id}, type={self.hint_type})>"

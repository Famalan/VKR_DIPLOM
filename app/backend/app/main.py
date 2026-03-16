from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import create_tables
from app.routers import rooms, transcription, ai_hints, livekit_token, report
from app.services.redis_service import close_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield
    await close_redis()


app = FastAPI(
    title="Interview Platform API",
    description="Video interview platform with AI analysis",
    version="0.2.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms.router, prefix="/api/rooms", tags=["rooms"])
app.include_router(livekit_token.router, prefix="/api/livekit", tags=["livekit"])
app.include_router(transcription.router, tags=["transcription"])
app.include_router(ai_hints.router, prefix="/api/ai", tags=["ai"])
app.include_router(report.router, prefix="/api/rooms", tags=["report"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}

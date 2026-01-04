from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_tables
from app.routers import rooms, signaling


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield


app = FastAPI(
    title="Interview Platform API",
    description="WebRTC video interview platform with AI analysis",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms.router, prefix="/api/rooms", tags=["rooms"])
app.include_router(signaling.router, tags=["signaling"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}

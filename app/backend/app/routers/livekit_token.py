from fastapi import APIRouter
from pydantic import BaseModel
from livekit import api

from app.config import settings

router = APIRouter()


class TokenRequest(BaseModel):
    room_id: str
    user_id: str
    role: str = "candidate"


class TokenResponse(BaseModel):
    token: str
    ws_url: str


@router.post("/token", response_model=TokenResponse)
async def create_token(request: TokenRequest):
    token = (
        api.AccessToken(
            api_key=settings.livekit_api_key,
            api_secret=settings.livekit_api_secret,
        )
        .with_identity(request.user_id)
        .with_name(request.role)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=request.room_id,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )

    ws_url = settings.livekit_url

    return TokenResponse(token=token, ws_url=ws_url)

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from livekit import api

from app.config import settings
from app.services.auth_service import verify_room_token

router = APIRouter()


class TokenRequest(BaseModel):
    room_id: str
    user_id: str
    role: str = "candidate"


class TokenResponse(BaseModel):
    token: str
    ws_url: str


@router.post("/token", response_model=TokenResponse)
async def create_token(
    request: TokenRequest,
    authorization: str = Header(None),
):
    effective_role = request.role

    if request.role == "interviewer":
        if not authorization:
            raise HTTPException(
                status_code=403,
                detail="Для входа как интервьюер необходим токен комнаты",
            )

        raw_token = authorization
        if authorization.startswith("Bearer "):
            raw_token = authorization[7:]

        payload = verify_room_token(raw_token)

        if payload.get("room_id") != request.room_id:
            raise HTTPException(
                status_code=403,
                detail="Токен не соответствует комнате",
            )

        if payload.get("role") != "interviewer":
            raise HTTPException(
                status_code=403,
                detail="Токен не предоставляет роль интервьюера",
            )

        effective_role = "interviewer"

    token = (
        api.AccessToken(
            api_key=settings.livekit_api_key,
            api_secret=settings.livekit_api_secret,
        )
        .with_identity(request.user_id)
        .with_name(effective_role)
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

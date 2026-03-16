import datetime

import jwt
from fastapi import HTTPException, Header

from app.config import settings


def create_room_token(room_id: str, role: str = "interviewer") -> str:
    payload = {
        "room_id": room_id,
        "role": role,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=8),
        "iat": datetime.datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def verify_room_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_room(authorization: str = Header(None)) -> dict | None:
    if not authorization:
        return None

    token = authorization
    if authorization.startswith("Bearer "):
        token = authorization[7:]

    return verify_room_token(token)

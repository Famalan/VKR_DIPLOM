import json
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.transcription_service import create_grpc_stream
from app.services.redis_service import append_to_list

router = APIRouter()


@router.websocket("/ws/transcribe/{room_id}/{user_id}")
async def transcription_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    print(f"[STT] Connection opened: {room_id}:{user_id}")

    async def on_result(text: str, is_final: bool, confidence: float):
        try:
            await websocket.send_json({
                "type": "transcription",
                "userId": user_id,
                "text": text,
                "isFinal": is_final,
                "confidence": confidence,
            })

            if is_final and text.strip():
                utterance_data = json.dumps({
                    "speaker": user_id,
                    "text": text,
                    "confidence": confidence,
                })
                await append_to_list(f"room:{room_id}:utterances", utterance_data)

        except Exception as e:
            print(f"[STT] Send error: {e}")

    async def on_error(message: str):
        try:
            await websocket.send_json({
                "type": "error",
                "message": message,
            })
        except Exception:
            pass

    request_queue = None
    done_event = None

    try:
        print(f"[STT] Starting gRPC stream for {room_id}:{user_id}")
        request_queue, done_event = await create_grpc_stream(on_result, on_error)
        print(f"[STT] gRPC stream created, waiting for audio data...")

        while True:
            data = await websocket.receive_bytes()
            if request_queue is not None:
                await request_queue.put(data)

    except WebSocketDisconnect:
        print(f"[STT] Connection closed: {room_id}:{user_id}")
    except Exception as e:
        print(f"[STT] Error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if request_queue is not None:
            await request_queue.put(None)
        if done_event is not None:
            await done_event.wait()

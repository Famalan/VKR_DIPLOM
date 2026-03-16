import asyncio
import json
import uuid
import traceback

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.transcription_service import run_single_grpc_stream
from app.services.redis_service import (
    append_to_list,
    publish,
    subscribe,
    increment_word_count,
    check_and_reset_throttle,
)
from app.services.ai_hints_service import generate_hint
from app.services.hint_service import create_hint
from app.database import async_session_maker

router = APIRouter()


ROLE_LABELS = {
    "interviewer": "Интервьюер",
    "candidate": "Кандидат",
}


@router.websocket("/ws/transcribe/{room_id}/{user_id}/{role}")
async def transcription_endpoint(
    websocket: WebSocket, room_id: str, user_id: str, role: str = "candidate"
):
    await websocket.accept()
    role_label = ROLE_LABELS.get(role, role)
    print(f"[STT] Connection opened: {room_id}:{user_id} ({role_label})", flush=True)

    audio_queue = asyncio.Queue()
    cancel_event = asyncio.Event()
    ws_closed = False

    async def process_ai_hint_background(text: str):
        try:
            hint_data = None
            for attempt in range(3):
                hint_data = await generate_hint(room_id, text, speaker_role="candidate")
                if hint_data.get("success"):
                    break
                print(f"[AI] Attempt {attempt + 1} failed: {hint_data.get('error')}", flush=True)
                if attempt < 2:
                    await asyncio.sleep(1)

            if not hint_data or not hint_data.get("success") or hint_data.get("skipped"):
                return

            async with async_session_maker() as session:
                db_hint = await create_hint(
                    db=session,
                    room_id=uuid.UUID(room_id),
                    text=hint_data.get("hint", ""),
                    hint_type=hint_data.get("hint_type"),
                    title=hint_data.get("title"),
                    actionable_question=hint_data.get("actionable_question"),
                )

                payload = {
                    "id": str(db_hint.id),
                    "dbId": str(db_hint.id),
                    "hintType": hint_data.get("hint_type"),
                    "title": hint_data.get("title", ""),
                    "actionableQuestion": hint_data.get("actionable_question", ""),
                    "text": hint_data.get("hint", ""),
                    "sourceText": text,
                    "tokensUsed": hint_data.get("tokens_used", 0),
                }

                await publish(f"room:{room_id}:hints", json.dumps(payload))
                print(f"[AI] Hint published to room:{room_id}:hints", flush=True)
        except Exception as e:
            print(f"[AI] Background hint error: {e}", flush=True)
            traceback.print_exc()

    async def on_result(text: str, is_final: bool, confidence: float):
        try:
            transcription_msg = {
                "type": "transcription",
                "userId": user_id,
                "role": role,
                "roleLabel": role_label,
                "text": text,
                "isFinal": is_final,
                "confidence": confidence,
            }

            await websocket.send_json(transcription_msg)

            if is_final and text.strip():
                await publish(
                    f"room:{room_id}:transcriptions",
                    json.dumps(transcription_msg),
                )

                utterance_data = json.dumps({
                    "speaker": role_label,
                    "role": role,
                    "text": text,
                    "confidence": confidence,
                })
                await append_to_list(f"room:{room_id}:utterances", utterance_data)

                if role == "candidate":
                    word_count = len(text.split())
                    total = await increment_word_count(room_id, word_count)
                    should_trigger = await check_and_reset_throttle(room_id)
                    print(f"[AI] Candidate final: words={word_count}, total={total}, trigger={should_trigger}", flush=True)
                    if should_trigger:
                        print(f"[AI] Triggering hint generation for: '{text[:50]}'", flush=True)
                        asyncio.create_task(process_ai_hint_background(text))
        except Exception as e:
            print(f"[STT] Send error: {e}", flush=True)

    async def on_error(message: str):
        try:
            await websocket.send_json({"type": "error", "message": message})
        except Exception:
            pass

    async def receive_audio():
        nonlocal ws_closed
        try:
            while True:
                data = await websocket.receive_bytes()
                await audio_queue.put(data)
        except WebSocketDisconnect:
            print(f"[STT] WS disconnected: {room_id}:{user_id}", flush=True)
        except Exception as e:
            print(f"[STT] WS receive error: {e}", flush=True)
        finally:
            ws_closed = True
            await audio_queue.put(None)

    async def listen_for_hints():
        try:
            async for message in subscribe(f"room:{room_id}:hints"):
                payload = json.loads(message)
                await websocket.send_json({"type": "hint", "payload": payload})
        except Exception:
            pass

    async def listen_for_transcriptions():
        try:
            async for message in subscribe(f"room:{room_id}:transcriptions"):
                msg = json.loads(message)
                if msg.get("userId") != user_id:
                    await websocket.send_json(msg)
        except Exception:
            pass

    recv_task = asyncio.create_task(receive_audio())

    hint_listener_task = None
    transcription_listener_task = None

    if role == "interviewer":
        hint_listener_task = asyncio.create_task(listen_for_hints())
        transcription_listener_task = asyncio.create_task(listen_for_transcriptions())

    try:
        while not ws_closed and not cancel_event.is_set():
            print(f"[STT] Starting gRPC stream for {room_id}:{user_id}", flush=True)

            await run_single_grpc_stream(
                audio_queue=audio_queue,
                on_result_callback=on_result,
                on_error_callback=on_error,
                cancel_event=cancel_event,
            )

            if ws_closed or cancel_event.is_set():
                break

            try:
                await websocket.send_json({"type": "reconnecting"})
                print("[STT] Reconnecting gRPC stream...", flush=True)
            except Exception:
                break

            await asyncio.sleep(0.3)

    except Exception as e:
        print(f"[STT] Error in reconnect loop: {e}", flush=True)
    finally:
        cancel_event.set()
        recv_task.cancel()
        if hint_listener_task is not None:
            hint_listener_task.cancel()
        if transcription_listener_task is not None:
            transcription_listener_task.cancel()
        try:
            await recv_task
        except asyncio.CancelledError:
            pass
        if hint_listener_task is not None:
            try:
                await hint_listener_task
            except asyncio.CancelledError:
                pass
        if transcription_listener_task is not None:
            try:
                await transcription_listener_task
            except asyncio.CancelledError:
                pass
        print(f"[STT] Session ended: {room_id}:{user_id}", flush=True)

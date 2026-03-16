import asyncio
import os
import uuid

import grpc
import httpx

from app.config import settings
from app.grpc_generated import recognition_pb2, recognition_pb2_grpc

SMARTSPEECH_GRPC_HOST = "smartspeech.sber.ru:443"
TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"

CERTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "certs")
SBER_CA_PATH = os.path.join(CERTS_DIR, "sber_root_ca.pem")


async def get_access_token() -> str:
    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        response = await client.post(
            TOKEN_URL,
            headers={
                "Authorization": f"Basic {settings.salute_speech_credentials}",
                "RqUID": str(uuid.uuid4()),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"scope": "SALUTE_SPEECH_PERS"},
        )
        response.raise_for_status()
        data = response.json()
        return data["access_token"]


def _build_options_request() -> recognition_pb2.RecognitionRequest:
    from google.protobuf.duration_pb2 import Duration

    options = recognition_pb2.RecognitionOptions(
        audio_encoding=recognition_pb2.RecognitionOptions.PCM_S16LE,
        sample_rate=16000,
        language="ru-RU",
        model="general",
        hypotheses_count=1,
        enable_partial_results=True,
        enable_multi_utterance=True,
        enable_profanity_filter=False,
        no_speech_timeout=Duration(seconds=7),
        max_speech_timeout=Duration(seconds=120),
    )
    return recognition_pb2.RecognitionRequest(options=options)


def _get_grpc_credentials():
    with open(SBER_CA_PATH, "rb") as f:
        root_certs = f.read()
    return grpc.ssl_channel_credentials(root_certificates=root_certs)


async def run_single_grpc_stream(
    audio_queue: asyncio.Queue,
    on_result_callback,
    on_error_callback,
    cancel_event: asyncio.Event,
):
    """
    Runs ONE gRPC recognition stream. Returns when the stream ends
    (timeout, error, or cancel). Does NOT consume the sentinel None
    from audio_queue — that is reserved for final shutdown only.
    """
    token = await get_access_token()
    print(f"[gRPC STT] Token obtained: {token[:20]}...", flush=True)

    inner_queue = asyncio.Queue()
    stream_done = asyncio.Event()

    async def request_iterator():
        yield _build_options_request()
        while True:
            try:
                chunk = await asyncio.wait_for(inner_queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                if cancel_event.is_set():
                    return
                continue
            if chunk is None:
                return
            yield recognition_pb2.RecognitionRequest(audio_chunk=chunk)

    async def pump_audio():
        while not cancel_event.is_set() and not stream_done.is_set():
            try:
                chunk = await asyncio.wait_for(audio_queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            if chunk is None:
                await inner_queue.put(None)
                cancel_event.set()
                return
            await inner_queue.put(chunk)
        await inner_queue.put(None)

    pump_task = asyncio.create_task(pump_audio())

    channel = None
    try:
        print(f"[gRPC STT] Connecting to {SMARTSPEECH_GRPC_HOST}...", flush=True)
        credentials = _get_grpc_credentials()
        channel = grpc.aio.secure_channel(SMARTSPEECH_GRPC_HOST, credentials)
        stub = recognition_pb2_grpc.SmartSpeechStub(channel)

        metadata = [("authorization", f"Bearer {token}")]
        response_stream = stub.Recognize(request_iterator(), metadata=metadata)
        print("[gRPC STT] Stream started", flush=True)

        async for response in response_stream:
            for result in response.results:
                text = result.normalized_text or result.text
                if text.strip():
                    print(f"[gRPC STT] eou={response.eou} text='{text.strip()}'", flush=True)
                    await on_result_callback(
                        text=text.strip(),
                        is_final=response.eou,
                        confidence=0.0,
                    )

        print("[gRPC STT] Stream ended normally (timeout or server close)", flush=True)
    except grpc.aio.AioRpcError as e:
        print(f"[gRPC STT] RPC error: {e.code()} - {e.details()}", flush=True)
        await on_error_callback(str(e.details()))
    except Exception as e:
        print(f"[gRPC STT] Stream error: {e}", flush=True)
        await on_error_callback(str(e))
    finally:
        stream_done.set()
        pump_task.cancel()
        try:
            await pump_task
        except asyncio.CancelledError:
            pass
        if channel:
            await channel.close()

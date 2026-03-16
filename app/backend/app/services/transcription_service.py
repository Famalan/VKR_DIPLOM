import asyncio
import os
import uuid

import grpc
import httpx

from app.config import settings
from app.grpc_generated import recognition_pb2, recognition_pb2_grpc

SMARTSPEECH_GRPC_HOST = "smartspeech.sber.ru:443"
TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"

_access_token: str | None = None

CERTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "certs")
SBER_CA_PATH = os.path.join(CERTS_DIR, "sber_root_ca.pem")


async def get_access_token() -> str:
    global _access_token

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
        _access_token = data["access_token"]
        return _access_token


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


async def create_grpc_stream(on_result_callback, on_error_callback):
    print("[gRPC STT] Getting access token...", flush=True)
    token = await get_access_token()
    print(f"[gRPC STT] Token obtained: {token[:20]}...", flush=True)

    request_queue = asyncio.Queue()
    done_event = asyncio.Event()

    async def request_iterator():
        yield _build_options_request()

        while True:
            chunk = await request_queue.get()
            if chunk is None:
                break
            yield recognition_pb2.RecognitionRequest(audio_chunk=chunk)

    async def run_stream():
        try:
            print(f"[gRPC STT] Connecting to {SMARTSPEECH_GRPC_HOST}...", flush=True)
            credentials = _get_grpc_credentials()
            channel = grpc.aio.secure_channel(SMARTSPEECH_GRPC_HOST, credentials)
            stub = recognition_pb2_grpc.SmartSpeechStub(channel)
            print("[gRPC STT] Channel created, starting Recognize stream...", flush=True)

            metadata = [("authorization", f"Bearer {token}")]

            response_stream = stub.Recognize(
                request_iterator(),
                metadata=metadata,
            )

            async for response in response_stream:
                for result in response.results:
                    text = result.normalized_text or result.text
                    if text.strip():
                        print(f"[gRPC STT] Result: eou={response.eou} text='{text.strip()}'", flush=True)
                        await on_result_callback(
                            text=text.strip(),
                            is_final=response.eou,
                            confidence=0.0,
                        )

            await channel.close()
        except grpc.aio.AioRpcError as e:
            print(f"[gRPC STT] RPC error: {e.code()} - {e.details()}")
            await on_error_callback(str(e.details()))
        except Exception as e:
            print(f"[gRPC STT] Stream error: {e}")
            await on_error_callback(str(e))
        finally:
            done_event.set()

    asyncio.create_task(run_stream())

    return request_queue, done_event

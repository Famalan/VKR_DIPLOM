import json
import time

import redis.asyncio as aioredis

from app.config import settings

_redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )
    return _redis_client


async def close_redis():
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None


async def set_with_ttl(key: str, value: str, ttl_seconds: int = 14400):
    r = await get_redis()
    await r.set(key, value, ex=ttl_seconds)


async def get_value(key: str) -> str | None:
    r = await get_redis()
    return await r.get(key)


async def append_to_list(key: str, value: str, ttl_seconds: int = 14400):
    r = await get_redis()
    await r.rpush(key, value)
    await r.expire(key, ttl_seconds)


async def get_list(key: str) -> list[str]:
    r = await get_redis()
    return await r.lrange(key, 0, -1)


async def delete_key(key: str):
    r = await get_redis()
    await r.delete(key)


async def publish(channel: str, message: str):
    r = await get_redis()
    await r.publish(channel, message)


async def subscribe(channel: str):
    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)
    try:
        async for msg in pubsub.listen():
            if msg["type"] == "message":
                yield msg["data"]
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()


async def increment_word_count(room_id: str, count: int) -> int:
    r = await get_redis()
    key = f"room:{room_id}:hint_word_count"
    new_val = await r.incrby(key, count)
    await r.expire(key, 14400)
    return new_val


async def check_and_reset_throttle(
    room_id: str, min_words: int = 3, min_interval_sec: float = 3.0
) -> bool:
    r = await get_redis()
    word_key = f"room:{room_id}:hint_word_count"
    time_key = f"room:{room_id}:last_hint_time"

    word_count = int(await r.get(word_key) or 0)
    last_time = float(await r.get(time_key) or 0)
    now = time.time()

    if word_count >= min_words and (now - last_time) >= min_interval_sec:
        await r.set(word_key, 0, ex=14400)
        await r.set(time_key, str(now), ex=14400)
        return True
    return False

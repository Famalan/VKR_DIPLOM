import json
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

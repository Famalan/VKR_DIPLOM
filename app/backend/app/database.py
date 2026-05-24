from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=True)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session_maker() as session:
        yield session


# Простые миграции "ALTER TABLE IF NOT EXISTS" для обратной совместимости
# с существующими БД, в которых ещё нет новых колонок.
_RUNTIME_MIGRATIONS = [
    "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS interview_context TEXT",
    "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS report_data JSONB",
    "ALTER TABLE hints ADD COLUMN IF NOT EXISTS severity INTEGER",
    "ALTER TABLE hints ADD COLUMN IF NOT EXISTS color VARCHAR",
]


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in _RUNTIME_MIGRATIONS:
            await conn.execute(text(stmt))

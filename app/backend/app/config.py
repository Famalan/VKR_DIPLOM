from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://interview:interview_secret@localhost:5432/interview_db"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    salute_speech_credentials: str
    gigachat_credentials: str
    redis_url: str = "redis://localhost:6379/0"
    livekit_api_key: str = "devkey"
    livekit_api_secret: str = "secret"
    livekit_url: str = "ws://localhost:7880"
    jwt_secret: str = "change-me-in-production"
    cors_origins: str = "http://localhost:3000"

    class Config:
        env_file = ("../.env", ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

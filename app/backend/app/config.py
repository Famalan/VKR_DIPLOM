from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://interview:interview_secret@localhost:5432/interview_db"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

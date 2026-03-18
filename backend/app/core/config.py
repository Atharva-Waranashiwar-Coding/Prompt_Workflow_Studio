from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Prompt Workflow Studio API"
    environment: str = "development"
    api_v1_prefix: str = "/api"
    database_url: str = "postgresql+psycopg://postgres:postgres@postgres:5432/prompt_workflow_studio"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    default_user_email: str = "dev@promptworkflow.local"
    default_user_name: str = "Dev User"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()

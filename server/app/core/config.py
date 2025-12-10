"""Configuration for VoiceAssist V2 backend.

Uses Pydantic settings so configuration can be provided via
environment variables or a local `.env` file as described in
docs/INFRASTRUCTURE_SETUP.md.

Compatible with both Pydantic v1 (BaseSettings) and v2 (pydantic-settings).
"""
from functools import lru_cache

try:
    # Pydantic v2
    from pydantic_settings import BaseSettings
    from pydantic import Field
except ImportError:
    # Pydantic v1
    from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    environment: str = Field("development", alias="VOICEASSIST_ENV")

    # OpenAI Cloud LLM Settings
    openai_api_key: str = Field(..., alias="OPENAI_API_KEY")
    openai_model: str = Field("gpt-4o", alias="OPENAI_MODEL")
    openai_timeout_sec: int = Field(30, alias="OPENAI_TIMEOUT_SEC")

    # Local LLM Settings (for PHI-safe inference)
    local_llm_url: str = Field("", alias="LOCAL_LLM_URL")
    local_llm_api_key: str = Field("", alias="LOCAL_LLM_API_KEY")
    local_llm_model: str = Field("local-clinical-llm", alias="LOCAL_LLM_MODEL")
    local_llm_timeout_sec: int = Field(15, alias="LOCAL_LLM_TIMEOUT_SEC")

    # Database
    database_url: str = Field(
        "postgresql+psycopg2://voiceassist:voiceassist@localhost:5432/voiceassist",
        alias="DATABASE_URL",
    )
    redis_url: str = Field("redis://localhost:6379/0", alias="REDIS_URL")
    qdrant_url: str = Field("http://localhost:6333", alias="QDRANT_URL")

    # Nextcloud Settings
    nextcloud_base_url: str = Field("http://localhost:8080", alias="NEXTCLOUD_BASE_URL")
    nextcloud_username: str = Field("", alias="NEXTCLOUD_USERNAME")
    nextcloud_password: str = Field("", alias="NEXTCLOUD_PASSWORD")
    nextcloud_default_calendar: str = Field("personal", alias="NEXTCLOUD_DEFAULT_CALENDAR")

    # OpenEvidence API Settings
    openevidence_api_key: str = Field("", alias="OPENEVIDENCE_API_KEY")
    openevidence_base_url: str = Field(
        "https://api.openevidence.com", alias="OPENEVIDENCE_BASE_URL"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # For Pydantic v2, populate_by_name allows using alias
        populate_by_name = True


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance.

    Using an LRU cache avoids re-parsing environment variables on every request.
    """
    return Settings()

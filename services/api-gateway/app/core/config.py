"""
Application configuration
"""

from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings"""

    # Application
    APP_NAME: str = "VoiceAssist API Gateway"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "development"

    # Database
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # Redis
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str

    @property
    def REDIS_URL(self) -> str:
        return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}"

    # Qdrant
    QDRANT_HOST: str = "qdrant"
    QDRANT_PORT: int = 6333

    @property
    def QDRANT_URL(self) -> str:
        return f"http://{self.QDRANT_HOST}:{self.QDRANT_PORT}"

    # Security
    SECRET_KEY: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    # Nextcloud
    NEXTCLOUD_URL: str = "http://nextcloud"
    NEXTCLOUD_ADMIN_USER: str = "admin"
    NEXTCLOUD_ADMIN_PASSWORD: str

    # OpenAI
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_TIMEOUT_SEC: int = 30

    # Local LLM (for PHI-safe inference)
    LOCAL_LLM_URL: Optional[str] = None
    LOCAL_LLM_API_KEY: Optional[str] = None
    LOCAL_LLM_MODEL: Optional[str] = None
    LOCAL_LLM_TIMEOUT_SEC: int = 15

    # Voice/TTS settings (wire-up placeholder)
    TTS_PROVIDER: Optional[str] = None  # e.g., "azure", "gcp", "elevenlabs"
    TTS_ENDPOINT: Optional[str] = None
    TTS_API_KEY: Optional[str] = None
    TTS_VOICE: Optional[str] = None
    VOICE_WS_MAX_INFLIGHT: int = 5

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Caching (Phase 7 Integration Improvements - P2.1)
    CACHE_ENABLED: bool = True
    CACHE_L1_MAX_SIZE: int = 1000  # Max entries in L1 cache
    CACHE_DEFAULT_TTL: int = 600  # Default TTL in seconds (10 minutes)

    model_config = SettingsConfigDict(
        env_file=".env", case_sensitive=True, extra="ignore"
    )


# Global settings instance
settings = Settings()

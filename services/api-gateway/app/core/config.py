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
    QDRANT_ENABLED: bool = True  # Set to False for local development without Qdrant
    QDRANT_HOST: str = "qdrant"
    QDRANT_PORT: int = 6333

    @property
    def QDRANT_URL(self) -> str:
        return f"http://{self.QDRANT_HOST}:{self.QDRANT_PORT}"

    # Security
    SECRET_KEY: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 5
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60

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

    # Specialized model adapters
    ENABLE_PUBMEDBERT_ADAPTER: bool = True
    ENABLE_BIOGPT_ADAPTER: bool = True
    PUBMEDBERT_MODEL_ID: Optional[str] = None
    BIOGPT_MODEL_ID: Optional[str] = None
    MODEL_SELECTION_DEFAULT: str = "gpt-4o"

    # Retrieval configuration
    ENABLE_QUERY_DECOMPOSITION: bool = True
    ENABLE_MULTI_HOP_RETRIEVAL: bool = True

    # Voice/TTS settings (wire-up placeholder)
    TTS_PROVIDER: Optional[str] = None  # e.g., "openai", "elevenlabs", "azure", "gcp"
    TTS_ENDPOINT: Optional[str] = None
    TTS_API_KEY: Optional[str] = None
    TTS_VOICE: Optional[str] = None
    VOICE_WS_MAX_INFLIGHT: int = 5

    # STT Provider settings
    STT_PROVIDER: Optional[str] = None  # e.g., "openai", "deepgram", "azure", "gcp"
    STT_ENDPOINT: Optional[str] = None

    # OpenAI Realtime API settings (voice mode with WebSocket)
    REALTIME_ENABLED: bool = True  # Enable Realtime API for voice sessions
    REALTIME_MODEL: str = "gpt-4o-realtime-preview-2024-10-01"  # Realtime model
    REALTIME_BASE_URL: str = "wss://api.openai.com/v1/realtime"  # WebSocket endpoint
    REALTIME_TOKEN_EXPIRY_SEC: int = 300  # 5 minutes for ephemeral tokens

    # Provider API Keys (for future STT/TTS integration)
    # IMPORTANT: These are sensitive credentials and should never be logged or exposed
    ELEVENLABS_API_KEY: Optional[str] = None  # ElevenLabs TTS provider
    DEEPGRAM_API_KEY: Optional[str] = None  # Deepgram STT provider
    GOOGLE_STUDIO_API_KEY: Optional[str] = None  # Google AI Studio provider
    DEEPSEEK_API_KEY: Optional[str] = None  # DeepSeek LLM provider

    # OAuth Providers (optional - leave empty to disable)
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_OAUTH_REDIRECT_URI: Optional[str] = None

    MICROSOFT_CLIENT_ID: Optional[str] = None
    MICROSOFT_CLIENT_SECRET: Optional[str] = None
    MICROSOFT_OAUTH_REDIRECT_URI: Optional[str] = None

    # CORS (comma-separated list of allowed origins)
    ALLOWED_ORIGINS: str = (
        "https://asimo.io,https://dev.asimo.io,https://assist.asimo.io,http://localhost:3000,http://localhost:5173"
    )

    # Frontend URL (used for generating share links and other frontend-facing URLs)
    FRONTEND_URL: str = "http://localhost:5173"

    # Sentry Error Tracking
    SENTRY_DSN: Optional[str] = None  # Sentry DSN for error tracking
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1  # 10% of requests traced
    SENTRY_PROFILES_SAMPLE_RATE: float = 0.1  # 10% of traced requests profiled

    # OpenTelemetry / Tracing
    OTLP_ENDPOINT: Optional[str] = None  # OTLP collector endpoint
    OTLP_INSECURE: bool = True  # Set to False for TLS in production
    JAEGER_HOST: Optional[str] = None  # Jaeger agent hostname
    JAEGER_PORT: int = 6831  # Jaeger agent port
    TRACING_ENABLED: bool = True  # Enable/disable distributed tracing

    # Caching (Phase 7 Integration Improvements - P2.1)
    CACHE_ENABLED: bool = True
    CACHE_L1_MAX_SIZE: int = 1000  # Max entries in L1 cache
    CACHE_DEFAULT_TTL: int = 600  # Default TTL in seconds (10 minutes)

    # External evidence sources
    EXTERNAL_SYNC_ENABLED: bool = True
    EXTERNAL_SYNC_INTERVAL_MINUTES: int = 180
    OPENEVIDENCE_API_KEY: Optional[str] = None
    OPENEVIDENCE_BASE_URL: str = "https://api.openevidence.com"
    OPENEVIDENCE_SYNC_MINUTES: int = 240
    PUBMED_API_KEY: Optional[str] = None
    PUBMED_TOOL_EMAIL: Optional[str] = None
    PUBMED_SYNC_MINUTES: int = 180

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")


# Global settings instance
settings = Settings()

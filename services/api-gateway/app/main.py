"""
Main FastAPI application
"""

# Suppress CryptographyDeprecationWarning from pypdf ARC4 usage
# pypdf uses ARC4 (RC4) for older encrypted PDFs which triggers deprecation warnings
# This is a known issue: https://github.com/py-pdf/pypdf/issues/1536
# The warning is non-actionable for us as users of pypdf until they migrate to modern encryption
import warnings

try:
    from cryptography.utils import CryptographyDeprecationWarning

    warnings.filterwarnings("ignore", category=CryptographyDeprecationWarning, message=".*ARC4.*")  # nosec B608
except ImportError:
    pass  # cryptography not installed or no CryptographyDeprecationWarning

# Import business metrics to register them with Prometheus (P3.3)
import uvicorn
from app.api import (
    admin_attachments,
    admin_cache,
    admin_calendar_connections,
    admin_clinical,
    admin_conversations,
    admin_feature_flags,
    admin_folders,
    admin_integrations,
    admin_kb,
    admin_medical,
    admin_panel,
    admin_phi,
    admin_prompts,
    admin_system,
    admin_tools,
    admin_troubleshooting,
    admin_user_flag_overrides,
    admin_voice,
    attachments,
    auth,
    auth_2fa,
    auth_oauth,
    calendar_connections,
    clinical_context,
    conversations,
    experiments,
    export,
    external_medical,
    feature_flags_realtime,
    folders,
    health,
    integrations,
    medical_ai,
    metrics,
    realtime,
    sharing,
    user_api_keys,
    users,
    voice,
)

# This import registers business metrics with Prometheus  # noqa: F401
from app.core import business_metrics  # noqa: F401
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.middleware import MetricsMiddleware, RequestTracingMiddleware, SecurityHeadersMiddleware
from app.core.sentry import init_sentry
from app.middleware.voice_auth import VoiceAuthMiddleware
from app.services.external_connectors import ExternalSyncScheduler, OpenEvidenceConnector, PubMedConnector
from app.services.session_activity import session_activity_service
from app.services.token_revocation import token_revocation_service
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# Configure structured logging
configure_logging()
logger = get_logger(__name__)


# Create rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])


# Create FastAPI application with enhanced documentation
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    description="""
    VoiceAssist V2 - Enterprise Medical AI Assistant API

    ## Features
    - Health monitoring endpoints
    - Database connectivity checks (PostgreSQL, Redis, Qdrant)
    - Prometheus metrics
    - Structured logging with correlation IDs
    - Rate limiting for API protection
    - Circuit breaker pattern for resilience

    ## Security
    - Security headers (CSP, HSTS, X-Frame-Options)
    - Rate limiting on all endpoints
    - Request tracing with correlation IDs

    ## Authentication
    - JWT-based authentication with secure token management
    - User registration and login endpoints
    - Token refresh mechanism for extended sessions
    - Integration with Nextcloud for file storage
    """,
    contact={
        "name": "VoiceAssist Team",
        "email": "support@voiceassist.example.com",
    },
    license_info={
        "name": "Internal Use",
    },
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)


# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add custom middleware (order matters!)
# 1. Security headers should be added first
app.add_middleware(SecurityHeadersMiddleware)

# 2. Request tracing for correlation IDs
app.add_middleware(RequestTracingMiddleware)

# 3. Metrics middleware
app.add_middleware(MetricsMiddleware)

# 4. CORS middleware
# Parse ALLOWED_ORIGINS from environment (comma-separated string)
allowed_origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")]

if settings.DEBUG:
    allowed_origins.append("*")  # Allow all in development

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID"],
)

# 5. Voice auth middleware to validate voice session headers
app.add_middleware(VoiceAuthMiddleware)

# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(metrics.router)  # Prometheus metrics endpoint (Phase 7 - P2.1)
app.include_router(auth.router)
app.include_router(auth_2fa.router)  # Two-factor authentication
app.include_router(auth_oauth.router)  # OAuth providers (Google, Microsoft)
app.include_router(calendar_connections.router)  # Calendar connections API (user-facing)
app.include_router(users.router)
app.include_router(realtime.router)
app.include_router(conversations.router, prefix="/api")  # Phase 2 Week 10: Conversations & branching
app.include_router(voice.router, prefix="/api")  # Milestone 1 Phase 3: Voice features (transcription, TTS)
app.include_router(admin_kb.router)  # Phase 5: KB Management
app.include_router(integrations.router)  # Phase 6: Nextcloud integrations
app.include_router(admin_panel.router)  # Phase 7: Admin Panel API
app.include_router(admin_conversations.router)  # Admin Conversations API
app.include_router(admin_cache.router)  # Phase 7: Cache Management API (P2.1)
app.include_router(admin_feature_flags.router)  # Phase 7: Feature Flags API (P3.1)
app.include_router(admin_user_flag_overrides.router)  # Phase 4: User Flag Overrides API
app.include_router(experiments.router)  # Public experiments/feature flags API
app.include_router(feature_flags_realtime.router)  # Phase 3: Real-time flag updates via SSE
app.include_router(admin_voice.router)  # Sprint 1: Voice Admin API
app.include_router(admin_integrations.router)  # Sprint 2: Integrations Admin API
app.include_router(admin_phi.router)  # Sprint 3: PHI & Security Admin API
app.include_router(admin_clinical.router)  # Admin Clinical Context API (HIPAA)
app.include_router(admin_attachments.router)  # Admin Attachments API
app.include_router(admin_folders.router)  # Admin Folders API
app.include_router(admin_prompts.router)  # Prompt Management Admin API
app.include_router(admin_medical.router)  # Sprint 4: Medical AI Admin API
app.include_router(admin_system.router)  # Sprint 4: System Admin API
app.include_router(admin_tools.router)  # Sprint 6: Tools Admin API
app.include_router(admin_calendar_connections.router)  # Calendar connections admin API
app.include_router(admin_troubleshooting.router)  # Sprint 6: Troubleshooting Admin API
app.include_router(attachments.router, prefix="/api")  # Phase 8: File attachments in chat
app.include_router(clinical_context.router, prefix="/api")  # Phase 8: Clinical context
app.include_router(folders.router, prefix="/api")  # Phase 8: Conversation folders
app.include_router(export.router, prefix="/api")  # Phase 8: Conversation export
app.include_router(sharing.router, prefix="/api")  # Phase 8: Conversation sharing
app.include_router(external_medical.router, prefix="/api")  # Phase 3: External medical integrations
app.include_router(medical_ai.router)  # Phase 2 Deferred: Medical AI services
app.include_router(user_api_keys.router)  # User API key management


@app.on_event("startup")
async def startup_event():
    """Application startup tasks"""
    # Initialize Sentry error tracking (if configured)
    sentry_enabled = init_sentry()

    logger.info(
        "application_startup",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        debug=settings.DEBUG,
        sentry_enabled=sentry_enabled,
    )

    # Connect to Redis for token revocation and session tracking
    await token_revocation_service.connect()
    await session_activity_service.connect()
    logger.info(
        "session_services_initialized",
        inactivity_timeout_minutes=settings.SESSION_INACTIVITY_TIMEOUT_MINUTES,
        absolute_timeout_hours=settings.SESSION_ABSOLUTE_TIMEOUT_HOURS,
    )

    # Warm prompt cache for fast AI prompt lookups
    try:
        from app.services.prompt_service import prompt_service

        prompts_cached = await prompt_service.warm_cache()
        logger.info("prompt_cache_warmed", prompts_cached=prompts_cached)
    except Exception as e:
        logger.warning("prompt_cache_warm_failed", error=str(e))

    # Auto-register feature flags from shared definitions and warm cache (Phase 7 Enhancement)
    try:
        from app.core.flag_definitions import get_all_flags
        from app.services.feature_flags import feature_flag_service

        # Warm the feature flag cache
        flags_cached = await feature_flag_service.warm_cache()
        logger.info("feature_flag_cache_warmed", flags_cached=flags_cached)

        # Log flag definitions summary
        all_flags = get_all_flags()
        categories = {}
        for flag in all_flags:
            cat = flag.category.value
            categories[cat] = categories.get(cat, 0) + 1

        logger.info(
            "feature_flags_loaded",
            total_definitions=len(all_flags),
            categories=categories,
        )
    except Exception as e:
        logger.warning("feature_flag_init_failed", error=str(e))

    # FastAPI Cache disabled due to redis-py compatibility issues
    # TODO: Re-enable when fastapi-cache2 supports redis-py 5.x
    # FastAPICache.init(RedisBackend(redis_client), prefix="fastapi-cache")
    # logger.info("cache_initialized", backend="redis")

    logger.info("database_pool_configured", pool_size=20, max_overflow=40)
    logger.info("redis_pool_configured", max_connections=50)
    logger.info(
        "middleware_configured",
        middleware=["SecurityHeaders", "RequestTracing", "Metrics", "CORS"],
    )
    logger.info("rate_limiting_enabled", default_limit="100/minute")
    logger.info(
        "auth_system_enabled",
        jwt_algorithm=settings.JWT_ALGORITHM,
        token_expiry_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    )

    # Start periodic sync for external evidence sources when enabled
    if settings.EXTERNAL_SYNC_ENABLED and settings.ENVIRONMENT != "test":
        app.state.external_sync_scheduler = ExternalSyncScheduler(
            connectors=[
                OpenEvidenceConnector(
                    api_key=settings.OPENEVIDENCE_API_KEY,
                    base_url=settings.OPENEVIDENCE_BASE_URL,
                ),
                PubMedConnector(
                    api_key=settings.PUBMED_API_KEY,
                    tool_email=settings.PUBMED_TOOL_EMAIL,
                ),
            ],
            default_interval_minutes=settings.EXTERNAL_SYNC_INTERVAL_MINUTES,
            per_connector_intervals={
                "openevidence": settings.OPENEVIDENCE_SYNC_MINUTES,
                "pubmed": settings.PUBMED_SYNC_MINUTES,
            },
        )
        await app.state.external_sync_scheduler.start()


@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown tasks"""
    logger.info(
        "application_shutdown",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
    )

    # Disconnect session services
    await token_revocation_service.disconnect()
    await session_activity_service.disconnect()

    scheduler = getattr(app.state, "external_sync_scheduler", None)
    if scheduler:
        await scheduler.stop()


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",  # nosec B104 - intentional for Docker container
        port=8000,
        reload=settings.DEBUG,
    )

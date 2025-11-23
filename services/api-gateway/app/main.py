"""
Main FastAPI application
"""

# Import business metrics to register them with Prometheus (P3.3)
import uvicorn

# This import registers business metrics with Prometheus  # noqa: F401
from app.core import business_metrics  # noqa: F401
from app.api import (
    admin_cache,
    admin_feature_flags,
    admin_kb,
    admin_panel,
    auth,
    health,
    integrations,
    metrics,
    realtime,
    users,
)
from app.core.config import settings
from app.core.database import redis_client
from app.core.logging import configure_logging, get_logger
from app.core.middleware import MetricsMiddleware, RequestTracingMiddleware, SecurityHeadersMiddleware
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
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

# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(metrics.router)  # Prometheus metrics endpoint (Phase 7 - P2.1)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(realtime.router)
app.include_router(admin_kb.router)  # Phase 5: KB Management
app.include_router(integrations.router)  # Phase 6: Nextcloud integrations
app.include_router(admin_panel.router)  # Phase 7: Admin Panel API
app.include_router(admin_cache.router)  # Phase 7: Cache Management API (P2.1)
app.include_router(admin_feature_flags.router)  # Phase 7: Feature Flags API (P3.1)


@app.on_event("startup")
async def startup_event():
    """Application startup tasks"""
    logger.info(
        "application_startup",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        debug=settings.DEBUG,
    )

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


@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown tasks"""
    logger.info(
        "application_shutdown",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
    )


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
    )

"""Sentry error tracking and performance monitoring.

Provides centralized error tracking with:
- Automatic exception capture
- Performance tracing for requests
- Custom context for debugging
- Privacy-safe scrubbing of sensitive data
"""

from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Track initialization state
_sentry_initialized = False


def init_sentry() -> bool:
    """Initialize Sentry SDK if DSN is configured.

    Returns:
        True if Sentry was initialized, False otherwise
    """
    global _sentry_initialized

    if _sentry_initialized:
        return True

    if not settings.SENTRY_DSN:
        logger.info("sentry_disabled", reason="SENTRY_DSN not configured")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            release=f"voiceassist-api@{settings.APP_VERSION}",
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            profiles_sample_rate=settings.SENTRY_PROFILES_SAMPLE_RATE,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
                LoggingIntegration(
                    level=None,  # Capture all breadcrumbs
                    event_level=40,  # Only send ERROR and above as events
                ),
            ],
            # Privacy: scrub sensitive data
            send_default_pii=False,
            before_send=_scrub_sensitive_data,
            before_send_transaction=_scrub_transaction_data,
        )

        _sentry_initialized = True
        logger.info(
            "sentry_initialized",
            environment=settings.ENVIRONMENT,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        )
        return True

    except ImportError:
        logger.warning("sentry_import_error", reason="sentry-sdk not installed")
        return False
    except Exception as e:
        logger.error("sentry_init_error", error=str(e))
        return False


def _scrub_sensitive_data(event: dict, hint: dict) -> dict | None:
    """Scrub sensitive data before sending to Sentry.

    Removes:
    - Authorization headers
    - API keys
    - Passwords
    - PHI markers
    """
    if "request" in event:
        request = event["request"]

        # Scrub headers
        if "headers" in request:
            headers = request["headers"]
            sensitive_headers = ["authorization", "x-api-key", "cookie", "set-cookie"]
            for header in sensitive_headers:
                if header in headers:
                    headers[header] = "[REDACTED]"

        # Scrub query strings
        if "query_string" in request:
            request["query_string"] = _redact_params(request["query_string"])

        # Scrub body data
        if "data" in request and isinstance(request["data"], dict):
            request["data"] = _redact_dict(request["data"])

    # Scrub extra context
    if "extra" in event:
        event["extra"] = _redact_dict(event["extra"])

    return event


def _scrub_transaction_data(event: dict, hint: dict) -> dict | None:
    """Scrub sensitive data from transaction events."""
    # Remove user data from transactions
    if "user" in event:
        user = event["user"]
        # Keep only non-PII identifiers
        event["user"] = {"id": user.get("id")}

    return event


def _redact_params(params: str) -> str:
    """Redact sensitive query parameters."""
    sensitive_params = ["token", "api_key", "password", "secret", "key"]
    parts = params.split("&")
    result = []
    for part in parts:
        if "=" in part:
            key, _ = part.split("=", 1)
            if any(s in key.lower() for s in sensitive_params):
                result.append(f"{key}=[REDACTED]")
            else:
                result.append(part)
        else:
            result.append(part)
    return "&".join(result)


def _redact_dict(data: dict) -> dict:
    """Recursively redact sensitive dictionary values."""
    sensitive_keys = [
        "password",
        "token",
        "api_key",
        "secret",
        "authorization",
        "transcript",
        "content",
        "message",
    ]
    result = {}
    for key, value in data.items():
        if any(s in key.lower() for s in sensitive_keys):
            result[key] = "[REDACTED]"
        elif isinstance(value, dict):
            result[key] = _redact_dict(value)
        elif isinstance(value, list):
            result[key] = [_redact_dict(v) if isinstance(v, dict) else v for v in value]
        else:
            result[key] = value
    return result


def capture_voice_error(
    error: Exception,
    *,
    user_id: str | None = None,
    conversation_id: str | None = None,
    voice_status: str | None = None,
    extra: dict[str, Any] | None = None,
) -> str | None:
    """Capture a voice-related error to Sentry with context.

    Args:
        error: The exception to capture
        user_id: User identifier (no PII)
        conversation_id: Conversation identifier
        voice_status: Current voice session status
        extra: Additional context (will be scrubbed)

    Returns:
        Sentry event ID if captured, None otherwise
    """
    if not _sentry_initialized:
        return None

    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            scope.set_tag("feature", "voice")
            scope.set_tag("voice_status", voice_status or "unknown")

            if user_id:
                scope.set_user({"id": user_id})

            if conversation_id:
                scope.set_tag("conversation_id", conversation_id)

            if extra:
                # Scrub extra data before adding
                scrubbed = _redact_dict(extra)
                for key, value in scrubbed.items():
                    scope.set_extra(key, value)

            return sentry_sdk.capture_exception(error)

    except Exception as e:
        logger.warning("sentry_capture_error", error=str(e))
        return None


def capture_slo_violation(
    metric_name: str,
    actual_value: float,
    threshold: float,
    *,
    user_id: str | None = None,
    conversation_id: str | None = None,
) -> str | None:
    """Capture an SLO violation as a Sentry event.

    Args:
        metric_name: Name of the SLO metric
        actual_value: The measured value
        threshold: The SLO threshold that was violated
        user_id: User identifier
        conversation_id: Conversation identifier

    Returns:
        Sentry event ID if captured, None otherwise
    """
    if not _sentry_initialized:
        return None

    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            scope.set_tag("type", "slo_violation")
            scope.set_tag("metric", metric_name)
            scope.set_level("warning")

            if user_id:
                scope.set_user({"id": user_id})

            if conversation_id:
                scope.set_tag("conversation_id", conversation_id)

            scope.set_extra("actual_value", actual_value)
            scope.set_extra("threshold", threshold)
            scope.set_extra("exceeded_by", actual_value - threshold)

            msg = f"SLO violation: {metric_name} "
            msg += f"({actual_value:.0f}ms > {threshold:.0f}ms)"
            return sentry_sdk.capture_message(msg)

    except Exception as e:
        logger.warning("sentry_slo_capture_error", error=str(e))
        return None

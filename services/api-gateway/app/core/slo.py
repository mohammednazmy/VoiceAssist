"""Service Level Objectives (SLOs) for voice mode performance.

Defines thresholds for acceptable performance and provides
violation detection and alerting capabilities.

SLO Targets:
- Connection time: < 500ms (time to establish WebSocket)
- STT latency: < 300ms (speech-to-text processing)
- Response latency: < 1000ms (AI response generation)
- Session duration: informational only
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)


class SLOMetric(str, Enum):
    """Voice SLO metric names."""

    CONNECTION_TIME = "voice_connection_time_ms"
    STT_LATENCY = "voice_stt_latency_ms"
    RESPONSE_LATENCY = "voice_response_latency_ms"
    TIME_TO_FIRST_TRANSCRIPT = "voice_time_to_first_transcript_ms"


@dataclass(frozen=True)
class SLOThreshold:
    """SLO threshold configuration."""

    metric: SLOMetric
    warning_ms: float  # Warning threshold
    critical_ms: float  # Critical threshold (SLO breach)
    description: str


# Voice Mode SLO Thresholds
VOICE_SLO_THRESHOLDS: dict[SLOMetric, SLOThreshold] = {
    SLOMetric.CONNECTION_TIME: SLOThreshold(
        metric=SLOMetric.CONNECTION_TIME,
        warning_ms=400.0,
        critical_ms=500.0,
        description="WebSocket connection establishment time",
    ),
    SLOMetric.STT_LATENCY: SLOThreshold(
        metric=SLOMetric.STT_LATENCY,
        warning_ms=250.0,
        critical_ms=300.0,
        description="Speech-to-text processing latency",
    ),
    SLOMetric.RESPONSE_LATENCY: SLOThreshold(
        metric=SLOMetric.RESPONSE_LATENCY,
        warning_ms=800.0,
        critical_ms=1000.0,
        description="AI response generation latency",
    ),
    SLOMetric.TIME_TO_FIRST_TRANSCRIPT: SLOThreshold(
        metric=SLOMetric.TIME_TO_FIRST_TRANSCRIPT,
        warning_ms=500.0,
        critical_ms=700.0,
        description="Time from session start to first transcript",
    ),
}


@dataclass
class SLOViolation:
    """Represents an SLO violation."""

    metric: SLOMetric
    actual_ms: float
    threshold_ms: float
    severity: str  # "warning" or "critical"
    exceeded_by_ms: float
    description: str


def check_slo_violations(
    connection_time_ms: float | None = None,
    stt_latency_ms: float | None = None,
    response_latency_ms: float | None = None,
    time_to_first_transcript_ms: float | None = None,
) -> list[SLOViolation]:
    """Check metrics against SLO thresholds and return violations.

    Args:
        connection_time_ms: WebSocket connection time
        stt_latency_ms: Speech-to-text latency
        response_latency_ms: AI response latency
        time_to_first_transcript_ms: Time to first transcript

    Returns:
        List of SLO violations (empty if all within thresholds)
    """
    violations: list[SLOViolation] = []

    # Map metrics to their values
    metrics = {
        SLOMetric.CONNECTION_TIME: connection_time_ms,
        SLOMetric.STT_LATENCY: stt_latency_ms,
        SLOMetric.RESPONSE_LATENCY: response_latency_ms,
        SLOMetric.TIME_TO_FIRST_TRANSCRIPT: time_to_first_transcript_ms,
    }

    for metric, value in metrics.items():
        if value is None:
            continue

        threshold = VOICE_SLO_THRESHOLDS[metric]

        # Check critical first
        if value > threshold.critical_ms:
            violations.append(
                SLOViolation(
                    metric=metric,
                    actual_ms=value,
                    threshold_ms=threshold.critical_ms,
                    severity="critical",
                    exceeded_by_ms=value - threshold.critical_ms,
                    description=threshold.description,
                )
            )
        elif value > threshold.warning_ms:
            violations.append(
                SLOViolation(
                    metric=metric,
                    actual_ms=value,
                    threshold_ms=threshold.warning_ms,
                    severity="warning",
                    exceeded_by_ms=value - threshold.warning_ms,
                    description=threshold.description,
                )
            )

    return violations


def log_slo_violations(
    violations: list[SLOViolation],
    *,
    user_id: str | None = None,
    conversation_id: str | None = None,
) -> None:
    """Log SLO violations with appropriate severity.

    Args:
        violations: List of SLO violations to log
        user_id: User identifier for context
        conversation_id: Conversation identifier for context
    """
    for violation in violations:
        log_extra: dict[str, Any] = {
            "metric": violation.metric.value,
            "actual_ms": violation.actual_ms,
            "threshold_ms": violation.threshold_ms,
            "exceeded_by_ms": violation.exceeded_by_ms,
            "severity": violation.severity,
        }

        if user_id:
            log_extra["user_id"] = user_id
        if conversation_id:
            log_extra["conversation_id"] = conversation_id

        if violation.severity == "critical":
            logger.error(
                f"slo_violation_{violation.metric.value}",
                extra=log_extra,
            )
        else:
            logger.warning(
                f"slo_warning_{violation.metric.value}",
                extra=log_extra,
            )


def get_slo_status(
    connection_time_ms: float | None = None,
    stt_latency_ms: float | None = None,
    response_latency_ms: float | None = None,
) -> dict[str, Any]:
    """Get current SLO status summary.

    Returns a dictionary with:
    - healthy: True if all metrics within thresholds
    - violations_count: Number of threshold violations
    - metrics: Individual metric status
    """
    violations = check_slo_violations(
        connection_time_ms=connection_time_ms,
        stt_latency_ms=stt_latency_ms,
        response_latency_ms=response_latency_ms,
    )

    critical_count = sum(1 for v in violations if v.severity == "critical")
    warning_count = sum(1 for v in violations if v.severity == "warning")

    return {
        "healthy": len(violations) == 0,
        "critical_count": critical_count,
        "warning_count": warning_count,
        "violations": [
            {
                "metric": v.metric.value,
                "severity": v.severity,
                "actual_ms": v.actual_ms,
                "threshold_ms": v.threshold_ms,
            }
            for v in violations
        ],
        "thresholds": {
            metric.value: {
                "warning_ms": threshold.warning_ms,
                "critical_ms": threshold.critical_ms,
            }
            for metric, threshold in VOICE_SLO_THRESHOLDS.items()
        },
    }

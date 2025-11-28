"""Admin PHI & Security API endpoints (Sprint 3).

Provides comprehensive PHI (Protected Health Information) management for the Admin Panel:
- PHI detection rule configuration
- PHI detection testing and preview
- Detection statistics and audit logs
- Routing configuration (local vs cloud for PHI-containing queries)

HIPAA Compliance: This module allows admins to configure and monitor PHI handling
to ensure compliance with HIPAA regulations. All actions are audit logged.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from app.core.api_envelope import error_response, success_response
from app.core.database import get_db, redis_client
from app.core.dependencies import get_current_admin_user
from app.middleware.phi_redaction import PHI_PATTERNS, redact_phi
from app.models.audit_log import AuditLog
from app.services.phi_detector import PHIDetector
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/phi", tags=["admin", "phi", "security"])

# Redis keys for PHI configuration
REDIS_PHI_RULES_KEY = "voiceassist:phi:rules"
REDIS_PHI_ROUTING_KEY = "voiceassist:phi:routing"
REDIS_PHI_STATS_KEY = "voiceassist:phi:stats"

# Global PHI detector instance
_phi_detector = PHIDetector()


# ============================================================================
# Pydantic Models
# ============================================================================


class PHIRuleStatus(str, Enum):
    """Status of a PHI detection rule."""

    ENABLED = "enabled"
    DISABLED = "disabled"


class PHIRuleType(str, Enum):
    """Type of PHI that a rule detects."""

    SSN = "ssn"
    PHONE = "phone"
    EMAIL = "email"
    MRN = "mrn"
    ACCOUNT = "account"
    IP_ADDRESS = "ip_address"
    URL = "url"
    DOB = "dob"
    NAME = "name"
    ADDRESS = "address"
    CREDIT_CARD = "credit_card"


class PHIRoutingMode(str, Enum):
    """Routing mode when PHI is detected."""

    LOCAL_ONLY = "local_only"  # Always use local LLM for PHI queries
    CLOUD_ALLOWED = "cloud_allowed"  # Allow cloud with redaction
    HYBRID = "hybrid"  # Local for high-confidence, cloud for low


class PHIRule(BaseModel):
    """PHI detection rule configuration."""

    id: str
    name: str
    description: str
    phi_type: PHIRuleType
    status: PHIRuleStatus = PHIRuleStatus.ENABLED
    pattern: Optional[str] = None  # Regex pattern (read-only for built-in rules)
    is_builtin: bool = True
    detection_count: int = 0
    last_detection: Optional[str] = None


class PHIRuleUpdate(BaseModel):
    """Update a PHI detection rule."""

    status: PHIRuleStatus


class PHITestRequest(BaseModel):
    """Request to test PHI detection."""

    text: str = Field(..., min_length=1, max_length=10000)
    include_redacted: bool = True


class PHITestResult(BaseModel):
    """Result of PHI detection test."""

    contains_phi: bool
    phi_types: List[str]
    confidence: float
    details: Dict[str, Any]
    redacted_text: Optional[str] = None


class PHIRoutingConfig(BaseModel):
    """PHI routing configuration."""

    mode: PHIRoutingMode = PHIRoutingMode.LOCAL_ONLY
    confidence_threshold: float = Field(0.7, ge=0.0, le=1.0)
    local_llm_enabled: bool = False
    local_llm_url: Optional[str] = None
    redact_before_cloud: bool = True
    audit_all_phi: bool = True


class PHIRoutingUpdate(BaseModel):
    """Update PHI routing configuration."""

    mode: Optional[PHIRoutingMode] = None
    confidence_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    redact_before_cloud: Optional[bool] = None
    audit_all_phi: Optional[bool] = None


class PHIStats(BaseModel):
    """PHI detection statistics."""

    total_detections: int
    detections_today: int
    detections_this_week: int
    by_type: Dict[str, int]
    by_day: List[Dict[str, Any]]
    routing_stats: Dict[str, int]


class PHIEvent(BaseModel):
    """A PHI detection event."""

    id: str
    timestamp: str
    phi_types: List[str]
    confidence: float
    action_taken: str  # e.g., "routed_local", "redacted_cloud", "blocked"
    user_id: Optional[str] = None
    session_id: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================


def get_builtin_rules() -> List[PHIRule]:
    """Get all built-in PHI detection rules."""
    rules = []

    # Pattern-based rules from PHI_PATTERNS
    pattern_descriptions = {
        "ssn": ("Social Security Number", "Detects SSN in xxx-xx-xxxx or xxxxxxxxx format"),
        "phone": ("Phone Number", "Detects US phone numbers in various formats"),
        "email": ("Email Address", "Detects email addresses"),
        "mrn": ("Medical Record Number", "Detects MRN patterns with labels"),
        "account": ("Account Number", "Detects account numbers with labels"),
        "ip_address": ("IP Address", "Detects IPv4 addresses"),
        "url": ("URL", "Detects HTTP/HTTPS URLs"),
        "dob": ("Date of Birth", "Detects DOB with context keywords"),
        "credit_card": ("Credit Card Number", "Detects credit card numbers"),
        "address": ("Street Address", "Detects street addresses"),
    }

    for phi_type, (name, description) in pattern_descriptions.items():
        # Get pattern if it exists
        pattern = None
        if phi_type in PHI_PATTERNS:
            pattern = PHI_PATTERNS[phi_type].pattern

        rules.append(
            PHIRule(
                id=f"builtin_{phi_type}",
                name=name,
                description=description,
                phi_type=PHIRuleType(phi_type) if phi_type in [t.value for t in PHIRuleType] else PHIRuleType.SSN,
                pattern=pattern,
                is_builtin=True,
            )
        )

    # Add name detection rule (uses different pattern)
    rules.append(
        PHIRule(
            id="builtin_name",
            name="Personal Name",
            description="Detects potential personal names (capitalized word pairs)",
            phi_type=PHIRuleType.NAME,
            pattern=r"\b[A-Z][a-z]+ [A-Z][a-z]+\b",
            is_builtin=True,
        )
    )

    return rules


def get_rule_status(rule_id: str) -> PHIRuleStatus:
    """Get the status of a rule from Redis."""
    try:
        status = redis_client.hget(REDIS_PHI_RULES_KEY, rule_id)
        if status:
            return PHIRuleStatus(status)
    except Exception as e:
        logger.warning(f"Failed to get rule status from Redis: {e}")
    return PHIRuleStatus.ENABLED


def set_rule_status(rule_id: str, status: PHIRuleStatus) -> None:
    """Set the status of a rule in Redis."""
    try:
        redis_client.hset(REDIS_PHI_RULES_KEY, rule_id, status.value)
    except Exception as e:
        logger.error(f"Failed to set rule status in Redis: {e}")
        raise HTTPException(status_code=500, detail="Failed to update rule status")


def get_routing_config() -> PHIRoutingConfig:
    """Get PHI routing configuration from Redis."""
    try:
        config_str = redis_client.get(REDIS_PHI_ROUTING_KEY)
        if config_str:
            import json

            config_dict = json.loads(config_str)
            return PHIRoutingConfig(**config_dict)
    except Exception as e:
        logger.warning(f"Failed to get routing config from Redis: {e}")
    return PHIRoutingConfig()


def set_routing_config(config: PHIRoutingConfig) -> None:
    """Set PHI routing configuration in Redis."""
    try:
        import json

        redis_client.set(REDIS_PHI_ROUTING_KEY, json.dumps(config.model_dump()))
    except Exception as e:
        logger.error(f"Failed to set routing config in Redis: {e}")
        raise HTTPException(status_code=500, detail="Failed to update routing config")


def increment_detection_stat(phi_type: str) -> None:
    """Increment detection statistics in Redis."""
    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        redis_client.hincrby(f"{REDIS_PHI_STATS_KEY}:total", phi_type, 1)
        redis_client.hincrby(f"{REDIS_PHI_STATS_KEY}:daily:{today}", phi_type, 1)
        redis_client.hincrby(f"{REDIS_PHI_STATS_KEY}:total", "all", 1)
    except Exception as e:
        logger.warning(f"Failed to increment detection stat: {e}")


def log_phi_detection_audit(
    db: Session,
    phi_types: List[str],
    action: str,
    user_id: Optional[str] = None,
    details: Optional[Dict] = None,
) -> None:
    """Log PHI detection to audit log."""
    try:
        audit_entry = AuditLog(
            action="phi_detection",
            resource_type="phi",
            resource_id=None,
            user_id=user_id,
            details={
                "phi_types": phi_types,
                "action_taken": action,
                **(details or {}),
            },
            ip_address=None,
        )
        db.add(audit_entry)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to log PHI detection audit: {e}")
        db.rollback()


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/rules")
async def list_phi_rules(
    admin_user=Depends(get_current_admin_user),
) -> Dict[str, Any]:
    """List all PHI detection rules with their status.

    Returns both built-in rules and any custom rules.
    """
    rules = get_builtin_rules()

    # Apply status from Redis
    for rule in rules:
        rule.status = get_rule_status(rule.id)

    return success_response(
        data={
            "rules": [rule.model_dump() for rule in rules],
            "total": len(rules),
            "enabled": sum(1 for r in rules if r.status == PHIRuleStatus.ENABLED),
        }
    )


@router.get("/rules/{rule_id}")
async def get_phi_rule(
    rule_id: str,
    admin_user=Depends(get_current_admin_user),
) -> Dict[str, Any]:
    """Get details of a specific PHI detection rule."""
    rules = get_builtin_rules()
    rule = next((r for r in rules if r.id == rule_id), None)

    if not rule:
        raise HTTPException(status_code=404, detail=f"Rule '{rule_id}' not found")

    rule.status = get_rule_status(rule.id)

    return success_response(data=rule.model_dump())


@router.put("/rules/{rule_id}")
async def update_phi_rule(
    rule_id: str,
    update: PHIRuleUpdate,
    admin_user=Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Update a PHI detection rule (enable/disable).

    Built-in rules can only be enabled or disabled, not modified.
    """
    rules = get_builtin_rules()
    rule = next((r for r in rules if r.id == rule_id), None)

    if not rule:
        raise HTTPException(status_code=404, detail=f"Rule '{rule_id}' not found")

    # Update status
    set_rule_status(rule_id, update.status)
    rule.status = update.status

    # Audit log
    log_phi_detection_audit(
        db,
        phi_types=[rule.phi_type.value],
        action=f"rule_{update.status.value}",
        user_id=str(admin_user.id) if admin_user else None,
        details={"rule_id": rule_id},
    )

    logger.info(f"PHI rule '{rule_id}' updated to {update.status.value} by admin")

    return success_response(
        data=rule.model_dump(),
        message=f"Rule '{rule.name}' has been {update.status.value}",
    )


@router.post("/test")
async def test_phi_detection(
    request: PHITestRequest,
    admin_user=Depends(get_current_admin_user),
) -> Dict[str, Any]:
    """Test PHI detection on provided text.

    This endpoint allows admins to test the PHI detection system
    without affecting any user data or statistics.
    """
    # Run detection
    result = _phi_detector.detect(request.text)

    # Optionally get redacted text
    redacted_text = None
    if request.include_redacted and result.contains_phi:
        redacted_text = _phi_detector.sanitize(request.text)

    return success_response(
        data=PHITestResult(
            contains_phi=result.contains_phi,
            phi_types=result.phi_types,
            confidence=result.confidence,
            details=result.details,
            redacted_text=redacted_text,
        ).model_dump()
    )


@router.post("/redact")
async def redact_phi_text(
    request: PHITestRequest,
    admin_user=Depends(get_current_admin_user),
) -> Dict[str, Any]:
    """Redact PHI from provided text.

    Returns the text with all detected PHI replaced with redaction markers.
    """
    redacted = redact_phi(request.text)
    original_length = len(request.text)
    redacted_length = len(redacted)

    # Count redactions
    redaction_count = redacted.count("[REDACTED]")

    return success_response(
        data={
            "original_length": original_length,
            "redacted_length": redacted_length,
            "redaction_count": redaction_count,
            "redacted_text": redacted,
        }
    )


@router.get("/routing")
async def get_phi_routing(
    admin_user=Depends(get_current_admin_user),
) -> Dict[str, Any]:
    """Get current PHI routing configuration.

    Routing determines how queries containing PHI are processed:
    - local_only: Always use local LLM (most secure)
    - cloud_allowed: Allow cloud with redaction
    - hybrid: Use local for high-confidence PHI, cloud for low
    """
    config = get_routing_config()

    return success_response(data=config.model_dump())


@router.patch("/routing")
async def update_phi_routing(
    update: PHIRoutingUpdate,
    admin_user=Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Update PHI routing configuration.

    Changes affect how future queries with PHI are processed.
    """
    current = get_routing_config()

    # Apply updates
    if update.mode is not None:
        current.mode = update.mode
    if update.confidence_threshold is not None:
        current.confidence_threshold = update.confidence_threshold
    if update.redact_before_cloud is not None:
        current.redact_before_cloud = update.redact_before_cloud
    if update.audit_all_phi is not None:
        current.audit_all_phi = update.audit_all_phi

    set_routing_config(current)

    # Audit log
    log_phi_detection_audit(
        db,
        phi_types=[],
        action="routing_config_updated",
        user_id=str(admin_user.id) if admin_user else None,
        details=update.model_dump(exclude_none=True),
    )

    logger.info(f"PHI routing config updated by admin: {update.model_dump(exclude_none=True)}")

    return success_response(
        data=current.model_dump(),
        message="PHI routing configuration updated",
    )


@router.get("/stats")
async def get_phi_stats(
    days: int = Query(7, ge=1, le=90),
    admin_user=Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get PHI detection statistics.

    Returns detection counts by type, by day, and routing statistics.
    """
    stats = PHIStats(
        total_detections=0,
        detections_today=0,
        detections_this_week=0,
        by_type={},
        by_day=[],
        routing_stats={
            "routed_local": 0,
            "redacted_cloud": 0,
            "blocked": 0,
        },
    )

    try:
        # Get total by type from Redis
        totals = redis_client.hgetall(f"{REDIS_PHI_STATS_KEY}:total")
        if totals:
            stats.total_detections = int(totals.get("all", 0))
            stats.by_type = {k: int(v) for k, v in totals.items() if k != "all"}

        # Get daily stats
        today = datetime.now(timezone.utc)
        for i in range(days):
            day = (today - timedelta(days=i)).strftime("%Y-%m-%d")
            daily = redis_client.hgetall(f"{REDIS_PHI_STATS_KEY}:daily:{day}")
            if daily:
                total = sum(int(v) for v in daily.values())
                stats.by_day.append(
                    {
                        "date": day,
                        "count": total,
                        "by_type": {k: int(v) for k, v in daily.items()},
                    }
                )

                if i == 0:
                    stats.detections_today = total
                if i < 7:
                    stats.detections_this_week += total

        # Sort by_day chronologically
        stats.by_day.sort(key=lambda x: x["date"])

    except Exception as e:
        logger.error(f"Failed to get PHI stats from Redis: {e}")

    # Get routing stats from audit logs
    try:
        one_week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        routing_counts = (
            db.query(
                func.json_extract(AuditLog.details, "$.action_taken").label("action"),
                func.count().label("count"),
            )
            .filter(
                AuditLog.action == "phi_detection",
                AuditLog.created_at >= one_week_ago,
            )
            .group_by(func.json_extract(AuditLog.details, "$.action_taken"))
            .all()
        )
        for action, count in routing_counts:
            if action and action.strip('"') in stats.routing_stats:
                stats.routing_stats[action.strip('"')] = count
    except Exception as e:
        logger.warning(f"Failed to get routing stats from audit logs: {e}")

    return success_response(data=stats.model_dump())


@router.get("/events")
async def get_phi_events(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin_user=Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get recent PHI detection events from audit logs.

    Returns a paginated list of PHI detection events.
    """
    try:
        # Query audit logs for PHI detections
        query = db.query(AuditLog).filter(AuditLog.action == "phi_detection").order_by(desc(AuditLog.created_at))

        total = query.count()
        events = query.offset(offset).limit(limit).all()

        event_list = []
        for event in events:
            details = event.details or {}
            event_list.append(
                PHIEvent(
                    id=str(event.id),
                    timestamp=event.created_at.isoformat() if event.created_at else "",
                    phi_types=details.get("phi_types", []),
                    confidence=details.get("confidence", 0.0),
                    action_taken=details.get("action_taken", "unknown"),
                    user_id=event.user_id,
                    session_id=details.get("session_id"),
                ).model_dump()
            )

        return success_response(
            data={
                "events": event_list,
                "total": total,
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        logger.error(f"Failed to get PHI events: {e}")
        return error_response(
            code="PHI_EVENTS_ERROR",
            message="Failed to retrieve PHI events",
            status_code=500,
        )


@router.get("/health")
async def get_phi_health(
    admin_user=Depends(get_current_admin_user),
) -> Dict[str, Any]:
    """Get PHI detection system health status.

    Returns status of all PHI-related components.
    """
    health = {
        "detector": "healthy",
        "redis_config": "unknown",
        "local_llm": "not_configured",
        "audit_logging": "healthy",
    }

    # Check Redis config access
    try:
        redis_client.ping()
        redis_client.get(REDIS_PHI_ROUTING_KEY)
        health["redis_config"] = "healthy"
    except Exception as e:
        health["redis_config"] = f"error: {str(e)}"

    # Check local LLM status
    routing = get_routing_config()
    if routing.local_llm_enabled and routing.local_llm_url:
        health["local_llm"] = "configured"
        # Could add actual connectivity check here

    overall = "healthy"
    if any("error" in str(v) for v in health.values()):
        overall = "degraded"

    return success_response(
        data={
            "overall": overall,
            "components": health,
            "routing_mode": routing.mode.value,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )

"""
Unified Audit Service - HIPAA Compliance Logging

Consolidates all audit logging for:
- PHI access and handling
- EHR interactions
- Emotion tracking activities
- Repair attempts and escalations
- Privacy setting changes
- User data exports and deletions

Supports HIPAA accounting of disclosures requirement.
"""

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class AuditEventType(Enum):
    """Types of audit events"""

    # PHI Events
    PHI_ACCESS = "phi.access"
    PHI_DETECTED = "phi.detected"
    PHI_SUPPRESSED = "phi.suppressed"
    PHI_DISCLOSED = "phi.disclosed"

    # EHR Events
    EHR_READ = "ehr.read"
    EHR_WRITE = "ehr.write"
    EHR_SEARCH = "ehr.search"

    # Phase 6b: EHR Write Operation Events
    EHR_ORDER_CREATED = "ehr.order_created"
    EHR_ORDER_CANCELLED = "ehr.order_cancelled"
    EHR_NOTE_CREATED = "ehr.note_created"
    EHR_WRITE_FAILED = "ehr.write_failed"
    EHR_CONFLICT_DETECTED = "ehr.conflict_detected"

    # User Data Events
    DATA_EXPORT = "data.export"
    DATA_DELETE = "data.delete"
    DATA_ACCESS = "data.access"

    # Privacy Events
    PRIVACY_CHANGE = "privacy.change"
    CONSENT_GRANTED = "consent.granted"
    CONSENT_REVOKED = "consent.revoked"

    # Session Events
    SESSION_START = "session.start"
    SESSION_END = "session.end"
    SESSION_ERROR = "session.error"

    # Emotion Tracking
    EMOTION_TRACKED = "emotion.tracked"
    EMOTION_DEVIATION = "emotion.deviation"

    # Repair Events
    REPAIR_ATTEMPT = "repair.attempt"
    REPAIR_ESCALATION = "repair.escalation"

    # Clinical Events
    CLINICAL_ALERT = "clinical.alert"
    DRUG_INTERACTION = "clinical.drug_interaction"

    # System Events
    SYSTEM_ERROR = "system.error"
    SECURITY_EVENT = "security.event"


class AuditSeverity(Enum):
    """Audit event severity levels"""

    INFO = "info"
    NOTICE = "notice"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class AuditEvent:
    """An audit log event"""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_type: AuditEventType = AuditEventType.DATA_ACCESS
    severity: AuditSeverity = AuditSeverity.INFO
    timestamp: datetime = field(default_factory=datetime.utcnow)

    # Actor information
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    actor_type: str = "user"  # user, system, admin

    # Resource information
    resource_type: Optional[str] = None  # patient, document, setting
    resource_id: Optional[str] = None
    resource_name: Optional[str] = None

    # Action details
    action: str = ""  # read, write, delete, etc.
    description: str = ""
    outcome: str = "success"  # success, failure, partial

    # Additional context
    metadata: Dict[str, Any] = field(default_factory=dict)

    # PHI-specific fields
    phi_types: List[str] = field(default_factory=list)  # ssn, mrn, name, etc.
    phi_count: int = 0
    disclosure_recipient: Optional[str] = None

    # Correlation
    correlation_id: Optional[str] = None
    parent_event_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage"""
        return {
            "id": self.id,
            "event_type": self.event_type.value,
            "severity": self.severity.value,
            "timestamp": self.timestamp.isoformat(),
            "user_id": self.user_id,
            "session_id": self.session_id,
            "actor_type": self.actor_type,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "resource_name": self.resource_name,
            "action": self.action,
            "description": self.description,
            "outcome": self.outcome,
            "metadata": self.metadata,
            "phi_types": self.phi_types,
            "phi_count": self.phi_count,
            "disclosure_recipient": self.disclosure_recipient,
            "correlation_id": self.correlation_id,
            "parent_event_id": self.parent_event_id,
        }


@dataclass
class AccountingOfDisclosures:
    """HIPAA Accounting of Disclosures record"""

    patient_id: str
    disclosures: List[Dict[str, Any]] = field(default_factory=list)
    period_start: datetime = field(default_factory=lambda: datetime.utcnow() - timedelta(days=365 * 6))
    period_end: datetime = field(default_factory=datetime.utcnow)

    def add_disclosure(
        self,
        date: datetime,
        recipient: str,
        purpose: str,
        description: str,
    ) -> None:
        """Add a disclosure record"""
        self.disclosures.append(
            {
                "date": date.isoformat(),
                "recipient": recipient,
                "purpose": purpose,
                "description": description,
            }
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for export"""
        return {
            "patient_id": self.patient_id,
            "period_start": self.period_start.isoformat(),
            "period_end": self.period_end.isoformat(),
            "disclosure_count": len(self.disclosures),
            "disclosures": self.disclosures,
        }


class AuditService:
    """
    Unified audit service for HIPAA compliance.

    Provides:
    - Centralized audit logging from all engines
    - Event bus integration for automatic capture
    - Accounting of disclosures for HIPAA
    - Query and export capabilities
    - Retention management
    """

    # Events to automatically capture from event bus
    AUTO_CAPTURE_EVENTS = {
        "phi.detected": AuditEventType.PHI_DETECTED,
        "phi.suppressed": AuditEventType.PHI_SUPPRESSED,
        "clinical.alert": AuditEventType.CLINICAL_ALERT,
        "privacy.settings_changed": AuditEventType.PRIVACY_CHANGE,
        "privacy.data_deleted": AuditEventType.DATA_DELETE,
        "emotion.deviation": AuditEventType.EMOTION_DEVIATION,
        "repair.started": AuditEventType.REPAIR_ATTEMPT,
        "repair.escalation": AuditEventType.REPAIR_ESCALATION,
    }

    # Default retention period (6 years for HIPAA)
    DEFAULT_RETENTION_DAYS = 365 * 6

    def __init__(
        self,
        event_bus=None,
        retention_days: int = DEFAULT_RETENTION_DAYS,
    ):
        self.event_bus = event_bus
        self.retention_days = retention_days

        self._events: List[AuditEvent] = []
        self._max_in_memory = 10000
        self._phi_access_log: Dict[str, List[AuditEvent]] = {}  # resource_id -> events

        if self.event_bus:
            self._subscribe_to_events()

        logger.info(f"AuditService initialized (retention: {retention_days} days)")

    def _subscribe_to_events(self) -> None:
        """Subscribe to events for automatic capture"""
        from app.core.event_bus import VoiceEvent

        async def handle_event(event: VoiceEvent):
            audit_type = self.AUTO_CAPTURE_EVENTS.get(event.event_type)
            if audit_type:
                await self._capture_event(event, audit_type)

        for event_type in self.AUTO_CAPTURE_EVENTS.keys():
            self.event_bus.subscribe(
                event_type,
                handle_event,
                priority=0,
                engine="audit",
            )

    async def _capture_event(
        self,
        event,
        audit_type: AuditEventType,
    ) -> None:
        """Capture an event bus event as an audit event"""
        data = event.data

        # Determine severity based on event type
        if audit_type in [AuditEventType.PHI_DETECTED, AuditEventType.CLINICAL_ALERT]:
            severity = AuditSeverity.WARNING
        elif audit_type in [AuditEventType.REPAIR_ESCALATION]:
            severity = AuditSeverity.NOTICE
        else:
            severity = AuditSeverity.INFO

        audit_event = AuditEvent(
            event_type=audit_type,
            severity=severity,
            timestamp=event.timestamp,
            user_id=data.get("user_id"),
            session_id=event.session_id,
            actor_type="system",
            action=event.event_type,
            description=str(data),
            metadata=data,
            correlation_id=event.correlation_id,
        )

        # Extract PHI information if present
        if "entities" in data:
            for entity in data["entities"]:
                entity_type = entity.get("type", "unknown")
                if entity_type not in audit_event.phi_types:
                    audit_event.phi_types.append(entity_type)
            audit_event.phi_count = len(data["entities"])

        await self.log(audit_event)

    async def log(self, event: AuditEvent) -> str:
        """
        Log an audit event.

        Returns event ID.
        """
        # Add to in-memory store
        self._events.append(event)

        # Limit in-memory storage
        if len(self._events) > self._max_in_memory:
            self._events = self._events[-self._max_in_memory :]

        # Track PHI access by resource
        if event.phi_types and event.resource_id:
            if event.resource_id not in self._phi_access_log:
                self._phi_access_log[event.resource_id] = []
            self._phi_access_log[event.resource_id].append(event)

        # TODO: Persist to database
        logger.debug(f"Audit: {event.event_type.value} - {event.description[:100]}")

        return event.id

    async def log_phi_access(
        self,
        user_id: str,
        session_id: str,
        resource_id: str,
        resource_type: str,
        phi_types: List[str],
        action: str = "read",
        purpose: str = "treatment",
    ) -> str:
        """Log PHI access event"""
        event = AuditEvent(
            event_type=AuditEventType.PHI_ACCESS,
            severity=AuditSeverity.NOTICE,
            user_id=user_id,
            session_id=session_id,
            resource_id=resource_id,
            resource_type=resource_type,
            action=action,
            description=f"PHI access: {action} on {resource_type}",
            phi_types=phi_types,
            phi_count=len(phi_types),
            metadata={"purpose": purpose},
        )
        return await self.log(event)

    async def log_disclosure(
        self,
        user_id: str,
        resource_id: str,
        recipient: str,
        purpose: str,
        description: str,
        phi_types: List[str],
    ) -> str:
        """Log PHI disclosure for accounting of disclosures"""
        event = AuditEvent(
            event_type=AuditEventType.PHI_DISCLOSED,
            severity=AuditSeverity.WARNING,
            user_id=user_id,
            resource_id=resource_id,
            resource_type="patient",
            action="disclose",
            description=description,
            phi_types=phi_types,
            phi_count=len(phi_types),
            disclosure_recipient=recipient,
            metadata={"purpose": purpose},
        )
        return await self.log(event)

    async def log_ehr_access(
        self,
        user_id: str,
        session_id: str,
        action: str,  # read, write, search
        resource_type: str,
        resource_id: Optional[str],
        details: Dict[str, Any],
    ) -> str:
        """Log EHR interaction"""
        event_type = {
            "read": AuditEventType.EHR_READ,
            "write": AuditEventType.EHR_WRITE,
            "search": AuditEventType.EHR_SEARCH,
        }.get(action, AuditEventType.EHR_READ)

        event = AuditEvent(
            event_type=event_type,
            severity=AuditSeverity.NOTICE,
            user_id=user_id,
            session_id=session_id,
            resource_type=resource_type,
            resource_id=resource_id,
            action=action,
            description=f"EHR {action}: {resource_type}",
            metadata=details,
        )
        return await self.log(event)

    # === Phase 6b: EHR Write Operation Logging ===

    async def log_ehr_order_created(
        self,
        user_id: str,
        session_id: str,
        order_type: str,  # medication, lab, imaging, procedure
        resource_id: str,
        patient_id: str,
        code: Optional[str],
        display_name: str,
        details: Dict[str, Any],
    ) -> str:
        """Log EHR order creation"""
        event = AuditEvent(
            event_type=AuditEventType.EHR_ORDER_CREATED,
            severity=AuditSeverity.NOTICE,
            user_id=user_id,
            session_id=session_id,
            resource_type=order_type,
            resource_id=resource_id,
            action="create",
            description=f"Order created: {order_type} - {display_name}",
            metadata={
                **details,
                "patient_id": patient_id,
                "order_type": order_type,
                "code": code,
                "display_name": display_name,
            },
        )
        return await self.log(event)

    async def log_ehr_order_cancelled(
        self,
        user_id: str,
        session_id: str,
        order_type: str,
        resource_id: str,
        patient_id: str,
        reason: Optional[str],
    ) -> str:
        """Log EHR order cancellation"""
        event = AuditEvent(
            event_type=AuditEventType.EHR_ORDER_CANCELLED,
            severity=AuditSeverity.NOTICE,
            user_id=user_id,
            session_id=session_id,
            resource_type=order_type,
            resource_id=resource_id,
            action="cancel",
            description=f"Order cancelled: {order_type}",
            metadata={
                "patient_id": patient_id,
                "order_type": order_type,
                "reason": reason,
            },
        )
        return await self.log(event)

    async def log_ehr_note_created(
        self,
        user_id: str,
        session_id: str,
        resource_id: str,
        patient_id: str,
        document_type: str,
        title: str,
        content_length: int,
    ) -> str:
        """Log EHR note/document creation"""
        event = AuditEvent(
            event_type=AuditEventType.EHR_NOTE_CREATED,
            severity=AuditSeverity.NOTICE,
            user_id=user_id,
            session_id=session_id,
            resource_type="DocumentReference",
            resource_id=resource_id,
            action="create",
            description=f"Note created: {document_type} - {title}",
            metadata={
                "patient_id": patient_id,
                "document_type": document_type,
                "title": title,
                "content_length": content_length,
            },
        )
        return await self.log(event)

    async def log_ehr_write_failed(
        self,
        user_id: str,
        session_id: str,
        operation_type: str,
        resource_type: str,
        patient_id: Optional[str],
        error: str,
        details: Dict[str, Any],
    ) -> str:
        """Log failed EHR write operation"""
        event = AuditEvent(
            event_type=AuditEventType.EHR_WRITE_FAILED,
            severity=AuditSeverity.WARNING,
            user_id=user_id,
            session_id=session_id,
            resource_type=resource_type,
            action=operation_type,
            outcome="failure",
            description=f"EHR write failed: {operation_type} - {error[:100]}",
            metadata={
                **details,
                "patient_id": patient_id,
                "error": error,
            },
        )
        return await self.log(event)

    async def log_ehr_conflict_detected(
        self,
        user_id: str,
        session_id: str,
        order_type: str,
        patient_id: str,
        conflict_type: str,  # duplicate, version_mismatch
        conflicting_resources: List[str],
        details: Dict[str, Any],
    ) -> str:
        """Log detected EHR order conflict"""
        event = AuditEvent(
            event_type=AuditEventType.EHR_CONFLICT_DETECTED,
            severity=AuditSeverity.WARNING,
            user_id=user_id,
            session_id=session_id,
            resource_type=order_type,
            action="conflict_check",
            description=f"Conflict detected: {conflict_type} for {order_type}",
            metadata={
                **details,
                "patient_id": patient_id,
                "conflict_type": conflict_type,
                "conflicting_resources": conflicting_resources,
            },
        )
        return await self.log(event)

    async def log_data_export(
        self,
        user_id: str,
        data_types: List[str],
        format: str = "json",
    ) -> str:
        """Log user data export"""
        event = AuditEvent(
            event_type=AuditEventType.DATA_EXPORT,
            severity=AuditSeverity.NOTICE,
            user_id=user_id,
            action="export",
            description=f"User data export: {', '.join(data_types)}",
            metadata={"data_types": data_types, "format": format},
        )
        return await self.log(event)

    async def log_data_deletion(
        self,
        user_id: str,
        data_types: List[str],
    ) -> str:
        """Log user data deletion"""
        event = AuditEvent(
            event_type=AuditEventType.DATA_DELETE,
            severity=AuditSeverity.WARNING,
            user_id=user_id,
            action="delete",
            description=f"User data deletion: {', '.join(data_types)}",
            metadata={"data_types": data_types},
        )
        return await self.log(event)

    # === Query Methods ===

    async def get_events(
        self,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        event_type: Optional[AuditEventType] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[AuditEvent]:
        """Query audit events"""
        events = self._events

        if user_id:
            events = [e for e in events if e.user_id == user_id]

        if session_id:
            events = [e for e in events if e.session_id == session_id]

        if event_type:
            events = [e for e in events if e.event_type == event_type]

        if start_time:
            events = [e for e in events if e.timestamp >= start_time]

        if end_time:
            events = [e for e in events if e.timestamp <= end_time]

        return events[-limit:]

    async def get_phi_access_log(
        self,
        resource_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> List[AuditEvent]:
        """Get PHI access log for a resource"""
        events = self._phi_access_log.get(resource_id, [])

        if start_time:
            events = [e for e in events if e.timestamp >= start_time]

        if end_time:
            events = [e for e in events if e.timestamp <= end_time]

        return events

    async def get_accounting_of_disclosures(
        self,
        patient_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> AccountingOfDisclosures:
        """
        Generate HIPAA Accounting of Disclosures report.

        Returns all disclosures for a patient in the specified period.
        """
        if start_date is None:
            # HIPAA requires 6 years of history
            start_date = datetime.utcnow() - timedelta(days=365 * 6)

        if end_date is None:
            end_date = datetime.utcnow()

        accounting = AccountingOfDisclosures(
            patient_id=patient_id,
            period_start=start_date,
            period_end=end_date,
        )

        # Find all disclosures for this patient
        events = await self.get_events(
            event_type=AuditEventType.PHI_DISCLOSED,
            start_time=start_date,
            end_time=end_date,
        )

        for event in events:
            if event.resource_id == patient_id:
                accounting.add_disclosure(
                    date=event.timestamp,
                    recipient=event.disclosure_recipient or "Unknown",
                    purpose=event.metadata.get("purpose", "Unknown"),
                    description=event.description,
                )

        return accounting

    async def export_audit_log(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        event_types: Optional[List[AuditEventType]] = None,
        format: str = "json",
    ) -> str:
        """Export audit log for compliance review"""
        events = await self.get_events(
            start_time=start_time,
            end_time=end_time,
            limit=10000,
        )

        if event_types:
            events = [e for e in events if e.event_type in event_types]

        if format == "json":
            return json.dumps([e.to_dict() for e in events], indent=2)
        else:
            # CSV format
            lines = ["timestamp,event_type,user_id,action,description"]
            for e in events:
                lines.append(
                    f"{e.timestamp.isoformat()},{e.event_type.value},"
                    f"{e.user_id or ''},{e.action},{e.description[:100]}"
                )
            return "\n".join(lines)

    # === Retention ===

    async def cleanup_old_events(self) -> int:
        """Remove events older than retention period"""
        cutoff = datetime.utcnow() - timedelta(days=self.retention_days)

        original_count = len(self._events)
        self._events = [e for e in self._events if e.timestamp >= cutoff]

        removed = original_count - len(self._events)
        if removed > 0:
            logger.info(f"Cleaned up {removed} audit events older than {self.retention_days} days")

        return removed

    def get_stats(self) -> Dict[str, Any]:
        """Get audit service statistics"""
        event_counts = {}
        for event in self._events:
            key = event.event_type.value
            event_counts[key] = event_counts.get(key, 0) + 1

        return {
            "total_events": len(self._events),
            "event_counts": event_counts,
            "phi_resources_tracked": len(self._phi_access_log),
            "retention_days": self.retention_days,
        }


# Global audit service instance
_audit_service_instance: Optional[AuditService] = None


def get_audit_service() -> AuditService:
    """Get the global audit service instance"""
    global _audit_service_instance
    if _audit_service_instance is None:
        from app.core.event_bus import get_event_bus

        _audit_service_instance = AuditService(event_bus=get_event_bus())
    return _audit_service_instance


def reset_audit_service() -> None:
    """Reset the global audit service (for testing)"""
    global _audit_service_instance
    _audit_service_instance = None


__all__ = [
    "AuditService",
    "AuditEvent",
    "AuditEventType",
    "AuditSeverity",
    "AccountingOfDisclosures",
    "get_audit_service",
    "reset_audit_service",
]

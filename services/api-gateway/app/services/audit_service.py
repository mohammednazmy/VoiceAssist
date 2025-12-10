"""
Audit logging service for tracking user actions and system events.

HIPAA Compliance: All access to PHI and authentication events must be logged.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from app.core.request_id import get_request_id
from app.models.audit_log import AuditLog
from app.models.user import User
from fastapi import Request
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class AuditService:
    """
    Service for creating and managing audit logs.

    Audit logs are immutable and include integrity verification.
    """

    @staticmethod
    async def log_event(
        db: Session,
        action: str,
        success: bool,
        user: Optional[User] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        user_role: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        request: Optional[Request] = None,
        request_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        endpoint: Optional[str] = None,
        status_code: Optional[str] = None,
        error_message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        service_name: str = "api-gateway",
    ) -> AuditLog:
        """
        Create an audit log entry.

        Args:
            db: Database session
            action: Action performed (e.g., "login", "create_user", "delete_document")
            success: Whether the action succeeded
            user: User object (if available, will extract user_id, email, role)
            user_id: User ID (if user not provided)
            user_email: User email (if user not provided)
            user_role: User role (if user not provided)
            resource_type: Type of resource accessed (e.g., "user", "document")
            resource_id: ID of the resource
            request: FastAPI Request object (will extract request_id, ip, user_agent, endpoint)
            request_id: Request correlation ID (if request not provided)
            ip_address: Client IP address (if request not provided)
            user_agent: Client user agent (if request not provided)
            endpoint: API endpoint (if request not provided)
            status_code: HTTP status code
            error_message: Error message if action failed
            metadata: Additional context as JSON
            service_name: Name of the service generating the log

        Returns:
            Created AuditLog entry
        """
        # Extract user info from User object if provided
        if user:
            user_id = str(user.id)
            user_email = user.email
            user_role = getattr(user, "admin_role", None) or ("admin" if user.is_admin else "user")

        # Extract request info from Request object if provided
        if request:
            request_id = get_request_id(request)
            ip_address = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent")
            endpoint = f"{request.method} {request.url.path}"

        # Create audit log entry
        audit_log = AuditLog(
            user_id=user_id,
            user_email=user_email,
            user_role=user_role,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            request_id=request_id,
            ip_address=ip_address,
            user_agent=user_agent,
            service_name=service_name,
            endpoint=endpoint,
            success=success,
            status_code=status_code,
            error_message=error_message,
            metadata=metadata,
        )

        # Calculate integrity hash
        audit_log.hash = audit_log.calculate_hash()

        # Save to database
        try:
            db.add(audit_log)
            db.commit()
            db.refresh(audit_log)

            # Also log to application logs
            log_level = logging.INFO if success else logging.WARNING
            logger.log(
                log_level,
                f"Audit: {action} by {user_email or 'system'} - " f"{'success' if success else 'failed'}",
                extra={
                    "audit_log_id": str(audit_log.id),
                    "request_id": request_id,
                    "user_id": user_id,
                    "action": action,
                    "resource_type": resource_type,
                    "success": success,
                },
            )

            return audit_log

        except Exception as e:
            logger.error(f"Failed to create audit log: {e}", exc_info=True)
            db.rollback()
            raise

    @staticmethod
    async def log_authentication(
        db: Session,
        action: str,  # "login", "logout", "register", "password_change"
        user: Optional[User],
        request: Request,
        success: bool,
        error_message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """
        Log authentication-related events.

        This is a convenience method for the most common audit log use case.
        """
        return await AuditService.log_event(
            db=db,
            action=action,
            success=success,
            user=user,
            resource_type="authentication",
            request=request,
            error_message=error_message,
            metadata=metadata,
        )

    @staticmethod
    def verify_audit_log_integrity(db: Session, audit_log_id: str) -> bool:
        """
        Verify that an audit log entry has not been tampered with.

        Args:
            db: Database session
            audit_log_id: ID of the audit log to verify

        Returns:
            True if hash matches, False if tampered
        """
        audit_log = db.query(AuditLog).filter(AuditLog.id == audit_log_id).first()
        if not audit_log:
            return False

        return audit_log.verify_integrity()

    @staticmethod
    def get_user_audit_trail(db: Session, user_id: str, limit: int = 100, offset: int = 0) -> list[AuditLog]:
        """
        Get audit trail for a specific user.

        Args:
            db: Database session
            user_id: User ID to get audit trail for
            limit: Maximum number of entries to return
            offset: Number of entries to skip

        Returns:
            List of AuditLog entries
        """
        return (
            db.query(AuditLog)
            .filter(AuditLog.user_id == user_id)
            .order_by(AuditLog.timestamp.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    @staticmethod
    def get_recent_failed_logins(db: Session, minutes: int = 30, limit: int = 100) -> list[AuditLog]:
        """
        Get recent failed login attempts for security monitoring.

        Args:
            db: Database session
            minutes: How many minutes back to look
            limit: Maximum number of entries to return

        Returns:
            List of failed login audit logs
        """
        cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=minutes)

        return (
            db.query(AuditLog)
            .filter(
                AuditLog.action == "login",
                AuditLog.success.is_(False),
                AuditLog.timestamp >= cutoff_time,
            )
            .order_by(AuditLog.timestamp.desc())
            .limit(limit)
            .all()
        )

    # =========================================================================
    # HIPAA Dictation Audit Events (Phase 9)
    # =========================================================================

    @staticmethod
    async def log_dictation_started(
        db: Session,
        user: Optional[User],
        session_id: str,
        patient_id: Optional[str] = None,
        note_type: Optional[str] = None,
        specialty: Optional[str] = None,
        request: Optional[Request] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """
        Log dictation session start (HIPAA required).

        Args:
            db: Database session
            user: Clinician user object
            session_id: Dictation session ID
            patient_id: Patient ID if in patient context
            note_type: Type of note being dictated (SOAP, H&P, etc.)
            specialty: Medical specialty if set
            request: FastAPI request object
            metadata: Additional context
        """
        event_metadata = {
            "session_id": session_id,
            "note_type": note_type,
            "specialty": specialty,
            **(metadata or {}),
        }

        return await AuditService.log_event(
            db=db,
            action="DICTATION_STARTED",
            success=True,
            user=user,
            resource_type="dictation_session",
            resource_id=session_id,
            request=request,
            metadata=event_metadata,
        )

    @staticmethod
    async def log_dictation_ended(
        db: Session,
        user: Optional[User],
        session_id: str,
        duration_seconds: Optional[float] = None,
        word_count: Optional[int] = None,
        was_saved: bool = False,
        request: Optional[Request] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """
        Log dictation session end (HIPAA required).

        Args:
            db: Database session
            user: Clinician user object
            session_id: Dictation session ID
            duration_seconds: Total session duration
            word_count: Number of words dictated
            was_saved: Whether the note was saved
            request: FastAPI request object
            metadata: Additional context
        """
        event_metadata = {
            "session_id": session_id,
            "duration_seconds": duration_seconds,
            "word_count": word_count,
            "was_saved": was_saved,
            **(metadata or {}),
        }

        return await AuditService.log_event(
            db=db,
            action="DICTATION_ENDED",
            success=True,
            user=user,
            resource_type="dictation_session",
            resource_id=session_id,
            request=request,
            metadata=event_metadata,
        )

    @staticmethod
    async def log_patient_context_accessed(
        db: Session,
        user: Optional[User],
        patient_id: str,
        session_id: Optional[str] = None,
        data_categories: Optional[list[str]] = None,
        request: Optional[Request] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """
        Log patient context access during dictation (HIPAA required).

        This event is logged whenever patient data is retrieved for
        context-aware dictation assistance.

        Args:
            db: Database session
            user: Clinician user object
            patient_id: Patient whose data was accessed
            session_id: Dictation session ID
            data_categories: Categories of data accessed (meds, labs, etc.)
            request: FastAPI request object
            metadata: Additional context
        """
        event_metadata = {
            "session_id": session_id,
            "data_categories": data_categories or [],
            **(metadata or {}),
        }

        return await AuditService.log_event(
            db=db,
            action="PATIENT_CONTEXT_ACCESSED",
            success=True,
            user=user,
            resource_type="patient",
            resource_id=patient_id,
            request=request,
            metadata=event_metadata,
        )

    @staticmethod
    async def log_note_saved(
        db: Session,
        user: Optional[User],
        session_id: str,
        note_id: str,
        patient_id: Optional[str] = None,
        note_type: Optional[str] = None,
        word_count: Optional[int] = None,
        request: Optional[Request] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """
        Log clinical note save (HIPAA required).

        Args:
            db: Database session
            user: Clinician user object
            session_id: Dictation session ID
            note_id: ID of the saved note
            patient_id: Patient ID if in patient context
            note_type: Type of note saved
            word_count: Number of words in note
            request: FastAPI request object
            metadata: Additional context
        """
        event_metadata = {
            "session_id": session_id,
            "patient_id": patient_id,
            "note_type": note_type,
            "word_count": word_count,
            **(metadata or {}),
        }

        return await AuditService.log_event(
            db=db,
            action="NOTE_SAVED",
            success=True,
            user=user,
            resource_type="clinical_note",
            resource_id=note_id,
            request=request,
            metadata=event_metadata,
        )

    @staticmethod
    async def log_phi_detected(
        db: Session,
        user: Optional[User],
        session_id: str,
        phi_type: str,
        alert_level: str,
        was_expected: bool,
        action_taken: str,
        request: Optional[Request] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """
        Log PHI detection during dictation (HIPAA required for unexpected PHI).

        Args:
            db: Database session
            user: Clinician user object
            session_id: Dictation session ID
            phi_type: Type of PHI detected (name, SSN, MRN, etc.)
            alert_level: info, warning, or critical
            was_expected: Whether PHI matched current patient context
            action_taken: Action taken (allow, mask, redact, alert)
            request: FastAPI request object
            metadata: Additional context
        """
        event_metadata = {
            "session_id": session_id,
            "phi_type": phi_type,
            "alert_level": alert_level,
            "was_expected": was_expected,
            "action_taken": action_taken,
            **(metadata or {}),
        }

        # Unexpected PHI is a potential security event
        success = was_expected or alert_level == "info"

        return await AuditService.log_event(
            db=db,
            action="PHI_DETECTED",
            success=success,
            user=user,
            resource_type="dictation_session",
            resource_id=session_id,
            request=request,
            metadata=event_metadata,
        )

    @staticmethod
    async def log_medication_interaction_check(
        db: Session,
        user: Optional[User],
        patient_id: str,
        medication_checked: str,
        interactions_found: int,
        session_id: Optional[str] = None,
        request: Optional[Request] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """
        Log medication interaction check (HIPAA recommended for clinical decision support).

        Args:
            db: Database session
            user: Clinician user object
            patient_id: Patient whose medications were checked
            medication_checked: Name of medication being evaluated
            interactions_found: Number of interactions found
            session_id: Dictation session ID if during dictation
            request: FastAPI request object
            metadata: Additional context
        """
        event_metadata = {
            "session_id": session_id,
            "medication_checked": medication_checked,
            "interactions_found": interactions_found,
            **(metadata or {}),
        }

        return await AuditService.log_event(
            db=db,
            action="MEDICATION_INTERACTION_CHECK",
            success=True,
            user=user,
            resource_type="patient",
            resource_id=patient_id,
            request=request,
            metadata=event_metadata,
        )

    @staticmethod
    def get_dictation_audit_trail(
        db: Session,
        session_id: str,
        limit: int = 100,
    ) -> list[AuditLog]:
        """
        Get all audit events for a dictation session.

        Args:
            db: Database session
            session_id: Dictation session ID
            limit: Maximum number of entries

        Returns:
            List of audit events for the session
        """
        dictation_actions = [
            "DICTATION_STARTED",
            "DICTATION_ENDED",
            "PATIENT_CONTEXT_ACCESSED",
            "NOTE_SAVED",
            "PHI_DETECTED",
            "MEDICATION_INTERACTION_CHECK",
        ]

        return (
            db.query(AuditLog)
            .filter(
                AuditLog.action.in_(dictation_actions),
                AuditLog.resource_id == session_id,
            )
            .order_by(AuditLog.timestamp.asc())
            .limit(limit)
            .all()
        )

    @staticmethod
    def get_patient_access_log(
        db: Session,
        patient_id: str,
        days: int = 30,
        limit: int = 500,
    ) -> list[AuditLog]:
        """
        Get all access events for a patient (HIPAA accounting of disclosures).

        Args:
            db: Database session
            patient_id: Patient ID
            days: Number of days to look back
            limit: Maximum number of entries

        Returns:
            List of audit events involving the patient
        """
        cutoff_time = datetime.now(timezone.utc) - timedelta(days=days)

        return (
            db.query(AuditLog)
            .filter(
                AuditLog.resource_type == "patient",
                AuditLog.resource_id == patient_id,
                AuditLog.timestamp >= cutoff_time,
            )
            .order_by(AuditLog.timestamp.desc())
            .limit(limit)
            .all()
        )

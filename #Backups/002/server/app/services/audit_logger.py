"""Audit logging stub for VoiceAssist V2.

See SECURITY_COMPLIANCE.md for what must be recorded in the audit log.
"""
from __future__ import annotations

from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)


async def audit_event(event_type: str, payload: Dict[str, Any]) -> None:
    """Record an audit event.

    Early phases simply log to the application logger; later phases
    will persist to a dedicated audit log store.
    """
    logger.info("AUDIT %s %s", event_type, payload)

"""
Conversation metadata helpers.

Lightweight helpers for updating conversation-level metadata stored in the
Session.context JSONB column without introducing heavy dependencies into
voice or Thinker services.

Metadata stored here is intentionally minimal and non-PHI:
- phi_mode: "clinical" | "demo" (for PHI-conscious UI badges)
- tags: ["dictation", "consult", ...] for audit/organization
"""

from __future__ import annotations

import uuid
from typing import Iterable, List, Optional

from app.core.database import SessionLocal, transaction
from app.core.logging import get_logger
from app.models.session import Session as ChatSession

logger = get_logger(__name__)


def _load_session(db, conversation_id: str) -> Optional[ChatSession]:
    """Internal helper to load a ChatSession by string UUID."""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except (ValueError, TypeError):
        logger.warning("conversation_metadata_service: invalid UUID %s", conversation_id)
        return None

    return db.query(ChatSession).filter(ChatSession.id == conv_uuid).first()


def set_conversation_phi_mode(conversation_id: str, phi_mode: str) -> None:
    """
    Persist conversation-level PHI mode in Session.context.

    Args:
        conversation_id: Conversation/session UUID as string
        phi_mode: "clinical" or "demo"
    """
    mode_value = str(phi_mode).lower()
    if mode_value not in {"clinical", "demo"}:
        logger.warning(
            "conversation_metadata_service: ignoring invalid phi_mode '%s' for %s",
            phi_mode,
            conversation_id,
        )
        return

    db = SessionLocal()
    try:
        session = _load_session(db, conversation_id)
        if not session:
            return

        ctx = dict(session.context or {})
        if ctx.get("phi_mode") == mode_value:
            return

        ctx["phi_mode"] = mode_value
        session.context = ctx

        # Explicitly mark session as modified to ensure JSONB changes are persisted
        db.add(session)
        with transaction(db):
            logger.debug(
                "conversation_metadata_service: set phi_mode=%s for %s",
                mode_value,
                conversation_id,
            )
    except Exception as e:  # pragma: no cover - defensive logging
        logger.warning(
            "conversation_metadata_service: failed to set phi_mode for %s: %s",
            conversation_id,
            e,
        )
    finally:
        db.close()


def add_conversation_tags(conversation_id: str, tags: Iterable[str]) -> None:
    """
    Add one or more tags to a conversation.

    Tags are stored as a de-duplicated, sorted list of strings in Session.context["tags"].
    """
    tag_list: List[str] = [str(t).strip() for t in tags if str(t).strip()]
    if not tag_list:
        return

    db = SessionLocal()
    try:
        session = _load_session(db, conversation_id)
        if not session:
            return

        ctx = dict(session.context or {})
        existing = set(ctx.get("tags") or [])
        updated = existing.union(tag_list)
        if updated == existing:
            return

        ctx["tags"] = sorted(updated)
        session.context = ctx

        # Explicitly mark session as modified to ensure JSONB changes are persisted
        db.add(session)
        with transaction(db):
            logger.debug(
                "conversation_metadata_service: added tags %s for %s",
                tag_list,
                conversation_id,
            )
    except Exception as e:  # pragma: no cover - defensive logging
        logger.warning(
            "conversation_metadata_service: failed to add tags for %s: %s",
            conversation_id,
            e,
        )
    finally:
        db.close()


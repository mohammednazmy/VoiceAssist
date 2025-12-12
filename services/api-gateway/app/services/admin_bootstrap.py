"""
Local/test admin bootstrap helper.

In non-production environments this module can ensure that a default admin
user exists so that admin workflows (API tests, admin panel smoke checks)
have a valid principal with appropriate privileges.

Safety:
- Only activates when ENVIRONMENT is not \"production\" OR DEBUG is True.
- Uses a configurable email/password via environment variables:
  - TEST_ADMIN_EMAIL (default: \"admin@test.com\")
  - TEST_ADMIN_PASSWORD (default: \"Test123!@#\")
"""

from __future__ import annotations

import os
from typing import Optional

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.core.security import get_password_hash
from app.models.user import User

logger = get_logger(__name__)


def _get_bootstrap_credentials() -> Optional[tuple[str, str, str]]:
    """Resolve bootstrap admin credentials for non-production environments."""
    # Only enable bootstrap in explicit non-production environments
    if settings.ENVIRONMENT.lower() == "production" and not settings.DEBUG:
        return None

    email = os.getenv("TEST_ADMIN_EMAIL", "admin@test.com").strip()
    password = os.getenv("TEST_ADMIN_PASSWORD", "Test123!@#")
    full_name = os.getenv("TEST_ADMIN_FULL_NAME", "Test Admin").strip()

    if not email or not password:
        return None

    return email, password, full_name


def bootstrap_default_admin() -> None:
    """
    Ensure a default admin user exists for local/test environments.

    This helper is intentionally conservative:
    - No-op in production unless DEBUG is explicitly enabled.
    - Idempotent across restarts.
    """
    creds = _get_bootstrap_credentials()
    if creds is None:
        return

    email, password, full_name = creds
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.email == email).first()

        if user is None:
            # Create a new admin user
            user = User(
                email=email,
                full_name=full_name,
                hashed_password=get_password_hash(password),
                is_active=True,
                is_admin=True,
                admin_role="admin",
            )
            db.add(user)
            db.commit()
            logger.info(
                "admin_bootstrap_created",
                email=email,
                admin_role=user.admin_role,
                environment=settings.ENVIRONMENT,
            )
            return

        # Elevate existing user to admin if needed
        updated = False
        if not user.is_admin:
            user.is_admin = True
            updated = True
        if user.admin_role not in {"admin", "super_admin"}:
            user.admin_role = "admin"
            updated = True

        if updated:
            db.commit()
            logger.info(
                "admin_bootstrap_elevated",
                email=email,
                admin_role=user.admin_role,
                environment=settings.ENVIRONMENT,
            )

    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "admin_bootstrap_failed",
            error=str(exc),
            environment=settings.ENVIRONMENT,
            exc_info=True,
        )
    finally:
        db.close()


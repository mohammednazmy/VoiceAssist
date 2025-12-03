"""
System API Key Service for managing external service credentials.

Provides encrypted storage for system API keys (OpenAI, PubMed, etc.)
with database override capability over environment variables.
"""

import base64
from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import UUID

from app.core.config import settings
from app.models.system_api_key import SystemAPIKey
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

# Mapping of integration_id to config key name
INTEGRATION_KEY_MAP: Dict[str, str] = {
    "openai": "OPENAI_API_KEY",
    "google_ai": "GOOGLE_STUDIO_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "local_llm": "LOCAL_LLM_API_KEY",
    "elevenlabs": "ELEVENLABS_API_KEY",
    "deepgram": "DEEPGRAM_API_KEY",
    "openevidence": "OPENEVIDENCE_API_KEY",
    "pubmed": "PUBMED_API_KEY",
    "google_oauth": "GOOGLE_CLIENT_SECRET",
    "microsoft_oauth": "MICROSOFT_CLIENT_SECRET",
    "sentry": "SENTRY_DSN",
}


class SystemKeyService:
    """
    Service for managing system API keys with database overrides.

    Keys are encrypted at rest using Fernet symmetric encryption.
    The database can override environment variables for dynamic updates.
    """

    def __init__(self):
        """Initialize the service with encryption key."""
        # Use SECRET_KEY for encrypting API keys at rest
        key_bytes = settings.SECRET_KEY.encode()[:32].ljust(32, b"0")
        self.cipher = Fernet(base64.urlsafe_b64encode(key_bytes))

    def encrypt_value(self, value: str) -> str:
        """Encrypt a value for database storage."""
        return self.cipher.encrypt(value.encode()).decode()

    def decrypt_value(self, encrypted_value: str) -> str:
        """Decrypt a value from database storage."""
        return self.cipher.decrypt(encrypted_value.encode()).decode()

    def get_env_value(self, integration_id: str) -> Optional[str]:
        """Get the value from environment variable."""
        key_name = INTEGRATION_KEY_MAP.get(integration_id)
        if not key_name:
            return None
        return getattr(settings, key_name, None)

    def get_key(self, db: Session, integration_id: str) -> Optional[str]:
        """
        Get the effective API key value.

        Returns DB override if set, otherwise falls back to .env value.
        """
        # Check for DB override first
        record = (
            db.query(SystemAPIKey)
            .filter(
                SystemAPIKey.integration_id == integration_id,
                SystemAPIKey.is_override.is_(True),
            )
            .first()
        )

        if record and record.encrypted_value:
            try:
                return self.decrypt_value(record.encrypted_value)
            except Exception:
                # If decryption fails, fall back to env
                pass

        # Fall back to environment variable
        return self.get_env_value(integration_id)

    def set_key(
        self,
        db: Session,
        integration_id: str,
        value: str,
        user_id: UUID,
    ) -> SystemAPIKey:
        """
        Set/update an API key in the database.

        This creates a DB override for the environment variable.
        """
        key_name = INTEGRATION_KEY_MAP.get(integration_id, integration_id.upper() + "_API_KEY")
        encrypted_value = self.encrypt_value(value)

        # Check if record exists
        record = db.query(SystemAPIKey).filter(SystemAPIKey.integration_id == integration_id).first()

        if record:
            record.encrypted_value = encrypted_value
            record.is_override = True
            record.updated_by = user_id
            record.updated_at = datetime.now(timezone.utc)
            record.validation_status = "unknown"
            record.last_validated_at = None
        else:
            record = SystemAPIKey(
                integration_id=integration_id,
                key_name=key_name,
                encrypted_value=encrypted_value,
                is_override=True,
                updated_by=user_id,
            )
            db.add(record)

        db.commit()
        db.refresh(record)
        return record

    def clear_override(self, db: Session, integration_id: str) -> bool:
        """
        Clear the DB override and revert to .env value.

        Returns True if override was cleared.
        """
        record = db.query(SystemAPIKey).filter(SystemAPIKey.integration_id == integration_id).first()

        if record:
            record.encrypted_value = None
            record.is_override = False
            record.validation_status = None
            record.last_validated_at = None
            db.commit()
            return True

        return False

    def update_validation_status(
        self,
        db: Session,
        integration_id: str,
        status: str,
    ) -> None:
        """Update the validation status of a key."""
        record = db.query(SystemAPIKey).filter(SystemAPIKey.integration_id == integration_id).first()

        if record:
            record.validation_status = status
            record.last_validated_at = datetime.now(timezone.utc)
            db.commit()

    def get_key_info(self, db: Session, integration_id: str) -> dict:
        """
        Get information about a key without exposing the value.

        Returns configuration status and masked preview.
        """
        key_name = INTEGRATION_KEY_MAP.get(integration_id)
        env_value = self.get_env_value(integration_id) if key_name else None

        record = db.query(SystemAPIKey).filter(SystemAPIKey.integration_id == integration_id).first()

        # Determine source and configure status
        if record and record.is_override and record.encrypted_value:
            try:
                value = self.decrypt_value(record.encrypted_value)
                source = "database"
                is_configured = True
                masked_value = self._mask_value(value)
            except Exception:
                source = "database_error"
                is_configured = False
                masked_value = None
        elif env_value:
            source = "environment"
            is_configured = True
            masked_value = self._mask_value(env_value)
        else:
            source = "not_configured"
            is_configured = False
            masked_value = None

        return {
            "integration_id": integration_id,
            "key_name": key_name or f"{integration_id.upper()}_API_KEY",
            "is_configured": is_configured,
            "source": source,
            "masked_value": masked_value,
            "is_override": record.is_override if record else False,
            "validation_status": record.validation_status if record else None,
            "last_validated_at": (
                record.last_validated_at.isoformat() if record and record.last_validated_at else None
            ),
            "updated_at": record.updated_at.isoformat() if record else None,
        }

    def list_all_keys(self, db: Session) -> List[dict]:
        """Get info for all known integrations."""
        result = []
        for integration_id in INTEGRATION_KEY_MAP.keys():
            result.append(self.get_key_info(db, integration_id))
        return result

    def _mask_value(self, value: str) -> str:
        """Mask a value for safe display (show first 4 and last 4 chars)."""
        if not value:
            return None
        if len(value) <= 8:
            return "*" * len(value)
        return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"


# Global instance
system_key_service = SystemKeyService()


def get_system_key(db: Session, integration_id: str) -> Optional[str]:
    """Convenience function to get a system key value."""
    return system_key_service.get_key(db, integration_id)

"""
User API Key Service for programmatic access to VoiceAssist API.

Provides secure key generation, hashing, and validation for user-generated API keys.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple
from uuid import UUID

from app.models.user import User
from app.models.user_api_key import UserAPIKey
from passlib.context import CryptContext
from sqlalchemy.orm import Session

# Password context for hashing API keys (same as password hashing)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# API key prefix
KEY_PREFIX = "va_k_"


class UserAPIKeyService:
    """
    Service for managing user-generated API keys.

    Keys are hashed with bcrypt for secure storage.
    The full key is only returned once at creation time.
    """

    def generate_key(self) -> Tuple[str, str]:
        """
        Generate a new API key.

        Returns:
            Tuple of (full_key, key_prefix)
            - full_key: Complete key to give to user (shown once)
            - key_prefix: First 12 chars for display/identification
        """
        # Generate 32 random URL-safe characters
        random_part = secrets.token_urlsafe(24)  # ~32 chars after encoding
        full_key = f"{KEY_PREFIX}{random_part}"

        # Store first 12 chars as prefix for identification
        key_prefix = full_key[:12]

        return full_key, key_prefix

    def hash_key(self, key: str) -> str:
        """Hash an API key for secure storage."""
        return pwd_context.hash(key)

    def verify_key(self, plain_key: str, hashed_key: str) -> bool:
        """Verify a plain API key against its hash."""
        return pwd_context.verify(plain_key, hashed_key)

    def create_key(
        self,
        db: Session,
        user_id: UUID,
        name: str,
        expires_in_days: Optional[int] = None,
        scopes: Optional[List[str]] = None,
    ) -> Tuple[UserAPIKey, str]:
        """
        Create a new API key for a user.

        Args:
            db: Database session
            user_id: User ID
            name: User-provided name for the key
            expires_in_days: Optional expiration (None = never expires)
            scopes: Optional list of permission scopes

        Returns:
            Tuple of (UserAPIKey record, full_key)
            Note: full_key is only available at creation time!
        """
        full_key, key_prefix = self.generate_key()
        key_hash = self.hash_key(full_key)

        expires_at = None
        if expires_in_days:
            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

        api_key = UserAPIKey(
            user_id=user_id,
            key_prefix=key_prefix,
            key_hash=key_hash,
            name=name,
            scopes=scopes or [],
            expires_at=expires_at,
        )

        db.add(api_key)
        db.commit()
        db.refresh(api_key)

        return api_key, full_key

    def validate_key(
        self,
        db: Session,
        plain_key: str,
        update_last_used: bool = True,
        ip_address: Optional[str] = None,
    ) -> Optional[User]:
        """
        Validate an API key and return the associated user.

        Args:
            db: Database session
            plain_key: The API key provided by the client
            update_last_used: Whether to update last_used_at timestamp
            ip_address: Client IP address for tracking

        Returns:
            User if key is valid, None otherwise
        """
        if not plain_key or not plain_key.startswith(KEY_PREFIX):
            return None

        # Extract prefix for lookup
        key_prefix = plain_key[:12]

        # Find all non-revoked keys with this prefix
        api_keys = (
            db.query(UserAPIKey)
            .filter(
                UserAPIKey.key_prefix == key_prefix,
                UserAPIKey.is_revoked.is_(False),
            )
            .all()
        )

        for api_key in api_keys:
            # Check expiration
            if api_key.expires_at and datetime.now(timezone.utc) > api_key.expires_at:
                continue

            # Verify the hash
            if self.verify_key(plain_key, api_key.key_hash):
                # Update last used info
                if update_last_used:
                    api_key.last_used_at = datetime.now(timezone.utc)
                    if ip_address:
                        api_key.last_used_ip = ip_address
                    db.commit()

                # Load and return the user
                user = db.query(User).filter(User.id == api_key.user_id).first()
                return user

        return None

    def revoke_key(self, db: Session, key_id: UUID, user_id: UUID) -> bool:
        """
        Revoke an API key.

        Args:
            db: Database session
            key_id: ID of the key to revoke
            user_id: ID of the user (for ownership verification)

        Returns:
            True if revoked, False if not found or not owned by user
        """
        api_key = (
            db.query(UserAPIKey)
            .filter(
                UserAPIKey.id == key_id,
                UserAPIKey.user_id == user_id,
            )
            .first()
        )

        if not api_key:
            return False

        api_key.is_revoked = True
        api_key.revoked_at = datetime.now(timezone.utc)
        db.commit()

        return True

    def list_user_keys(
        self,
        db: Session,
        user_id: UUID,
        include_revoked: bool = False,
    ) -> List[UserAPIKey]:
        """
        List all API keys for a user.

        Args:
            db: Database session
            user_id: User ID
            include_revoked: Whether to include revoked keys

        Returns:
            List of UserAPIKey records (without the actual key values)
        """
        query = db.query(UserAPIKey).filter(UserAPIKey.user_id == user_id)

        if not include_revoked:
            query = query.filter(UserAPIKey.is_revoked.is_(False))

        return query.order_by(UserAPIKey.created_at.desc()).all()

    def get_key_by_id(
        self,
        db: Session,
        key_id: UUID,
        user_id: UUID,
    ) -> Optional[UserAPIKey]:
        """Get a specific API key by ID (with ownership verification)."""
        return (
            db.query(UserAPIKey)
            .filter(
                UserAPIKey.id == key_id,
                UserAPIKey.user_id == user_id,
            )
            .first()
        )


# Global instance
user_api_key_service = UserAPIKeyService()

"""
Two-Factor Authentication (2FA) Service using TOTP.

Provides TOTP-based 2FA with:
- Secret generation and QR code creation
- Code verification with time window tolerance
- Backup codes for account recovery
"""

import base64
import io
import secrets
from typing import Optional, Tuple

import pyotp
import qrcode
from app.core.config import settings
from cryptography.fernet import Fernet


class TwoFactorService:
    """
    Service for managing TOTP-based two-factor authentication.
    """

    # App name shown in authenticator apps
    ISSUER_NAME = "VoiceAssist Admin"

    # Number of backup codes to generate
    BACKUP_CODE_COUNT = 10

    # Backup code length (alphanumeric)
    BACKUP_CODE_LENGTH = 8

    def __init__(self):
        """Initialize the 2FA service with encryption key."""
        # Use SECRET_KEY for encrypting TOTP secrets at rest
        # Ensure key is 32 bytes for Fernet
        key_bytes = settings.SECRET_KEY.encode()[:32].ljust(32, b"0")
        self.cipher = Fernet(base64.urlsafe_b64encode(key_bytes))

    def generate_secret(self) -> str:
        """
        Generate a new TOTP secret.

        Returns:
            Base32-encoded secret string
        """
        return pyotp.random_base32()

    def encrypt_secret(self, secret: str) -> str:
        """
        Encrypt a TOTP secret for database storage.

        Args:
            secret: Plain TOTP secret

        Returns:
            Encrypted secret string
        """
        return self.cipher.encrypt(secret.encode()).decode()

    def decrypt_secret(self, encrypted_secret: str) -> str:
        """
        Decrypt a TOTP secret from database storage.

        Args:
            encrypted_secret: Encrypted secret string

        Returns:
            Plain TOTP secret
        """
        return self.cipher.decrypt(encrypted_secret.encode()).decode()

    def get_provisioning_uri(self, secret: str, email: str) -> str:
        """
        Generate a provisioning URI for authenticator apps.

        Args:
            secret: Plain TOTP secret
            email: User's email (used as account name)

        Returns:
            otpauth:// URI for QR code generation
        """
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(name=email, issuer_name=self.ISSUER_NAME)

    def generate_qr_code(self, provisioning_uri: str) -> str:
        """
        Generate a QR code image as base64-encoded PNG.

        Args:
            provisioning_uri: otpauth:// URI

        Returns:
            Base64-encoded PNG image data URL
        """
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(provisioning_uri)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")

        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.getvalue()).decode()

        return f"data:image/png;base64,{img_base64}"

    def verify_code(self, secret: str, code: str, valid_window: int = 1) -> bool:
        """
        Verify a TOTP code.

        Args:
            secret: Plain TOTP secret
            code: 6-digit TOTP code from user
            valid_window: Number of time steps to check before/after current

        Returns:
            True if code is valid
        """
        if not code or len(code) != 6 or not code.isdigit():
            return False

        totp = pyotp.TOTP(secret)
        return totp.verify(code, valid_window=valid_window)

    def generate_backup_codes(self) -> list[str]:
        """
        Generate a set of backup codes for account recovery.

        Returns:
            List of backup codes
        """
        codes = []
        for _ in range(self.BACKUP_CODE_COUNT):
            # Generate alphanumeric code
            code = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(self.BACKUP_CODE_LENGTH))
            # Format as XXXX-XXXX for readability
            formatted = f"{code[:4]}-{code[4:]}"
            codes.append(formatted)
        return codes

    def encrypt_backup_codes(self, codes: list[str]) -> str:
        """
        Encrypt backup codes for database storage.

        Args:
            codes: List of backup codes

        Returns:
            Encrypted comma-separated codes
        """
        joined = ",".join(codes)
        return self.cipher.encrypt(joined.encode()).decode()

    def decrypt_backup_codes(self, encrypted_codes: str) -> list[str]:
        """
        Decrypt backup codes from database storage.

        Args:
            encrypted_codes: Encrypted codes string

        Returns:
            List of backup codes
        """
        if not encrypted_codes:
            return []
        decrypted = self.cipher.decrypt(encrypted_codes.encode()).decode()
        return decrypted.split(",")

    def verify_backup_code(self, encrypted_codes: str, code: str) -> Tuple[bool, Optional[str]]:
        """
        Verify a backup code and remove it if valid.

        Args:
            encrypted_codes: Encrypted backup codes from database
            code: Backup code to verify (with or without dash)

        Returns:
            Tuple of (is_valid, updated_encrypted_codes)
            - If valid, returns (True, new_encrypted_codes)
            - If invalid, returns (False, None)
        """
        # Normalize code format
        code = code.upper().replace("-", "")
        if len(code) != self.BACKUP_CODE_LENGTH:
            return (False, None)

        # Format for comparison
        formatted_code = f"{code[:4]}-{code[4:]}"

        codes = self.decrypt_backup_codes(encrypted_codes)

        if formatted_code not in codes:
            return (False, None)

        # Remove used code
        codes.remove(formatted_code)

        if codes:
            return (True, self.encrypt_backup_codes(codes))
        else:
            return (True, "")

    def setup_2fa(self, email: str) -> dict:
        """
        Generate all data needed to set up 2FA for a user.

        Args:
            email: User's email address

        Returns:
            Dict with secret, qr_code, and backup_codes
        """
        secret = self.generate_secret()
        provisioning_uri = self.get_provisioning_uri(secret, email)
        qr_code = self.generate_qr_code(provisioning_uri)
        backup_codes = self.generate_backup_codes()

        return {
            "secret": secret,
            "encrypted_secret": self.encrypt_secret(secret),
            "qr_code": qr_code,
            "provisioning_uri": provisioning_uri,
            "backup_codes": backup_codes,
            "encrypted_backup_codes": self.encrypt_backup_codes(backup_codes),
        }


# Global instance
two_factor_service = TwoFactorService()

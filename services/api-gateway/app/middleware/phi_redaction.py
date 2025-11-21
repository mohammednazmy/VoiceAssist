"""PHI (Protected Health Information) redaction for logs.

HIPAA Compliance: Ensures that PHI is never logged or exposed in traces/metrics.
Implements automatic redaction patterns for common PHI data types.
"""
import re
from typing import Any, Dict, List, Optional


# Patterns for common PHI data types
PHI_PATTERNS = {
    # Social Security Numbers
    'ssn': re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),
    'ssn_compact': re.compile(r'\b\d{9}\b'),

    # Phone numbers
    'phone': re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'),

    # Email addresses
    'email': re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),

    # Medical Record Numbers (MRN) - typically 6-10 digits
    'mrn': re.compile(r'\b(?:mrn|medical[-_]?record[-_]?number|patient[-_]?id)[:\s]*(\d{6,10})\b', re.IGNORECASE),

    # Date of Birth
    'dob': re.compile(r'\b(?:dob|date[-_]?of[-_]?birth|birth[-_]?date)[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b', re.IGNORECASE),

    # IP addresses (can be used to identify individuals)
    'ip_address': re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b'),

    # Credit card numbers
    'credit_card': re.compile(r'\b(?:\d{4}[-\s]?){3}\d{4}\b'),

    # Addresses (simplified pattern)
    'address': re.compile(r'\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|boulevard|blvd)\b', re.IGNORECASE),
}

# Fields that should always be redacted
PHI_FIELD_NAMES = {
    'ssn', 'social_security', 'social_security_number',
    'phone', 'phone_number', 'telephone', 'mobile',
    'email', 'email_address',
    'mrn', 'medical_record_number', 'patient_id',
    'dob', 'date_of_birth', 'birth_date', 'birthdate',
    'address', 'street_address', 'home_address',
    'first_name', 'last_name', 'full_name', 'name',
    'password', 'token', 'access_token', 'refresh_token',
    'api_key', 'secret', 'private_key',
    'credit_card', 'card_number', 'cvv', 'card_cvv',
}


class PHIRedactor:
    """Redactor for PHI in logs, traces, and metrics."""

    def __init__(self, redaction_string: str = "[REDACTED]"):
        """Initialize PHI redactor.

        Args:
            redaction_string: String to replace PHI with
        """
        self.redaction_string = redaction_string

    def redact_string(self, text: str) -> str:
        """Redact PHI from a string.

        Args:
            text: Text potentially containing PHI

        Returns:
            Text with PHI redacted
        """
        if not text or not isinstance(text, str):
            return text

        # Apply all PHI patterns
        for pattern_name, pattern in PHI_PATTERNS.items():
            text = pattern.sub(self.redaction_string, text)

        return text

    def redact_dict(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Redact PHI from a dictionary.

        Args:
            data: Dictionary potentially containing PHI

        Returns:
            Dictionary with PHI redacted
        """
        if not isinstance(data, dict):
            return data

        redacted = {}
        for key, value in data.items():
            # Check if field name indicates PHI
            if self._is_phi_field(key):
                redacted[key] = self.redaction_string
            # Recursively redact nested structures
            elif isinstance(value, dict):
                redacted[key] = self.redact_dict(value)
            elif isinstance(value, list):
                redacted[key] = self.redact_list(value)
            elif isinstance(value, str):
                redacted[key] = self.redact_string(value)
            else:
                redacted[key] = value

        return redacted

    def redact_list(self, data: List[Any]) -> List[Any]:
        """Redact PHI from a list.

        Args:
            data: List potentially containing PHI

        Returns:
            List with PHI redacted
        """
        if not isinstance(data, list):
            return data

        return [
            self.redact_dict(item) if isinstance(item, dict)
            else self.redact_list(item) if isinstance(item, list)
            else self.redact_string(item) if isinstance(item, str)
            else item
            for item in data
        ]

    def _is_phi_field(self, field_name: str) -> bool:
        """Check if a field name indicates PHI.

        Args:
            field_name: Field name to check

        Returns:
            True if field contains PHI
        """
        field_lower = field_name.lower().replace('-', '_')
        return any(phi_field in field_lower for phi_field in PHI_FIELD_NAMES)

    def redact_exception(self, exception: Exception) -> str:
        """Redact PHI from exception message.

        Args:
            exception: Exception instance

        Returns:
            Redacted exception message
        """
        message = str(exception)
        return self.redact_string(message)


# Global redactor instance
_global_redactor = PHIRedactor()


def redact_phi(data: Any) -> Any:
    """Convenience function to redact PHI from any data type.

    Args:
        data: Data to redact (string, dict, list, etc.)

    Returns:
        Redacted data
    """
    if isinstance(data, str):
        return _global_redactor.redact_string(data)
    elif isinstance(data, dict):
        return _global_redactor.redact_dict(data)
    elif isinstance(data, list):
        return _global_redactor.redact_list(data)
    elif isinstance(data, Exception):
        return _global_redactor.redact_exception(data)
    else:
        return data


def is_phi_field(field_name: str) -> bool:
    """Check if a field name indicates PHI.

    Args:
        field_name: Field name to check

    Returns:
        True if field contains PHI
    """
    return _global_redactor._is_phi_field(field_name)


# Example usage in logging:
"""
import logging
from app.middleware.phi_redaction import redact_phi

logger = logging.getLogger(__name__)

# Before logging user data
user_data = {
    "user_id": "123",
    "email": "patient@example.com",
    "ssn": "123-45-6789",
    "name": "John Doe"
}

# Redact before logging
logger.info(f"User data: {redact_phi(user_data)}")
# Logs: User data: {'user_id': '123', 'email': '[REDACTED]', 'ssn': '[REDACTED]', 'name': '[REDACTED]'}
"""

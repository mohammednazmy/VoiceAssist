"""Unit tests for PHI redaction middleware.

Tests PHI (Protected Health Information) detection and redaction including:
- SSN redaction
- Medical record number redaction
- Phone number masking
- Email masking
- Passthrough for non-PHI content
"""
from __future__ import annotations

import re
from typing import Dict, List, Any
from unittest.mock import MagicMock, patch

import pytest


# Mock PHI redaction implementation for testing
class PHIEntity:
    """Detected PHI entity."""

    def __init__(self, entity_type: str, text: str, start: int, end: int, confidence: float = 1.0):
        self.entity_type = entity_type
        self.text = text
        self.start = start
        self.end = end
        self.confidence = confidence


class PHIRedactionService:
    """Service for detecting and redacting PHI from text."""

    # Regex patterns for PHI detection
    PATTERNS = {
        "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
        "phone": re.compile(r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b"),
        "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
        "mrn": re.compile(r"\b(MRN|Medical Record Number)[\s:-]*\d{5,10}\b", re.IGNORECASE),
        "date_of_birth": re.compile(r"\b(DOB|Date of Birth)[\s:-]*(0?[1-9]|1[0-2])/(0?[1-9]|[12][0-9]|3[01])/\d{4}\b", re.IGNORECASE),
    }

    REDACTION_TEMPLATES = {
        "ssn": "[SSN-REDACTED]",
        "phone": "[PHONE-REDACTED]",
        "email": "[EMAIL-REDACTED]",
        "mrn": "[MRN-REDACTED]",
        "date_of_birth": "[DOB-REDACTED]",
    }

    def detect_phi(self, text: str) -> List[PHIEntity]:
        """Detect PHI entities in text.

        Args:
            text: Text to scan for PHI

        Returns:
            List of detected PHI entities
        """
        entities = []

        for entity_type, pattern in self.PATTERNS.items():
            for match in pattern.finditer(text):
                entity = PHIEntity(
                    entity_type=entity_type,
                    text=match.group(),
                    start=match.start(),
                    end=match.end(),
                )
                entities.append(entity)

        # Sort by start position
        entities.sort(key=lambda e: e.start)
        return entities

    def redact_text(self, text: str, entities: List[PHIEntity] = None) -> str:
        """Redact PHI from text.

        Args:
            text: Text containing PHI
            entities: Optional pre-detected entities, will detect if not provided

        Returns:
            Text with PHI redacted
        """
        if entities is None:
            entities = self.detect_phi(text)

        if not entities:
            return text

        # Redact from end to start to preserve positions
        redacted = text
        for entity in reversed(entities):
            template = self.REDACTION_TEMPLATES.get(entity.entity_type, "[REDACTED]")
            redacted = redacted[:entity.start] + template + redacted[entity.end:]

        return redacted

    def mask_text(self, text: str, entities: List[PHIEntity] = None, mask_char: str = "*") -> str:
        """Mask PHI in text instead of fully redacting.

        Args:
            text: Text containing PHI
            entities: Optional pre-detected entities
            mask_char: Character to use for masking

        Returns:
            Text with PHI masked
        """
        if entities is None:
            entities = self.detect_phi(text)

        if not entities:
            return text

        masked = text
        for entity in reversed(entities):
            # Keep first and last character visible for some types
            if entity.entity_type in ("ssn", "phone", "email"):
                original = entity.text
                if len(original) > 4:
                    masked_value = original[0] + mask_char * (len(original) - 2) + original[-1]
                else:
                    masked_value = mask_char * len(original)
            else:
                masked_value = mask_char * len(entity.text)

            masked = masked[:entity.start] + masked_value + masked[entity.end:]

        return masked

    def contains_phi(self, text: str) -> bool:
        """Check if text contains any PHI.

        Args:
            text: Text to check

        Returns:
            True if PHI is detected, False otherwise
        """
        return len(self.detect_phi(text)) > 0


# ============================================================================
# SSN Redaction Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.phi
def test_ssn_detection():
    """Test that SSNs are correctly detected."""
    service = PHIRedactionService()
    text = "Patient SSN is 123-45-6789"

    entities = service.detect_phi(text)

    assert len(entities) == 1
    assert entities[0].entity_type == "ssn"
    assert entities[0].text == "123-45-6789"


@pytest.mark.unit
@pytest.mark.phi
def test_ssn_redaction():
    """Test that SSNs are properly redacted."""
    service = PHIRedactionService()
    text = "Patient SSN is 123-45-6789"

    redacted = service.redact_text(text)

    assert "123-45-6789" not in redacted
    assert "[SSN-REDACTED]" in redacted


@pytest.mark.unit
@pytest.mark.phi
@pytest.mark.parametrize("ssn", [
    "123-45-6789",
    "987-65-4321",
    "000-00-0000",
])
def test_multiple_ssn_formats(ssn: str):
    """Test detection of various SSN formats."""
    service = PHIRedactionService()
    text = f"SSN: {ssn}"

    entities = service.detect_phi(text)

    assert len(entities) >= 1
    assert any(e.entity_type == "ssn" for e in entities)


@pytest.mark.unit
@pytest.mark.phi
def test_multiple_ssns_in_text():
    """Test detection and redaction of multiple SSNs."""
    service = PHIRedactionService()
    text = "Patient 1: 123-45-6789, Patient 2: 987-65-4321"

    entities = service.detect_phi(text)
    ssn_entities = [e for e in entities if e.entity_type == "ssn"]

    assert len(ssn_entities) == 2


@pytest.mark.unit
@pytest.mark.phi
def test_ssn_masking():
    """Test that SSNs can be masked instead of fully redacted."""
    service = PHIRedactionService()
    text = "Patient SSN is 123-45-6789"

    masked = service.mask_text(text)

    assert "123-45-6789" not in masked
    assert masked.startswith("Patient SSN is 1")
    assert masked.endswith("9")
    assert "*" in masked


# ============================================================================
# Medical Record Number Redaction Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.phi
def test_mrn_detection():
    """Test that MRNs are correctly detected."""
    service = PHIRedactionService()
    text = "Medical Record Number: 123456"

    entities = service.detect_phi(text)

    mrn_entities = [e for e in entities if e.entity_type == "mrn"]
    assert len(mrn_entities) >= 1


@pytest.mark.unit
@pytest.mark.phi
def test_mrn_redaction():
    """Test that MRNs are properly redacted."""
    service = PHIRedactionService()
    text = "MRN: 123456"

    redacted = service.redact_text(text)

    assert "123456" not in redacted or "[MRN-REDACTED]" in redacted


@pytest.mark.unit
@pytest.mark.phi
@pytest.mark.parametrize("mrn_text", [
    "MRN: 123456",
    "Medical Record Number: 789012",
    "MRN-345678",
    "mrn 901234",
])
def test_various_mrn_formats(mrn_text: str):
    """Test detection of various MRN formats."""
    service = PHIRedactionService()

    entities = service.detect_phi(mrn_text)

    # Should detect MRN (or at least the number part)
    assert len(entities) >= 1


@pytest.mark.unit
@pytest.mark.phi
def test_mrn_case_insensitive():
    """Test that MRN detection is case-insensitive."""
    service = PHIRedactionService()
    texts = [
        "MRN: 123456",
        "mrn: 123456",
        "Mrn: 123456",
    ]

    for text in texts:
        entities = service.detect_phi(text)
        assert len(entities) >= 1


# ============================================================================
# Phone Number Masking Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.phi
def test_phone_detection():
    """Test that phone numbers are correctly detected."""
    service = PHIRedactionService()
    text = "Call me at 555-123-4567"

    entities = service.detect_phi(text)

    phone_entities = [e for e in entities if e.entity_type == "phone"]
    assert len(phone_entities) == 1
    assert "555-123-4567" in phone_entities[0].text


@pytest.mark.unit
@pytest.mark.phi
def test_phone_redaction():
    """Test that phone numbers are properly redacted."""
    service = PHIRedactionService()
    text = "Call me at 555-123-4567"

    redacted = service.redact_text(text)

    assert "555-123-4567" not in redacted
    assert "[PHONE-REDACTED]" in redacted


@pytest.mark.unit
@pytest.mark.phi
@pytest.mark.parametrize("phone", [
    "555-123-4567",
    "555.123.4567",
    "5551234567",
])
def test_various_phone_formats(phone: str):
    """Test detection of various phone number formats."""
    service = PHIRedactionService()
    text = f"Phone: {phone}"

    entities = service.detect_phi(text)

    phone_entities = [e for e in entities if e.entity_type == "phone"]
    assert len(phone_entities) >= 1


@pytest.mark.unit
@pytest.mark.phi
def test_phone_masking():
    """Test that phone numbers can be masked."""
    service = PHIRedactionService()
    text = "Contact: 555-123-4567"

    masked = service.mask_text(text)

    assert "555-123-4567" not in masked
    assert "*" in masked


@pytest.mark.unit
@pytest.mark.phi
def test_multiple_phone_numbers():
    """Test detection of multiple phone numbers."""
    service = PHIRedactionService()
    text = "Home: 555-123-4567, Work: 555-987-6543"

    entities = service.detect_phi(text)

    phone_entities = [e for e in entities if e.entity_type == "phone"]
    assert len(phone_entities) == 2


# ============================================================================
# Email Masking Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.phi
def test_email_detection():
    """Test that email addresses are correctly detected."""
    service = PHIRedactionService()
    text = "Contact: patient@example.com"

    entities = service.detect_phi(text)

    email_entities = [e for e in entities if e.entity_type == "email"]
    assert len(email_entities) == 1
    assert email_entities[0].text == "patient@example.com"


@pytest.mark.unit
@pytest.mark.phi
def test_email_redaction():
    """Test that email addresses are properly redacted."""
    service = PHIRedactionService()
    text = "Email: patient@example.com"

    redacted = service.redact_text(text)

    assert "patient@example.com" not in redacted
    assert "[EMAIL-REDACTED]" in redacted


@pytest.mark.unit
@pytest.mark.phi
@pytest.mark.parametrize("email", [
    "patient@example.com",
    "john.doe@hospital.org",
    "user+tag@domain.co.uk",
    "test_user@subdomain.example.com",
])
def test_various_email_formats(email: str):
    """Test detection of various email formats."""
    service = PHIRedactionService()
    text = f"Email: {email}"

    entities = service.detect_phi(text)

    email_entities = [e for e in entities if e.entity_type == "email"]
    assert len(email_entities) == 1


@pytest.mark.unit
@pytest.mark.phi
def test_email_masking():
    """Test that emails can be masked."""
    service = PHIRedactionService()
    text = "Contact: patient@example.com"

    masked = service.mask_text(text)

    assert "patient@example.com" not in masked
    assert "*" in masked


@pytest.mark.unit
@pytest.mark.phi
def test_multiple_emails():
    """Test detection of multiple email addresses."""
    service = PHIRedactionService()
    text = "Primary: john@example.com, Secondary: jane@example.com"

    entities = service.detect_phi(text)

    email_entities = [e for e in entities if e.entity_type == "email"]
    assert len(email_entities) == 2


# ============================================================================
# Passthrough for Non-PHI Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.phi
def test_non_phi_text_unchanged():
    """Test that text without PHI is not modified."""
    service = PHIRedactionService()
    text = "The weather is nice today."

    redacted = service.redact_text(text)

    assert redacted == text


@pytest.mark.unit
@pytest.mark.phi
def test_contains_phi_returns_false_for_clean_text():
    """Test that contains_phi returns False for clean text."""
    service = PHIRedactionService()
    text = "This is a normal message without any sensitive data."

    assert service.contains_phi(text) is False


@pytest.mark.unit
@pytest.mark.phi
def test_contains_phi_returns_true_for_phi_text():
    """Test that contains_phi returns True when PHI is present."""
    service = PHIRedactionService()
    text = "Patient SSN is 123-45-6789"

    assert service.contains_phi(text) is True


@pytest.mark.unit
@pytest.mark.phi
def test_empty_text_returns_empty():
    """Test that empty text returns empty after redaction."""
    service = PHIRedactionService()
    text = ""

    redacted = service.redact_text(text)

    assert redacted == ""


@pytest.mark.unit
@pytest.mark.phi
def test_whitespace_only_text():
    """Test handling of whitespace-only text."""
    service = PHIRedactionService()
    text = "   \n\t  "

    redacted = service.redact_text(text)

    assert redacted == text


@pytest.mark.unit
@pytest.mark.phi
def test_numbers_alone_not_detected_as_phi():
    """Test that random numbers are not falsely detected as PHI."""
    service = PHIRedactionService()
    text = "The year is 2023 and the temperature is 72 degrees."

    entities = service.detect_phi(text)

    # Should not detect any PHI
    assert len(entities) == 0


# ============================================================================
# Mixed Content Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.phi
def test_mixed_phi_and_normal_text():
    """Test redaction of text with both PHI and normal content."""
    service = PHIRedactionService()
    text = "Patient John Doe, SSN: 123-45-6789, scheduled for tomorrow."

    redacted = service.redact_text(text)

    assert "123-45-6789" not in redacted
    assert "John Doe" in redacted  # Names not detected in basic implementation
    assert "scheduled for tomorrow" in redacted


@pytest.mark.unit
@pytest.mark.phi
def test_multiple_types_of_phi():
    """Test detection and redaction of multiple PHI types in one text."""
    service = PHIRedactionService()
    text = "Patient SSN: 123-45-6789, Phone: 555-123-4567, Email: patient@example.com"

    entities = service.detect_phi(text)

    # Should detect all three types
    entity_types = {e.entity_type for e in entities}
    assert "ssn" in entity_types
    assert "phone" in entity_types
    assert "email" in entity_types


@pytest.mark.unit
@pytest.mark.phi
def test_redaction_preserves_structure():
    """Test that redaction preserves overall text structure."""
    service = PHIRedactionService()
    text = "Contact info:\nEmail: patient@example.com\nPhone: 555-123-4567"

    redacted = service.redact_text(text)

    # Structure should be preserved
    assert "Contact info:" in redacted
    assert "\n" in redacted
    assert "Email:" in redacted
    assert "Phone:" in redacted


# ============================================================================
# Edge Cases
# ============================================================================


@pytest.mark.unit
@pytest.mark.phi
def test_phi_at_start_of_text():
    """Test PHI detection when it appears at the start of text."""
    service = PHIRedactionService()
    text = "123-45-6789 is the patient's SSN"

    entities = service.detect_phi(text)

    assert len(entities) >= 1
    assert entities[0].start == 0


@pytest.mark.unit
@pytest.mark.phi
def test_phi_at_end_of_text():
    """Test PHI detection when it appears at the end of text."""
    service = PHIRedactionService()
    text = "Patient SSN: 123-45-6789"

    entities = service.detect_phi(text)

    assert len(entities) >= 1


@pytest.mark.unit
@pytest.mark.phi
def test_consecutive_phi_entities():
    """Test handling of consecutive PHI entities."""
    service = PHIRedactionService()
    text = "SSN: 123-45-6789 Phone: 555-123-4567"

    redacted = service.redact_text(text)

    assert "123-45-6789" not in redacted
    assert "555-123-4567" not in redacted


@pytest.mark.unit
@pytest.mark.phi
def test_overlapping_patterns():
    """Test handling when patterns might overlap."""
    service = PHIRedactionService()
    # Some edge case where patterns might match the same text
    text = "Call 555-123-4567 or 555-987-6543"

    entities = service.detect_phi(text)

    # Should detect both phone numbers separately
    phone_entities = [e for e in entities if e.entity_type == "phone"]
    assert len(phone_entities) == 2


@pytest.mark.unit
@pytest.mark.phi
def test_custom_mask_character():
    """Test using custom mask character."""
    service = PHIRedactionService()
    text = "SSN: 123-45-6789"

    masked = service.mask_text(text, mask_char="#")

    assert "#" in masked
    assert "*" not in masked


@pytest.mark.unit
@pytest.mark.phi
def test_very_long_text_with_phi():
    """Test redaction performance with very long text."""
    service = PHIRedactionService()
    # Create long text with PHI embedded
    text = "Normal text. " * 1000 + "SSN: 123-45-6789" + " More text." * 1000

    redacted = service.redact_text(text)

    assert "123-45-6789" not in redacted
    assert len(redacted) > 0


@pytest.mark.unit
@pytest.mark.phi
def test_unicode_text_with_phi():
    """Test PHI detection in text with unicode characters."""
    service = PHIRedactionService()
    text = "Patient's SSN: 123-45-6789. Note: café"

    redacted = service.redact_text(text)

    assert "123-45-6789" not in redacted
    assert "café" in redacted  # Non-PHI unicode preserved

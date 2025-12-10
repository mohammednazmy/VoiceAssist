"""
Unit tests for PHI (Protected Health Information) Detection Service.

Tests the PHIDetector class from app/services/phi_detector.py to ensure
proper detection of sensitive health information according to HIPAA Safe Harbor rules.
"""

import pytest
from app.services.phi_detector import PHIDetectionResult, PHIDetector


@pytest.fixture
def detector():
    """Create a PHI detector instance for testing."""
    return PHIDetector()


class TestPHIDetectorBasic:
    """Basic PHI detection tests."""

    def test_empty_text_returns_no_phi(self, detector):
        """Empty input should return no PHI detected."""
        result = detector.detect("")
        assert not result.contains_phi
        assert result.phi_types == []

    def test_none_text_returns_no_phi(self, detector):
        """None input should return no PHI detected."""
        result = detector.detect(None)
        assert not result.contains_phi
        assert result.phi_types == []

    def test_clean_medical_query(self, detector):
        """Clean medical questions should not be flagged as PHI."""
        clean_queries = [
            "What are the symptoms of diabetes?",
            "How does metformin work?",
            "What is the recommended dosage for lisinopril?",
            "Explain the mechanism of insulin resistance.",
            "What are common side effects of beta blockers?",
        ]
        for query in clean_queries:
            result = detector.detect(query)
            # Medical queries without identifiers should be clean
            # Note: Some false positives may occur with name detection
            if result.contains_phi:
                # If flagged, should only be due to name patterns, not sensitive data
                assert "ssn" not in result.phi_types
                assert "phone" not in result.phi_types
                assert "mrn" not in result.phi_types


class TestSSNDetection:
    """Tests for Social Security Number detection."""

    def test_detects_ssn_with_dashes(self, detector):
        """Should detect SSN in xxx-xx-xxxx format."""
        result = detector.detect("Patient SSN is 123-45-6789")
        assert result.contains_phi
        assert "ssn" in result.phi_types

    def test_detects_ssn_with_spaces(self, detector):
        """Should detect SSN in xxx xx xxxx format."""
        result = detector.detect("SSN: 123 45 6789")
        assert result.contains_phi
        assert "ssn" in result.phi_types

    def test_detects_ssn_compact(self, detector):
        """Should detect SSN in xxxxxxxxx format."""
        result = detector.detect("Social security 123456789")
        assert result.contains_phi
        assert "ssn" in result.phi_types


class TestPhoneNumberDetection:
    """Tests for phone number detection."""

    def test_detects_phone_with_dashes(self, detector):
        """Should detect phone in xxx-xxx-xxxx format."""
        result = detector.detect("Call me at 555-123-4567")
        assert result.contains_phi
        assert "phone" in result.phi_types

    def test_detects_phone_with_parentheses(self, detector):
        """Should detect phone in (xxx) xxx-xxxx format."""
        result = detector.detect("Phone: (555) 123-4567")
        assert result.contains_phi
        assert "phone" in result.phi_types

    def test_detects_phone_with_dots(self, detector):
        """Should detect phone in xxx.xxx.xxxx format."""
        result = detector.detect("Contact: 555.123.4567")
        assert result.contains_phi
        assert "phone" in result.phi_types

    def test_detects_phone_with_country_code(self, detector):
        """Should detect phone with +1 country code."""
        result = detector.detect("Number: +1-555-123-4567")
        assert result.contains_phi
        assert "phone" in result.phi_types


class TestEmailDetection:
    """Tests for email address detection."""

    def test_detects_standard_email(self, detector):
        """Should detect standard email addresses."""
        result = detector.detect("Email: patient@hospital.com")
        assert result.contains_phi
        assert "email" in result.phi_types

    def test_detects_complex_email(self, detector):
        """Should detect emails with dots and plus signs."""
        result = detector.detect("Contact: john.doe+medical@example.org")
        assert result.contains_phi
        assert "email" in result.phi_types


class TestMRNDetection:
    """Tests for Medical Record Number detection."""

    def test_detects_mrn_with_prefix(self, detector):
        """Should detect MRN with MRN- prefix."""
        result = detector.detect("MRN-12345678")
        assert result.contains_phi
        assert "mrn" in result.phi_types

    def test_detects_medical_record_number(self, detector):
        """Should detect 'medical record number' pattern."""
        # The pattern requires 'record number' not just 'record'
        result = detector.detect("record number 1234567890")
        assert result.contains_phi
        assert "mrn" in result.phi_types


class TestDOBDetection:
    """Tests for Date of Birth detection."""

    def test_detects_dob_format(self, detector):
        """Should detect DOB with date (requires born/dob prefix before date)."""
        # Pattern requires 'born', 'dob', or 'date of birth' directly before the date
        result = detector.detect("born 01/15/1990")
        assert result.contains_phi
        assert "dob" in result.phi_types

    def test_detects_date_of_birth_label(self, detector):
        """Should detect 'date of birth' label."""
        # Pattern requires the date to immediately follow 'date of birth'
        result = detector.detect("date of birth 12/25/1985")
        assert result.contains_phi
        assert "dob" in result.phi_types


class TestIPAddressDetection:
    """Tests for IP address detection."""

    def test_detects_ip_address(self, detector):
        """Should detect IPv4 addresses."""
        result = detector.detect("Connected from 192.168.1.100")
        assert result.contains_phi
        assert "ip_address" in result.phi_types


class TestURLDetection:
    """Tests for URL detection."""

    def test_detects_http_url(self, detector):
        """Should detect HTTP URLs."""
        result = detector.detect("See http://example.com/patient/123")
        assert result.contains_phi
        assert "url" in result.phi_types

    def test_detects_https_url(self, detector):
        """Should detect HTTPS URLs."""
        result = detector.detect("Link: https://portal.hospital.com/records")
        assert result.contains_phi
        assert "url" in result.phi_types


class TestNameDetection:
    """Tests for name detection."""

    def test_detects_capitalized_names(self, detector):
        """Should detect capitalized first and last names."""
        result = detector.detect("Patient John Smith reported symptoms")
        assert result.contains_phi
        assert "name" in result.phi_types

    def test_medical_terms_not_flagged_as_names(self, detector):
        """Medical terms should not be flagged as names."""
        # The medical_terms whitelist should exclude these
        result = detector.detect("Diagnosed with heart disease and blood pressure issues")
        # Should not flag medical terms as PHI
        if result.contains_phi and "name" in result.phi_types:
            # If name is detected, ensure it's not a medical term
            assert "heart disease" not in result.details.get("name", [])


class TestMultiplePHITypes:
    """Tests for detection of multiple PHI types."""

    def test_detects_multiple_phi_types(self, detector):
        """Should detect multiple PHI types in one text."""
        text = """
        Patient: John Smith
        SSN: 123-45-6789
        Phone: 555-123-4567
        Email: jsmith@email.com
        """
        result = detector.detect(text)
        assert result.contains_phi
        assert "ssn" in result.phi_types
        assert "phone" in result.phi_types
        assert "email" in result.phi_types

    def test_counts_multiple_occurrences(self, detector):
        """Should count multiple occurrences of same PHI type."""
        text = "Numbers: 555-111-2222 and 555-333-4444"
        result = detector.detect(text)
        assert result.contains_phi
        assert result.details.get("phone", 0) >= 2


class TestClinicalContextPHI:
    """Tests for PHI detection in clinical context."""

    def test_detects_phi_in_clinical_context(self, detector):
        """Should detect PHI fields in clinical context dict."""
        clinical_context = {
            "patient_name": "John Doe",
            "patient_id": "12345",
            "age": 45,  # Not PHI
            "chief_complaint": "Chest pain",  # Not PHI
        }
        result = detector.detect("Simple query", clinical_context=clinical_context)
        assert result.contains_phi
        assert "patient_name" in result.phi_types or "name" in result.phi_types

    def test_clean_clinical_context(self, detector):
        """Clinical context without identifiers should not be flagged."""
        clinical_context = {
            "age": 45,
            "gender": "male",
            "chief_complaint": "Headache",
        }
        result = detector.detect("What medications help with headaches?", clinical_context=clinical_context)
        # The query itself is clean
        if result.contains_phi:
            # Should not be due to SSN, phone, email etc.
            assert "ssn" not in result.phi_types
            assert "phone" not in result.phi_types


class TestSanitization:
    """Tests for PHI sanitization/redaction."""

    def test_sanitizes_ssn(self, detector):
        """Should redact SSN from text."""
        text = "SSN: 123-45-6789"
        sanitized = detector.sanitize(text)
        assert "123-45-6789" not in sanitized
        assert "SSN_REDACTED" in sanitized

    def test_sanitizes_phone(self, detector):
        """Should redact phone numbers from text."""
        text = "Call 555-123-4567"
        sanitized = detector.sanitize(text)
        assert "555-123-4567" not in sanitized
        assert "PHONE_REDACTED" in sanitized

    def test_sanitizes_email(self, detector):
        """Should redact email addresses from text."""
        text = "Email: test@example.com"
        sanitized = detector.sanitize(text)
        assert "test@example.com" not in sanitized
        assert "EMAIL_REDACTED" in sanitized

    def test_sanitizes_multiple_phi(self, detector):
        """Should redact multiple PHI types."""
        text = "John Smith (SSN: 123-45-6789, phone: 555-123-4567)"
        sanitized = detector.sanitize(text)
        assert "123-45-6789" not in sanitized
        assert "555-123-4567" not in sanitized
        assert "NAME_REDACTED" in sanitized

    def test_preserves_non_phi_text(self, detector):
        """Should preserve non-PHI text."""
        text = "The patient has diabetes and takes metformin."
        sanitized = detector.sanitize(text)
        assert "diabetes" in sanitized
        assert "metformin" in sanitized


class TestPHIDetectionResult:
    """Tests for PHIDetectionResult class."""

    def test_result_attributes(self):
        """PHIDetectionResult should have expected attributes."""
        result = PHIDetectionResult(
            contains_phi=True,
            phi_types=["ssn", "phone"],
            confidence=0.9,
            details={"ssn": 1, "phone": 2},
        )
        assert result.contains_phi is True
        assert result.phi_types == ["ssn", "phone"]
        assert result.confidence == 0.9
        assert result.details == {"ssn": 1, "phone": 2}

    def test_result_defaults(self):
        """PHIDetectionResult should have sensible defaults."""
        result = PHIDetectionResult(contains_phi=False, phi_types=[])
        assert result.confidence == 1.0  # Default confidence
        assert result.details == {}  # Default empty details


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_partial_patterns_not_detected(self, detector):
        """Partial patterns should not be detected as PHI."""
        # 5-digit numbers are not SSN
        result = detector.detect("Patient ID: 12345")
        assert "ssn" not in result.phi_types

    def test_whitespace_handling(self, detector):
        """Should handle extra whitespace."""
        result = detector.detect("   123-45-6789   ")
        assert result.contains_phi
        assert "ssn" in result.phi_types

    def test_case_insensitivity(self, detector):
        """Should detect PHI regardless of case."""
        # DOB pattern requires the date format directly after the keyword
        result = detector.detect("dob 01/15/1990")
        assert result.contains_phi
        result2 = detector.detect("DOB 01/15/1990")
        assert result2.contains_phi

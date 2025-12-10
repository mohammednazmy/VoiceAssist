"""
Unit tests for PHI (Protected Health Information) Redaction Middleware.

Tests the PHIRedactor class from app/middleware/phi_redaction.py to ensure
proper redaction of sensitive information from logs, traces, and metrics.
"""

import pytest
from app.middleware.phi_redaction import PHI_FIELD_NAMES, PHI_PATTERNS, PHIRedactor, is_phi_field, redact_phi


@pytest.fixture
def redactor():
    """Create a PHI redactor instance for testing."""
    return PHIRedactor()


@pytest.fixture
def custom_redactor():
    """Create a PHI redactor with custom redaction string."""
    return PHIRedactor(redaction_string="***HIDDEN***")


class TestPHIRedactorBasic:
    """Basic PHI redactor tests."""

    def test_empty_string_unchanged(self, redactor):
        """Empty strings should be returned unchanged."""
        assert redactor.redact_string("") == ""

    def test_none_input_unchanged(self, redactor):
        """None input should be returned unchanged."""
        assert redactor.redact_string(None) is None

    def test_clean_text_unchanged(self, redactor):
        """Clean text without PHI should be unchanged."""
        clean_text = "The patient has diabetes and takes metformin daily."
        assert redactor.redact_string(clean_text) == clean_text


class TestSSNRedaction:
    """Tests for Social Security Number redaction."""

    def test_redacts_ssn_with_dashes(self, redactor):
        """Should redact SSN in xxx-xx-xxxx format."""
        text = "SSN: 123-45-6789"
        result = redactor.redact_string(text)
        assert "123-45-6789" not in result
        assert "[REDACTED]" in result

    def test_custom_redaction_string(self, custom_redactor):
        """Should use custom redaction string."""
        text = "SSN: 123-45-6789"
        result = custom_redactor.redact_string(text)
        assert "123-45-6789" not in result
        assert "***HIDDEN***" in result


class TestPhoneRedaction:
    """Tests for phone number redaction."""

    def test_redacts_phone_with_dashes(self, redactor):
        """Should redact phone numbers with dashes."""
        text = "Phone: 555-123-4567"
        result = redactor.redact_string(text)
        assert "555-123-4567" not in result
        assert "[REDACTED]" in result

    def test_redacts_phone_with_dots(self, redactor):
        """Should redact phone numbers with dots."""
        text = "Call 555.123.4567"
        result = redactor.redact_string(text)
        assert "555.123.4567" not in result


class TestEmailRedaction:
    """Tests for email address redaction."""

    def test_redacts_email(self, redactor):
        """Should redact email addresses."""
        text = "Email: patient@hospital.com"
        result = redactor.redact_string(text)
        assert "patient@hospital.com" not in result
        assert "[REDACTED]" in result

    def test_redacts_complex_email(self, redactor):
        """Should redact complex email addresses."""
        text = "Contact: john.doe+test@subdomain.example.com"
        result = redactor.redact_string(text)
        assert "@" not in result or "[REDACTED]" in result


class TestMRNRedaction:
    """Tests for Medical Record Number redaction."""

    def test_redacts_mrn(self, redactor):
        """Should redact MRN patterns."""
        text = "MRN: 1234567890"
        result = redactor.redact_string(text)
        assert "1234567890" not in result


class TestIPAddressRedaction:
    """Tests for IP address redaction."""

    def test_redacts_ip_address(self, redactor):
        """Should redact IP addresses."""
        text = "Logged in from 192.168.1.100"
        result = redactor.redact_string(text)
        assert "192.168.1.100" not in result
        assert "[REDACTED]" in result


class TestCreditCardRedaction:
    """Tests for credit card number redaction."""

    def test_redacts_credit_card(self, redactor):
        """Should redact credit card numbers."""
        text = "Card: 1234-5678-9012-3456"
        result = redactor.redact_string(text)
        assert "1234-5678-9012-3456" not in result


class TestAddressRedaction:
    """Tests for address redaction."""

    def test_redacts_street_address(self, redactor):
        """Should redact street addresses."""
        text = "Lives at 123 Main Street"
        result = redactor.redact_string(text)
        assert "123 Main Street" not in result


class TestDictRedaction:
    """Tests for dictionary redaction."""

    def test_redacts_phi_field_by_name(self, redactor):
        """Should redact fields with PHI-indicating names."""
        data = {
            "user_id": "123",
            "email": "test@example.com",
            "ssn": "123-45-6789",
        }
        result = redactor.redact_dict(data)
        assert result["user_id"] == "123"  # Not a PHI field name
        assert result["email"] == "[REDACTED]"
        assert result["ssn"] == "[REDACTED]"

    def test_redacts_nested_dict(self, redactor):
        """Should redact nested dictionaries."""
        data = {
            "user": {
                "name": "John Doe",
                "email": "john@example.com",
            },
            "metadata": {
                "ip_address": "192.168.1.1",
            },
        }
        result = redactor.redact_dict(data)
        assert result["user"]["name"] == "[REDACTED]"
        assert result["user"]["email"] == "[REDACTED]"

    def test_redacts_phi_in_string_values(self, redactor):
        """Should redact PHI patterns in string values."""
        data = {
            "message": "Contact SSN: 123-45-6789",
            "notes": "Call 555-123-4567",
        }
        result = redactor.redact_dict(data)
        assert "123-45-6789" not in result["message"]
        assert "555-123-4567" not in result["notes"]

    def test_preserves_non_dict_input(self, redactor):
        """Should return non-dict input unchanged."""
        assert redactor.redact_dict("string") == "string"
        assert redactor.redact_dict(123) == 123
        assert redactor.redact_dict(None) is None


class TestListRedaction:
    """Tests for list redaction."""

    def test_redacts_list_of_strings(self, redactor):
        """Should redact PHI in list of strings."""
        data = ["User ID 123", "SSN: 123-45-6789", "Phone: 555-123-4567"]
        result = redactor.redact_list(data)
        assert "123-45-6789" not in result[1]
        assert "555-123-4567" not in result[2]

    def test_redacts_list_of_dicts(self, redactor):
        """Should redact PHI in list of dictionaries."""
        data = [
            {"email": "test1@example.com"},
            {"email": "test2@example.com"},
        ]
        result = redactor.redact_list(data)
        assert result[0]["email"] == "[REDACTED]"
        assert result[1]["email"] == "[REDACTED]"

    def test_redacts_nested_lists(self, redactor):
        """Should redact PHI in nested lists."""
        data = [["SSN: 123-45-6789"], ["Phone: 555-123-4567"]]
        result = redactor.redact_list(data)
        assert "123-45-6789" not in str(result)
        assert "555-123-4567" not in str(result)


class TestExceptionRedaction:
    """Tests for exception message redaction."""

    def test_redacts_exception_message(self, redactor):
        """Should redact PHI from exception messages."""
        exc = Exception("Failed for user with SSN 123-45-6789")
        result = redactor.redact_exception(exc)
        assert "123-45-6789" not in result
        assert "[REDACTED]" in result


class TestPHIFieldDetection:
    """Tests for PHI field name detection."""

    def test_detects_phi_field_names(self, redactor):
        """Should detect PHI-indicating field names."""
        phi_fields = [
            "ssn",
            "social_security",
            "phone",
            "email",
            "mrn",
            "date_of_birth",
            "dob",
            "name",
            "password",
            "api_key",
            "credit_card",
        ]
        for field in phi_fields:
            assert redactor._is_phi_field(field), f"Should detect {field} as PHI"

    def test_non_phi_fields(self, redactor):
        """Should not flag non-PHI field names."""
        non_phi_fields = [
            "user_id",
            "created_at",
            "status",
            "type",
            "query",
            "response",
            "duration",
        ]
        for field in non_phi_fields:
            assert not redactor._is_phi_field(field), f"Should not detect {field} as PHI"

    def test_case_insensitive_field_detection(self, redactor):
        """Should detect PHI fields regardless of case."""
        assert redactor._is_phi_field("EMAIL")
        assert redactor._is_phi_field("Email")
        assert redactor._is_phi_field("SSN")

    def test_hyphenated_field_names(self, redactor):
        """Should detect PHI fields with hyphens."""
        assert redactor._is_phi_field("phone-number")
        assert redactor._is_phi_field("date-of-birth")


class TestConvenienceFunctions:
    """Tests for module-level convenience functions."""

    def test_redact_phi_string(self):
        """redact_phi should work with strings."""
        result = redact_phi("SSN: 123-45-6789")
        assert "123-45-6789" not in result

    def test_redact_phi_dict(self):
        """redact_phi should work with dicts."""
        result = redact_phi({"email": "test@example.com"})
        assert result["email"] == "[REDACTED]"

    def test_redact_phi_list(self):
        """redact_phi should work with lists."""
        result = redact_phi(["SSN: 123-45-6789"])
        assert "123-45-6789" not in result[0]

    def test_redact_phi_exception(self):
        """redact_phi should work with exceptions."""
        exc = Exception("User phone: 555-123-4567")
        result = redact_phi(exc)
        assert "555-123-4567" not in result

    def test_redact_phi_other_types(self):
        """redact_phi should pass through other types."""
        assert redact_phi(123) == 123
        assert redact_phi(True) is True
        assert redact_phi(None) is None

    def test_is_phi_field_function(self):
        """is_phi_field function should detect PHI fields."""
        assert is_phi_field("email") is True
        assert is_phi_field("user_id") is False


class TestComplexScenarios:
    """Tests for complex real-world scenarios."""

    def test_log_message_redaction(self, redactor):
        """Should properly redact a realistic log message."""
        log_msg = """
        User login attempt:
        Email: john.doe@hospital.com
        IP: 192.168.1.100
        MRN: 1234567890
        Status: Success
        """
        result = redactor.redact_string(log_msg)
        assert "john.doe@hospital.com" not in result
        assert "192.168.1.100" not in result
        assert "Success" in result  # Non-PHI should remain

    def test_api_response_redaction(self, redactor):
        """Should properly redact an API response-like structure."""
        response = {
            "status": "success",
            "data": {
                "patient": {
                    "name": "John Doe",
                    "dob": "01/15/1990",
                    "conditions": ["diabetes", "hypertension"],
                },
                "appointment": {
                    "date": "2024-01-15",
                    "provider": "Dr. Smith",
                },
            },
            "meta": {
                "request_id": "abc123",
                "timestamp": "2024-01-15T10:00:00Z",
            },
        }
        result = redactor.redact_dict(response)
        assert result["status"] == "success"
        assert result["data"]["patient"]["name"] == "[REDACTED]"
        assert result["data"]["patient"]["dob"] == "[REDACTED]"
        assert "diabetes" in result["data"]["patient"]["conditions"]  # Non-PHI


class TestPHIPatternsAndFieldNames:
    """Tests for the PHI_PATTERNS and PHI_FIELD_NAMES constants."""

    def test_phi_patterns_are_compiled(self):
        """PHI_PATTERNS should be compiled regex patterns."""
        for name, pattern in PHI_PATTERNS.items():
            assert hasattr(pattern, "match"), f"Pattern {name} should be compiled regex"

    def test_phi_field_names_coverage(self):
        """PHI_FIELD_NAMES should cover common PHI fields."""
        required_fields = ["ssn", "phone", "email", "mrn", "dob", "name", "password"]
        for field in required_fields:
            assert field in PHI_FIELD_NAMES, f"PHI_FIELD_NAMES should include {field}"

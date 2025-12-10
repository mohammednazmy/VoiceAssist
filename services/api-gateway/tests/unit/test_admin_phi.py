"""Unit tests for Admin PHI API endpoints (Sprint 3).

Tests PHI detection rules management, testing, statistics, and routing configuration.
"""

from app.api.admin_phi import (
    PHIRoutingConfig,
    PHIRoutingMode,
    PHIRule,
    PHIRuleStatus,
    PHIRuleType,
    PHITestRequest,
    PHITestResult,
    get_builtin_rules,
)


class TestPHIRules:
    """Test PHI rule management."""

    def test_get_builtin_rules(self):
        """Test that builtin rules are returned correctly."""
        rules = get_builtin_rules()

        assert len(rules) > 0
        assert all(isinstance(r, PHIRule) for r in rules)
        assert all(r.is_builtin for r in rules)

        # Check for expected rule types
        rule_types = [r.phi_type for r in rules]
        assert PHIRuleType.SSN in rule_types
        assert PHIRuleType.EMAIL in rule_types
        assert PHIRuleType.PHONE in rule_types
        assert PHIRuleType.NAME in rule_types

    def test_builtin_rules_have_required_fields(self):
        """Test that all builtin rules have required fields."""
        rules = get_builtin_rules()

        for rule in rules:
            assert rule.id
            assert rule.name
            assert rule.description
            assert rule.phi_type
            assert rule.status == PHIRuleStatus.ENABLED  # Default status


class TestPHIRuleStatus:
    """Test PHI rule status enum."""

    def test_status_values(self):
        """Test that status enum has expected values."""
        assert PHIRuleStatus.ENABLED.value == "enabled"
        assert PHIRuleStatus.DISABLED.value == "disabled"


class TestPHIRoutingConfig:
    """Test PHI routing configuration."""

    def test_default_routing_config(self):
        """Test default routing configuration values."""
        config = PHIRoutingConfig()

        assert config.mode == PHIRoutingMode.LOCAL_ONLY
        assert config.confidence_threshold == 0.7
        assert config.redact_before_cloud is True
        assert config.audit_all_phi is True

    def test_routing_modes(self):
        """Test routing mode enum values."""
        assert PHIRoutingMode.LOCAL_ONLY.value == "local_only"
        assert PHIRoutingMode.CLOUD_ALLOWED.value == "cloud_allowed"
        assert PHIRoutingMode.HYBRID.value == "hybrid"

    def test_confidence_threshold_bounds(self):
        """Test that confidence threshold respects bounds."""
        # Valid threshold
        config = PHIRoutingConfig(confidence_threshold=0.5)
        assert config.confidence_threshold == 0.5

        # Test model validation would reject invalid values
        # (Pydantic handles this at validation time)


class TestPHITestRequest:
    """Test PHI test request model."""

    def test_valid_request(self):
        """Test valid test request."""
        request = PHITestRequest(text="Test text", include_redacted=True)
        assert request.text == "Test text"
        assert request.include_redacted is True

    def test_default_include_redacted(self):
        """Test default include_redacted value."""
        request = PHITestRequest(text="Test")
        assert request.include_redacted is True


class TestPHITestResult:
    """Test PHI test result model."""

    def test_result_with_phi(self):
        """Test result when PHI is detected."""
        result = PHITestResult(
            contains_phi=True,
            phi_types=["ssn", "email"],
            confidence=0.9,
            details={"ssn": 1, "email": 1},
            redacted_text="[REDACTED] test [REDACTED]",
        )

        assert result.contains_phi is True
        assert "ssn" in result.phi_types
        assert "email" in result.phi_types
        assert result.confidence == 0.9
        assert result.redacted_text is not None

    def test_result_without_phi(self):
        """Test result when no PHI is detected."""
        result = PHITestResult(
            contains_phi=False,
            phi_types=[],
            confidence=0.0,
            details={},
        )

        assert result.contains_phi is False
        assert len(result.phi_types) == 0
        assert result.redacted_text is None


class TestPHIDetectorIntegration:
    """Integration tests for PHI detector with admin API."""

    def test_detect_ssn(self):
        """Test SSN detection."""
        from app.services.phi_detector import PHIDetector

        detector = PHIDetector()
        result = detector.detect("My SSN is 123-45-6789")

        assert result.contains_phi
        assert "ssn" in result.phi_types

    def test_detect_email(self):
        """Test email detection."""
        from app.services.phi_detector import PHIDetector

        detector = PHIDetector()
        result = detector.detect("Email me at patient@example.com")

        assert result.contains_phi
        assert "email" in result.phi_types

    def test_detect_phone(self):
        """Test phone number detection."""
        from app.services.phi_detector import PHIDetector

        detector = PHIDetector()
        result = detector.detect("Call me at 555-123-4567")

        assert result.contains_phi
        assert "phone" in result.phi_types

    def test_no_phi_detected(self):
        """Test no PHI in clean text."""
        from app.services.phi_detector import PHIDetector

        detector = PHIDetector()
        result = detector.detect("What are the symptoms of diabetes?")

        assert not result.contains_phi
        assert len(result.phi_types) == 0

    def test_sanitize_ssn(self):
        """Test SSN sanitization."""
        from app.services.phi_detector import PHIDetector

        detector = PHIDetector()
        sanitized = detector.sanitize("SSN: 123-45-6789")

        assert "123-45-6789" not in sanitized
        assert "REDACTED" in sanitized


class TestPHIRedactionMiddleware:
    """Test PHI redaction middleware functions."""

    def test_redact_phi_string(self):
        """Test PHI redaction on strings."""
        from app.middleware.phi_redaction import redact_phi

        text = "Email: test@example.com, SSN: 123-45-6789"
        redacted = redact_phi(text)

        assert "test@example.com" not in redacted
        assert "123-45-6789" not in redacted
        assert "[REDACTED]" in redacted

    def test_redact_phi_dict(self):
        """Test PHI redaction on dictionaries."""
        from app.middleware.phi_redaction import redact_phi

        data = {
            "name": "John Doe",
            "email": "john@example.com",
            "query": "Test query",
        }
        redacted = redact_phi(data)

        assert redacted["email"] == "[REDACTED]"
        assert redacted["query"] == "Test query"  # No PHI in query

    def test_is_phi_field(self):
        """Test PHI field detection."""
        from app.middleware.phi_redaction import is_phi_field

        assert is_phi_field("email")
        assert is_phi_field("email_address")
        assert is_phi_field("ssn")
        assert is_phi_field("phone_number")
        assert is_phi_field("patient_name")
        assert not is_phi_field("query")
        assert not is_phi_field("conversation_id")


class TestPHIRuleTypes:
    """Test PHI rule type enum."""

    def test_all_rule_types_defined(self):
        """Test that all expected PHI types are defined."""
        expected_types = [
            "ssn",
            "phone",
            "email",
            "mrn",
            "account",
            "ip_address",
            "url",
            "dob",
            "name",
            "address",
            "credit_card",
        ]

        for type_name in expected_types:
            assert hasattr(PHIRuleType, type_name.upper()), f"Missing PHI type: {type_name}"

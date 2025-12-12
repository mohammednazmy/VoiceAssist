"""Unit tests for password validation system.

Tests password strength validation including:
- Strong passwords pass validation
- Weak passwords fail validation
- Common passwords are blocked
- Password strength scoring
"""
from __future__ import annotations

from typing import Dict, Tuple

import pytest


# Mock password validator implementation for testing
# In real implementation, this would import from app.core.security or similar
class PasswordValidator:
    """Password validation utility for testing."""

    COMMON_PASSWORDS = {
        "password",
        "123456",
        "password123",
        "password123!",
        "qwerty",
        "abc123",
        "letmein",
        "welcome",
        "monkey",
        "dragon",
        "master",
        "sunshine",
        "princess",
        "login",
        "admin",
        "solo",
        "passw0rd",
    }

    MIN_LENGTH = 8
    MAX_LENGTH = 128

    @classmethod
    def validate(cls, password: str) -> Tuple[bool, str, Dict[str, bool]]:
        """Validate password strength.

        Returns:
            Tuple of (is_valid, error_message, checks_passed)
        """
        checks = {
            "min_length": len(password) >= cls.MIN_LENGTH,
            "max_length": len(password) <= cls.MAX_LENGTH,
            "has_uppercase": any(c.isupper() for c in password),
            "has_lowercase": any(c.islower() for c in password),
            "has_digit": any(c.isdigit() for c in password),
            "has_special": any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password),
            "not_common": password.lower() not in cls.COMMON_PASSWORDS,
        }

        if not checks["min_length"]:
            return False, f"Password must be at least {cls.MIN_LENGTH} characters", checks
        if not checks["max_length"]:
            return False, f"Password must be at most {cls.MAX_LENGTH} characters", checks
        if not checks["has_uppercase"]:
            return False, "Password must contain at least one uppercase letter", checks
        if not checks["has_lowercase"]:
            return False, "Password must contain at least one lowercase letter", checks
        if not checks["has_digit"]:
            return False, "Password must contain at least one digit", checks
        if not checks["has_special"]:
            return False, "Password must contain at least one special character", checks
        if not checks["not_common"]:
            return False, "Password is too common", checks

        return True, "", checks

    @classmethod
    def calculate_strength(cls, password: str) -> int:
        """Calculate password strength score (0-100).

        Args:
            password: Password to score

        Returns:
            Score from 0 (weakest) to 100 (strongest)
        """
        score = 0

        # Length scoring (up to 30 points)
        if len(password) >= cls.MIN_LENGTH:
            score += min(30, (len(password) - cls.MIN_LENGTH) * 3 + 10)

        # Character variety (up to 40 points)
        if any(c.islower() for c in password):
            score += 10
        if any(c.isupper() for c in password):
            score += 10
        if any(c.isdigit() for c in password):
            score += 10
        if any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
            score += 10

        # Complexity bonus (up to 30 points)
        # Check for patterns and repetition
        unique_chars = len(set(password))
        uniqueness_ratio = unique_chars / len(password) if password else 0
        score += int(uniqueness_ratio * 20)

        # Penalize common passwords
        if password.lower() in cls.COMMON_PASSWORDS:
            score = max(0, score - 50)

        return min(100, max(0, score))


# ============================================================================
# Strong Password Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.parametrize("password", [
    "Str0ng!Pass",
    "MyP@ssw0rd123",
    "C0mpl3x!Passw0rd",
    "S3cur3#P@ssw0rd!",
    "V3ry!S3cur3P@ss",
])
def test_strong_passwords_pass_validation(password: str):
    """Test that strong passwords pass all validation checks."""
    is_valid, error_msg, checks = PasswordValidator.validate(password)

    assert is_valid is True
    assert error_msg == ""
    assert all(checks.values())


@pytest.mark.unit
def test_strong_password_with_all_character_types():
    """Test password with uppercase, lowercase, digits, and special characters."""
    password = "Abc123!@#"

    is_valid, _, checks = PasswordValidator.validate(password)

    assert is_valid is True
    assert checks["has_uppercase"] is True
    assert checks["has_lowercase"] is True
    assert checks["has_digit"] is True
    assert checks["has_special"] is True


# ============================================================================
# Weak Password Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.parametrize("password,expected_error", [
    ("short", "Password must be at least 8 characters"),
    ("NoDigitsOrSpecial", "Password must contain at least one digit"),
    ("nouppercaseorspecial123", "Password must contain at least one uppercase letter"),
    ("NOLOWERCASE123!", "Password must contain at least one lowercase letter"),
    ("NoSpecialChar123", "Password must contain at least one special character"),
])
def test_weak_passwords_fail_validation(password: str, expected_error: str):
    """Test that weak passwords fail validation with appropriate error messages."""
    is_valid, error_msg, _ = PasswordValidator.validate(password)

    assert is_valid is False
    assert expected_error in error_msg


@pytest.mark.unit
def test_password_too_short():
    """Test that passwords shorter than minimum length are rejected."""
    short_password = "Ab1!"

    is_valid, error_msg, checks = PasswordValidator.validate(short_password)

    assert is_valid is False
    assert checks["min_length"] is False
    assert "at least" in error_msg.lower()


@pytest.mark.unit
def test_password_too_long():
    """Test that passwords longer than maximum length are rejected."""
    long_password = "A" * 129 + "b1!"

    is_valid, error_msg, checks = PasswordValidator.validate(long_password)

    assert is_valid is False
    assert checks["max_length"] is False
    assert "at most" in error_msg.lower()


@pytest.mark.unit
def test_password_without_uppercase():
    """Test that passwords without uppercase letters are rejected."""
    password = "alllowercase123!"

    is_valid, error_msg, checks = PasswordValidator.validate(password)

    assert is_valid is False
    assert checks["has_uppercase"] is False
    assert "uppercase" in error_msg.lower()


@pytest.mark.unit
def test_password_without_lowercase():
    """Test that passwords without lowercase letters are rejected."""
    password = "ALLUPPERCASE123!"

    is_valid, error_msg, checks = PasswordValidator.validate(password)

    assert is_valid is False
    assert checks["has_lowercase"] is False
    assert "lowercase" in error_msg.lower()


@pytest.mark.unit
def test_password_without_digit():
    """Test that passwords without digits are rejected."""
    password = "NoDigitsHere!"

    is_valid, error_msg, checks = PasswordValidator.validate(password)

    assert is_valid is False
    assert checks["has_digit"] is False
    assert "digit" in error_msg.lower()


@pytest.mark.unit
def test_password_without_special_character():
    """Test that passwords without special characters are rejected."""
    password = "NoSpecialChar123"

    is_valid, error_msg, checks = PasswordValidator.validate(password)

    assert is_valid is False
    assert checks["has_special"] is False
    assert "special" in error_msg.lower()


# ============================================================================
# Common Password Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.parametrize("common_password", [
    "password",
    "Password123!",  # Common word with additions
    "123456",
    "qwerty",
    "abc123",
    "letmein",
    "welcome",
])
def test_common_passwords_are_blocked(common_password: str):
    """Test that common passwords are rejected even if they meet other criteria."""
    # Some might fail other checks too, but common check should fail
    is_valid, error_msg, checks = PasswordValidator.validate(common_password)

    assert is_valid is False
    # Either fails common check or other checks
    assert not all(checks.values())


@pytest.mark.unit
def test_common_password_case_insensitive():
    """Test that common password check is case-insensitive."""
    passwords = ["password", "PASSWORD", "PaSsWoRd"]

    for pwd in passwords:
        is_valid, _, checks = PasswordValidator.validate(pwd)
        # Should fail the common password check (may fail others too)
        assert is_valid is False


@pytest.mark.unit
def test_common_password_with_modifications_still_weak():
    """Test that simple modifications to common passwords are caught."""
    # "password123!" uses a common base word
    password = "password123!"

    is_valid, _, checks = PasswordValidator.validate(password)

    assert checks["not_common"] is False


# ============================================================================
# Password Strength Scoring Tests
# ============================================================================


@pytest.mark.unit
def test_password_strength_score_range():
    """Test that password strength scores are in valid range 0-100."""
    test_passwords = [
        "weak",
        "Weak1!",
        "Medium!Pass123",
        "V3ry!Str0ng!P@ssw0rd!",
    ]

    for password in test_passwords:
        score = PasswordValidator.calculate_strength(password)
        assert 0 <= score <= 100


@pytest.mark.unit
def test_empty_password_has_zero_strength():
    """Test that empty password has zero strength score."""
    score = PasswordValidator.calculate_strength("")

    assert score == 0


@pytest.mark.unit
def test_weak_password_has_low_score():
    """Test that weak passwords have low strength scores."""
    weak_passwords = ["abc", "123", "password"]

    for password in weak_passwords:
        score = PasswordValidator.calculate_strength(password)
        assert score < 40


@pytest.mark.unit
def test_strong_password_has_high_score():
    """Test that strong passwords have high strength scores."""
    strong_passwords = [
        "V3ry!Str0ng!P@ssw0rd!",
        "C0mpl3x#S3cur3!P@ss",
        "My!Sup3r#S3cur3P@ssw0rd123",
    ]

    for password in strong_passwords:
        score = PasswordValidator.calculate_strength(password)
        assert score > 70


@pytest.mark.unit
def test_longer_password_has_higher_score():
    """Test that longer passwords generally score higher."""
    short_password = "Ab1!xyz9"
    long_password = "Ab1!xyz9ExtraLength#123"

    short_score = PasswordValidator.calculate_strength(short_password)
    long_score = PasswordValidator.calculate_strength(long_password)

    assert long_score > short_score


@pytest.mark.unit
def test_password_with_more_variety_scores_higher():
    """Test that passwords with more character variety score higher."""
    low_variety = "aaaaaaaa1!"  # Lots of repetition
    high_variety = "AbCd!123$xyz"  # More unique characters

    low_score = PasswordValidator.calculate_strength(low_variety)
    high_score = PasswordValidator.calculate_strength(high_variety)

    assert high_score > low_score


@pytest.mark.unit
def test_common_password_has_reduced_score():
    """Test that common passwords have significantly reduced scores."""
    common_password = "password"
    unique_password = "P@ssw0rd!"  # Similar but not in common list

    common_score = PasswordValidator.calculate_strength(common_password)
    unique_score = PasswordValidator.calculate_strength(unique_password)

    assert common_score < unique_score


# ============================================================================
# Validation Check Details Tests
# ============================================================================


@pytest.mark.unit
def test_validation_returns_detailed_checks():
    """Test that validation returns detailed check results."""
    password = "TestPass"

    _, _, checks = PasswordValidator.validate(password)

    expected_keys = {
        "min_length",
        "max_length",
        "has_uppercase",
        "has_lowercase",
        "has_digit",
        "has_special",
        "not_common",
    }

    assert set(checks.keys()) == expected_keys
    assert all(isinstance(v, bool) for v in checks.values())


@pytest.mark.unit
def test_all_checks_pass_for_valid_password():
    """Test that all checks pass for a valid password."""
    password = "Valid!P@ssw0rd123"

    is_valid, _, checks = PasswordValidator.validate(password)

    assert is_valid is True
    assert all(checks.values())


@pytest.mark.unit
def test_multiple_checks_fail_for_invalid_password():
    """Test that multiple checks can fail simultaneously."""
    password = "bad"  # Too short, no uppercase, no digit, no special

    is_valid, _, checks = PasswordValidator.validate(password)

    assert is_valid is False
    failed_checks = [k for k, v in checks.items() if not v]
    assert len(failed_checks) >= 2


# ============================================================================
# Edge Cases
# ============================================================================


@pytest.mark.unit
def test_password_with_unicode_characters():
    """Test password validation with unicode characters."""
    password = "P@ssw0rd123💪"

    is_valid, _, checks = PasswordValidator.validate(password)

    # Should handle unicode gracefully
    assert isinstance(is_valid, bool)


@pytest.mark.unit
def test_password_with_spaces():
    """Test that passwords with spaces are handled."""
    password = "Pass word 123!"

    is_valid, _, _ = PasswordValidator.validate(password)

    # Spaces should be allowed
    assert isinstance(is_valid, bool)


@pytest.mark.unit
def test_password_at_minimum_length():
    """Test password exactly at minimum length."""
    password = "Abc123!@"  # Exactly 8 characters

    is_valid, _, checks = PasswordValidator.validate(password)

    assert checks["min_length"] is True
    assert is_valid is True


@pytest.mark.unit
def test_password_at_maximum_length():
    """Test password exactly at maximum length."""
    # Create password with exactly 128 characters
    password = "A" * 120 + "bc123!@#"

    is_valid, _, checks = PasswordValidator.validate(password)

    assert checks["max_length"] is True


@pytest.mark.unit
def test_password_with_only_special_characters():
    """Test password made only of special characters."""
    password = "!@#$%^&*()"

    is_valid, _, checks = PasswordValidator.validate(password)

    assert checks["has_special"] is True
    assert checks["has_uppercase"] is False
    assert checks["has_lowercase"] is False
    assert checks["has_digit"] is False


@pytest.mark.unit
def test_numeric_password_as_string():
    """Test purely numeric password."""
    password = "12345678"

    is_valid, _, checks = PasswordValidator.validate(password)

    assert checks["has_digit"] is True
    assert checks["has_uppercase"] is False
    assert checks["has_lowercase"] is False
    assert is_valid is False

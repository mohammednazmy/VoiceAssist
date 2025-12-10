"""Unit tests for Password Validator."""

import pytest
from app.core.password_validator import PasswordStrength, PasswordValidator


class TestPasswordValidator:
    """Tests for PasswordValidator class."""

    @pytest.fixture
    def validator(self):
        """Create a default password validator."""
        return PasswordValidator()

    @pytest.fixture
    def strict_validator(self):
        """Create a strict password validator."""
        return PasswordValidator(
            min_length=12,
            require_uppercase=True,
            require_lowercase=True,
            require_digits=True,
            require_special=True,
            reject_common=True,
        )

    @pytest.fixture
    def lenient_validator(self):
        """Create a lenient password validator."""
        return PasswordValidator(
            min_length=6,
            require_uppercase=False,
            require_lowercase=False,
            require_digits=False,
            require_special=False,
            reject_common=False,
        )

    # Test validation with various passwords

    def test_valid_strong_password(self, validator):
        """Test validation of a strong password."""
        password = "SecureP@ssw0rd2024!"

        is_valid, errors = validator.validate(password)

        assert is_valid is True
        assert len(errors) == 0

    def test_password_too_short(self, validator):
        """Test password that's too short."""
        password = "Short1!"

        is_valid, errors = validator.validate(password)

        assert is_valid is False
        assert any("at least 8 characters" in error for error in errors)

    def test_password_missing_uppercase(self, validator):
        """Test password missing uppercase letters."""
        password = "nouppercase123!"

        is_valid, errors = validator.validate(password)

        assert is_valid is False
        assert any("uppercase" in error.lower() for error in errors)

    def test_password_missing_lowercase(self, validator):
        """Test password missing lowercase letters."""
        password = "NOLOWERCASE123!"

        is_valid, errors = validator.validate(password)

        assert is_valid is False
        assert any("lowercase" in error.lower() for error in errors)

    def test_password_missing_digits(self, validator):
        """Test password missing digits."""
        password = "NoDigitsHere!"

        is_valid, errors = validator.validate(password)

        assert is_valid is False
        assert any("digit" in error.lower() for error in errors)

    def test_password_missing_special_chars(self, validator):
        """Test password missing special characters."""
        password = "NoSpecialChars123"

        is_valid, errors = validator.validate(password)

        assert is_valid is False
        assert any("special character" in error.lower() for error in errors)

    def test_common_password_rejected(self, validator):
        """Test that common passwords are rejected."""
        common_passwords = ["password", "password123", "123456", "qwerty"]

        for password in common_passwords:
            is_valid, errors = validator.validate(password)
            assert is_valid is False
            assert any("common" in error.lower() for error in errors)

    def test_sequential_characters_rejected(self, validator):
        """Test that passwords with sequential characters are rejected."""
        password = "Abc123456!"

        is_valid, errors = validator.validate(password)

        assert is_valid is False
        assert any("sequential" in error.lower() for error in errors)

    def test_repeated_characters_rejected(self, validator):
        """Test that passwords with too many repeated characters are rejected."""
        password = "Aaaaaa1!"

        is_valid, errors = validator.validate(password)

        assert is_valid is False
        assert any("repeated" in error.lower() for error in errors)

    def test_multiple_validation_errors(self, validator):
        """Test password with multiple validation errors."""
        password = "bad"  # Too short, no uppercase, no digits, no special chars

        is_valid, errors = validator.validate(password)

        assert is_valid is False
        assert len(errors) >= 4

    def test_strict_validator_requirements(self, strict_validator):
        """Test strict validator with higher requirements."""
        # This should fail on strict validator (too short)
        password = "Short1!"

        is_valid, errors = strict_validator.validate(password)

        assert is_valid is False
        assert any("at least 12 characters" in error for error in errors)

    def test_strict_validator_passes_strong_password(self, strict_validator):
        """Test that strict validator passes strong passwords."""
        password = "VerySecureP@ssw0rd2024!"

        is_valid, errors = strict_validator.validate(password)

        assert is_valid is True
        assert len(errors) == 0

    def test_lenient_validator_accepts_simple_password(self, lenient_validator):
        """Test that lenient validator accepts simple passwords."""
        password = "simple"

        is_valid, errors = lenient_validator.validate(password)

        assert is_valid is True
        assert len(errors) == 0

    # Test strength scoring

    def test_strength_score_weak_password(self, validator):
        """Test strength score for weak password."""
        password = "weak"

        score = validator.get_strength_score(password)

        assert score < 40
        assert validator.get_password_strength(password) == PasswordStrength.WEAK

    def test_strength_score_medium_password(self, validator):
        """Test strength score for medium strength password."""
        password = "Medium1234"

        score = validator.get_strength_score(password)

        assert 40 <= score < 70
        assert validator.get_password_strength(password) == PasswordStrength.MEDIUM

    def test_strength_score_strong_password(self, validator):
        """Test strength score for strong password."""
        password = "StrongP@ssw0rd123"

        score = validator.get_strength_score(password)

        assert score >= 70
        assert validator.get_password_strength(password) == PasswordStrength.STRONG

    def test_strength_score_increases_with_length(self, validator):
        """Test that strength score increases with password length."""
        short = "Pass1!"
        medium = "Password123!"
        long = "VeryLongPassword123!"

        score_short = validator.get_strength_score(short)
        score_medium = validator.get_strength_score(medium)
        score_long = validator.get_strength_score(long)

        assert score_short < score_medium < score_long

    def test_strength_score_increases_with_diversity(self, validator):
        """Test that strength score increases with character diversity."""
        lowercase_only = "passwordpassword"
        with_upper = "PasswordPassword"
        with_digits = "Password1234"
        with_special = "P@ssword1234"

        score1 = validator.get_strength_score(lowercase_only)
        score2 = validator.get_strength_score(with_upper)
        score3 = validator.get_strength_score(with_digits)
        score4 = validator.get_strength_score(with_special)

        assert score1 < score2 < score3 < score4

    def test_strength_score_max_100(self, validator):
        """Test that strength score doesn't exceed 100."""
        ultra_strong = "Ultr@Str0ng!P@ssw0rd_2024_WithLots0fCh@racters"

        score = validator.get_strength_score(ultra_strong)

        assert score <= 100

    def test_get_password_strength_enum(self, validator):
        """Test get_password_strength returns correct enum values."""
        weak = "weak"
        medium = "Medium123"
        strong = "Str0ng!P@ssw0rd"

        assert validator.get_password_strength(weak) == PasswordStrength.WEAK
        assert validator.get_password_strength(medium) == PasswordStrength.MEDIUM
        assert validator.get_password_strength(strong) == PasswordStrength.STRONG

    # Edge cases

    def test_empty_password(self, validator):
        """Test validation of empty password."""
        password = ""

        is_valid, errors = validator.validate(password)

        assert is_valid is False
        assert len(errors) > 0

    def test_whitespace_only_password(self, validator):
        """Test validation of whitespace-only password."""
        password = "        "

        is_valid, errors = validator.validate(password)

        assert is_valid is False

    def test_unicode_characters_in_password(self, validator):
        """Test that unicode characters are handled properly."""
        password = "Pāsswørd123!"

        is_valid, errors = validator.validate(password)

        # Should validate based on the rules (length, etc.)
        assert isinstance(is_valid, bool)

    def test_very_long_password(self, validator):
        """Test validation of very long password."""
        password = "A1!" + "x" * 100  # 103 characters

        is_valid, errors = validator.validate(password)

        # Should be valid if it meets other criteria
        # This tests that we don't have an upper limit
        assert is_valid is True

    def test_all_special_characters_accepted(self, validator):
        """Test that all defined special characters are recognized."""
        special_chars = "!@#$%^&*()_+-=[]{}|;:',.<>?/`~"

        for char in special_chars:
            password = f"Password123{char}"
            is_valid, errors = validator.validate(password)

            # Should pass special character requirement
            assert not any("special character" in error.lower() for error in errors)

    # Test configuration

    def test_custom_min_length(self):
        """Test custom minimum length configuration."""
        validator = PasswordValidator(min_length=16)

        short = "Short1!"
        long = "VeryLongPassword123!"

        is_valid_short, _ = validator.validate(short)
        is_valid_long, _ = validator.validate(long)

        assert is_valid_short is False
        assert is_valid_long is True

    def test_disable_uppercase_requirement(self):
        """Test disabling uppercase requirement."""
        validator = PasswordValidator(require_uppercase=False)

        password = "lowercase123!"

        is_valid, errors = validator.validate(password)

        assert is_valid is True
        assert len(errors) == 0

    def test_disable_special_char_requirement(self):
        """Test disabling special character requirement."""
        validator = PasswordValidator(require_special=False)

        password = "Password123"

        is_valid, errors = validator.validate(password)

        assert is_valid is True

    def test_allow_common_passwords(self):
        """Test allowing common passwords."""
        validator = PasswordValidator(reject_common=False)

        password = "password"

        is_valid, errors = validator.validate(password)

        # May fail on other criteria but not on being common
        assert not any("common" in error.lower() for error in errors)

    def test_validate_returns_list_of_strings(self, validator):
        """Test that validate returns a list of error strings."""
        password = "bad"

        is_valid, errors = validator.validate(password)

        assert isinstance(errors, list)
        for error in errors:
            assert isinstance(error, str)

    def test_get_strength_score_returns_int(self, validator):
        """Test that get_strength_score returns an integer."""
        password = "Test123!"

        score = validator.get_strength_score(password)

        assert isinstance(score, int)
        assert 0 <= score <= 100

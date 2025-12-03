"""Password strength validation for enhanced security."""

import re
from enum import Enum
from typing import List, Tuple


class PasswordStrength(str, Enum):
    """Password strength levels."""

    WEAK = "weak"
    MEDIUM = "medium"
    STRONG = "strong"


class PasswordValidator:
    """Validates password strength based on multiple criteria."""

    # Common passwords to reject (case-sensitive)
    COMMON_PASSWORDS = {
        "password",
        "password123",
        "123456",
        "12345678",
        "qwerty",
        "abc123",
        "monkey",
        "1234567",
        "letmein",
        "trustno1",
        "dragon",
        "baseball",
        "iloveyou",
        "master",
        "sunshine",
        "ashley",
        "bailey",
        "passw0rd",
        "shadow",
        "123123",
        "654321",
        "superman",
        "qazwsx",
        "michael",
        "football",
    }

    def __init__(
        self,
        min_length: int = 8,
        require_uppercase: bool = True,
        require_lowercase: bool = True,
        require_digits: bool = True,
        require_special: bool = True,
        reject_common: bool = True,
    ):
        self.min_length = min_length
        self.require_uppercase = require_uppercase
        self.require_lowercase = require_lowercase
        self.require_digits = require_digits
        self.require_special = require_special
        self.reject_common = reject_common

    def validate(self, password: str) -> Tuple[bool, List[str]]:
        """Validate password strength. Returns (is_valid, list_of_errors)."""
        errors = []

        if len(password) < self.min_length:
            errors.append(f"Password must be at least {self.min_length} characters long")
        if self.require_uppercase and not re.search(r"[A-Z]", password):
            errors.append("Password must contain at least one uppercase letter")
        if self.require_lowercase and not re.search(r"[a-z]", password):
            errors.append("Password must contain at least one lowercase letter")
        if self.require_digits and not re.search(r"\d", password):
            errors.append("Password must contain at least one digit")
        if self.require_special and not re.search(r'[!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|`~]', password):
            errors.append("Password must contain at least one special character")
        # Check against common passwords (case-sensitive for better security)
        if self.reject_common and password in self.COMMON_PASSWORDS:
            errors.append("Password is too common")
        # Only check sequential/repeated for shorter passwords where patterns are more concerning
        # Skip these checks if requirements are relaxed or password is sufficiently long
        if (
            len(password) < 16
            and self.require_uppercase
            and self.require_lowercase
            and self.require_digits
            and self.require_special
        ):
            if self._has_sequential_chars(password):
                errors.append("Password should not contain sequential characters")
            if self._has_repeated_chars(password):
                errors.append("Password should not contain too many repeated characters")

        return len(errors) == 0, errors

    def _has_sequential_chars(self, password: str) -> bool:
        password_lower = password.lower()
        for i in range(len(password_lower) - 2):
            if password_lower[i : i + 3].isalpha():
                codes = [ord(c) for c in password_lower[i : i + 3]]
                if codes[1] == codes[0] + 1 and codes[2] == codes[1] + 1:
                    return True
        for i in range(len(password) - 2):
            if password[i : i + 3].isdigit():
                nums = [int(c) for c in password[i : i + 3]]
                if nums[1] == nums[0] + 1 and nums[2] == nums[1] + 1:
                    return True
        return False

    def _has_repeated_chars(self, password: str) -> bool:
        for i in range(len(password) - 2):
            if password[i] == password[i + 1] == password[i + 2]:
                return True
        return False

    def get_strength_score(self, password: str) -> int:
        score = 0
        # Length bonuses
        if len(password) >= 8:
            score += 10
        if len(password) >= 12:
            score += 10
        # Character diversity bonuses
        if re.search(r"[a-z]", password):
            score += 10
        if re.search(r"[A-Z]", password):
            score += 10
        if re.search(r"\d", password):
            score += 10
        if re.search(r'[!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|`~]', password):
            score += 10
        # Not in common passwords (case-sensitive check)
        if password not in self.COMMON_PASSWORDS:
            score += 10
        # Extra length bonuses for very long passwords
        if len(password) >= 20:
            score += 10
        if len(password) >= 28:
            score += 10
        if len(password) >= 36:
            score += 10
        return min(score, 100)

    def get_password_strength(self, password: str) -> PasswordStrength:
        score = self.get_strength_score(password)
        if score < 40:
            return PasswordStrength.WEAK
        elif score < 70:
            return PasswordStrength.MEDIUM
        else:
            return PasswordStrength.STRONG

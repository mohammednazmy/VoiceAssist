"""
Tests for bcrypt/passlib compatibility - ensures password hashing works correctly.
This test was added after bcrypt 5.x caused login 500 errors due to passlib incompatibility.
"""

from app.core.security import get_password_hash, pwd_context, verify_password


class TestPasswordHashing:
    """Test bcrypt password hashing and verification"""

    def test_hash_and_verify_correct_password(self):
        """Password hashing and verification should work with correct password"""
        password = "secure_password_123"
        hashed = get_password_hash(password)

        assert hashed.startswith("$2b$")  # bcrypt prefix
        assert verify_password(password, hashed) is True

    def test_verify_wrong_password(self):
        """Verification should fail for wrong password"""
        hashed = get_password_hash("correct_password")
        assert verify_password("wrong_password", hashed) is False

    def test_hash_produces_different_hashes(self):
        """Same password should produce different hashes (salt)"""
        password = "test_password"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)

        assert hash1 != hash2  # Different salts
        assert verify_password(password, hash1) is True
        assert verify_password(password, hash2) is True

    def test_empty_password(self):
        """Empty password should be hashable and verifiable"""
        hashed = get_password_hash("")
        assert verify_password("", hashed) is True
        assert verify_password("not_empty", hashed) is False

    def test_long_password_under_72_bytes(self):
        """Password under 72 bytes should work correctly"""
        password = "a" * 71  # 71 characters = 71 bytes ASCII
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True

    def test_password_with_special_chars(self):
        """Password with special characters should work"""
        password = "p@ssw0rd!#$%^&*()_+-=[]{}|;':\",./<>?"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True

    def test_unicode_password(self):
        """Unicode password should work correctly"""
        password = "пароль密码كلمة"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True

    def test_pwd_context_bcrypt_scheme(self):
        """Ensure bcrypt is the active scheme"""
        assert "bcrypt" in pwd_context.schemes()

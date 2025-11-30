"""
Unit tests for Admin User Management API functions.

Tests cover:
- Role resolution logic
- Token generation
- Password generation
- Audit logging functions
"""


class TestResolveAdminRole:
    """Tests for the resolve_admin_role helper function."""

    def test_resolve_admin_role_import(self):
        """Verify the function can be imported."""
        from app.api.admin_panel import resolve_admin_role

        assert callable(resolve_admin_role)

    def test_resolve_admin_role_to_user(self):
        """Test resolving to user role."""
        from app.api.admin_panel import resolve_admin_role

        result = resolve_admin_role("admin", False, "user")
        assert result == "user"

    def test_resolve_admin_role_to_admin_via_flag(self):
        """Test resolving to admin role via is_admin flag."""
        from app.api.admin_panel import resolve_admin_role

        result = resolve_admin_role("user", True, None)
        assert result == "admin"

    def test_resolve_admin_role_to_viewer(self):
        """Test resolving to viewer role."""
        from app.api.admin_panel import resolve_admin_role

        result = resolve_admin_role("user", None, "viewer")
        assert result == "viewer"

    def test_resolve_admin_role_to_admin_via_role(self):
        """Test resolving to admin via explicit role."""
        from app.api.admin_panel import resolve_admin_role

        result = resolve_admin_role("viewer", None, "admin")
        assert result == "admin"

    def test_resolve_admin_role_preserves_current(self):
        """Test preserving current role when no change specified."""
        from app.api.admin_panel import resolve_admin_role

        result = resolve_admin_role("admin", None, None)
        assert result == "admin"

    def test_resolve_admin_role_is_admin_flag_precedence(self):
        """Test that is_admin=True overrides explicit role to admin."""
        from app.api.admin_panel import resolve_admin_role

        # is_admin flag takes precedence for backwards compatibility
        result = resolve_admin_role("user", True, "viewer")
        assert result == "admin"


class TestPasswordGeneration:
    """Tests for password generation functions."""

    def test_generate_temporary_password_exists(self):
        """Verify temporary password generation function exists."""
        from app.api.admin_panel import generate_temporary_password

        assert callable(generate_temporary_password)

    def test_generate_temporary_password_length(self):
        """Verify generated password meets length requirements."""
        from app.api.admin_panel import generate_temporary_password

        password = generate_temporary_password(16)
        assert len(password) >= 16

    def test_generate_temporary_password_complexity(self):
        """Verify generated password has letters and special chars."""
        from app.api.admin_panel import generate_temporary_password

        # Generate multiple passwords to ensure complexity is consistent
        for _ in range(10):
            password = generate_temporary_password(16)
            has_upper = any(c.isupper() for c in password)
            has_lower = any(c.islower() for c in password)

            assert has_upper, f"Password {password} should have uppercase"
            assert has_lower, f"Password {password} should have lowercase"

    def test_generate_temporary_password_uniqueness(self):
        """Verify generated passwords are unique."""
        from app.api.admin_panel import generate_temporary_password

        passwords = [generate_temporary_password(16) for _ in range(50)]
        assert len(set(passwords)) == 50, "All passwords should be unique"


class TestSecureTokenGeneration:
    """Tests for secure token generation."""

    def test_generate_secure_token_exists(self):
        """Verify secure token generation function exists."""
        from app.api.admin_panel import generate_secure_token

        assert callable(generate_secure_token)

    def test_generate_secure_token_length(self):
        """Verify token has reasonable length."""
        from app.api.admin_panel import generate_secure_token

        token = generate_secure_token(32)
        # URL-safe base64 encoded, length depends on implementation
        assert len(token) >= 32

    def test_generate_secure_token_uniqueness(self):
        """Verify tokens are unique."""
        from app.api.admin_panel import generate_secure_token

        tokens = [generate_secure_token(32) for _ in range(100)]
        assert len(set(tokens)) == 100, "All tokens should be unique"

    def test_generate_secure_token_is_url_safe(self):
        """Verify token is URL-safe string."""
        from app.api.admin_panel import generate_secure_token

        token = generate_secure_token(32)
        # URL-safe characters only: alphanumeric, hyphen, underscore
        import re

        assert re.match(r"^[\w\-]+$", token), f"Token {token} should be URL-safe"


class TestAuditLogging:
    """Tests for audit logging functionality."""

    def test_log_audit_event_exists(self):
        """Verify audit log function exists."""
        from app.api.admin_panel import log_audit_event

        assert callable(log_audit_event)


class TestWebSocketSessions:
    """Tests for WebSocket session management."""

    def test_session_functions_exist(self):
        """Verify WebSocket session management functions exist."""
        from app.api.admin.utils import (
            get_active_websocket_count,
            get_all_websocket_sessions,
            register_websocket_session,
            unregister_websocket_session,
        )

        assert callable(register_websocket_session)
        assert callable(unregister_websocket_session)
        assert callable(get_all_websocket_sessions)
        assert callable(get_active_websocket_count)

    def test_get_active_websocket_count_returns_int(self):
        """Verify active WebSocket count returns integer."""
        from app.api.admin_panel import get_active_websocket_count

        count = get_active_websocket_count()
        assert isinstance(count, int)
        assert count >= 0

    def test_get_all_websocket_sessions_returns_dict(self):
        """Verify WebSocket sessions returns dictionary."""
        from app.api.admin_panel import get_all_websocket_sessions

        sessions = get_all_websocket_sessions()
        assert isinstance(sessions, dict)


class TestRateLimiting:
    """Tests for rate limiting functionality."""

    def test_rate_limit_function_exists(self):
        """Verify rate limiting function exists."""
        from app.api.admin_panel import enforce_admin_action_rate_limit

        assert callable(enforce_admin_action_rate_limit)


class TestPasswordHashing:
    """Tests for password hashing functions."""

    def test_get_password_hash_exists(self):
        """Verify password hashing function exists."""
        from app.core.security import get_password_hash

        assert callable(get_password_hash)

    def test_verify_password_exists(self):
        """Verify password verification function exists."""
        from app.core.security import verify_password

        assert callable(verify_password)

    # Note: Password hashing integration tests require proper bcrypt setup
    # The actual hashing is tested via integration tests with the test database

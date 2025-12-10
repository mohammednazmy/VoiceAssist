"""
Admin Tools API tests

Tests admin endpoints for managing AI assistant tools.
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi import Request


class TestListTools:
    """Tests for GET /api/admin/tools."""

    @pytest.mark.asyncio
    async def test_list_tools(self):
        """Test listing all registered tools."""
        from app.api.admin_tools import list_tools

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"
        mock_admin.email = "admin@example.com"

        with patch("app.api.admin_tools.get_all_tools") as mock_get_tools:
            mock_get_tools.return_value = [
                {
                    "tool_name": "calendar_create_event",
                    "display_name": "Create Calendar Event",
                    "description": "Create a new event",
                    "category": "calendar",
                    "enabled": True,
                    "total_calls_24h": 10,
                    "success_rate": 0.95,
                    "avg_duration_ms": 250.0,
                    "last_error": None,
                    "last_error_at": None,
                    "phi_enabled": False,
                    "requires_confirmation": True,
                },
            ]

            response = await list_tools(
                request=mock_request,
                current_admin_user=mock_admin,
                category=None,
                enabled=None,
            )

        assert response["success"] is True
        assert len(response["data"]["tools"]) >= 1
        assert response["data"]["total"] >= 1
        assert "enabled_count" in response["data"]

    @pytest.mark.asyncio
    async def test_list_tools_filter_by_category(self):
        """Test listing tools filtered by category."""
        from app.api.admin_tools import list_tools

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        with patch("app.api.admin_tools.get_all_tools") as mock_get_tools:
            mock_get_tools.return_value = [
                {
                    "tool_name": "calendar_create_event",
                    "display_name": "Create Calendar Event",
                    "description": "Create a new event",
                    "category": "calendar",
                    "enabled": True,
                    "total_calls_24h": 10,
                    "success_rate": 0.95,
                    "avg_duration_ms": 250.0,
                    "last_error": None,
                    "last_error_at": None,
                    "phi_enabled": False,
                    "requires_confirmation": True,
                },
                {
                    "tool_name": "medical_calculator",
                    "display_name": "Medical Calculator",
                    "description": "Calculate medical scores",
                    "category": "calculation",
                    "enabled": True,
                    "total_calls_24h": 5,
                    "success_rate": 1.0,
                    "avg_duration_ms": 50.0,
                    "last_error": None,
                    "last_error_at": None,
                    "phi_enabled": True,
                    "requires_confirmation": False,
                },
            ]

            response = await list_tools(
                request=mock_request,
                current_admin_user=mock_admin,
                category="calendar",
                enabled=None,
            )

        assert response["success"] is True
        # Should only include calendar tools
        calendar_tools = [t for t in response["data"]["tools"] if t["category"] == "calendar"]
        assert len(calendar_tools) == len(response["data"]["tools"])

    @pytest.mark.asyncio
    async def test_list_tools_filter_by_enabled(self):
        """Test listing tools filtered by enabled status."""
        from app.api.admin_tools import list_tools

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        with patch("app.api.admin_tools.get_all_tools") as mock_get_tools:
            mock_get_tools.return_value = [
                {
                    "tool_name": "calendar_create_event",
                    "category": "calendar",
                    "enabled": True,
                    "display_name": "Create Event",
                    "description": "Create event",
                    "total_calls_24h": 0,
                    "success_rate": 0.0,
                    "avg_duration_ms": 0.0,
                    "last_error": None,
                    "last_error_at": None,
                    "phi_enabled": False,
                    "requires_confirmation": False,
                },
            ]

            response = await list_tools(
                request=mock_request,
                current_admin_user=mock_admin,
                category=None,
                enabled=True,
            )

        assert response["success"] is True
        for tool in response["data"]["tools"]:
            assert tool["enabled"] is True


class TestGetToolDetails:
    """Tests for GET /api/admin/tools/{tool_name}."""

    @pytest.mark.asyncio
    async def test_get_tool_details(self):
        """Test getting details for a specific tool."""
        from app.api.admin_tools import get_tool_details

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        with patch("app.api.admin_tools.get_tool_config") as mock_config, patch(
            "app.api.admin_tools.get_tool_analytics_24h"
        ) as mock_analytics:
            from app.api.admin_tools import ToolConfiguration

            mock_config.return_value = ToolConfiguration(
                tool_name="calendar_create_event",
                enabled=True,
                timeout_seconds=30,
                rate_limit_per_user=50,
                rate_limit_window_seconds=3600,
                requires_confirmation=True,
                phi_enabled=False,
            )
            mock_analytics.return_value = {
                "total_calls": 100,
                "success_count": 95,
                "failure_count": 5,
                "success_rate": 0.95,
            }

            response = await get_tool_details(
                request=mock_request,
                tool_name="calendar_create_event",
                current_admin_user=mock_admin,
            )

        assert response["success"] is True
        assert response["data"]["tool_name"] == "calendar_create_event"
        assert "config" in response["data"]
        assert "analytics" in response["data"]

    @pytest.mark.asyncio
    async def test_get_tool_details_not_found(self):
        """Test getting details for non-existent tool."""
        from app.api.admin_tools import get_tool_details
        from fastapi import HTTPException

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        with pytest.raises(HTTPException) as exc_info:
            await get_tool_details(
                request=mock_request,
                tool_name="nonexistent_tool",
                current_admin_user=mock_admin,
            )

        assert exc_info.value.status_code == 404


class TestUpdateToolConfig:
    """Tests for PATCH /api/admin/tools/{tool_name}."""

    @pytest.mark.asyncio
    async def test_update_tool_config(self):
        """Test updating tool configuration."""
        from app.api.admin_tools import ToolConfigUpdate, update_tool_config

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"
        mock_admin.email = "admin@example.com"
        mock_admin.role = "admin"

        mock_db = MagicMock()

        config_update = ToolConfigUpdate(
            enabled=False,
            timeout_seconds=60,
        )

        with patch("app.api.admin_tools.get_tool_config") as mock_get_config, patch(
            "app.api.admin_tools.save_tool_config"
        ) as mock_save_config, patch("app.api.admin_tools.log_audit_event") as mock_audit, patch(
            "app.api.admin_tools.ensure_admin_privileges"
        ):
            from app.api.admin_tools import ToolConfiguration

            mock_get_config.return_value = ToolConfiguration(
                tool_name="calendar_create_event",
                enabled=True,
                timeout_seconds=30,
                rate_limit_per_user=50,
                rate_limit_window_seconds=3600,
                requires_confirmation=True,
                phi_enabled=False,
            )

            response = await update_tool_config(
                request=mock_request,
                tool_name="calendar_create_event",
                config_update=config_update,
                db=mock_db,
                current_admin_user=mock_admin,
            )

        assert response["success"] is True
        mock_save_config.assert_called_once()
        mock_audit.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_tool_config_not_found(self):
        """Test updating non-existent tool."""
        from app.api.admin_tools import ToolConfigUpdate, update_tool_config
        from fastapi import HTTPException

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"
        mock_admin.email = "admin@example.com"
        mock_admin.role = "admin"

        mock_db = MagicMock()

        config_update = ToolConfigUpdate(enabled=False)

        with patch("app.api.admin_tools.ensure_admin_privileges"):
            with pytest.raises(HTTPException) as exc_info:
                await update_tool_config(
                    request=mock_request,
                    tool_name="nonexistent_tool",
                    config_update=config_update,
                    db=mock_db,
                    current_admin_user=mock_admin,
                )

        assert exc_info.value.status_code == 404


class TestToolLogs:
    """Tests for GET /api/admin/tools/logs."""

    @pytest.mark.asyncio
    async def test_get_tool_logs(self):
        """Test getting tool invocation logs."""
        from app.api.admin_tools import get_tool_invocation_logs

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        with patch("app.api.admin_tools.get_tool_logs") as mock_get_logs:
            mock_get_logs.return_value = [
                {
                    "id": "log-1",
                    "tool_name": "calendar_create_event",
                    "user_email": "user@example.com",
                    "session_id": "session-123",
                    "call_id": "call-123",
                    "arguments": {"title": "Meeting"},
                    "status": "completed",
                    "duration_ms": 250,
                    "phi_detected": False,
                    "created_at": "2024-01-15T10:00:00Z",
                },
            ]

            response = await get_tool_invocation_logs(
                request=mock_request,
                current_admin_user=mock_admin,
                tool_name=None,
                status=None,
                limit=50,
                offset=0,
            )

        assert response["success"] is True
        assert len(response["data"]["logs"]) == 1
        assert response["data"]["logs"][0]["tool_name"] == "calendar_create_event"

    @pytest.mark.asyncio
    async def test_get_tool_logs_with_filters(self):
        """Test getting tool logs with filters."""
        from app.api.admin_tools import get_tool_invocation_logs

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        with patch("app.api.admin_tools.get_tool_logs") as mock_get_logs:
            mock_get_logs.return_value = []

            response = await get_tool_invocation_logs(
                request=mock_request,
                current_admin_user=mock_admin,
                tool_name="calendar_create_event",
                status="completed",
                limit=50,
                offset=0,
            )

        assert response["success"] is True
        assert response["data"]["filters"]["tool_name"] == "calendar_create_event"
        assert response["data"]["filters"]["status"] == "completed"


class TestToolAnalytics:
    """Tests for GET /api/admin/tools/analytics."""

    @pytest.mark.asyncio
    async def test_get_tools_analytics(self):
        """Test getting tool usage analytics."""
        from app.api.admin_tools import get_tools_analytics

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        with patch("app.api.admin_tools.get_tool_analytics_24h") as mock_analytics:
            mock_analytics.return_value = {
                "total_calls": 50,
                "success_count": 45,
                "failure_count": 5,
                "timeout_count": 0,
                "cancelled_count": 0,
                "success_rate": 0.9,
                "avg_duration_ms": 200.0,
                "p95_duration_ms": 500.0,
                "phi_detected_count": 2,
                "confirmation_required_count": 10,
            }

            response = await get_tools_analytics(
                request=mock_request,
                current_admin_user=mock_admin,
            )

        assert response["success"] is True
        assert "tools" in response["data"]
        assert "summary" in response["data"]
        assert "by_category" in response["data"]


class TestToolConfigHelpers:
    """Tests for helper functions."""

    def test_get_tool_config_default(self):
        """Test getting default tool config."""
        from app.api.admin_tools import get_tool_config

        with patch("app.api.admin_tools.redis_client") as mock_redis:
            mock_redis.hget.return_value = None

            config = get_tool_config("calendar_create_event")

        assert config.tool_name == "calendar_create_event"
        assert config.enabled is True
        assert config.requires_confirmation is True

    def test_get_tool_config_from_redis(self):
        """Test getting tool config from Redis."""
        from app.api.admin_tools import get_tool_config

        stored_config = {
            "enabled": False,
            "timeout_seconds": 60,
            "rate_limit_per_user": 25,
            "rate_limit_window_seconds": 3600,
            "requires_confirmation": False,
            "phi_enabled": True,
            "custom_settings": {},
        }

        with patch("app.api.admin_tools.redis_client") as mock_redis:
            mock_redis.hget.return_value = json.dumps(stored_config).encode("utf-8")

            config = get_tool_config("calendar_create_event")

        assert config.tool_name == "calendar_create_event"
        assert config.enabled is False
        assert config.timeout_seconds == 60

    def test_get_tool_config_unknown_tool(self):
        """Test getting config for unknown tool raises error."""
        from app.api.admin_tools import get_tool_config

        with patch("app.api.admin_tools.redis_client") as mock_redis:
            mock_redis.hget.return_value = None

            with pytest.raises(ValueError) as exc_info:
                get_tool_config("unknown_tool")

            assert "Unknown tool" in str(exc_info.value)

    def test_save_tool_config(self):
        """Test saving tool config to Redis."""
        from app.api.admin_tools import ToolConfiguration, save_tool_config

        config = ToolConfiguration(
            tool_name="calendar_create_event",
            enabled=False,
            timeout_seconds=60,
            rate_limit_per_user=25,
            rate_limit_window_seconds=3600,
            requires_confirmation=True,
            phi_enabled=False,
        )

        with patch("app.api.admin_tools.redis_client") as mock_redis:
            save_tool_config("calendar_create_event", config)

            mock_redis.hset.assert_called_once()
            call_args = mock_redis.hset.call_args
            assert call_args[0][0] == "voiceassist:tools:config"
            assert call_args[0][1] == "calendar_create_event"

    def test_redact_phi_from_args(self):
        """Test PHI redaction from tool arguments."""
        from app.api.admin_tools import _redact_phi_from_args

        args = {
            "title": "Meeting",
            "patient_name": "John Doe",
            "email": "john@example.com",
            "description": "A" * 200,  # Long string
        }

        redacted = _redact_phi_from_args(args)

        assert redacted["title"] == "Meeting"
        assert redacted["patient_name"] == "[REDACTED]"
        assert redacted["email"] == "[REDACTED]"
        assert "[TRUNCATED]" in redacted["description"]


class TestLogToolInvocation:
    """Tests for tool invocation logging."""

    def test_log_tool_invocation(self):
        """Test logging a tool invocation."""
        from app.api.admin_tools import log_tool_invocation

        with patch("app.api.admin_tools.redis_client") as mock_redis, patch(
            "app.api.admin_tools._update_tool_analytics"
        ):
            log_tool_invocation(
                tool_name="calendar_create_event",
                user_email="user@example.com",
                session_id="session-123",
                call_id="call-123",
                arguments={"title": "Meeting"},
                status="completed",
                duration_ms=250,
                phi_detected=False,
            )

            mock_redis.lpush.assert_called_once()
            mock_redis.ltrim.assert_called_once()

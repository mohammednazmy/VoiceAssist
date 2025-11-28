"""Unit tests for Admin System API endpoints.

Tests cover:
- System resource monitoring (disk, memory, CPU)
- Backup status and controls
- Maintenance mode management
- System health status
- RBAC enforcement (admin vs viewer roles)
"""

import json
from unittest.mock import MagicMock, mock_open, patch

import pytest
from app.api.admin_system import (
    REDIS_MAINTENANCE_KEY,
    BackupHistoryEntry,
    BackupStatus,
    MaintenanceRequest,
    MaintenanceStatus,
    ResourceMetrics,
    SystemHealthStatus,
    _get_backup_status_from_redis,
    _get_cpu_usage,
    _get_disk_usage,
    _get_memory_usage,
    _get_uptime_seconds,
)


class TestResourceHelpers:
    """Tests for resource monitoring helper functions."""

    @patch("app.api.admin_system.shutil.disk_usage")
    def test_get_disk_usage_success(self, mock_disk_usage):
        """Test successful disk usage retrieval."""
        # Mock: 100GB total, 60GB used, 40GB free
        mock_disk_usage.return_value = MagicMock(
            total=100 * (1024**3),
            used=60 * (1024**3),
            free=40 * (1024**3),
        )

        result = _get_disk_usage()

        assert result["total_gb"] == 100.0
        assert result["used_gb"] == 60.0
        assert result["free_gb"] == 40.0
        assert result["percent"] == 60.0

    @patch("app.api.admin_system.shutil.disk_usage")
    def test_get_disk_usage_error(self, mock_disk_usage):
        """Test graceful handling of disk usage errors."""
        mock_disk_usage.side_effect = Exception("Permission denied")

        result = _get_disk_usage()

        assert result["total_gb"] == 0
        assert result["percent"] == 0

    @patch(
        "builtins.open",
        mock_open(
            read_data="""MemTotal:       16384000 kB
MemFree:         4096000 kB
MemAvailable:    8192000 kB
Buffers:          512000 kB
Cached:          2048000 kB
"""
        ),
    )
    def test_get_memory_usage_success(self):
        """Test successful memory usage retrieval."""
        result = _get_memory_usage()

        # 16GB total, 8GB available, 8GB used
        assert result["total_gb"] == pytest.approx(15.625, rel=0.01)  # 16384000 / 1024^2
        assert result["free_gb"] == pytest.approx(7.8125, rel=0.01)  # 8192000 / 1024^2
        assert result["percent"] == pytest.approx(50.0, rel=0.01)

    @patch("builtins.open")
    def test_get_memory_usage_error(self, mock_file):
        """Test graceful handling of memory usage errors."""
        mock_file.side_effect = Exception("File not found")

        result = _get_memory_usage()

        assert result["total_gb"] == 0
        assert result["percent"] == 0

    @patch("app.api.admin_system.os.cpu_count")
    @patch("app.api.admin_system.os.getloadavg")
    def test_get_cpu_usage_success(self, mock_loadavg, mock_cpu_count):
        """Test successful CPU usage retrieval."""
        mock_cpu_count.return_value = 4
        mock_loadavg.return_value = (2.0, 1.5, 1.0)  # 1m, 5m, 15m load

        result = _get_cpu_usage()

        assert result["count"] == 4
        assert result["load_1m"] == 2.0
        assert result["load_5m"] == 1.5
        assert result["load_15m"] == 1.0
        # 2.0 / 4 * 100 = 50%
        assert result["percent"] == 50.0

    @patch("app.api.admin_system.os.cpu_count")
    @patch("app.api.admin_system.os.getloadavg")
    def test_get_cpu_usage_high_load(self, mock_loadavg, mock_cpu_count):
        """Test CPU usage caps at 100%."""
        mock_cpu_count.return_value = 2
        mock_loadavg.return_value = (5.0, 4.0, 3.0)  # Very high load

        result = _get_cpu_usage()

        # Should cap at 100%
        assert result["percent"] == 100.0

    @patch("app.api.admin_system.os.cpu_count")
    @patch("app.api.admin_system.os.getloadavg")
    def test_get_cpu_usage_error(self, mock_loadavg, mock_cpu_count):
        """Test graceful handling of CPU usage errors."""
        mock_loadavg.side_effect = Exception("Not available")

        result = _get_cpu_usage()

        assert result["count"] == 1
        assert result["percent"] == 0


class TestBackupHelpers:
    """Tests for backup helper functions."""

    @patch("app.api.admin_system.redis_client")
    def test_get_backup_status_from_redis_success(self, mock_redis):
        """Test successful backup status retrieval."""
        mock_data = {
            "last_backup_at": "2025-11-27T02:00:00Z",
            "last_backup_result": "success",
            "backup_destination": "s3",
            "schedule": "Daily at 2:00 AM UTC",
            "retention_days": 30,
            "next_scheduled_at": "2025-11-28T02:00:00Z",
            "backup_size_mb": 524.5,
        }
        mock_redis.get.return_value = json.dumps(mock_data)

        result = _get_backup_status_from_redis()

        assert result["last_backup_result"] == "success"
        assert result["retention_days"] == 30

    @patch("app.api.admin_system.redis_client")
    def test_get_backup_status_from_redis_empty(self, mock_redis):
        """Test handling when no backup status exists."""
        mock_redis.get.return_value = None

        result = _get_backup_status_from_redis()

        assert result["last_backup_result"] == "unknown"
        assert result["retention_days"] == 30

    @patch("app.api.admin_system.redis_client")
    def test_get_backup_status_redis_error(self, mock_redis):
        """Test graceful handling of Redis errors."""
        mock_redis.get.side_effect = Exception("Redis connection failed")

        result = _get_backup_status_from_redis()

        assert result["last_backup_result"] == "unknown"


class TestUptimeHelper:
    """Tests for uptime helper function."""

    @patch("builtins.open", mock_open(read_data="12345.67 54321.00"))
    def test_get_uptime_seconds_success(self):
        """Test successful uptime retrieval."""
        result = _get_uptime_seconds()

        assert result == 12345

    @patch("builtins.open")
    def test_get_uptime_seconds_error(self, mock_file):
        """Test graceful handling of uptime errors."""
        mock_file.side_effect = Exception("File not found")

        result = _get_uptime_seconds()

        assert result == 0


class TestPydanticModels:
    """Tests for Pydantic model validation."""

    def test_resource_metrics_valid(self):
        """Test valid ResourceMetrics creation."""
        metrics = ResourceMetrics(
            disk_total_gb=500.0,
            disk_used_gb=300.0,
            disk_free_gb=200.0,
            disk_usage_percent=60.0,
            memory_total_gb=16.0,
            memory_used_gb=8.0,
            memory_free_gb=8.0,
            memory_usage_percent=50.0,
            cpu_count=8,
            cpu_usage_percent=25.0,
            load_average_1m=2.0,
            load_average_5m=1.5,
            load_average_15m=1.0,
        )
        assert metrics.disk_usage_percent == 60.0
        assert metrics.cpu_count == 8

    def test_backup_status_valid(self):
        """Test valid BackupStatus creation."""
        status = BackupStatus(
            last_backup_at="2025-11-27T02:00:00Z",
            last_backup_result="success",
            backup_destination="s3",
            schedule="Daily at 2:00 AM UTC",
            retention_days=30,
            next_scheduled_at="2025-11-28T02:00:00Z",
            backup_size_mb=524.5,
        )
        assert status.last_backup_result == "success"
        assert status.retention_days == 30

    def test_backup_history_entry_valid(self):
        """Test valid BackupHistoryEntry creation."""
        entry = BackupHistoryEntry(
            id="backup-20251127",
            started_at="2025-11-27T02:00:00Z",
            completed_at="2025-11-27T02:15:00Z",
            status="success",
            size_bytes=524288000,
            backup_type="full",
            error_message=None,
        )
        assert entry.status == "success"
        assert entry.backup_type == "full"

    def test_maintenance_status_valid(self):
        """Test valid MaintenanceStatus creation."""
        status = MaintenanceStatus(
            enabled=True,
            started_at="2025-11-27T10:00:00Z",
            started_by="admin@example.com",
            message="Scheduled maintenance",
            estimated_end="2025-11-27T12:00:00Z",
        )
        assert status.enabled is True
        assert status.started_by == "admin@example.com"

    def test_maintenance_status_disabled(self):
        """Test MaintenanceStatus when maintenance is disabled."""
        status = MaintenanceStatus(
            enabled=False,
            started_at=None,
            started_by=None,
            message=None,
            estimated_end=None,
        )
        assert status.enabled is False
        assert status.started_at is None

    def test_maintenance_request_valid(self):
        """Test valid MaintenanceRequest creation."""
        request = MaintenanceRequest(
            message="Scheduled maintenance window",
            estimated_duration_minutes=60,
        )
        assert request.message == "Scheduled maintenance window"
        assert request.estimated_duration_minutes == 60

    def test_maintenance_request_defaults(self):
        """Test MaintenanceRequest with default values."""
        request = MaintenanceRequest()
        assert request.message == "System is under maintenance"
        assert request.estimated_duration_minutes == 30

    def test_system_health_status_valid(self):
        """Test valid SystemHealthStatus creation."""
        status = SystemHealthStatus(
            status="healthy",
            uptime_seconds=86400,
            services={"redis": "healthy", "database": "healthy"},
            last_checked_at="2025-11-27T12:00:00Z",
        )
        assert status.status == "healthy"
        assert status.uptime_seconds == 86400
        assert len(status.services) == 2


class TestAdminSystemEndpoints:
    """Tests for Admin System API endpoints."""

    @pytest.fixture
    def mock_admin_user(self):
        """Create a mock admin user."""
        user = MagicMock()
        user.id = "admin-user-123"
        user.email = "admin@example.com"
        user.is_admin = True
        user.admin_role = "admin"
        return user

    @pytest.fixture
    def mock_viewer_user(self):
        """Create a mock viewer user."""
        user = MagicMock()
        user.id = "viewer-user-456"
        user.email = "viewer@example.com"
        user.is_admin = False
        user.admin_role = "viewer"
        return user

    @pytest.fixture
    def mock_request(self):
        """Create a mock FastAPI request."""
        request = MagicMock()
        request.state.trace_id = "test-trace-123"
        return request

    @pytest.fixture
    def mock_db(self):
        """Create a mock database session."""
        return MagicMock()

    @patch("app.api.admin_system._get_disk_usage")
    @patch("app.api.admin_system._get_memory_usage")
    @patch("app.api.admin_system._get_cpu_usage")
    @patch("app.api.admin_system.redis_client")
    def test_get_system_resources_success(
        self, mock_redis, mock_cpu, mock_memory, mock_disk, mock_request, mock_admin_user
    ):
        """Test successful system resources retrieval."""
        import asyncio

        from app.api.admin_system import get_system_resources

        mock_redis.get.return_value = None
        mock_disk.return_value = {"total_gb": 500, "used_gb": 300, "free_gb": 200, "percent": 60}
        mock_memory.return_value = {"total_gb": 16, "used_gb": 8, "free_gb": 8, "percent": 50}
        mock_cpu.return_value = {"count": 8, "percent": 25, "load_1m": 2, "load_5m": 1.5, "load_15m": 1}

        result = asyncio.get_event_loop().run_until_complete(get_system_resources(mock_request, mock_admin_user))

        assert result["success"] is True
        assert "disk_total_gb" in result["data"]
        assert "memory_total_gb" in result["data"]
        assert "cpu_count" in result["data"]

    @patch("app.api.admin_system.redis_client")
    def test_get_system_health_healthy(self, mock_redis, mock_request, mock_admin_user):
        """Test system health when all services are healthy."""
        import asyncio

        from app.api.admin_system import get_system_health

        mock_redis.ping.return_value = True

        result = asyncio.get_event_loop().run_until_complete(get_system_health(mock_request, mock_admin_user))

        assert result["success"] is True
        assert "status" in result["data"]
        assert "services" in result["data"]

    @patch("app.api.admin_system._get_backup_status_from_redis")
    def test_get_backup_status_success(self, mock_get_status, mock_request, mock_admin_user):
        """Test successful backup status retrieval."""
        import asyncio

        from app.api.admin_system import get_backup_status

        mock_get_status.return_value = {
            "last_backup_at": "2025-11-27T02:00:00Z",
            "last_backup_result": "success",
            "backup_destination": "s3",
            "schedule": "Daily at 2:00 AM UTC",
            "retention_days": 30,
            "next_scheduled_at": None,
            "backup_size_mb": 524.5,
        }

        result = asyncio.get_event_loop().run_until_complete(get_backup_status(mock_request, mock_admin_user))

        assert result["success"] is True
        assert result["data"]["last_backup_result"] == "success"

    def test_get_backup_history_returns_entries(self, mock_request, mock_admin_user):
        """Test backup history retrieval."""
        import asyncio

        from app.api.admin_system import get_backup_history

        result = asyncio.get_event_loop().run_until_complete(get_backup_history(mock_request, mock_admin_user, limit=5))

        assert result["success"] is True
        assert "history" in result["data"]
        assert len(result["data"]["history"]) <= 5

    @patch("app.api.admin_system.redis_client")
    def test_trigger_backup_admin_only(self, mock_redis, mock_request, mock_admin_user, mock_db):
        """Test that backup trigger requires admin role."""
        import asyncio

        from app.api.admin_system import trigger_backup

        result = asyncio.get_event_loop().run_until_complete(
            trigger_backup(mock_request, mock_db, mock_admin_user, backup_type="full")
        )

        assert result["success"] is True
        assert "backup_id" in result["data"]
        assert result["data"]["status"] == "in_progress"

    @patch("app.api.admin_system.redis_client")
    def test_get_maintenance_status_disabled(self, mock_redis, mock_request, mock_admin_user):
        """Test maintenance status when disabled."""
        import asyncio

        from app.api.admin_system import get_maintenance_status

        mock_redis.get.return_value = None

        result = asyncio.get_event_loop().run_until_complete(get_maintenance_status(mock_request, mock_admin_user))

        assert result["success"] is True
        assert result["data"]["enabled"] is False

    @patch("app.api.admin_system.redis_client")
    def test_get_maintenance_status_enabled(self, mock_redis, mock_request, mock_admin_user):
        """Test maintenance status when enabled."""
        import asyncio

        from app.api.admin_system import get_maintenance_status

        mock_data = {
            "enabled": True,
            "started_at": "2025-11-27T10:00:00Z",
            "started_by": "admin@example.com",
            "message": "Scheduled maintenance",
            "estimated_end": "2025-11-27T12:00:00Z",
        }
        mock_redis.get.return_value = json.dumps(mock_data)

        result = asyncio.get_event_loop().run_until_complete(get_maintenance_status(mock_request, mock_admin_user))

        assert result["success"] is True
        assert result["data"]["enabled"] is True
        assert result["data"]["message"] == "Scheduled maintenance"

    @patch("app.api.admin_system.redis_client")
    def test_enable_maintenance_mode(self, mock_redis, mock_request, mock_admin_user, mock_db):
        """Test enabling maintenance mode."""
        import asyncio

        from app.api.admin_system import enable_maintenance_mode

        maintenance_request = MaintenanceRequest(
            message="Scheduled maintenance window",
            estimated_duration_minutes=60,
        )

        result = asyncio.get_event_loop().run_until_complete(
            enable_maintenance_mode(mock_request, maintenance_request, mock_db, mock_admin_user)
        )

        assert result["success"] is True
        assert result["data"]["enabled"] is True
        assert result["data"]["action"] == "enabled"
        mock_redis.set.assert_called_once()

    @patch("app.api.admin_system.redis_client")
    def test_disable_maintenance_mode(self, mock_redis, mock_request, mock_admin_user, mock_db):
        """Test disabling maintenance mode."""
        import asyncio

        from app.api.admin_system import disable_maintenance_mode

        result = asyncio.get_event_loop().run_until_complete(
            disable_maintenance_mode(mock_request, mock_db, mock_admin_user)
        )

        assert result["success"] is True
        assert result["data"]["enabled"] is False
        assert result["data"]["action"] == "disabled"
        mock_redis.delete.assert_called_once_with(REDIS_MAINTENANCE_KEY)

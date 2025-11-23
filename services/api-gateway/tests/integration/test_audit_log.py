"""Unit tests for Audit Log model and service."""

import uuid
from datetime import datetime, timezone
from unittest.mock import Mock

import pytest
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services.audit_service import AuditService
from sqlalchemy.orm import Session


@pytest.fixture
def mock_db():
    """Create a mock database session."""
    db = Mock(spec=Session)
    db.add = Mock()
    db.commit = Mock()
    db.query = Mock()
    return db


@pytest.fixture
def sample_user():
    """Create a sample user for testing."""
    user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        role="clinician",
        hashed_password="hashed_password",
    )
    return user


@pytest.fixture
def mock_request():
    """Create a mock request object."""
    request = Mock()
    request.client.host = "192.168.1.1"
    request.headers.get = lambda key, default=None: (
        "Mozilla/5.0" if key.lower() == "user-agent" else default
    )
    request.url.path = "/api/test"
    request.state.request_id = str(uuid.uuid4())
    return request


class TestAuditLogModel:
    """Tests for the AuditLog model."""

    def test_audit_log_creation(self):
        """Test creating an audit log entry."""
        log = AuditLog(
            user_id=uuid.uuid4(),
            user_email="test@example.com",
            user_role="clinician",
            action="user_login",
            resource_type="authentication",
            success=True,
            service_name="api-gateway",
        )

        assert log.user_email == "test@example.com"
        assert log.action == "user_login"
        assert log.success is True

    def test_calculate_hash(self):
        """Test hash calculation for integrity verification."""
        log = AuditLog(
            user_id=uuid.uuid4(),
            action="test_action",
            resource_type="test_resource",
            success=True,
            timestamp=datetime.now(timezone.utc),
        )

        hash1 = log.calculate_hash()
        hash2 = log.calculate_hash()

        # Same log should produce same hash
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 produces 64 hex characters

    def test_verify_integrity_valid(self):
        """Test integrity verification with valid hash."""
        log = AuditLog(
            user_id=uuid.uuid4(),
            action="test_action",
            resource_type="test_resource",
            success=True,
            timestamp=datetime.now(timezone.utc),
        )

        log.hash = log.calculate_hash()

        assert log.verify_integrity() is True

    def test_verify_integrity_invalid(self):
        """Test integrity verification with tampered data."""
        log = AuditLog(
            user_id=uuid.uuid4(),
            action="test_action",
            resource_type="test_resource",
            success=True,
            timestamp=datetime.now(timezone.utc),
        )

        log.hash = log.calculate_hash()

        # Tamper with the log
        log.action = "modified_action"

        # Integrity check should fail
        assert log.verify_integrity() is False

    def test_hash_changes_with_different_data(self):
        """Test that different data produces different hashes."""
        user_id = uuid.uuid4()
        timestamp = datetime.now(timezone.utc)

        log1 = AuditLog(
            user_id=user_id, action="action1", success=True, timestamp=timestamp
        )

        log2 = AuditLog(
            user_id=user_id, action="action2", success=True, timestamp=timestamp
        )

        hash1 = log1.calculate_hash()
        hash2 = log2.calculate_hash()

        assert hash1 != hash2


class TestAuditService:
    """Tests for the AuditService."""

    @pytest.mark.asyncio
    async def test_log_event_basic(self, mock_db, sample_user, mock_request):
        """Test basic event logging."""
        log = await AuditService.log_event(
            db=mock_db,
            action="test_action",
            success=True,
            user=sample_user,
            request=mock_request,
        )

        assert log.action == "test_action"
        assert log.success is True
        assert log.user_id == sample_user.id
        assert log.user_email == sample_user.email
        assert log.ip_address == "192.168.1.1"
        assert log.hash is not None

        # Verify database interactions
        mock_db.add.assert_called_once_with(log)
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_log_event_without_user(self, mock_db, mock_request):
        """Test logging event without authenticated user."""
        log = await AuditService.log_event(
            db=mock_db,
            action="anonymous_action",
            success=True,
            user=None,
            request=mock_request,
        )

        assert log.user_id is None
        assert log.user_email is None
        assert log.action == "anonymous_action"
        assert log.hash is not None

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_log_event_with_resource(self, mock_db, sample_user, mock_request):
        """Test logging event with resource information."""
        resource_id = str(uuid.uuid4())

        log = await AuditService.log_event(
            db=mock_db,
            action="document_access",
            success=True,
            user=sample_user,
            resource_type="document",
            resource_id=resource_id,
            request=mock_request,
        )

        assert log.resource_type == "document"
        assert log.resource_id == resource_id

    @pytest.mark.asyncio
    async def test_log_event_with_metadata(self, mock_db, sample_user, mock_request):
        """Test logging event with additional metadata."""
        metadata = {"search_query": "pneumonia", "results_count": 42}

        log = await AuditService.log_event(
            db=mock_db,
            action="search_performed",
            success=True,
            user=sample_user,
            request=mock_request,
            metadata=metadata,
        )

        assert log.metadata == metadata
        assert log.metadata["search_query"] == "pneumonia"

    @pytest.mark.asyncio
    async def test_log_event_with_error(self, mock_db, sample_user, mock_request):
        """Test logging failed event with error message."""
        error_msg = "Invalid credentials"

        log = await AuditService.log_event(
            db=mock_db,
            action="user_login",
            success=False,
            user=None,
            request=mock_request,
            error_message=error_msg,
            status_code="401",
        )

        assert log.success is False
        assert log.error_message == error_msg
        assert log.status_code == "401"

    @pytest.mark.asyncio
    async def test_log_authentication_success(self, mock_db, sample_user, mock_request):
        """Test logging successful authentication."""
        log = await AuditService.log_authentication(
            db=mock_db,
            action="user_login",
            user=sample_user,
            request=mock_request,
            success=True,
        )

        assert log.action == "user_login"
        assert log.success is True
        assert log.resource_type == "authentication"
        assert log.user_id == sample_user.id

    @pytest.mark.asyncio
    async def test_log_authentication_failure(self, mock_db, mock_request):
        """Test logging failed authentication."""
        log = await AuditService.log_authentication(
            db=mock_db,
            action="user_login",
            user=None,
            request=mock_request,
            success=False,
            error_message="Invalid credentials",
        )

        assert log.success is False
        assert log.error_message == "Invalid credentials"
        assert log.user_id is None

    @pytest.mark.asyncio
    async def test_log_event_without_request(self, mock_db, sample_user):
        """Test logging event without request context."""
        log = await AuditService.log_event(
            db=mock_db,
            action="background_job",
            success=True,
            user=sample_user,
            request=None,
        )

        assert log.action == "background_job"
        assert log.ip_address is None
        assert log.user_agent is None
        assert log.request_id is None

    @pytest.mark.asyncio
    async def test_integrity_hash_automatically_set(
        self, mock_db, sample_user, mock_request
    ):
        """Test that integrity hash is automatically calculated."""
        log = await AuditService.log_event(
            db=mock_db,
            action="test_action",
            success=True,
            user=sample_user,
            request=mock_request,
        )

        # Hash should be set
        assert log.hash is not None
        assert len(log.hash) == 64

        # Hash should be valid
        assert log.verify_integrity() is True

    @pytest.mark.asyncio
    async def test_log_event_captures_request_id(
        self, mock_db, sample_user, mock_request
    ):
        """Test that request ID is captured from request context."""
        expected_request_id = str(uuid.uuid4())
        mock_request.state.request_id = expected_request_id

        log = await AuditService.log_event(
            db=mock_db,
            action="test_action",
            success=True,
            user=sample_user,
            request=mock_request,
        )

        assert log.request_id == expected_request_id

    @pytest.mark.asyncio
    async def test_get_user_audit_logs(self, mock_db, sample_user):
        """Test retrieving audit logs for a specific user."""
        # Mock the query chain
        mock_query = Mock()
        mock_filter = Mock()
        mock_order = Mock()

        mock_db.query.return_value = mock_query
        mock_query.filter.return_value = mock_filter
        mock_filter.order_by.return_value = mock_order
        mock_order.limit.return_value = mock_order
        mock_order.all.return_value = []

        logs = await AuditService.get_user_audit_logs(
            db=mock_db, user_id=sample_user.id, limit=50
        )

        # Verify query was constructed correctly
        mock_db.query.assert_called_once_with(AuditLog)
        assert logs == []

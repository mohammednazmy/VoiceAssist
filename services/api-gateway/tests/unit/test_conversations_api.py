"""
Unit tests for conversation branching API endpoints.
"""

import uuid
from datetime import datetime


class TestBranchHelpers:
    """Test helper functions for branching"""

    def test_generate_branch_id_format(self):
        """Test that branch ID has correct format"""
        from app.api.conversations import generate_branch_id

        branch_id = generate_branch_id()
        assert branch_id.startswith("branch-")
        parts = branch_id.split("-")
        assert len(parts) == 3  # branch-{timestamp}-{uuid}
        assert len(parts[1]) == 14  # timestamp YYYYMMDDHHMMSS
        assert len(parts[2]) == 8  # short UUID


class TestBranchSchemas:
    """Test Pydantic schemas for branching"""

    def test_create_branch_request_valid(self):
        """Test valid branch creation request"""
        from app.api.conversations import CreateBranchRequest

        request = CreateBranchRequest(parent_message_id=str(uuid.uuid4()), initial_message="Test message")
        assert request.parent_message_id is not None
        assert request.initial_message == "Test message"

    def test_create_branch_request_optional_message(self):
        """Test branch creation without initial message"""
        from app.api.conversations import CreateBranchRequest

        request = CreateBranchRequest(parent_message_id=str(uuid.uuid4()))
        assert request.parent_message_id is not None
        assert request.initial_message is None

    def test_branch_response_schema(self):
        """Test branch response schema"""
        from app.api.conversations import BranchResponse

        response = BranchResponse(
            branch_id="branch-20251123-12345678",
            session_id=str(uuid.uuid4()),
            parent_message_id=str(uuid.uuid4()),
            created_at=datetime.utcnow().isoformat() + "Z",
            message_count=1,
        )
        assert response.branch_id.startswith("branch-")
        assert response.message_count >= 0

    def test_message_response_with_branch_fields(self):
        """Test message response includes branching fields"""
        from app.api.conversations import MessageResponse

        message = MessageResponse(
            id=str(uuid.uuid4()),
            session_id=str(uuid.uuid4()),
            role="user",
            content="Test message",
            parent_message_id=str(uuid.uuid4()),
            branch_id="branch-20251123-12345678",
            created_at=datetime.utcnow().isoformat() + "Z",
        )
        assert message.parent_message_id is not None
        assert message.branch_id is not None


# Integration tests would require database setup and fixtures
# These would typically be in tests/integration/test_conversations_integration.py
# For now, we're focused on getting the API endpoints wired up correctly

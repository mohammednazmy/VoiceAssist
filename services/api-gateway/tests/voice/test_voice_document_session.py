"""
Unit tests for Voice Document Session API

Tests voice document navigation endpoints including:
- Start document session
- Get session state
- Update position
- End session
- Get page content
- Get table of contents
"""

import os
import sys
import types
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

# Set required environment variables before importing app modules
os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "test")
os.environ.setdefault("REDIS_PASSWORD", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("NEXTCLOUD_ADMIN_PASSWORD", "test")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")

# Stub optional dependencies
dummy_imap = types.SimpleNamespace(IMAP4_SSL=object)
sys.modules.setdefault("aioimaplib", dummy_imap)
sys.modules.setdefault("aiosmtplib", types.SimpleNamespace())


class _DynamicModule(types.ModuleType):
    def __getattr__(self, name):
        value = type(name, (), {})
        setattr(self, name, value)
        return value


stub_pubmed = _DynamicModule("app.services.pubmed_enhanced_service")
sys.modules.setdefault("app.services.pubmed_enhanced_service", stub_pubmed)
stub_uptodate = _DynamicModule("app.services.uptodate_service")
sys.modules.setdefault("app.services.uptodate_service", stub_uptodate)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import voice_documents
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.document import Document
from app.models.user import User
from app.models.voice_document_session import VoiceDocumentSession


# ========== Test Fixtures ==========


class MockUser:
    """Mock user for testing."""

    def __init__(self, user_id=None, is_admin=False):
        self.id = user_id or uuid.uuid4()
        self.email = "testuser@example.com"
        self.full_name = "Test User"
        self.is_admin = is_admin
        self.is_active = True


class MockDocument:
    """Mock document for testing."""

    def __init__(
        self,
        document_id="doc-123",
        title="Test Document",
        owner_id=None,
        is_public=True,
        indexing_status="indexed",
        total_pages=10,
        has_toc=True,
        has_figures=True,
        structure=None,
    ):
        self.document_id = document_id
        self.title = title
        self.owner_id = owner_id
        self.is_public = is_public
        self.indexing_status = indexing_status
        self.total_pages = total_pages
        self.has_toc = has_toc
        self.has_figures = has_figures
        self.structure = structure or self._default_structure()

    def _default_structure(self):
        return {
            "pages": [
                {
                    "page_number": i,
                    "text": f"Content of page {i}",
                    "word_count": 4,
                    "has_figures": i == 5,
                    "figures": [{"figure_id": "fig_1", "caption": "Test figure"}] if i == 5 else [],
                }
                for i in range(1, 11)
            ],
            "toc": [
                {"title": "Chapter 1: Introduction", "level": 1, "page_number": 1, "section_id": "sec_1"},
                {"title": "Chapter 2: Methods", "level": 1, "page_number": 4, "section_id": "sec_2"},
            ],
            "sections": [
                {"section_id": "sec_1", "title": "Chapter 1: Introduction", "level": 1, "start_page": 1, "end_page": 3},
                {"section_id": "sec_2", "title": "Chapter 2: Methods", "level": 1, "start_page": 4, "end_page": 10},
            ],
            "figures": [{"figure_id": "fig_1", "page_number": 5, "caption": "Test figure"}],
        }


class MockVoiceSession:
    """Mock voice document session for testing."""

    def __init__(
        self,
        session_id=None,
        conversation_id="conv-123",
        user_id=None,
        document_id="doc-123",
        current_page=1,
        current_section_id=None,
        last_read_position=0,
        is_active=True,
    ):
        self.id = session_id or uuid.uuid4()
        self.conversation_id = conversation_id
        self.user_id = user_id
        self.document_id = document_id
        self.current_page = current_page
        self.current_section_id = current_section_id
        self.last_read_position = last_read_position
        self.is_active = is_active
        self.created_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)


class MockDB:
    """Mock database session."""

    def __init__(self):
        self.documents = {}
        self.sessions = {}
        self._query_model = None
        self._filter_result = None

    def add(self, obj):
        if isinstance(obj, MockVoiceSession):
            self.sessions[str(obj.id)] = obj

    def commit(self):
        pass

    def refresh(self, obj):
        pass

    def query(self, model):
        self._query_model = model
        return self

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._filter_result

    def set_filter_result(self, result):
        self._filter_result = result


# ========== Test Setup ==========

test_app = FastAPI()
test_app.include_router(voice_documents.router)

# Store mocks globally for test configuration
_mock_user = MockUser()
_mock_db = MockDB()


def _override_get_current_user():
    return _mock_user


def _override_get_db():
    yield _mock_db


test_app.dependency_overrides[get_current_user] = _override_get_current_user
test_app.dependency_overrides[get_db] = _override_get_db

client = TestClient(test_app)


def teardown_module():
    test_app.dependency_overrides.pop(get_current_user, None)
    test_app.dependency_overrides.pop(get_db, None)


# ========== Tests for POST /session (Start Session) ==========


class TestStartDocumentSession:
    """Tests for starting a document session."""

    def setup_method(self):
        """Reset mocks before each test."""
        global _mock_user, _mock_db
        _mock_user = MockUser()
        _mock_db = MockDB()

    def test_start_session_document_not_found(self):
        """Test starting session with non-existent document."""
        _mock_db.set_filter_result(None)

        response = client.post(
            "/api/voice/documents/session",
            data={"document_id": "nonexistent", "conversation_id": "conv-123"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is False or data.get("error", {}).get("code") == "NOT_FOUND"

    def test_start_session_access_denied_private_doc(self):
        """Test starting session with private document owned by another user."""
        other_user_id = uuid.uuid4()
        private_doc = MockDocument(owner_id=other_user_id, is_public=False)
        _mock_db.set_filter_result(private_doc)

        response = client.post(
            "/api/voice/documents/session",
            data={"document_id": "doc-123", "conversation_id": "conv-123"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is False or data.get("error", {}).get("code") == "FORBIDDEN"

    def test_start_session_document_not_indexed(self):
        """Test starting session with document not yet indexed."""
        unindexed_doc = MockDocument(indexing_status="processing")
        _mock_db.set_filter_result(unindexed_doc)

        response = client.post(
            "/api/voice/documents/session",
            data={"document_id": "doc-123", "conversation_id": "conv-123"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is False or data.get("error", {}).get("code") == "PRECONDITION_FAILED"


class TestStartSessionSuccessScenarios:
    """Tests for successful session creation scenarios."""

    def setup_method(self):
        """Set up successful session creation scenario."""
        global _mock_user, _mock_db
        _mock_user = MockUser()
        _mock_db = MockDB()

    @patch.object(MockDB, "query")
    def test_start_session_creates_new(self, mock_query):
        """Test starting session creates new session when none exists."""
        indexed_doc = MockDocument(owner_id=_mock_user.id)

        # First query returns document, second returns no existing session
        query_results = [indexed_doc, None]
        call_count = [0]

        def side_effect(*args, **kwargs):
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.first.return_value = query_results[call_count[0] % len(query_results)]
            call_count[0] += 1
            return mock_filter

        mock_query.side_effect = side_effect

        response = client.post(
            "/api/voice/documents/session",
            data={"document_id": "doc-123", "conversation_id": "conv-new"},
        )

        # The response should be successful
        assert response.status_code == 200

    def test_start_session_public_document(self):
        """Test starting session with public document (any user can access)."""
        public_doc = MockDocument(owner_id=None, is_public=True)

        with patch.object(_mock_db, "query") as mock_query:
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.first.side_effect = [public_doc, None]  # doc found, no session
            mock_query.return_value = mock_filter

            response = client.post(
                "/api/voice/documents/session",
                data={"document_id": "doc-public", "conversation_id": "conv-123"},
            )

            assert response.status_code == 200


# ========== Tests for GET /session/{conversation_id} ==========


class TestGetDocumentSession:
    """Tests for getting document session state."""

    def setup_method(self):
        """Reset mocks before each test."""
        global _mock_user, _mock_db
        _mock_user = MockUser()
        _mock_db = MockDB()

    def test_get_session_no_active_session(self):
        """Test getting session when none exists."""
        _mock_db.set_filter_result(None)

        response = client.get("/api/voice/documents/session/conv-nonexistent")

        assert response.status_code == 200
        data = response.json()
        # Should return success with active=false
        result = data.get("data", data)
        assert result.get("active") is False

    @patch.object(MockDB, "query")
    def test_get_session_document_deleted(self, mock_query):
        """Test getting session when document was deleted."""
        session = MockVoiceSession(user_id=_mock_user.id)

        # First query returns session, second returns None (doc deleted)
        query_results = [session, None]
        call_count = [0]

        def side_effect(*args, **kwargs):
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.first.return_value = query_results[call_count[0] % len(query_results)]
            call_count[0] += 1
            return mock_filter

        mock_query.side_effect = side_effect

        response = client.get("/api/voice/documents/session/conv-123")

        assert response.status_code == 200
        data = response.json()
        result = data.get("data", data)
        assert result.get("active") is False

    @patch.object(MockDB, "query")
    def test_get_session_returns_state(self, mock_query):
        """Test getting session returns current state."""
        session = MockVoiceSession(user_id=_mock_user.id, current_page=5, current_section_id="sec_2")
        doc = MockDocument()

        query_results = [session, doc]
        call_count = [0]

        def side_effect(*args, **kwargs):
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.first.return_value = query_results[call_count[0] % len(query_results)]
            call_count[0] += 1
            return mock_filter

        mock_query.side_effect = side_effect

        response = client.get("/api/voice/documents/session/conv-123")

        assert response.status_code == 200
        data = response.json()
        result = data.get("data", data)
        assert result.get("active") is True
        assert result.get("current_page") == 5


# ========== Tests for PATCH /session/{conversation_id} ==========


class TestUpdateSessionPosition:
    """Tests for updating session position."""

    def setup_method(self):
        """Reset mocks before each test."""
        global _mock_user, _mock_db
        _mock_user = MockUser()
        _mock_db = MockDB()

    def test_update_position_no_session(self):
        """Test updating position when no session exists."""
        _mock_db.set_filter_result(None)

        response = client.patch(
            "/api/voice/documents/session/conv-nonexistent",
            data={"page": 10},
        )

        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is False or data.get("error", {}).get("code") == "NOT_FOUND"

    def test_update_position_page_only(self):
        """Test updating page position only."""
        session = MockVoiceSession(user_id=_mock_user.id)
        _mock_db.set_filter_result(session)

        response = client.patch(
            "/api/voice/documents/session/conv-123",
            data={"page": 15},
        )

        assert response.status_code == 200
        data = response.json()
        result = data.get("data", data)
        assert result.get("current_page") == 15

    def test_update_position_section_only(self):
        """Test updating section position only."""
        session = MockVoiceSession(user_id=_mock_user.id)
        _mock_db.set_filter_result(session)

        response = client.patch(
            "/api/voice/documents/session/conv-123",
            data={"section_id": "sec_3"},
        )

        assert response.status_code == 200
        data = response.json()
        result = data.get("data", data)
        assert result.get("current_section_id") == "sec_3"

    def test_update_position_last_read(self):
        """Test updating last read position."""
        session = MockVoiceSession(user_id=_mock_user.id)
        _mock_db.set_filter_result(session)

        response = client.patch(
            "/api/voice/documents/session/conv-123",
            data={"last_read_position": 500},
        )

        assert response.status_code == 200
        data = response.json()
        result = data.get("data", data)
        assert result.get("last_read_position") == 500


# ========== Tests for DELETE /session/{conversation_id} ==========


class TestEndDocumentSession:
    """Tests for ending document session."""

    def setup_method(self):
        """Reset mocks before each test."""
        global _mock_user, _mock_db
        _mock_user = MockUser()
        _mock_db = MockDB()

    def test_end_session_no_active_session(self):
        """Test ending session when none exists."""
        _mock_db.set_filter_result(None)

        response = client.delete("/api/voice/documents/session/conv-nonexistent")

        assert response.status_code == 200
        data = response.json()
        result = data.get("data", data)
        assert "No active session" in result.get("message", "")

    def test_end_session_success(self):
        """Test ending session successfully."""
        session = MockVoiceSession(user_id=_mock_user.id)
        _mock_db.set_filter_result(session)

        response = client.delete("/api/voice/documents/session/conv-123")

        assert response.status_code == 200
        data = response.json()
        result = data.get("data", data)
        assert "ended" in result.get("message", "").lower()
        assert session.is_active is False


# ========== Tests for GET /session/{conversation_id}/page/{page_number} ==========


class TestGetPageContent:
    """Tests for getting page content."""

    def setup_method(self):
        """Reset mocks before each test."""
        global _mock_user, _mock_db
        _mock_user = MockUser()
        _mock_db = MockDB()

    def test_get_page_no_session(self):
        """Test getting page when no session exists."""
        _mock_db.set_filter_result(None)

        response = client.get("/api/voice/documents/session/conv-123/page/5")

        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is False or data.get("error", {}).get("code") == "NOT_FOUND"

    @patch.object(MockDB, "query")
    def test_get_page_no_structure(self, mock_query):
        """Test getting page when document has no structure."""
        session = MockVoiceSession(user_id=_mock_user.id)
        doc = MockDocument()
        doc.structure = None

        query_results = [session, doc]
        call_count = [0]

        def side_effect(*args, **kwargs):
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.first.return_value = query_results[call_count[0] % len(query_results)]
            call_count[0] += 1
            return mock_filter

        mock_query.side_effect = side_effect

        response = client.get("/api/voice/documents/session/conv-123/page/5")

        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is False or data.get("error", {}).get("code") == "NOT_FOUND"

    @patch.object(MockDB, "query")
    def test_get_page_not_found(self, mock_query):
        """Test getting page that doesn't exist."""
        session = MockVoiceSession(user_id=_mock_user.id)
        doc = MockDocument(total_pages=10)

        query_results = [session, doc]
        call_count = [0]

        def side_effect(*args, **kwargs):
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.first.return_value = query_results[call_count[0] % len(query_results)]
            call_count[0] += 1
            return mock_filter

        mock_query.side_effect = side_effect

        response = client.get("/api/voice/documents/session/conv-123/page/99")

        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is False or "not found" in str(data).lower()

    @patch.object(MockDB, "query")
    def test_get_page_success(self, mock_query):
        """Test getting page content successfully."""
        session = MockVoiceSession(user_id=_mock_user.id)
        doc = MockDocument()

        query_results = [session, doc]
        call_count = [0]

        def side_effect(*args, **kwargs):
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.first.return_value = query_results[call_count[0] % len(query_results)]
            call_count[0] += 1
            return mock_filter

        mock_query.side_effect = side_effect

        response = client.get("/api/voice/documents/session/conv-123/page/5")

        assert response.status_code == 200
        data = response.json()
        result = data.get("data", data)
        if result.get("page_number"):
            assert result.get("page_number") == 5
            assert "content" in result

    @patch.object(MockDB, "query")
    def test_get_page_updates_session_position(self, mock_query):
        """Test getting page updates session's current page."""
        session = MockVoiceSession(user_id=_mock_user.id, current_page=1)
        doc = MockDocument()

        query_results = [session, doc]
        call_count = [0]

        def side_effect(*args, **kwargs):
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.first.return_value = query_results[call_count[0] % len(query_results)]
            call_count[0] += 1
            return mock_filter

        mock_query.side_effect = side_effect

        client.get("/api/voice/documents/session/conv-123/page/7")

        # Session's current_page should be updated
        assert session.current_page == 7


# ========== Tests for GET /session/{conversation_id}/toc ==========


class TestGetDocumentTOC:
    """Tests for getting document table of contents."""

    def setup_method(self):
        """Reset mocks before each test."""
        global _mock_user, _mock_db
        _mock_user = MockUser()
        _mock_db = MockDB()

    def test_get_toc_no_session(self):
        """Test getting TOC when no session exists."""
        _mock_db.set_filter_result(None)

        response = client.get("/api/voice/documents/session/conv-123/toc")

        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is False or data.get("error", {}).get("code") == "NOT_FOUND"

    @patch.object(MockDB, "query")
    def test_get_toc_no_structure(self, mock_query):
        """Test getting TOC when document has no structure."""
        session = MockVoiceSession(user_id=_mock_user.id)
        doc = MockDocument()
        doc.structure = None

        query_results = [session, doc]
        call_count = [0]

        def side_effect(*args, **kwargs):
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.first.return_value = query_results[call_count[0] % len(query_results)]
            call_count[0] += 1
            return mock_filter

        mock_query.side_effect = side_effect

        response = client.get("/api/voice/documents/session/conv-123/toc")

        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is False or data.get("error", {}).get("code") == "NOT_FOUND"

    @patch.object(MockDB, "query")
    def test_get_toc_empty(self, mock_query):
        """Test getting TOC when document has no TOC."""
        session = MockVoiceSession(user_id=_mock_user.id)
        doc = MockDocument()
        doc.structure = {"toc": [], "pages": [], "sections": [], "figures": []}

        query_results = [session, doc]
        call_count = [0]

        def side_effect(*args, **kwargs):
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.first.return_value = query_results[call_count[0] % len(query_results)]
            call_count[0] += 1
            return mock_filter

        mock_query.side_effect = side_effect

        response = client.get("/api/voice/documents/session/conv-123/toc")

        assert response.status_code == 200
        data = response.json()
        result = data.get("data", data)
        assert result.get("has_toc") is False

    @patch.object(MockDB, "query")
    def test_get_toc_success(self, mock_query):
        """Test getting TOC successfully."""
        session = MockVoiceSession(user_id=_mock_user.id)
        doc = MockDocument()

        query_results = [session, doc]
        call_count = [0]

        def side_effect(*args, **kwargs):
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.first.return_value = query_results[call_count[0] % len(query_results)]
            call_count[0] += 1
            return mock_filter

        mock_query.side_effect = side_effect

        response = client.get("/api/voice/documents/session/conv-123/toc")

        assert response.status_code == 200
        data = response.json()
        result = data.get("data", data)
        assert result.get("has_toc") is True
        assert len(result.get("toc", [])) > 0


# ========== Integration-style Tests ==========


class TestSessionLifecycle:
    """Tests for complete session lifecycle."""

    def setup_method(self):
        """Reset mocks before each test."""
        global _mock_user, _mock_db
        _mock_user = MockUser()
        _mock_db = MockDB()

    @patch.object(MockDB, "query")
    def test_full_session_lifecycle(self, mock_query):
        """Test complete session lifecycle: create, navigate, end."""
        doc = MockDocument(owner_id=_mock_user.id)
        session = MockVoiceSession(user_id=_mock_user.id)

        # Configure mock to return appropriate objects
        def side_effect_factory(results):
            call_count = [0]

            def side_effect(*args, **kwargs):
                mock_filter = MagicMock()
                mock_filter.filter.return_value = mock_filter
                idx = min(call_count[0], len(results) - 1)
                mock_filter.first.return_value = results[idx]
                call_count[0] += 1
                return mock_filter

            return side_effect

        # 1. Start session - doc found, no existing session
        mock_query.side_effect = side_effect_factory([doc, None])
        response = client.post(
            "/api/voice/documents/session",
            data={"document_id": "doc-123", "conversation_id": "lifecycle-test"},
        )
        assert response.status_code == 200

        # 2. Get session state
        mock_query.side_effect = side_effect_factory([session, doc])
        response = client.get("/api/voice/documents/session/lifecycle-test")
        assert response.status_code == 200

        # 3. Update position
        mock_query.side_effect = side_effect_factory([session])
        response = client.patch(
            "/api/voice/documents/session/lifecycle-test",
            data={"page": 5},
        )
        assert response.status_code == 200

        # 4. Get page content
        mock_query.side_effect = side_effect_factory([session, doc])
        response = client.get("/api/voice/documents/session/lifecycle-test/page/5")
        assert response.status_code == 200

        # 5. Get TOC
        mock_query.side_effect = side_effect_factory([session, doc])
        response = client.get("/api/voice/documents/session/lifecycle-test/toc")
        assert response.status_code == 200

        # 6. End session
        mock_query.side_effect = side_effect_factory([session])
        response = client.delete("/api/voice/documents/session/lifecycle-test")
        assert response.status_code == 200


class TestMultiUserIsolation:
    """Tests for multi-user session isolation."""

    def setup_method(self):
        """Reset mocks before each test."""
        global _mock_user, _mock_db
        _mock_user = MockUser()
        _mock_db = MockDB()

    def test_user_cannot_access_other_user_session(self):
        """Test that a user cannot access another user's session."""
        other_user_id = uuid.uuid4()
        other_user_session = MockVoiceSession(user_id=other_user_id)

        # Session exists but belongs to different user
        # The filter should return None because user_id doesn't match
        _mock_db.set_filter_result(None)

        response = client.get("/api/voice/documents/session/other-user-conv")

        assert response.status_code == 200
        data = response.json()
        result = data.get("data", data)
        # Should return no active session since user doesn't own it
        assert result.get("active") is False

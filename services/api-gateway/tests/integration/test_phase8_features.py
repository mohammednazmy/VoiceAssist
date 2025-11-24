"""
Integration tests for Phase 8 features.

Tests:
- File attachments (upload/list/download/delete)
- Clinical context API (create/get/update/delete)
- Structured citations (message_citations table)
- Conversation folders (create/list/tree/move)
- Export API (markdown + PDF)
"""

import io
from unittest.mock import patch

import pytest
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Test database URL
TEST_DATABASE_URL = "sqlite:///:memory:"

# Create test engine and session
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def test_db():
    """Create test database session."""
    from app.core.database import Base

    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def auth_headers(client):
    """Get authentication headers for test user."""
    # Login as test user
    response = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "testpass123"},
    )
    if response.status_code != 200:
        # Create test user first
        client.post(
            "/api/auth/register",
            json={
                "email": "test@example.com",
                "password": "testpass123",
                "name": "Test User",
            },
        )
        response = client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "testpass123"},
        )

    token_data = response.json()
    access_token = token_data.get("access_token")
    return {"Authorization": f"Bearer {access_token}"}


# =============================================================================
# Attachments API Tests
# =============================================================================


class TestAttachmentsAPI:
    """Test file attachment upload, list, download, and delete."""

    def test_upload_attachment(self, client, auth_headers):
        """Test uploading a file attachment to a message."""
        # Create a conversation and message first
        conv_response = client.post(
            "/api/conversations",
            json={"title": "Test Conversation"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        msg_response = client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"role": "user", "content": "Test message with attachment"},
            headers=auth_headers,
        )
        message_id = msg_response.json()["id"]

        # Upload attachment
        file_content = b"Test PDF content"
        files = {
            "file": ("test.pdf", io.BytesIO(file_content), "application/pdf"),
        }

        response = client.post(
            f"/api/attachments/upload?message_id={message_id}",
            files=files,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["fileName"] == "test.pdf"
        assert data["fileType"] == "pdf"
        assert data["mimeType"] == "application/pdf"
        assert data["messageId"] == message_id
        assert "fileUrl" in data
        assert "id" in data

    def test_list_attachments(self, client, auth_headers):
        """Test listing attachments for a message."""
        # Create conversation, message, and upload attachment
        conv_response = client.post(
            "/api/conversations",
            json={"title": "Test Conversation"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        msg_response = client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"role": "user", "content": "Test message"},
            headers=auth_headers,
        )
        message_id = msg_response.json()["id"]

        # Upload two attachments
        for i in range(2):
            files = {
                "file": (f"test{i}.txt", io.BytesIO(b"content"), "text/plain"),
            }
            client.post(
                f"/api/attachments/upload?message_id={message_id}",
                files=files,
                headers=auth_headers,
            )

        # List attachments
        response = client.get(
            f"/api/attachments?message_id={message_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert all(att["messageId"] == message_id for att in data)

    def test_download_attachment(self, client, auth_headers):
        """Test downloading an attachment."""
        # Create conversation, message, and upload attachment
        conv_response = client.post(
            "/api/conversations",
            json={"title": "Test Conversation"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        msg_response = client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"role": "user", "content": "Test message"},
            headers=auth_headers,
        )
        message_id = msg_response.json()["id"]

        # Upload attachment
        file_content = b"Test content for download"
        files = {
            "file": ("download.txt", io.BytesIO(file_content), "text/plain"),
        }
        upload_response = client.post(
            f"/api/attachments/upload?message_id={message_id}",
            files=files,
            headers=auth_headers,
        )
        attachment_id = upload_response.json()["id"]

        # Download attachment
        response = client.get(
            f"/api/attachments/{attachment_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.content == file_content

    def test_delete_attachment(self, client, auth_headers):
        """Test deleting an attachment."""
        # Create conversation, message, and upload attachment
        conv_response = client.post(
            "/api/conversations",
            json={"title": "Test Conversation"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        msg_response = client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"role": "user", "content": "Test message"},
            headers=auth_headers,
        )
        message_id = msg_response.json()["id"]

        # Upload attachment
        files = {
            "file": ("delete.txt", io.BytesIO(b"content"), "text/plain"),
        }
        upload_response = client.post(
            f"/api/attachments/upload?message_id={message_id}",
            files=files,
            headers=auth_headers,
        )
        attachment_id = upload_response.json()["id"]

        # Delete attachment
        response = client.delete(
            f"/api/attachments/{attachment_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200

        # Verify deletion
        list_response = client.get(
            f"/api/attachments?message_id={message_id}",
            headers=auth_headers,
        )
        assert len(list_response.json()) == 0


# =============================================================================
# Clinical Context API Tests
# =============================================================================


class TestClinicalContextAPI:
    """Test clinical context create, get, update, and delete."""

    def test_create_clinical_context(self, client, auth_headers):
        """Test creating a clinical context."""
        # Create conversation
        conv_response = client.post(
            "/api/conversations",
            json={"title": "Test Conversation"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        # Create clinical context
        context_data = {
            "session_id": conversation_id,
            "age": 45,
            "gender": "male",
            "weight_kg": 80.5,
            "chief_complaint": "Chest pain",
            "problems": ["Hypertension", "Type 2 Diabetes"],
            "medications": ["Metformin 500mg", "Lisinopril 10mg"],
            "allergies": ["Penicillin"],
            "vitals": {
                "temperature": 37.2,
                "heart_rate": 88,
                "blood_pressure": "140/90",
            },
        }

        response = client.post(
            "/api/clinical-context",
            json=context_data,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["sessionId"] == conversation_id
        assert data["age"] == 45
        assert data["gender"] == "male"
        assert data["chiefComplaint"] == "Chest pain"
        assert len(data["problems"]) == 2
        assert len(data["medications"]) == 2
        assert "id" in data

    def test_get_clinical_context(self, client, auth_headers):
        """Test retrieving clinical context."""
        # Create conversation and clinical context
        conv_response = client.post(
            "/api/conversations",
            json={"title": "Test Conversation"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        context_data = {
            "session_id": conversation_id,
            "age": 50,
            "gender": "female",
        }
        create_response = client.post(
            "/api/clinical-context",
            json=context_data,
            headers=auth_headers,
        )
        context_id = create_response.json()["id"]

        # Get clinical context
        response = client.get(
            f"/api/clinical-context/{context_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == context_id
        assert data["age"] == 50
        assert data["gender"] == "female"

    def test_update_clinical_context(self, client, auth_headers):
        """Test updating clinical context."""
        # Create conversation and clinical context
        conv_response = client.post(
            "/api/conversations",
            json={"title": "Test Conversation"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        context_data = {"session_id": conversation_id, "age": 40}
        create_response = client.post(
            "/api/clinical-context",
            json=context_data,
            headers=auth_headers,
        )
        context_id = create_response.json()["id"]

        # Update clinical context
        update_data = {
            "age": 41,
            "medications": ["Aspirin 81mg"],
        }
        response = client.put(
            f"/api/clinical-context/{context_id}",
            json=update_data,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["age"] == 41
        assert len(data["medications"]) == 1
        assert data["medications"][0] == "Aspirin 81mg"

    def test_delete_clinical_context(self, client, auth_headers):
        """Test deleting clinical context."""
        # Create conversation and clinical context
        conv_response = client.post(
            "/api/conversations",
            json={"title": "Test Conversation"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        context_data = {"session_id": conversation_id}
        create_response = client.post(
            "/api/clinical-context",
            json=context_data,
            headers=auth_headers,
        )
        context_id = create_response.json()["id"]

        # Delete clinical context
        response = client.delete(
            f"/api/clinical-context/{context_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200

        # Verify deletion
        get_response = client.get(
            f"/api/clinical-context/{context_id}",
            headers=auth_headers,
        )
        assert get_response.status_code == 404


# =============================================================================
# Conversation Folders API Tests
# =============================================================================


class TestFoldersAPI:
    """Test folder create, list, tree, move operations."""

    def test_create_folder(self, client, auth_headers):
        """Test creating a folder."""
        folder_data = {
            "name": "Work Projects",
            "color": "#3B82F6",
            "icon": "briefcase",
        }

        response = client.post(
            "/api/folders",
            json=folder_data,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Work Projects"
        assert data["color"] == "#3B82F6"
        assert data["icon"] == "briefcase"
        assert "id" in data

    def test_list_folders(self, client, auth_headers):
        """Test listing all folders."""
        # Create two folders
        client.post(
            "/api/folders",
            json={"name": "Folder 1"},
            headers=auth_headers,
        )
        client.post(
            "/api/folders",
            json={"name": "Folder 2"},
            headers=auth_headers,
        )

        # List folders
        response = client.get("/api/folders", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2
        assert any(f["name"] == "Folder 1" for f in data)
        assert any(f["name"] == "Folder 2" for f in data)

    def test_folder_tree(self, client, auth_headers):
        """Test getting hierarchical folder tree."""
        # Create parent folder
        parent_response = client.post(
            "/api/folders",
            json={"name": "Parent"},
            headers=auth_headers,
        )
        parent_id = parent_response.json()["id"]

        # Create child folder
        client.post(
            "/api/folders",
            json={"name": "Child", "parent_folder_id": parent_id},
            headers=auth_headers,
        )

        # Get folder tree
        response = client.get("/api/folders/tree", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        parent_folders = [f for f in data if f["name"] == "Parent"]
        assert len(parent_folders) == 1
        parent = parent_folders[0]
        assert "children" in parent
        assert len(parent["children"]) >= 1
        assert any(child["name"] == "Child" for child in parent["children"])

    def test_move_conversation_to_folder(self, client, auth_headers):
        """Test moving a conversation into a folder."""
        # Create folder
        folder_response = client.post(
            "/api/folders",
            json={"name": "Test Folder"},
            headers=auth_headers,
        )
        folder_id = folder_response.json()["id"]

        # Create conversation
        conv_response = client.post(
            "/api/conversations",
            json={"title": "Test Conversation"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        # Move conversation to folder
        response = client.patch(
            f"/api/conversations/{conversation_id}",
            json={"folder_id": folder_id},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["folderId"] == folder_id

    def test_prevent_folder_cycle(self, client, auth_headers):
        """Test that folder cannot be its own parent."""
        # Create folder
        folder_response = client.post(
            "/api/folders",
            json={"name": "Test Folder"},
            headers=auth_headers,
        )
        folder_id = folder_response.json()["id"]

        # Try to make folder its own parent (should fail)
        response = client.patch(
            f"/api/folders/{folder_id}",
            json={"parent_folder_id": folder_id},
            headers=auth_headers,
        )

        assert response.status_code in [400, 422]  # Bad request or validation error


# =============================================================================
# Export API Tests
# =============================================================================


class TestExportAPI:
    """Test conversation export in Markdown and PDF formats."""

    def test_export_markdown(self, client, auth_headers):
        """Test exporting conversation as Markdown."""
        # Create conversation with messages
        conv_response = client.post(
            "/api/conversations",
            json={"title": "Test Export"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        # Add messages
        client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"role": "user", "content": "What is diabetes?"},
            headers=auth_headers,
        )
        client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={
                "role": "assistant",
                "content": "Diabetes is a chronic condition...",
            },
            headers=auth_headers,
        )

        # Export as markdown
        response = client.get(
            f"/api/export/{conversation_id}/markdown",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/markdown; charset=utf-8"
        content = response.content.decode("utf-8")
        assert "# Test Export" in content
        assert "What is diabetes?" in content
        assert "Diabetes is a chronic condition" in content

    @patch("app.services.pdf_generator.generate_pdf_from_markdown")
    def test_export_pdf(self, mock_pdf_gen, client, auth_headers):
        """Test exporting conversation as PDF."""
        # Mock PDF generation
        mock_pdf_gen.return_value = b"Mock PDF content"

        # Create conversation with messages
        conv_response = client.post(
            "/api/conversations",
            json={"title": "Test Export"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"role": "user", "content": "Test question"},
            headers=auth_headers,
        )

        # Export as PDF
        response = client.get(
            f"/api/export/{conversation_id}/pdf",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert len(response.content) > 0


# =============================================================================
# RAG + Citations Integration Test
# =============================================================================


class TestRAGCitationsIntegration:
    """Test that RAG produces citations that are correctly stored."""

    @patch("app.services.search_aggregator.SearchAggregator.search")
    def test_rag_query_produces_citations(self, mock_search, client, auth_headers):
        """Test that a RAG query yields citations."""
        # Mock search results with citation data
        mock_search.return_value = [
            {
                "id": "doc-1",
                "source_id": "textbook-abc",
                "source_type": "textbook",
                "title": "Harrison's Principles of Internal Medicine",
                "url": None,
                "authors": ["Kasper", "Fauci"],
                "publication_date": "2018",
                "relevance_score": 95,
                "quoted_text": "Diabetes mellitus is characterized...",
            }
        ]

        # Create conversation
        conv_response = client.post(
            "/api/conversations",
            json={"title": "RAG Test"},
            headers=auth_headers,
        )
        conversation_id = conv_response.json()["id"]

        # Send query via WebSocket (or REST if available)
        # For now, test that QueryOrchestrator produces citations
        from app.services.rag_service import QueryOrchestrator, QueryRequest

        orchestrator = QueryOrchestrator(enable_rag=True)
        query_request = QueryRequest(
            session_id=conversation_id,
            query="What is diabetes?",
        )

        # Execute query
        import asyncio

        response = asyncio.run(orchestrator.handle_query(query_request))

        # Verify citations
        assert len(response.citations) > 0
        citation = response.citations[0]
        assert citation.source_type == "textbook"
        assert citation.title == "Harrison's Principles of Internal Medicine"
        assert citation.authors == ["Kasper", "Fauci"]
        assert citation.relevance_score == 95

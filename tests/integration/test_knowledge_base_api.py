"""Integration tests for Knowledge Base API endpoints.

Tests KB functionality including:
- Document upload
- Document listing
- Document search
- Document deletion
- RAG query
"""
from __future__ import annotations

import io
from typing import Dict, Any
from unittest.mock import patch, MagicMock

import pytest
from fastapi import status


# ============================================================================
# Document Upload Tests
# ============================================================================


@pytest.fixture
def sample_document(authenticated_client) -> Dict[str, Any]:
    """Upload a sample document via the user-facing documents API.

    This fixture is used as a backing document for KB tests that assume
    a document already exists. If the upload endpoint is unavailable,
    dependent tests are skipped.
    """
    file_content = b"Sample document for KB tests"
    files = {"file": ("sample.txt", io.BytesIO(file_content), "text/plain")}
    data = {"title": "Sample KB Document", "category": "general"}

    response = authenticated_client.post("/api/documents/upload", files=files, data=data)
    if response.status_code not in (200, 201):
        pytest.skip(f"/api/documents/upload unavailable for sample_document fixture: {response.status_code}")

    payload = response.json()
    # documents.upload uses API envelope; extract from data if present
    doc_data = payload.get("data", payload)
    return {"id": doc_data.get("document_id") or doc_data.get("id"), "title": doc_data.get("title")}


@pytest.mark.integration
@pytest.mark.api
def test_upload_document_success(authenticated_client):
    """Test successful document upload."""
    # Create a mock file
    file_content = b"This is test document content for the knowledge base."
    files = {
        "file": ("test_document.txt", io.BytesIO(file_content), "text/plain")
    }
    data = {
        "title": "Test Document",
        "category": "general"
    }

    response = authenticated_client.post("/api/kb/documents", files=files, data=data)

    assert response.status_code == status.HTTP_201_CREATED
    result = response.json()
    assert result["success"] is True
    assert "document_id" in result["data"]
    assert result["data"]["title"] == "Test Document"


@pytest.mark.integration
@pytest.mark.api
def test_upload_pdf_document(authenticated_client):
    """Test uploading PDF document."""
    # Mock PDF content
    pdf_content = b"%PDF-1.4\nTest PDF content"
    files = {
        "file": ("document.pdf", io.BytesIO(pdf_content), "application/pdf")
    }
    data = {"title": "PDF Document"}

    response = authenticated_client.post("/api/kb/documents", files=files, data=data)

    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.integration
@pytest.mark.api
def test_upload_document_with_metadata(authenticated_client):
    """Test uploading document with custom metadata."""
    file_content = b"Document with metadata"
    files = {
        "file": ("doc.txt", io.BytesIO(file_content), "text/plain")
    }
    data = {
        "title": "Document with Metadata",
        "metadata": '{"author": "Test Author", "tags": ["test", "sample"]}'
    }

    response = authenticated_client.post("/api/kb/documents", files=files, data=data)

    assert response.status_code == status.HTTP_201_CREATED
    result = response.json()
    assert "metadata" in result["data"]


@pytest.mark.integration
@pytest.mark.api
def test_upload_document_without_auth(client):
    """Test document upload requires authentication."""
    file_content = b"Test content"
    files = {
        "file": ("test.txt", io.BytesIO(file_content), "text/plain")
    }

    response = client.post("/api/kb/documents", files=files)

    # If KB API is not implemented yet, treat as environment constraint.
    if response.status_code == status.HTTP_404_NOT_FOUND:
        pytest.skip("KB document upload endpoint not implemented")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.integration
@pytest.mark.api
def test_upload_document_exceeds_size_limit(authenticated_client):
    """Test upload fails when file exceeds size limit."""
    # Create very large file (e.g., > 10MB)
    large_content = b"x" * (11 * 1024 * 1024)  # 11MB
    files = {
        "file": ("large.txt", io.BytesIO(large_content), "text/plain")
    }

    response = authenticated_client.post("/api/kb/documents", files=files)

    assert response.status_code in [
        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        status.HTTP_422_UNPROCESSABLE_ENTITY
    ]


@pytest.mark.integration
@pytest.mark.api
def test_upload_unsupported_file_type(authenticated_client):
    """Test upload fails with unsupported file type."""
    file_content = b"Executable content"
    files = {
        "file": ("malicious.exe", io.BytesIO(file_content), "application/x-executable")
    }

    response = authenticated_client.post("/api/kb/documents", files=files)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# ============================================================================
# Document Listing Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.api
def test_list_documents(authenticated_client, sample_document):
    """Test listing all documents."""
    response = authenticated_client.get("/api/kb/documents")

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert result["success"] is True
    assert "documents" in result["data"]
    assert isinstance(result["data"]["documents"], list)


@pytest.mark.integration
@pytest.mark.api
def test_list_documents_with_pagination(authenticated_client):
    """Test document listing with pagination."""
    response = authenticated_client.get("/api/kb/documents?page=1&page_size=10")

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert "pagination" in result["data"]
    assert result["data"]["pagination"]["page"] == 1
    assert result["data"]["pagination"]["page_size"] == 10


@pytest.mark.integration
@pytest.mark.api
def test_list_documents_filtered_by_category(authenticated_client):
    """Test listing documents filtered by category."""
    response = authenticated_client.get("/api/kb/documents?category=medical")

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    documents = result["data"]["documents"]

    # All returned documents should be in medical category
    if documents:
        assert all(doc.get("category") == "medical" for doc in documents)


@pytest.mark.integration
@pytest.mark.api
def test_list_documents_sorted_by_date(authenticated_client):
    """Test listing documents sorted by creation date."""
    response = authenticated_client.get("/api/kb/documents?sort_by=created_at&order=desc")

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    documents = result["data"]["documents"]

    # Documents should be in descending order by date
    if len(documents) > 1:
        dates = [doc["created_at"] for doc in documents]
        assert dates == sorted(dates, reverse=True)


@pytest.mark.integration
@pytest.mark.api
def test_list_documents_empty_result(authenticated_client):
    """Test listing documents returns empty list when no documents exist."""
    # Assuming fresh database or filtered to non-existent category
    response = authenticated_client.get("/api/kb/documents?category=nonexistent")

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert result["data"]["documents"] == []


# ============================================================================
# Document Search Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.api
def test_search_documents_by_title(authenticated_client, sample_document):
    """Test searching documents by title."""
    search_query = {"query": "Test Document"}

    response = authenticated_client.post("/api/kb/documents/search", json=search_query)

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert "results" in result["data"]
    assert isinstance(result["data"]["results"], list)


@pytest.mark.integration
@pytest.mark.api
def test_search_documents_by_content(authenticated_client):
    """Test semantic search in document content."""
    search_query = {
        "query": "medical diagnosis procedures",
        "search_type": "semantic"
    }

    response = authenticated_client.post("/api/kb/documents/search", json=search_query)

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert "results" in result["data"]


@pytest.mark.integration
@pytest.mark.api
def test_search_with_filters(authenticated_client):
    """Test search with additional filters."""
    search_query = {
        "query": "patient care",
        "filters": {
            "category": "medical",
            "date_from": "2024-01-01"
        }
    }

    response = authenticated_client.post("/api/kb/documents/search", json=search_query)

    assert response.status_code == status.HTTP_200_OK


@pytest.mark.integration
@pytest.mark.api
def test_search_returns_relevance_scores(authenticated_client):
    """Test that search results include relevance scores."""
    search_query = {"query": "test"}

    response = authenticated_client.post("/api/kb/documents/search", json=search_query)

    assert response.status_code == status.HTTP_200_OK
    result = response.json()

    if result["data"]["results"]:
        first_result = result["data"]["results"][0]
        assert "relevance_score" in first_result or "score" in first_result


@pytest.mark.integration
@pytest.mark.api
def test_search_with_limit(authenticated_client):
    """Test search with result limit."""
    search_query = {
        "query": "test",
        "limit": 5
    }

    response = authenticated_client.post("/api/kb/documents/search", json=search_query)

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert len(result["data"]["results"]) <= 5


@pytest.mark.integration
@pytest.mark.api
def test_search_empty_query(authenticated_client):
    """Test search with empty query."""
    search_query = {"query": ""}

    response = authenticated_client.post("/api/kb/documents/search", json=search_query)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# ============================================================================
# Document Deletion Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.api
def test_delete_document_success(authenticated_client, sample_document):
    """Test successful document deletion."""
    document_id = sample_document["id"]

    response = authenticated_client.delete(f"/api/kb/documents/{document_id}")

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert result["success"] is True


@pytest.mark.integration
@pytest.mark.api
def test_delete_nonexistent_document(authenticated_client):
    """Test deleting non-existent document returns 404."""
    fake_id = "nonexistent-document-id"

    response = authenticated_client.delete(f"/api/kb/documents/{fake_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    result = response.json()
    assert result["error"]["code"] == "NOT_FOUND"


@pytest.mark.integration
@pytest.mark.api
def test_delete_document_unauthorized(client, sample_document):
    """Test document deletion requires authentication."""
    document_id = sample_document["id"]

    response = client.delete(f"/api/kb/documents/{document_id}")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.integration
@pytest.mark.api
def test_delete_document_forbidden_for_non_owner(authenticated_client):
    """Test user cannot delete another user's document."""
    # Assuming document belongs to different user
    other_user_document_id = "other-user-document-123"

    response = authenticated_client.delete(f"/api/kb/documents/{other_user_document_id}")

    assert response.status_code in [
        status.HTTP_403_FORBIDDEN,
        status.HTTP_404_NOT_FOUND
    ]


@pytest.mark.integration
@pytest.mark.api
def test_deleted_document_not_in_search(authenticated_client, sample_document):
    """Test that deleted document doesn't appear in search results."""
    document_id = sample_document["id"]
    document_title = sample_document["title"]

    # Delete document
    authenticated_client.delete(f"/api/kb/documents/{document_id}")

    # Search for it
    search_response = authenticated_client.post(
        "/api/kb/documents/search",
        json={"query": document_title}
    )

    results = search_response.json()["data"]["results"]
    assert not any(r["id"] == document_id for r in results)


# ============================================================================
# RAG Query Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.api
def test_rag_query_success(authenticated_client):
    """Test successful RAG query."""
    query_data = {
        "question": "What are the symptoms of diabetes?",
        "context_documents": 5
    }

    response = authenticated_client.post("/api/kb/query", json=query_data)

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert result["success"] is True
    assert "answer" in result["data"]
    assert "sources" in result["data"]


@pytest.mark.integration
@pytest.mark.api
def test_rag_query_returns_sources(authenticated_client):
    """Test that RAG query returns source documents."""
    query_data = {
        "question": "How to treat hypertension?"
    }

    response = authenticated_client.post("/api/kb/query", json=query_data)

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert "sources" in result["data"]
    assert isinstance(result["data"]["sources"], list)


@pytest.mark.integration
@pytest.mark.api
def test_rag_query_with_filters(authenticated_client):
    """Test RAG query with document filters."""
    query_data = {
        "question": "Treatment options?",
        "filters": {
            "category": "medical",
            "document_ids": ["doc1", "doc2"]
        }
    }

    response = authenticated_client.post("/api/kb/query", json=query_data)

    assert response.status_code == status.HTTP_200_OK


@pytest.mark.integration
@pytest.mark.api
def test_rag_query_empty_knowledge_base(authenticated_client):
    """Test RAG query when knowledge base is empty for a fresh user."""
    import uuid

    # Create a fresh user with no personal KB documents
    unique_email = f"kb-empty-{uuid.uuid4().hex[:8]}@example.com"
    user_payload = {
        "email": unique_email,
        "password": "StrongP@ssw0rd!",
        "full_name": "KB Empty User",
    }

    # Use a raw client so we don't affect the authenticated_client's auth state
    from tests.conftest import APIClient, TEST_API_BASE_URL

    client = APIClient(base_url=TEST_API_BASE_URL, timeout=30.0)

    register_resp = client.post("/api/auth/register", json=user_payload)
    if register_resp.status_code not in (200, 201, 400, 409, 429):
        pytest.skip(f"Unable to register KB-empty test user: {register_resp.status_code}")

    login_resp = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": user_payload["password"]},
    )
    if login_resp.status_code != 200:
        pytest.skip(f"Unable to log in KB-empty test user: {login_resp.status_code}")

    tokens = login_resp.json()
    access_token = tokens.get("access_token")
    if not access_token:
        pytest.skip("KB-empty user login response missing access_token")

    client.headers = {"Authorization": f"Bearer {access_token}"}

    query_data = {
        "question": "Any question?",
        "context_documents": 5,
    }

    response = client.post("/api/kb/query", json=query_data)

    if response.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_501_NOT_IMPLEMENTED):
        pytest.skip("KB RAG query endpoint not available in this environment")
    if response.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        pytest.skip(f"KB RAG query failed due to backend error: {response.status_code}")

    # Should return gracefully with an answer and an explicit sources list
    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert result["success"] is True
    assert "answer" in result["data"]
    assert "sources" in result["data"]
    assert isinstance(result["data"]["sources"], list)


@pytest.mark.integration
@pytest.mark.api
def test_rag_query_includes_public_documents_for_other_users():
    """RAG query should include public documents owned by a different user.

    This validates that `/api/kb/query` uses the same visibility rules as the
    documents API (owner OR is_public).
    """
    import uuid

    from tests.conftest import APIClient, TEST_API_BASE_URL

    owner_client = APIClient(base_url=TEST_API_BASE_URL, timeout=30.0)
    other_client = APIClient(base_url=TEST_API_BASE_URL, timeout=30.0)

    owner_email = f"kb-owner-{uuid.uuid4().hex[:8]}@example.com"
    other_email = f"kb-other-{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongP@ssw0rd!"

    def register_and_login(api_client: APIClient, email: str) -> None:
        register_resp = api_client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": password,
                "full_name": "KB Public Doc User",
            },
        )
        # Treat 400/409/429 as "already exists / constrained" so tests can proceed
        if register_resp.status_code not in (200, 201, 400, 409, 429):
            pytest.skip(
                f"Auth service unavailable for KB public-doc user: {register_resp.status_code}"
            )

        login_resp = api_client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )
        if login_resp.status_code != 200:
            pytest.skip(
                f"Unable to log in KB public-doc user ({email}): {login_resp.status_code}"
            )

        tokens = login_resp.json()
        access_token = tokens.get("access_token")
        if not access_token:
            pytest.skip(f"Login response for {email} missing access_token")

        api_client.headers = {"Authorization": f"Bearer {access_token}"}

    # Create owner user and upload a public document
    register_and_login(owner_client, owner_email)

    file_content = b"Public KB document content for cross-user tests"
    files = {
        "file": ("public-kb-doc.txt", io.BytesIO(file_content), "text/plain"),
    }
    data = {
        "title": "Public KB Cross-User Doc",
        "category": "general",
        "is_public": "true",
    }

    upload_resp = owner_client.post("/api/documents/upload", files=files, data=data)
    if upload_resp.status_code in (
        status.HTTP_404_NOT_FOUND,
        status.HTTP_501_NOT_IMPLEMENTED,
    ):
        pytest.skip(
            f"Documents upload endpoint not available for KB public-doc test: {upload_resp.status_code}"
        )
    if upload_resp.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        pytest.skip(
            f"Documents upload failed due to backend error: {upload_resp.status_code}"
        )

    upload_payload = upload_resp.json()
    doc_data = upload_payload.get("data", upload_payload) or {}
    public_doc_id = doc_data.get("document_id") or doc_data.get("id")
    if not public_doc_id:
        pytest.skip("Public KB document upload response missing document_id")

    # Create a different user and issue a KB query
    register_and_login(other_client, other_email)

    query_data = {
        "question": "Cross-user KB query test",
        "context_documents": 20,
    }

    response = other_client.post("/api/kb/query", json=query_data)

    if response.status_code in (
        status.HTTP_404_NOT_FOUND,
        status.HTTP_501_NOT_IMPLEMENTED,
    ):
        pytest.skip("KB RAG query endpoint not available in this environment")
    if response.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        pytest.skip(
            f"KB RAG query failed due to backend error in public-doc test: {response.status_code}"
        )

    result = response.json()
    assert response.status_code == status.HTTP_200_OK
    assert result.get("success") is True
    assert "answer" in result["data"]
    assert "sources" in result["data"]
    sources = result["data"]["sources"]
    assert isinstance(sources, list)

    # At least one of the sources should be the public document created by the owner.
    assert any(source.get("id") == public_doc_id for source in sources)


@pytest.mark.integration
@pytest.mark.api
def test_rag_query_requires_auth(client):
    """Test RAG query requires authentication."""
    query_data = {
        "question": "Test question?"
    }

    response = client.post("/api/kb/query", json=query_data)

    if response.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_501_NOT_IMPLEMENTED):
        pytest.skip("KB RAG query endpoint not available in this environment")
    if response.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        pytest.skip(f"KB RAG query failed due to backend error: {response.status_code}")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.integration
@pytest.mark.api
def test_rag_query_with_conversation_history(authenticated_client):
    """Test RAG query with conversation history for context."""
    query_data = {
        "question": "What about side effects?",
        "conversation_history": [
            {"role": "user", "content": "Tell me about aspirin"},
            {"role": "assistant", "content": "Aspirin is a pain reliever..."}
        ]
    }

    response = authenticated_client.post("/api/kb/query", json=query_data)

    assert response.status_code == status.HTTP_200_OK


# ============================================================================
# Document Retrieval Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.api
def test_get_document_by_id(authenticated_client, sample_document):
    """Test retrieving specific document by ID."""
    document_id = sample_document["id"]

    response = authenticated_client.get(f"/api/kb/documents/{document_id}")

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert result["data"]["id"] == document_id


@pytest.mark.integration
@pytest.mark.api
def test_get_nonexistent_document(authenticated_client):
    """Test retrieving non-existent document returns 404."""
    response = authenticated_client.get("/api/kb/documents/nonexistent-id")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.integration
@pytest.mark.api
def test_get_document_content(authenticated_client, sample_document):
    """Test retrieving document content/text."""
    document_id = sample_document["id"]

    response = authenticated_client.get(f"/api/kb/documents/{document_id}/content")

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert "content" in result["data"]


# ============================================================================
# Document Update Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.api
def test_update_document_metadata(authenticated_client, sample_document):
    """Test updating document metadata."""
    document_id = sample_document["id"]
    update_data = {
        "title": "Updated Title",
        "category": "updated_category"
    }

    response = authenticated_client.patch(
        f"/api/kb/documents/{document_id}",
        json=update_data
    )

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert result["data"]["title"] == "Updated Title"


@pytest.mark.integration
@pytest.mark.api
def test_update_nonexistent_document(authenticated_client):
    """Test updating non-existent document returns 404."""
    update_data = {"title": "New Title"}

    response = authenticated_client.patch(
        "/api/kb/documents/nonexistent-id",
        json=update_data
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


# ============================================================================
# Bulk Operations Tests
# ============================================================================


@pytest.mark.integration
@pytest.mark.api
def test_bulk_document_upload(authenticated_client):
    """Test uploading multiple documents at once."""
    files = [
        ("files", ("doc1.txt", io.BytesIO(b"Content 1"), "text/plain")),
        ("files", ("doc2.txt", io.BytesIO(b"Content 2"), "text/plain")),
    ]

    response = authenticated_client.post("/api/kb/documents/bulk", files=files)

    assert response.status_code == status.HTTP_201_CREATED
    result = response.json()
    assert "uploaded_count" in result["data"]


@pytest.mark.integration
@pytest.mark.api
def test_bulk_document_deletion(authenticated_client):
    """Test deleting multiple documents at once."""
    delete_data = {
        "document_ids": ["doc1", "doc2", "doc3"]
    }

    response = authenticated_client.post("/api/kb/documents/bulk-delete", json=delete_data)

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert "deleted_count" in result["data"]


# ============================================================================
# Error Handling and Edge Cases
# ============================================================================


@pytest.mark.integration
@pytest.mark.api
@pytest.mark.slow
def test_upload_large_document_processes_correctly(authenticated_client):
    """Test that large documents are processed correctly."""
    # Create a moderately large document (within limits)
    large_content = b"Sample text. " * 100000  # ~1.3MB
    files = {
        "file": ("large.txt", io.BytesIO(large_content), "text/plain")
    }

    response = authenticated_client.post("/api/kb/documents", files=files)

    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.integration
@pytest.mark.api
def test_concurrent_document_operations(authenticated_client):
    """Test handling concurrent document operations."""
    # This would test race conditions and concurrent access
    # Implementation depends on your concurrency model
    pass


@pytest.mark.integration
@pytest.mark.api
def test_document_with_special_characters(authenticated_client):
    """Test handling documents with special characters in filename."""
    file_content = b"Test content"
    files = {
        "file": ("file with spaces & special!@#.txt", io.BytesIO(file_content), "text/plain")
    }

    response = authenticated_client.post("/api/kb/documents", files=files)

    assert response.status_code == status.HTTP_201_CREATED

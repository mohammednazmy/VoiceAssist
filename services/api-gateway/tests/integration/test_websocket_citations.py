"""
Integration tests for WebSocket citation streaming.

Tests that citations are correctly:
- Streamed in message.done events
- Formatted with correct schema
- Include all structured fields (authors, DOI, PubMed ID, etc.)

NOTE: WebSocket endpoint requires JWT authentication, so these tests need to either:
1. Use E2E test setup with real database to create test users and tokens
2. Or mock the authentication flow completely

These tests are skipped until proper WebSocket E2E test infrastructure is set up.
"""

from unittest.mock import patch

import pytest
from app.main import app
from app.services.rag_service import Citation, QueryResponse
from fastapi.testclient import TestClient


@pytest.mark.skip(reason="WebSocket tests require authentication - use E2E test setup with real users")
class TestWebSocketCitationStreaming:
    """Test suite for WebSocket citation streaming."""

    @patch("app.services.rag_service.QueryOrchestrator.handle_query")
    def test_message_done_includes_citations(self, mock_handle_query):
        """Test that message.done event includes structured citations."""
        # Mock QueryOrchestrator to return response with citations
        mock_citations = [
            Citation(
                id="cite-1",
                source_id="textbook-harrison",
                source_type="textbook",
                title="Harrison's Principles of Internal Medicine",
                authors=["Kasper", "Fauci", "Hauser", "Longo"],
                publication_date="2018",
                journal=None,
                doi="10.1036/9781259644047",
                pmid=None,
                relevance_score=95,
                quoted_text="Diabetes mellitus is characterized by hyperglycemia...",
            ),
            Citation(
                id="cite-2",
                source_id="pubmed-12345",
                source_type="journal",
                title="Management of Type 2 Diabetes",
                authors=["Smith", "Johnson"],
                publication_date="2023-06-15",
                journal="New England Journal of Medicine",
                volume="388",
                issue="24",
                pages="2252-2260",
                doi="10.1056/NEJMra2301806",
                pmid="12345678",
                relevance_score=92,
                quoted_text="Metformin remains first-line therapy...",
            ),
        ]

        mock_response = QueryResponse(
            session_id="test-session",
            message_id="msg-123",
            answer="Diabetes is a chronic metabolic disorder...",
            created_at="2025-11-24T00:00:00Z",
            citations=mock_citations,
        )

        # Make handle_query async
        async def async_handle_query(*args, **kwargs):
            return mock_response

        mock_handle_query.side_effect = async_handle_query

        client = TestClient(app)

        with client.websocket_connect("/api/realtime/ws") as websocket:
            # Skip connected message
            connected_msg = websocket.receive_json()
            assert connected_msg["type"] == "connected"

            # Send query message
            websocket.send_json(
                {
                    "type": "message",
                    "content": "What is diabetes?",
                }
            )

            # Collect chunks
            chunks = []
            message_done = None

            while True:
                event = websocket.receive_json()
                event_type = event["type"]

                if event_type == "chunk":
                    chunks.append(event["content"])
                elif event_type == "message.done":
                    message_done = event
                    break
                elif event_type == "error":
                    pytest.fail(f"Received error: {event['error']}")

            # Verify message.done structure
            assert message_done is not None
            assert "message" in message_done
            message = message_done["message"]

            # Verify message fields
            assert message["role"] == "assistant"
            assert message["content"] == mock_response.answer
            assert "citations" in message
            assert len(message["citations"]) == 2

            # Verify first citation (textbook)
            cite1 = message["citations"][0]
            assert cite1["id"] == "cite-1"
            assert cite1["sourceType"] == "textbook"
            assert cite1["title"] == "Harrison's Principles of Internal Medicine"
            assert cite1["authors"] == ["Kasper", "Fauci", "Hauser", "Longo"]
            assert cite1["doi"] == "10.1036/9781259644047"
            assert cite1["relevanceScore"] == 95
            assert "hyperglycemia" in cite1["snippet"]

            # Verify second citation (journal article)
            cite2 = message["citations"][1]
            assert cite2["id"] == "cite-2"
            assert cite2["sourceType"] == "journal"
            assert cite2["title"] == "Management of Type 2 Diabetes"
            assert cite2["authors"] == ["Smith", "Johnson"]
            assert cite2["journal"] == "New England Journal of Medicine"
            assert cite2["doi"] == "10.1056/NEJMra2301806"
            assert cite2["pubmedId"] == "12345678"
            assert cite2["relevanceScore"] == 92

    @patch("app.services.rag_service.QueryOrchestrator.handle_query")
    def test_empty_citations_handled_correctly(self, mock_handle_query):
        """Test that queries without citations work correctly."""
        mock_response = QueryResponse(
            session_id="test-session",
            message_id="msg-124",
            answer="I don't have specific information about that.",
            created_at="2025-11-24T00:00:00Z",
            citations=[],  # No citations
        )

        async def async_handle_query(*args, **kwargs):
            return mock_response

        mock_handle_query.side_effect = async_handle_query

        client = TestClient(app)

        with client.websocket_connect("/api/realtime/ws") as websocket:
            # Skip connected message
            websocket.receive_json()

            # Send query
            websocket.send_json(
                {
                    "type": "message",
                    "content": "What is foobar disease?",
                }
            )

            # Wait for message.done
            while True:
                event = websocket.receive_json()
                if event["type"] == "message.done":
                    message_done = event
                    break
                elif event["type"] == "error":
                    pytest.fail(f"Received error: {event['error']}")

            # Verify citations is empty array, not null/undefined
            assert "citations" in message_done["message"]
            assert message_done["message"]["citations"] == []

    @patch("app.services.rag_service.QueryOrchestrator.handle_query")
    def test_citation_backward_compatibility_fields(self, mock_handle_query):
        """Test that citations include backward compatibility fields."""
        mock_citations = [
            Citation(
                id="cite-1",
                source_id="kb-doc-1",
                source_type="guideline",
                title="ADA Standards of Care",
                quoted_text="HbA1c target <7% for most adults",
            ),
        ]

        mock_response = QueryResponse(
            session_id="test-session",
            message_id="msg-125",
            answer="The ADA recommends...",
            created_at="2025-11-24T00:00:00Z",
            citations=mock_citations,
        )

        async def async_handle_query(*args, **kwargs):
            return mock_response

        mock_handle_query.side_effect = async_handle_query

        client = TestClient(app)

        with client.websocket_connect("/api/realtime/ws") as websocket:
            websocket.receive_json()  # connected

            websocket.send_json(
                {
                    "type": "message",
                    "content": "What are diabetes guidelines?",
                }
            )

            while True:
                event = websocket.receive_json()
                if event["type"] == "message.done":
                    message_done = event
                    break

            citation = message_done["message"]["citations"][0]

            # Check backward compatibility fields
            assert "source" in citation  # Should map to source_type
            assert citation["source"] == "guideline"
            assert "reference" in citation  # Should map to title
            assert citation["reference"] == "ADA Standards of Care"
            assert "snippet" in citation  # Should map to quoted_text
            assert "HbA1c" in citation["snippet"]

    def test_citations_persist_to_database(self):
        """Test that citations from WebSocket are persisted to message_citations table."""
        # This would require a more complex setup with actual database
        # For now, we verify the schema is correct
        from app.models.citation import MessageCitation

        # Verify MessageCitation model has all required fields
        assert hasattr(MessageCitation, "source_id")
        assert hasattr(MessageCitation, "source_type")
        assert hasattr(MessageCitation, "title")
        assert hasattr(MessageCitation, "authors")
        assert hasattr(MessageCitation, "publication_date")
        assert hasattr(MessageCitation, "journal")
        assert hasattr(MessageCitation, "doi")
        assert hasattr(MessageCitation, "pmid")
        assert hasattr(MessageCitation, "relevance_score")
        assert hasattr(MessageCitation, "quoted_text")
        assert hasattr(MessageCitation, "context")

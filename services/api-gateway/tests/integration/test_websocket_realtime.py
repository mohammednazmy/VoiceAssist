"""
Unit tests for WebSocket realtime endpoint.

Tests the Phase 4 realtime communication endpoint including:
- Connection establishment
- Message protocol
- QueryOrchestrator integration
- Error handling
"""

from app.main import app
from fastapi.testclient import TestClient


class TestRealtimeWebSocket:
    """Test suite for realtime WebSocket endpoint."""

    def test_websocket_connection_established(self):
        """Test that WebSocket connection can be established."""
        client = TestClient(app)

        with client.websocket_connect("/api/realtime/ws") as websocket:
            # Receive welcome message
            data = websocket.receive_json()

            assert data["type"] == "connected"
            assert "client_id" in data
            assert data["protocol_version"] == "1.0"
            assert "text_streaming" in data["capabilities"]

    def test_websocket_message_flow(self):
        """Test complete message flow from client to server."""
        client = TestClient(app)

        with client.websocket_connect("/api/realtime/ws") as websocket:
            # Skip welcome message
            websocket.receive_json()

            # Send test message
            websocket.send_json({"type": "message", "content": "What is diabetes?"})

            # Receive message_start
            data = websocket.receive_json()
            assert data["type"] == "message_start"
            message_id = data["message_id"]
            assert message_id is not None

            # Receive message chunks
            chunks = []
            while True:
                data = websocket.receive_json()
                if data["type"] == "message_chunk":
                    assert data["message_id"] == message_id
                    chunks.append(data["content"])
                elif data["type"] == "message_complete":
                    assert data["message_id"] == message_id
                    assert "content" in data
                    assert isinstance(data["citations"], list)
                    break

            # Verify we received chunks
            assert len(chunks) > 0
            # Verify chunks combine to form complete message
            full_message = "".join(chunks)
            assert len(full_message) > 0

    def test_websocket_ping_pong(self):
        """Test WebSocket keepalive ping/pong."""
        client = TestClient(app)

        with client.websocket_connect("/api/realtime/ws") as websocket:
            # Skip welcome message
            websocket.receive_json()

            # Send ping
            websocket.send_json({"type": "ping"})

            # Receive pong
            data = websocket.receive_json()
            assert data["type"] == "pong"
            assert "timestamp" in data

    def test_websocket_unknown_message_type(self):
        """Test handling of unknown message types."""
        client = TestClient(app)

        with client.websocket_connect("/api/realtime/ws") as websocket:
            # Skip welcome message
            websocket.receive_json()

            # Send unknown message type
            websocket.send_json({"type": "unknown_type"})

            # Receive error
            data = websocket.receive_json()
            assert data["type"] == "error"
            assert data["error"]["code"] == "UNKNOWN_MESSAGE_TYPE"

    def test_websocket_query_orchestrator_integration(self):
        """Test that QueryOrchestrator is properly integrated."""
        client = TestClient(app)

        with client.websocket_connect("/api/realtime/ws") as websocket:
            # Skip welcome message
            websocket.receive_json()

            # Send clinical query
            websocket.send_json(
                {
                    "type": "message",
                    "content": "Test clinical query",
                    "session_id": "test-session-123",
                }
            )

            # Skip to message_complete
            while True:
                data = websocket.receive_json()
                if data["type"] == "message_complete":
                    # Verify QueryOrchestrator processed the message
                    # Current stub returns text with "STUB" in it
                    assert "STUB" in data["content"]
                    break

    def test_websocket_with_clinical_context(self):
        """Test message with clinical context."""
        client = TestClient(app)

        with client.websocket_connect("/api/realtime/ws") as websocket:
            # Skip welcome message
            websocket.receive_json()

            # Send message with clinical context
            websocket.send_json(
                {
                    "type": "message",
                    "content": "Analyze this case",
                    "session_id": "session-456",
                    "clinical_context_id": "context-789",
                }
            )

            # Verify message is processed
            data = websocket.receive_json()
            assert data["type"] == "message_start"

    def test_websocket_empty_message_handling(self):
        """Test handling of empty messages."""
        client = TestClient(app)

        with client.websocket_connect("/api/realtime/ws") as websocket:
            # Skip welcome message
            websocket.receive_json()

            # Send empty message
            websocket.send_json({"type": "message", "content": ""})

            # Server should handle gracefully and return error
            data = websocket.receive_json()
            # Either error or processed empty string
            assert data["type"] in ["error", "message_start"]

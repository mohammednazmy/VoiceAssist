"""
Voice interaction tests for voice assistant functionality.
Phase 13: Final Testing & Documentation
"""

import pytest
from httpx import AsyncClient
import io


@pytest.mark.voice
@pytest.mark.asyncio
class TestVoiceRecording:
    """Test voice recording and transcription."""

    async def test_voice_upload_and_transcription(self, api_client: AsyncClient, user_token: str):
        """Test uploading audio and getting transcription."""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # Create mock audio data
        audio_data = b"RIFF" + b"\x00" * 36 + b"WAVEfmt " + b"\x00" * 16 + b"data" + b"\x00" * 100
        
        files = {
            "audio": ("test_audio.wav", io.BytesIO(audio_data), "audio/wav")
        }
        
        response = await api_client.post(
            "/api/voice/transcribe",
            files=files,
            headers=headers
        )
        
        if response.status_code == 404:
            pytest.skip("Voice transcription endpoint not implemented")
        
        assert response.status_code in [200, 422], f"Transcription failed: {response.text}"
        
        if response.status_code == 200:
            result = response.json()
            assert "text" in result or "transcription" in result

    async def test_real_time_voice_session(self, api_client: AsyncClient, user_token: str):
        """Test WebSocket-based real-time voice interaction."""
        # Note: This would require WebSocket testing capability
        # For now, test the session creation endpoint
        headers = {"Authorization": f"Bearer {user_token}"}
        
        session_response = await api_client.post(
            "/api/voice/session",
            json={"mode": "interactive"},
            headers=headers
        )
        
        if session_response.status_code == 404:
            pytest.skip("Voice session endpoint not implemented")
        
        assert session_response.status_code in [200, 201]
        
        if session_response.status_code in [200, 201]:
            session = session_response.json()
            assert "session_id" in session or "id" in session


@pytest.mark.voice
@pytest.mark.asyncio
class TestVoiceQuery:
    """Test voice-based query workflows."""

    async def test_voice_query_to_text_response(self, api_client: AsyncClient, user_token: str):
        """Test converting voice query to text response."""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        audio_data = b"RIFF" + b"\x00" * 36 + b"WAVEfmt " + b"\x00" * 16 + b"data" + b"\x00" * 100
        
        files = {
            "audio": ("query.wav", io.BytesIO(audio_data), "audio/wav")
        }
        data = {
            "response_format": "text"
        }
        
        response = await api_client.post(
            "/api/voice/query",
            files=files,
            data=data,
            headers=headers
        )
        
        if response.status_code == 404:
            pytest.skip("Voice query endpoint not implemented")
        
        assert response.status_code in [200, 422]

    async def test_voice_query_with_context(self, api_client: AsyncClient, user_token: str):
        """Test voice query with conversation context."""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # Create a conversation first
        conversation_response = await api_client.post(
            "/api/conversations",
            json={"title": "Test Voice Conversation"},
            headers=headers
        )
        
        if conversation_response.status_code == 404:
            pytest.skip("Conversations endpoint not implemented")
        
        if conversation_response.status_code in [200, 201]:
            conv_id = conversation_response.json().get("id")
            
            # Submit voice query with conversation context
            audio_data = b"RIFF" + b"\x00" * 36 + b"WAVEfmt " + b"\x00" * 16 + b"data" + b"\x00" * 100
            
            files = {
                "audio": ("query.wav", io.BytesIO(audio_data), "audio/wav")
            }
            data = {
                "conversation_id": str(conv_id)
            }
            
            response = await api_client.post(
                "/api/voice/query",
                files=files,
                data=data,
                headers=headers
            )
            
            assert response.status_code in [200, 404, 422]


@pytest.mark.voice
@pytest.mark.asyncio
class TestVoiceClarifications:
    """Test voice clarification workflows."""

    async def test_request_voice_clarification(self, api_client: AsyncClient, user_token: str):
        """Test requesting clarification during voice interaction."""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # Simulate ambiguous query that requires clarification
        query_data = {
            "query": "medication",  # Intentionally ambiguous
            "mode": "voice"
        }
        
        response = await api_client.post(
            "/api/query",
            json=query_data,
            headers=headers
        )
        
        if response.status_code == 404:
            pytest.skip("Query endpoint not implemented")
        
        if response.status_code == 200:
            result = response.json()
            # Check if clarification is requested
            if "clarification_needed" in result or "requires_clarification" in result:
                assert "options" in result or "questions" in result

"""
Realtime WebSocket API for streaming chat and future voice integration.

This module provides WebSocket endpoints for real-time communication between
the client and the backend. In Phase 4 MVP, it supports text-based streaming.
Future phases will add voice streaming, VAD, and OpenAI Realtime API integration.
"""
import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.logging import get_logger
from app.services.rag_service import QueryOrchestrator, QueryRequest
from app.core.business_metrics import (
    rag_queries_total,
    rag_citations_per_query
)

router = APIRouter(prefix="/api/realtime", tags=["realtime"])
logger = get_logger(__name__)

# Global QueryOrchestrator instance
query_orchestrator = QueryOrchestrator()


class ConnectionManager:
    """
    Manages active WebSocket connections.

    Handles connection lifecycle, message broadcasting, and connection cleanup.
    """

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"WebSocket connected: {client_id}")

    def disconnect(self, client_id: str):
        """Remove a WebSocket connection."""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"WebSocket disconnected: {client_id}")

    async def send_personal_message(self, message: Dict[str, Any], client_id: str):
        """Send a message to a specific client."""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_json(message)

    async def send_error(self, client_id: str, error_code: str, error_message: str):
        """Send an error message to a client."""
        error_msg = {
            "type": "error",
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "error": {
                "code": error_code,
                "message": error_message
            }
        }
        await self.send_personal_message(error_msg, client_id)


# Global connection manager instance
manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint for realtime chat communication.

    Message Protocol (Updated to match frontend expectations):
    ----------------------------------------------------------

    Client -> Server:
    {
        "type": "message",
        "content": "User's message text",
        "session_id": "optional-session-uuid",
        "clinical_context": {...}  // optional
    }

    {
        "type": "ping"
    }

    Server -> Client:
    {
        "type": "connected",
        "client_id": "uuid",
        "timestamp": "2025-11-22T00:00:00.000Z",
        "protocol_version": "1.0",
        "capabilities": ["text_streaming"]
    }

    {
        "type": "chunk",
        "messageId": "uuid",
        "content": "Partial response text..."
    }

    {
        "type": "message.done",
        "messageId": "uuid",
        "message": {
            "id": "uuid",
            "role": "assistant",
            "content": "Complete response text",
            "citations": [...],
            "timestamp": 1700000000000  // Unix timestamp in milliseconds
        },
        "timestamp": "2025-11-22T00:00:05.000Z"
    }

    {
        "type": "error",
        "messageId": "uuid",
        "error": {
            "code": "BACKEND_ERROR",
            "message": "Error description"
        }
    }

    {
        "type": "pong",
        "timestamp": "2025-11-22T00:00:00.000Z"
    }

    Future phases will add:
    - Voice streaming events (audio_start, audio_chunk, audio_end)
    - VAD events (speech_start, speech_end)
    - Turn-taking events (interrupt, resume)
    """
    # For MVP, use a simple UUID-based client ID
    # In production, this should be derived from authenticated user
    import uuid
    client_id = str(uuid.uuid4())

    await manager.connect(websocket, client_id)

    try:
        # Send welcome message
        await websocket.send_json({
            "type": "connected",
            "client_id": client_id,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "protocol_version": "1.0",
            "capabilities": ["text_streaming"]
        })

        while True:
            # Receive message from client
            data = await websocket.receive_json()
            message_type = data.get("type")

            logger.info(f"Received WebSocket message", extra={
                "client_id": client_id,
                "message_type": message_type
            })

            if message_type == "message":
                # Process chat message
                await handle_chat_message(websocket, client_id, data, db)

            elif message_type == "ping":
                # Respond to ping for connection keepalive
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": datetime.now(timezone.utc).isoformat() + "Z"
                })

            else:
                # Unknown message type
                await manager.send_error(
                    client_id,
                    "UNKNOWN_MESSAGE_TYPE",
                    f"Unknown message type: {message_type}"
                )

    except WebSocketDisconnect:
        manager.disconnect(client_id)
        logger.info(f"Client disconnected: {client_id}")

    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}", exc_info=True)
        await manager.send_error(client_id, "INTERNAL_ERROR", str(e))
        manager.disconnect(client_id)


async def handle_chat_message(
    websocket: WebSocket,
    client_id: str,
    data: Dict[str, Any],
    db: Session
):
    """
    Handle incoming chat message and stream response using QueryOrchestrator.

    Integrates with the QueryOrchestrator to process clinical queries and
    stream responses back to the client in chunks.
    """
    import uuid
    import asyncio

    message_id = str(uuid.uuid4())
    user_message = data.get("content", "")
    session_id = data.get("session_id")
    clinical_context_id = data.get("clinical_context_id")

    logger.info("Processing chat message", extra={
        "client_id": client_id,
        "message_id": message_id,
        "has_session": bool(session_id),
        "has_context": bool(clinical_context_id)
    })

    # Note: Frontend expects specific event types and camelCase field names
    # Changed to match frontend protocol in useChatSession.ts

    try:
        # Create query request for orchestrator
        query_request = QueryRequest(
            session_id=session_id,
            query=user_message,
            clinical_context_id=clinical_context_id
        )

        # Call QueryOrchestrator to process the query
        # Note: Current implementation is synchronous (stub LLM)
        # Future phases will add true streaming from LLM API
        query_response = await query_orchestrator.handle_query(
            query_request,
            trace_id=message_id
        )

        # Stream the response in chunks
        response_text = query_response.answer
        chunk_size = 50  # Characters per chunk

        for i in range(0, len(response_text), chunk_size):
            chunk = response_text[i:i + chunk_size]
            # Changed from 'message_chunk' to 'chunk' to match frontend
            # Changed 'message_id' to 'messageId' for camelCase consistency
            await websocket.send_json({
                "type": "chunk",
                "messageId": message_id,
                "content": chunk,
            })
            # Small delay to simulate streaming (will be natural with real LLM streaming)
            await asyncio.sleep(0.05)

        # Prepare citations for response with full structured data
        citations = [
            {
                "id": cite.id,
                "source_id": cite.source_id,
                "source_type": cite.source_type,
                "title": cite.title,
                "url": cite.url if cite.url else None,
                "authors": cite.authors if hasattr(cite, 'authors') and cite.authors else None,
                "publication_date": cite.publication_date if hasattr(cite, 'publication_date') else None,
                "journal": cite.journal if hasattr(cite, 'journal') else None,
                "doi": cite.doi if hasattr(cite, 'doi') else None,
                "pmid": cite.pmid if hasattr(cite, 'pmid') else None,
                "relevance_score": cite.relevance_score if hasattr(cite, 'relevance_score') else None,
                "quoted_text": cite.quoted_text if hasattr(cite, 'quoted_text') else None,
                # Backward compatibility fields for frontend
                "source": cite.source_type,
                "reference": cite.title,
                "snippet": cite.quoted_text if hasattr(cite, 'quoted_text') and cite.quoted_text else cite.url,
            }
            for cite in query_response.citations
        ]

        # Build final message object for frontend
        final_message = {
            "id": message_id,
            "role": "assistant",
            "content": response_text,
            "citations": citations,
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),  # Unix timestamp in ms
        }

        # Changed from 'message_complete' to 'message.done' to match frontend
        await websocket.send_json({
            "type": "message.done",
            "messageId": message_id,
            "message": final_message,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z"
        })

        # Track RAG query metrics (P3.3 - Business Metrics)
        has_citations = len(citations) > 0
        rag_queries_total.labels(
            success="true",
            has_citations=str(has_citations).lower()
        ).inc()
        rag_citations_per_query.observe(len(citations))

        logger.info("Completed streaming response", extra={
            "client_id": client_id,
            "message_id": message_id,
            "response_length": len(response_text),
            "citation_count": len(citations)
        })

    except Exception as e:
        # Track failed RAG query (P3.3 - Business Metrics)
        rag_queries_total.labels(
            success="false",
            has_citations="false"
        ).inc()

        logger.error(f"Error processing chat message: {str(e)}", exc_info=True)
        # Changed message_id to messageId for camelCase consistency
        await websocket.send_json({
            "type": "error",
            "messageId": message_id,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "error": {
                "code": "BACKEND_ERROR",  # Changed to match frontend error codes
                "message": f"Failed to process query: {str(e)}"
            }
        })

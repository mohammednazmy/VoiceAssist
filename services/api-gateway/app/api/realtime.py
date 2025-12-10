"""
Realtime WebSocket API for streaming chat and future voice integration.

This module provides WebSocket endpoints for real-time communication between
the client and the backend. In Phase 4 MVP, it supports text-based streaming.

Voice/TTS integration plan (to be implemented):
- Add authenticated WS path for audio: accept PCM/Opus chunks, forward to ASR (OpenAI Realtime/local ASR)
- Emit interim transcripts as `transcript.partial` and final as `transcript.final`
- Support TTS responses via REST/WS: synthesize assistant replies and stream audio chunks
- Heartbeats + backpressure: ping/pong and max in-flight frames to avoid buffer bloat
- Metrics: connection counts, audio duration, ASR/TTS latency, error rates
Future phases will add voice streaming, VAD, and OpenAI Realtime API integration.
"""

from datetime import datetime, timezone
from typing import Any, Dict

from app.core.business_metrics import rag_citations_per_query, rag_queries_total
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.core.security import verify_token
from app.models.message import Message
from app.models.session import Session as ChatSession
from app.models.user import User
from app.schemas.websocket import (
    create_chunk_event,
    create_connected_event,
    create_error_event,
    create_message_done_event,
    create_pong_event,
)
from app.services.rag_service import QueryOrchestrator, QueryRequest
from app.services.webrtc_signaling import signaling_service
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketState

router = APIRouter(prefix="/api/realtime", tags=["realtime"])
logger = get_logger(__name__)


def is_websocket_connected(websocket: WebSocket) -> bool:
    """Check if WebSocket is still in a connected state and can receive messages."""
    try:
        return (
            websocket.client_state == WebSocketState.CONNECTED
            and websocket.application_state == WebSocketState.CONNECTED
        )
    except Exception:
        return False


async def safe_send_json(websocket: WebSocket, data: Dict[str, Any]) -> bool:
    """Safely send JSON to WebSocket, returning False if the socket is closed.

    Args:
        websocket: The WebSocket connection
        data: The data to send as JSON

    Returns:
        True if send succeeded, False if socket was closed or error occurred
    """
    if not is_websocket_connected(websocket):
        logger.warning("Attempted to send on closed WebSocket, skipping")
        return False

    try:
        await websocket.send_json(data)
        return True
    except RuntimeError as e:
        if "close message has been sent" in str(e).lower():
            logger.warning("WebSocket already closed, cannot send message")
        else:
            logger.error(f"RuntimeError sending WebSocket message: {e}")
        return False
    except WebSocketDisconnect:
        logger.warning("WebSocket disconnected during send")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending WebSocket message: {e}")
        return False


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

    async def send_personal_message(self, message: Dict[str, Any], client_id: str) -> bool:
        """Send a message to a specific client.

        Returns:
            True if send succeeded, False if client not found or socket closed
        """
        if client_id not in self.active_connections:
            logger.warning(f"Client {client_id} not found in active connections")
            return False

        websocket = self.active_connections[client_id]
        return await safe_send_json(websocket, message)

    async def send_error(self, client_id: str, error_code: str, error_message: str) -> bool:
        """Send an error message to a client.

        Returns:
            True if send succeeded, False if client not found or socket closed
        """
        error_msg = {
            "type": "error",
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "error": {"code": error_code, "message": error_message},
        }
        return await self.send_personal_message(error_msg, client_id)


# Global connection manager instance
manager = ConnectionManager()


class WebRTCOffer(BaseModel):
    session_id: str
    sdp: str


class WebRTCAnswer(BaseModel):
    session_id: str
    sdp: str


class ICECandidatePayload(BaseModel):
    session_id: str
    candidate: dict


class WebRTCSessionResponse(BaseModel):
    session_id: str
    offer: str | None = None
    answer: str | None = None
    ice_candidates: list[dict]
    processing: dict


@router.post("/webrtc/offer", response_model=WebRTCSessionResponse)
async def post_webrtc_offer(payload: WebRTCOffer, current_user: User = Depends(get_current_user)):
    session = signaling_service.register_offer(
        session_id=payload.session_id, user_id=str(current_user.id), sdp=payload.sdp
    )
    return WebRTCSessionResponse(
        session_id=session.session_id,
        offer=session.offer_sdp,
        answer=session.answer_sdp,
        ice_candidates=session.ice_candidates,
        processing={
            "vad_threshold": session.vad_threshold,
            "noise_suppression": session.noise_suppression,
        },
    )


@router.post("/webrtc/answer", response_model=WebRTCSessionResponse)
async def post_webrtc_answer(payload: WebRTCAnswer, current_user: User = Depends(get_current_user)):
    session = signaling_service.register_answer(
        session_id=payload.session_id, user_id=str(current_user.id), sdp=payload.sdp
    )
    if not session:
        raise HTTPException(status_code=400, detail="Unknown WebRTC session")

    return WebRTCSessionResponse(
        session_id=session.session_id,
        offer=session.offer_sdp,
        answer=session.answer_sdp,
        ice_candidates=session.ice_candidates,
        processing={
            "vad_threshold": session.vad_threshold,
            "noise_suppression": session.noise_suppression,
        },
    )


@router.post("/webrtc/candidate", response_model=WebRTCSessionResponse)
async def post_webrtc_candidate(payload: ICECandidatePayload, current_user: User = Depends(get_current_user)):
    session = signaling_service.add_ice_candidate(
        session_id=payload.session_id,
        user_id=str(current_user.id),
        candidate=payload.candidate,
    )
    if not session:
        raise HTTPException(status_code=400, detail="Unknown WebRTC session")

    return WebRTCSessionResponse(
        session_id=session.session_id,
        offer=session.offer_sdp,
        answer=session.answer_sdp,
        ice_candidates=session.ice_candidates,
        processing={
            "vad_threshold": session.vad_threshold,
            "noise_suppression": session.noise_suppression,
        },
    )


@router.get("/webrtc/{session_id}", response_model=WebRTCSessionResponse)
async def get_webrtc_state(session_id: str, current_user: User = Depends(get_current_user)):
    session = signaling_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="WebRTC session not found")

    return WebRTCSessionResponse(
        session_id=session.session_id,
        offer=session.offer_sdp,
        answer=session.answer_sdp,
        ice_candidates=session.ice_candidates,
        processing={
            "vad_threshold": session.vad_threshold,
            "noise_suppression": session.noise_suppression,
        },
    )


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    """
    WebSocket endpoint for realtime chat communication.

    Query Parameters:
    - token: JWT access token for authentication (required)
    - conversationId: Conversation/session ID to connect to (optional)

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
        "type": "history",
        "messages": [...]  // Previous messages if conversationId provided
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
    import uuid as uuid_module

    # Authenticate via query param token
    token = websocket.query_params.get("token")
    conversation_id = websocket.query_params.get("conversationId")

    if not token:
        await websocket.accept()
        error_event = create_error_event(
            error_code="UNAUTHORIZED",
            error_message="Missing authentication token",
            timestamp=datetime.now(timezone.utc),
        )
        await websocket.send_json(error_event)
        await websocket.close(code=1008)  # Policy Violation
        return

    # Verify JWT token
    payload = verify_token(token)
    if not payload or payload.get("type") != "access":
        await websocket.accept()
        error_event = create_error_event(
            error_code="UNAUTHORIZED",
            error_message="Invalid or expired token",
            timestamp=datetime.now(timezone.utc),
        )
        await websocket.send_json(error_event)
        await websocket.close(code=1008)
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.accept()
        error_event = create_error_event(
            error_code="UNAUTHORIZED",
            error_message="Invalid token payload",
            timestamp=datetime.now(timezone.utc),
        )
        await websocket.send_json(error_event)
        await websocket.close(code=1008)
        return

    # Verify user exists and is active
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        await websocket.accept()
        error_event = create_error_event(
            error_code="UNAUTHORIZED",
            error_message="User not found",
            timestamp=datetime.now(timezone.utc),
        )
        await websocket.send_json(error_event)
        await websocket.close(code=1008)
        return

    # Check if user is active
    if not user.is_active:
        await websocket.accept()
        error_event = create_error_event(
            error_code="FORBIDDEN",
            error_message="User account is deactivated",
            timestamp=datetime.now(timezone.utc),
        )
        await websocket.send_json(error_event)
        await websocket.close(code=1008)
        return

    # Use user ID as client ID for authenticated sessions
    client_id = str(user_id)

    # Verify conversation ownership if conversationId provided
    session_obj: ChatSession | None = None
    if conversation_id:
        try:
            session_uuid = uuid_module.UUID(conversation_id)
            session_obj = db.query(ChatSession).filter(ChatSession.id == session_uuid).first()
            if session_obj and str(session_obj.user_id) != str(user_id):
                await websocket.accept()
                error_event = create_error_event(
                    error_code="FORBIDDEN",
                    error_message="Access denied to conversation",
                    timestamp=datetime.now(timezone.utc),
                )
                await websocket.send_json(error_event)
                await websocket.close(code=1008)
                return
        except ValueError:
            # Invalid UUID format, ignore and proceed without session
            logger.warning(f"Invalid conversation ID format: {conversation_id}")

    await manager.connect(websocket, client_id)

    try:
        # Send welcome message using schema
        connected_event = create_connected_event(client_id=client_id, timestamp=datetime.now(timezone.utc))
        await websocket.send_json(connected_event)

        # Send message history if conversation exists
        if session_obj:
            messages = (
                db.query(Message)
                .filter(Message.session_id == session_obj.id)
                .order_by(Message.created_at.asc())
                .limit(100)  # Limit history to last 100 messages
                .all()
            )
            if messages:
                history_messages = []
                for msg in messages:
                    msg_dict = {
                        "id": str(msg.id),
                        "role": msg.role,
                        "content": msg.content,
                        "timestamp": (int(msg.created_at.timestamp() * 1000) if msg.created_at else 0),
                    }
                    # Include citations from metadata if present
                    if msg.message_metadata and "citations" in msg.message_metadata:
                        msg_dict["citations"] = msg.message_metadata["citations"]
                    history_messages.append(msg_dict)

                history_event = {
                    "type": "history",
                    "messages": history_messages,
                    "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                }
                await websocket.send_json(history_event)

        logger.info(
            "WebSocket authenticated and connected",
            extra={
                "client_id": client_id,
                "user_id": user_id,
                "conversation_id": conversation_id,
                "history_loaded": session_obj is not None,
            },
        )

        while True:
            # Receive message from client
            data = await websocket.receive_json()
            message_type = data.get("type")

            logger.info(
                "Received WebSocket message",
                extra={
                    "client_id": client_id,
                    "message_type": message_type,
                    "user_id": user_id,
                },
            )

            if message_type == "message":
                # Override session_id with the authenticated conversation if not provided
                if session_obj and not data.get("session_id"):
                    data["session_id"] = str(session_obj.id)
                # Pass user_id for ownership validation
                data["_user_id"] = user_id
                # Process chat message
                await handle_chat_message(websocket, client_id, data, db)

            elif message_type == "ping":
                # Respond to ping for connection keepalive using schema
                pong_event = create_pong_event(timestamp=datetime.now(timezone.utc))
                await websocket.send_json(pong_event)

            else:
                # Unknown message type
                await manager.send_error(
                    client_id,
                    "UNKNOWN_MESSAGE_TYPE",
                    f"Unknown message type: {message_type}",
                )

    except WebSocketDisconnect:
        manager.disconnect(client_id)
        logger.info(f"Client disconnected: {client_id}", extra={"user_id": user_id})

    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}", exc_info=True, extra={"user_id": user_id})
        # Try to send error, but don't fail if socket is already closed
        await manager.send_error(client_id, "INTERNAL_ERROR", str(e))
        manager.disconnect(client_id)


async def handle_chat_message(websocket: WebSocket, client_id: str, data: Dict[str, Any], db: Session):
    """
    Handle incoming chat message and stream response using QueryOrchestrator.

    Integrates with the QueryOrchestrator to process clinical queries and
    stream responses back to the client in chunks.
    """
    import uuid

    message_id = str(uuid.uuid4())
    user_message = data.get("content", "")
    session_id = data.get("session_id")
    clinical_context_id = data.get("clinical_context_id")
    attachments = data.get("attachments") or []
    # Client-provided message ID for idempotency and attachment sync
    client_message_id = data.get("client_message_id")
    # User ID passed from authenticated WebSocket handler
    user_id = data.get("_user_id")

    logger.info(
        "Processing chat message",
        extra={
            "client_id": client_id,
            "message_id": message_id,
            "has_session": bool(session_id),
            "has_context": bool(clinical_context_id),
            "user_id": user_id,
        },
    )

    # Note: Frontend expects specific event types and camelCase field names
    # Changed to match frontend protocol in useChatSession.ts

    try:
        # Validate session if provided
        session_obj: ChatSession | None = None
        if session_id:
            try:
                session_uuid = uuid.UUID(session_id)
                session_obj = db.query(ChatSession).filter(ChatSession.id == session_uuid).first()
                if not session_obj:
                    await manager.send_error(
                        client_id,
                        "INVALID_SESSION",
                        f"Session {session_id} not found",
                    )
                    return
                # Verify session ownership if user_id is available
                if user_id and str(session_obj.user_id) != str(user_id):
                    await manager.send_error(
                        client_id,
                        "FORBIDDEN",
                        "Access denied to this conversation",
                    )
                    return
            except ValueError:
                await manager.send_error(
                    client_id,
                    "INVALID_SESSION_ID",
                    f"Session id {session_id} is not a valid UUID",
                )
                return

        # Persist user message for history
        user_db_message_id = None
        if session_obj:
            user_message_row = Message(
                session_id=session_obj.id,
                role="user",
                content=user_message,
                client_message_id=client_message_id,  # Store client ID for attachment sync
                message_metadata={
                    "source": "realtime_ws",
                    "clinical_context_id": clinical_context_id,
                    "attachments": attachments,
                },
            )
            db.add(user_message_row)
            session_obj.message_count = (session_obj.message_count or 0) + 1
            db.commit()
            db.refresh(user_message_row)
            user_db_message_id = str(user_message_row.id)
            logger.info(
                "Persisted realtime user message",
                extra={
                    "session_id": session_id,
                    "message_id": user_db_message_id,
                    "client_message_id": client_message_id,
                },
            )

            # Send user_message.created event so frontend can sync message ID for attachments
            user_created_event = {
                "type": "user_message.created",
                "messageId": user_db_message_id,
                "clientMessageId": client_message_id,
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            }
            await safe_send_json(websocket, user_created_event)

        # Create query request for orchestrator
        query_request = QueryRequest(
            session_id=session_id,
            query=user_message,
            clinical_context_id=clinical_context_id,
        )

        async def stream_chunk(chunk: str):
            chunk_event = create_chunk_event(message_id=message_id, content=chunk)
            await safe_send_json(websocket, chunk_event)

        # Stream LLM response with real-time chunks
        query_response = await query_orchestrator.stream_query(
            query_request, trace_id=message_id, on_chunk=stream_chunk
        )

        # Prepare citations for response with full structured data
        # Use both snake_case (for schema) and camelCase (for frontend) field names
        citations = []
        for cite in query_response.citations:
            citation_dict = {
                "id": cite.id,
                "sourceId": cite.source_id,
                "source_id": cite.source_id,  # Also include snake_case
                "sourceType": cite.source_type,
                "source_type": cite.source_type,  # Also include snake_case
                "title": cite.title,
                "url": cite.url if cite.url else None,
                "authors": cite.authors if hasattr(cite, "authors") else None,
                "publicationYear": (cite.publication_date if hasattr(cite, "publication_date") else None),
                "publication_date": (cite.publication_date if hasattr(cite, "publication_date") else None),
                "journal": cite.journal if hasattr(cite, "journal") else None,
                "doi": cite.doi if hasattr(cite, "doi") else None,
                "pubmedId": cite.pmid if hasattr(cite, "pmid") else None,
                "pmid": cite.pmid if hasattr(cite, "pmid") else None,
                "relevanceScore": (cite.relevance_score if hasattr(cite, "relevance_score") else None),
                "relevance_score": (cite.relevance_score if hasattr(cite, "relevance_score") else None),
                "snippet": cite.quoted_text if hasattr(cite, "quoted_text") else None,
                "quoted_text": (cite.quoted_text if hasattr(cite, "quoted_text") else None),
                # Backward compatibility fields for older frontend code
                "source": cite.source_type,
                "reference": cite.title,
            }
            citations.append(citation_dict)

        # Use schema to create message.done event
        now = datetime.now(timezone.utc)
        message_done_event = create_message_done_event(
            message_id=message_id,
            role="assistant",
            content=query_response.answer,
            citations=citations,
            timestamp=now,
        )

        # Use safe send for the final message.done event
        await safe_send_json(websocket, message_done_event)

        # Persist assistant message for history
        if session_obj:
            assistant_metadata = {
                "source": "realtime_ws",
                "citations": citations,
                "clinical_context_id": clinical_context_id,
                "user_message_id": user_db_message_id,
                "finish_reason": query_response.finish_reason,
            }
            assistant_message_row = Message(
                session_id=session_obj.id,
                role="assistant",
                content=query_response.answer,
                tokens=query_response.tokens,
                model=query_response.model,
                message_metadata=assistant_metadata,
            )
            db.add(assistant_message_row)
            session_obj.message_count = (session_obj.message_count or 0) + 1
            db.commit()
            logger.info(
                "Persisted realtime assistant message",
                extra={
                    "session_id": session_id,
                    "message_id": str(assistant_message_row.id),
                },
            )

        # Track RAG query metrics (P3.3 - Business Metrics)
        has_citations = len(citations) > 0
        rag_queries_total.labels(success="true", has_citations=str(has_citations).lower()).inc()
        rag_citations_per_query.observe(len(citations))

        logger.info(
            "Completed streaming response",
            extra={
                "client_id": client_id,
                "message_id": message_id,
                "response_length": len(query_response.answer),
                "citation_count": len(citations),
            },
        )

    except Exception as e:
        # Track failed RAG query (P3.3 - Business Metrics)
        rag_queries_total.labels(success="false", has_citations="false").inc()

        logger.error(f"Error processing chat message: {str(e)}", exc_info=True)

        # Use schema to create error event
        error_event = create_error_event(
            error_code="BACKEND_ERROR",
            error_message=f"Failed to process query: {str(e)}",
            message_id=message_id,
            timestamp=datetime.now(timezone.utc),
        )
        # Use safe send to avoid RuntimeError if socket is already closed
        await safe_send_json(websocket, error_event)

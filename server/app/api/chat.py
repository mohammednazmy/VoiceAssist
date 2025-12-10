"""Chat API endpoints.

These endpoints are the HTTP/REST counterparts to the real-time
WebSocket interface documented in WEB_APP_SPECS.md and
ORCHESTRATION_DESIGN.md.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.core.api_envelope import APIEnvelope, success_response
from app.core.config import get_settings
from app.services.rag_service import QueryOrchestrator, QueryRequest, QueryResponse

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessageRequest(BaseModel):
    """Simplified chat request payload.

    The canonical entity definitions live in docs/DATA_MODEL.md; this
    schema is intentionally minimal for the HTTP API layer.
    """

    session_id: Optional[str] = Field(
        default=None, description="Existing session id, or null to start a new session"
    )
    content: str = Field(..., description="User message text")
    clinical_context_id: Optional[str] = Field(
        default=None,
        description="Optional id of a ClinicalContext entity representing the case being discussed",
    )


class ChatMessageResponse(BaseModel):
    """Simplified chat response payload for HTTP clients."""

    session_id: str
    message_id: str
    content: str
    created_at: datetime
    citations: List[dict] = []
    model: Optional[str] = None
    model_provider: Optional[str] = None
    retrieval_confidence: Optional[float] = None
    model_confidence: Optional[float] = None
    reasoning_path: List[dict] = []


@router.post("/message", response_model=APIEnvelope)
async def post_chat_message(
    payload: ChatMessageRequest,
    request: Request,
    settings=Depends(get_settings),
) -> APIEnvelope:
    """Accept a chat message and delegate to the QueryOrchestrator.

    In early phases this will return a stubbed response from the
    orchestrator; later phases will implement the full RAG pipeline.
    """
    trace_id = getattr(request.state, "trace_id", None)
    orchestrator = QueryOrchestrator()

    q_req = QueryRequest(
        session_id=payload.session_id,
        query=payload.content,
        clinical_context_id=payload.clinical_context_id,
    )
    q_res: QueryResponse = await orchestrator.handle_query(q_req, trace_id=trace_id)

    resp = ChatMessageResponse(
        session_id=q_res.session_id,
        message_id=q_res.message_id,
        content=q_res.answer,
        created_at=q_res.created_at,
        citations=[c.model_dump() for c in q_res.citations],
        model=q_res.model,
        model_provider=q_res.model_provider,
        retrieval_confidence=q_res.retrieval_confidence,
        model_confidence=q_res.model_confidence,
        reasoning_path=q_res.reasoning_path,
    )
    return success_response(resp, trace_id=trace_id)

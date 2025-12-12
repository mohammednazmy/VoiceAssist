"""
Validation API for answer verification and citation management.

Provides endpoints for:
- Validating responses against sources
- Retrieving validation history
- Getting validation statistics
"""

from typing import Any, Dict, List, Optional

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db
from app.core.dependencies import get_current_admin_or_viewer, get_current_user
from app.core.logging import get_logger
from app.models.response_validation import ResponseValidation, ResponseValidationCitation
from app.models.user import User
from app.services.answer_validator_service import get_answer_validator_service
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/validations", tags=["validations"])
logger = get_logger(__name__)


# Request/Response Models


class SourceChunk(BaseModel):
    """Source chunk for validation."""

    text: str
    document_id: Optional[str] = None
    document_title: Optional[str] = None
    page_number: Optional[int] = None
    chunk_id: Optional[str] = None
    score: Optional[float] = None


class ValidateRequest(BaseModel):
    """Request to validate a response."""

    response_text: str = Field(..., description="The AI response to validate")
    query: str = Field(..., description="Original user query")
    source_chunks: List[SourceChunk] = Field(default_factory=list, description="Source documents used")
    message_id: Optional[str] = Field(None, description="Associated message ID")
    session_id: Optional[str] = Field(None, description="Associated session ID")


class ValidationSummary(BaseModel):
    """Summary of validation result."""

    id: str
    overall_confidence: float
    claims_total: int
    claims_validated: int
    claims_partial: int
    claims_unsupported: int
    support_ratio: float
    validation_time_ms: int
    created_at: str


class CitationInfo(BaseModel):
    """Citation information."""

    claim_text: str
    claim_index: int
    status: str
    confidence: Optional[float]
    document_title: Optional[str]
    page_number: Optional[int]
    relevant_excerpt: Optional[str]
    explanation: Optional[str]


class ValidationDetail(BaseModel):
    """Detailed validation result."""

    id: str
    query_text: str
    response_text: str
    annotated_response: Optional[str]
    overall_confidence: float
    claims_total: int
    claims_validated: int
    claims_unsupported: int
    citations: List[CitationInfo]
    validation_time_ms: int
    created_at: str


# Endpoints


@router.post("/validate")
async def validate_response(
    request: ValidateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Validate an AI response against source documents.

    Extracts claims from the response and verifies each claim
    against the provided source chunks. Returns confidence scores
    and inline citations.
    """
    try:
        validator = get_answer_validator_service()

        # Convert source chunks to dicts
        source_chunks = [
            {
                "text": chunk.text,
                "document_id": chunk.document_id,
                "document_title": chunk.document_title,
                "page_number": chunk.page_number,
                "chunk_id": chunk.chunk_id,
                "score": chunk.score,
            }
            for chunk in request.source_chunks
        ]

        result = await validator.validate_response(
            response_text=request.response_text,
            source_chunks=source_chunks,
            query=request.query,
            db=db,
            message_id=request.message_id,
            session_id=request.session_id,
            user_id=str(current_user.id),
        )

        # Build response
        citations = []
        for claim, match in result.citations:
            citations.append(
                {
                    "claim_text": claim.text,
                    "claim_index": claim.index,
                    "claim_type": claim.claim_type,
                    "status": match.status,
                    "confidence": match.confidence,
                    "document_id": match.document_id if match.document_id else None,
                    "document_title": match.document_title,
                    "page_number": match.page_number,
                    "relevant_excerpt": match.relevant_excerpt,
                    "explanation": match.explanation,
                    "exact_match": match.exact_match,
                }
            )

        return success_response(
            data={
                "overall_confidence": result.overall_confidence,
                "annotated_response": result.annotated_response,
                "claims_total": len(result.claims),
                "claims_validated": result.details.get("supported", 0),
                "claims_partial": result.details.get("partial", 0),
                "claims_unsupported": len(result.unsupported_claims),
                "citations": citations,
                "validation_time_ms": result.validation_time_ms,
                "has_hallucinations": len(result.unsupported_claims) > 0,
            }
        )

    except Exception as e:
        logger.error(f"Validation failed: {e}", exc_info=True)
        return error_response(
            message="Failed to validate response",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/history")
async def get_validation_history(
    session_id: Optional[str] = Query(None, description="Filter by session"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get validation history for the current user.

    Optionally filter by session ID.
    """
    try:
        validator = get_answer_validator_service()

        validations = await validator.get_validation_history(
            db=db,
            session_id=session_id,
            user_id=str(current_user.id),
            limit=limit,
        )

        return success_response(
            data={
                "validations": [v.to_summary() for v in validations],
                "count": len(validations),
            }
        )

    except Exception as e:
        logger.error(f"Failed to get validation history: {e}", exc_info=True)
        return error_response(
            message="Failed to get validation history",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/stats")
async def get_validation_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get aggregate validation statistics for the current user.
    """
    try:
        validator = get_answer_validator_service()

        stats = await validator.get_validation_stats(
            db=db,
            user_id=str(current_user.id),
        )

        return success_response(data=stats)

    except Exception as e:
        logger.error(f"Failed to get validation stats: {e}", exc_info=True)
        return error_response(
            message="Failed to get validation stats",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/{validation_id}")
async def get_validation(
    validation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get detailed validation result by ID.
    """
    try:
        import uuid as uuid_module

        try:
            val_uuid = uuid_module.UUID(validation_id)
        except ValueError:
            return error_response(
                message="Invalid validation ID",
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        validation = (
            db.query(ResponseValidation)
            .filter(
                ResponseValidation.id == val_uuid,
                ResponseValidation.user_id == current_user.id,
            )
            .first()
        )

        if not validation:
            return error_response(
                message="Validation not found",
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

        # Get citations
        citations = (
            db.query(ResponseValidationCitation)
            .filter(ResponseValidationCitation.validation_id == val_uuid)
            .order_by(ResponseValidationCitation.claim_index)
            .all()
        )

        return success_response(
            data={
                **validation.to_dict(),
                "citations": [c.to_dict() for c in citations],
            }
        )

    except Exception as e:
        logger.error(f"Failed to get validation: {e}", exc_info=True)
        return error_response(
            message="Failed to get validation",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/{validation_id}/citations")
async def get_validation_citations(
    validation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get citations for a validation result.
    """
    try:
        import uuid as uuid_module

        try:
            val_uuid = uuid_module.UUID(validation_id)
        except ValueError:
            return error_response(
                message="Invalid validation ID",
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Verify access
        validation = (
            db.query(ResponseValidation)
            .filter(
                ResponseValidation.id == val_uuid,
                ResponseValidation.user_id == current_user.id,
            )
            .first()
        )

        if not validation:
            return error_response(
                message="Validation not found",
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

        citations = (
            db.query(ResponseValidationCitation)
            .filter(ResponseValidationCitation.validation_id == val_uuid)
            .order_by(ResponseValidationCitation.claim_index)
            .all()
        )

        return success_response(
            data={
                "validation_id": validation_id,
                "citations": [c.to_dict() for c in citations],
                "count": len(citations),
            }
        )

    except Exception as e:
        logger.error(f"Failed to get citations: {e}", exc_info=True)
        return error_response(
            message="Failed to get citations",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# Admin Endpoints


@router.get("/admin/stats")
async def get_admin_validation_stats(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Get system-wide validation statistics.

    Admin only.
    """
    try:
        from sqlalchemy import func

        # Overall stats
        overall = db.query(
            func.count(ResponseValidation.id).label("total_validations"),
            func.avg(ResponseValidation.overall_confidence).label("avg_confidence"),
            func.sum(ResponseValidation.claims_total).label("total_claims"),
            func.sum(ResponseValidation.claims_validated).label("total_validated"),
            func.sum(ResponseValidation.claims_unsupported).label("total_unsupported"),
            func.avg(ResponseValidation.validation_time_ms).label("avg_time_ms"),
        ).first()

        # Confidence distribution
        confidence_dist = (
            db.query(
                func.floor(ResponseValidation.overall_confidence * 10).label("bucket"),
                func.count(ResponseValidation.id).label("count"),
            )
            .group_by("bucket")
            .order_by("bucket")
            .all()
        )

        # Status distribution
        status_dist = (
            db.query(
                ResponseValidationCitation.status,
                func.count(ResponseValidationCitation.id).label("count"),
            )
            .group_by(ResponseValidationCitation.status)
            .all()
        )

        return success_response(
            data={
                "overall": {
                    "total_validations": overall.total_validations or 0,
                    "avg_confidence": float(overall.avg_confidence or 0),
                    "total_claims": overall.total_claims or 0,
                    "total_validated": overall.total_validated or 0,
                    "total_unsupported": overall.total_unsupported or 0,
                    "avg_time_ms": float(overall.avg_time_ms or 0),
                },
                "confidence_distribution": [
                    {"bucket": f"{int(b.bucket * 10)}-{int((b.bucket + 1) * 10)}%", "count": b.count}
                    for b in confidence_dist
                ],
                "status_distribution": {s.status: s.count for s in status_dist},
            }
        )

    except Exception as e:
        logger.error(f"Failed to get admin stats: {e}", exc_info=True)
        return error_response(
            message="Failed to get validation stats",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/admin/recent")
async def get_recent_validations(
    limit: int = Query(50, ge=1, le=200),
    min_confidence: Optional[float] = Query(None, ge=0, le=1),
    max_confidence: Optional[float] = Query(None, ge=0, le=1),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Get recent validations with optional filtering.

    Admin only.
    """
    try:
        query = db.query(ResponseValidation)

        if min_confidence is not None:
            query = query.filter(ResponseValidation.overall_confidence >= min_confidence)
        if max_confidence is not None:
            query = query.filter(ResponseValidation.overall_confidence <= max_confidence)

        validations = (
            query.order_by(ResponseValidation.created_at.desc())
            .limit(limit)
            .all()
        )

        return success_response(
            data={
                "validations": [v.to_dict() for v in validations],
                "count": len(validations),
            }
        )

    except Exception as e:
        logger.error(f"Failed to get recent validations: {e}", exc_info=True)
        return error_response(
            message="Failed to get recent validations",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/admin/low-confidence")
async def get_low_confidence_responses(
    threshold: float = Query(0.5, ge=0, le=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Get responses with low confidence scores for review.

    Admin only. Useful for identifying potential hallucinations.
    """
    try:
        validations = (
            db.query(ResponseValidation)
            .filter(ResponseValidation.overall_confidence < threshold)
            .order_by(ResponseValidation.overall_confidence.asc())
            .limit(limit)
            .all()
        )

        results = []
        for v in validations:
            citations = (
                db.query(ResponseValidationCitation)
                .filter(ResponseValidationCitation.validation_id == v.id)
                .filter(ResponseValidationCitation.status == "unsupported")
                .all()
            )

            results.append(
                {
                    **v.to_dict(),
                    "unsupported_claims": [c.to_dict() for c in citations],
                }
            )

        return success_response(
            data={
                "validations": results,
                "count": len(results),
                "threshold": threshold,
            }
        )

    except Exception as e:
        logger.error(f"Failed to get low confidence responses: {e}", exc_info=True)
        return error_response(
            message="Failed to get low confidence responses",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

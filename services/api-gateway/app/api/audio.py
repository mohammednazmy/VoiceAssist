"""
Audio API for streaming and managing narration audio.

Provides endpoints for:
- Streaming cached narration audio
- Generating narrations on-demand
- Managing narration cache
- Voice configuration
"""

from typing import Optional

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db
from app.core.dependencies import get_current_admin_or_viewer, get_current_user
from app.core.logging import get_logger
from app.models.audio_narration import AudioNarration
from app.models.user import User
from app.services.audio_storage_service import get_audio_storage_service
from app.services.narration_cache_service import get_narration_cache_service
from app.services.tts_service import get_tts_service
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/audio", tags=["audio"])
logger = get_logger(__name__)


# Request/Response Models


class GenerateNarrationRequest(BaseModel):
    """Request to generate narration for a page."""

    narration_text: str
    voice_id: Optional[str] = "alloy"
    voice_provider: Optional[str] = "openai"
    speed: Optional[float] = 1.0
    format: Optional[str] = "mp3"
    force_regenerate: bool = False


class VoiceConfigResponse(BaseModel):
    """Available voice configuration."""

    providers: dict
    default_provider: str
    default_voice: str


# Endpoints


@router.get("/narrations/{narration_id}/stream")
async def stream_narration_audio(
    narration_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stream cached narration audio.

    Returns audio file as streaming response.
    """
    try:
        import uuid as uuid_module

        try:
            narration_uuid = uuid_module.UUID(narration_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid narration ID")

        narration = db.query(AudioNarration).filter_by(id=narration_uuid).first()

        if not narration:
            raise HTTPException(status_code=404, detail="Narration not found")

        if narration.status != "ready":
            raise HTTPException(
                status_code=400,
                detail=f"Narration not ready (status: {narration.status})",
            )

        # Record access
        narration.record_access()
        db.commit()

        # Get storage service and stream audio
        storage = get_audio_storage_service()

        content_type = {
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "opus": "audio/opus",
            "aac": "audio/aac",
        }.get(narration.audio_format, "audio/mpeg")

        return StreamingResponse(
            storage.stream_audio(narration.storage_path),
            media_type=content_type,
            headers={
                "Content-Disposition": f'inline; filename="page_{narration.page_number}.{narration.audio_format}"',
                "Content-Length": str(narration.file_size_bytes) if narration.file_size_bytes else "",
                "X-Duration-Seconds": str(narration.duration_seconds) if narration.duration_seconds else "",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error streaming narration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to stream audio")


@router.get("/documents/{document_id}/pages/{page_number}/narration")
async def get_page_narration(
    document_id: str,
    page_number: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get narration status for a specific page.

    Returns narration metadata and stream URL if available.
    """
    try:
        cache_service = get_narration_cache_service(db)
        status_info = cache_service.get_narration_status(document_id, page_number)

        return success_response(data=status_info)

    except Exception as e:
        logger.error(f"Error getting page narration: {e}", exc_info=True)
        return error_response(
            message="Failed to get narration status",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/documents/{document_id}/pages/{page_number}/stream")
async def stream_page_narration(
    document_id: str,
    page_number: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stream narration audio for a specific page.

    Redirects to narration stream endpoint if available.
    """
    try:
        cache_service = get_narration_cache_service(db)
        narration = cache_service.get_narration(document_id, page_number)

        if not narration:
            raise HTTPException(
                status_code=404,
                detail="Narration not found or not ready",
            )

        # Stream directly
        storage = get_audio_storage_service()

        content_type = {
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "opus": "audio/opus",
            "aac": "audio/aac",
        }.get(narration.audio_format, "audio/mpeg")

        return StreamingResponse(
            storage.stream_audio(narration.storage_path),
            media_type=content_type,
            headers={
                "Content-Disposition": f'inline; filename="doc_{document_id}_page_{page_number}.{narration.audio_format}"',
                "Content-Length": str(narration.file_size_bytes) if narration.file_size_bytes else "",
                "X-Duration-Seconds": str(narration.duration_seconds) if narration.duration_seconds else "",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error streaming page narration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to stream audio")


@router.post("/documents/{document_id}/pages/{page_number}/generate")
async def generate_page_narration(
    document_id: str,
    page_number: int,
    request: GenerateNarrationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate narration for a specific page.

    This will synthesize TTS audio and cache it.
    """
    try:
        cache_service = get_narration_cache_service(db)

        voice_config = {
            "voice_id": request.voice_id,
            "provider": request.voice_provider,
            "speed": request.speed,
            "format": request.format,
        }

        narration = await cache_service.generate_narration(
            document_id=document_id,
            page_number=page_number,
            narration_text=request.narration_text,
            voice_config=voice_config,
            force_regenerate=request.force_regenerate,
        )

        return success_response(
            data=narration.to_dict(),
            message="Narration generated successfully",
        )

    except ValueError as e:
        return error_response(
            message=str(e),
            code=ErrorCodes.VALIDATION_ERROR,
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        logger.error(f"Error generating narration: {e}", exc_info=True)
        return error_response(
            message="Failed to generate narration",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/documents/{document_id}/narrations")
async def get_document_narrations(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all narrations for a document with coverage summary.
    """
    try:
        cache_service = get_narration_cache_service(db)

        summary = cache_service.get_document_narration_summary(document_id)
        narrations = cache_service.get_document_narrations(document_id)

        return success_response(
            data={
                "summary": summary,
                "narrations": [n.to_brief_dict() for n in narrations],
            }
        )

    except Exception as e:
        logger.error(f"Error getting document narrations: {e}", exc_info=True)
        return error_response(
            message="Failed to get document narrations",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


class BatchNarrationSummaryRequest(BaseModel):
    """Request for batch narration summaries."""

    document_ids: list[str]


@router.post("/documents/narration-summaries/batch")
async def get_batch_narration_summaries(
    request: BatchNarrationSummaryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_or_viewer),
):
    """
    Get narration coverage summaries for multiple documents in a single request.

    This is more efficient than calling the single-document endpoint multiple times,
    especially for the Knowledge Base page which needs coverage for all documents.

    Returns a dictionary mapping document_id -> summary.
    """
    try:
        cache_service = get_narration_cache_service(db)

        # Limit batch size to prevent abuse
        max_batch_size = 100
        doc_ids = request.document_ids[:max_batch_size]

        summaries = {}
        for doc_id in doc_ids:
            try:
                summary = cache_service.get_document_narration_summary(doc_id)
                if summary:
                    summaries[doc_id] = summary
            except Exception as e:
                # Log but continue - don't fail entire batch for one doc
                logger.warning(f"Failed to get narration summary for {doc_id}: {e}")

        return success_response(
            data={
                "summaries": summaries,
                "requested": len(doc_ids),
                "returned": len(summaries),
            }
        )

    except Exception as e:
        logger.error(f"Error getting batch narration summaries: {e}", exc_info=True)
        return error_response(
            message="Failed to get narration summaries",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/voices")
async def get_available_voices(
    current_user: User = Depends(get_current_user),
):
    """
    Get all available TTS voices.
    """
    try:
        tts_service = get_tts_service()

        if not tts_service.is_available():
            return error_response(
                message="TTS service not available",
                code=ErrorCodes.SERVICE_UNAVAILABLE,
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        voices = tts_service.get_all_voices()

        return success_response(
            data={
                "providers": voices,
                "default_provider": "openai",
                "default_voice": "alloy",
            }
        )

    except Exception as e:
        logger.error(f"Error getting voices: {e}", exc_info=True)
        return error_response(
            message="Failed to get available voices",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# Admin endpoints


@router.post("/admin/documents/{document_id}/generate-all")
async def generate_all_document_narrations(
    document_id: str,
    voice_id: str = Query("alloy"),
    voice_provider: str = Query("openai"),
    speed: float = Query(1.0),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Generate narrations for all pages in a document.

    Admin only. This can be expensive for large documents.
    """
    try:
        cache_service = get_narration_cache_service(db)

        voice_config = {
            "voice_id": voice_id,
            "provider": voice_provider,
            "speed": speed,
            "format": "mp3",
        }

        results = await cache_service.generate_document_narrations(
            document_id=document_id,
            voice_config=voice_config,
        )

        return success_response(
            data=results,
            message=f"Generated {results['generated']} narrations, {results['cached']} cached",
        )

    except ValueError as e:
        return error_response(
            message=str(e),
            code=ErrorCodes.VALIDATION_ERROR,
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        logger.error(f"Error generating all narrations: {e}", exc_info=True)
        return error_response(
            message="Failed to generate narrations",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.delete("/admin/documents/{document_id}/narrations")
async def delete_document_narrations(
    document_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Delete all cached narrations for a document.

    Admin only.
    """
    try:
        cache_service = get_narration_cache_service(db)
        deleted = cache_service.invalidate_document_narrations(document_id)

        return success_response(
            data={"deleted_count": deleted},
            message=f"Deleted {deleted} narrations",
        )

    except Exception as e:
        logger.error(f"Error deleting narrations: {e}", exc_info=True)
        return error_response(
            message="Failed to delete narrations",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.delete("/admin/documents/{document_id}/pages/{page_number}/narration")
async def delete_page_narration(
    document_id: str,
    page_number: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Delete cached narration for a specific page.

    Admin only.
    """
    try:
        cache_service = get_narration_cache_service(db)
        deleted = cache_service.invalidate_narration(document_id, page_number)

        if deleted:
            return success_response(
                data={"deleted": True},
                message="Narration deleted",
            )
        else:
            return error_response(
                message="Narration not found",
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

    except Exception as e:
        logger.error(f"Error deleting page narration: {e}", exc_info=True)
        return error_response(
            message="Failed to delete narration",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.post("/admin/cleanup")
async def cleanup_old_narrations(
    days_since_access: int = Query(30, ge=1, le=365),
    max_to_delete: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Clean up old narrations that haven't been accessed recently.

    Admin only.
    """
    try:
        cache_service = get_narration_cache_service(db)
        deleted = cache_service.cleanup_old_narrations(
            days_since_access=days_since_access,
            max_to_delete=max_to_delete,
        )

        return success_response(
            data={"deleted_count": deleted},
            message=f"Cleaned up {deleted} old narrations",
        )

    except Exception as e:
        logger.error(f"Error cleaning up narrations: {e}", exc_info=True)
        return error_response(
            message="Failed to clean up narrations",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/admin/stats")
async def get_audio_storage_stats(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
):
    """
    Get audio storage statistics.

    Admin only.
    """
    try:
        storage = get_audio_storage_service()
        stats = storage.get_storage_stats()

        # Add narration counts
        from sqlalchemy import func

        status_counts = dict(
            db.query(AudioNarration.status, func.count(AudioNarration.id))
            .group_by(AudioNarration.status)
            .all()
        )

        stats["narration_counts"] = status_counts
        stats["total_narrations"] = sum(status_counts.values())

        return success_response(data=stats)

    except Exception as e:
        logger.error(f"Error getting storage stats: {e}", exc_info=True)
        return error_response(
            message="Failed to get storage stats",
            code=ErrorCodes.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

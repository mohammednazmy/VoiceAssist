"""
Multi-modal search API endpoints.

Enables searching documents using text-to-image, image-to-text,
and image-to-image queries with CLIP embeddings.
"""

import base64
from typing import Any, Dict, List, Optional

from app.core.database import get_db
from app.core.logging import get_logger
from app.services.auth import get_current_active_user, require_admin
from app.services.multimodal_search_service import MultimodalSearchService
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

logger = get_logger(__name__)

router = APIRouter(prefix="/api/multimodal-search", tags=["multimodal-search"])


# Request/Response Models
class TextSearchRequest(BaseModel):
    """Text-based search request."""

    query: str = Field(..., min_length=1, max_length=1000, description="Search query text")
    limit: int = Field(20, ge=1, le=100, description="Maximum results")
    document_ids: Optional[List[str]] = Field(None, description="Filter to specific documents")
    image_types: Optional[List[str]] = Field(None, description="Filter to image types")
    min_score: float = Field(0.2, ge=0.0, le=1.0, description="Minimum similarity score")
    include_images: bool = Field(True, description="Include image results")
    include_text: bool = Field(True, description="Include text results")


class ImageSearchRequest(BaseModel):
    """Image-based search request (with base64 image)."""

    image_base64: str = Field(..., description="Base64 encoded image")
    search_type: str = Field("image_to_all", description="Search type: image_to_text, image_to_image, image_to_all")
    limit: int = Field(20, ge=1, le=100, description="Maximum results")
    document_ids: Optional[List[str]] = Field(None, description="Filter to specific documents")
    min_score: float = Field(0.2, ge=0.0, le=1.0, description="Minimum similarity score")


class SearchResultItem(BaseModel):
    """Single search result."""

    id: str
    result_type: str
    document_id: str
    page_number: Optional[int]
    score: float
    content: Dict[str, Any]


class SearchResponse(BaseModel):
    """Search response with results."""

    query_type: str
    results: List[SearchResultItem]
    total_count: int
    search_time_ms: int


class ImageResponse(BaseModel):
    """Document image response."""

    id: str
    document_id: str
    page_number: Optional[int]
    image_index: int
    storage_path: str
    thumbnail_path: Optional[str]
    image_format: Optional[str]
    width: Optional[int]
    height: Optional[int]
    caption: Optional[str]
    image_type: Optional[str]
    has_embedding: bool


class ExtractionRequest(BaseModel):
    """Image extraction request."""

    force_reprocess: bool = Field(False, description="Force re-extraction even if already processed")


class ExtractionStatusResponse(BaseModel):
    """Extraction status response."""

    document_id: str
    status: str
    images_count: Optional[int]
    pages_processed: Optional[int]
    total_pages: Optional[int]
    progress_percentage: Optional[int]


# Helper function
def get_multimodal_service(db: Session = Depends(get_db)) -> MultimodalSearchService:
    """Get multimodal search service instance."""
    return MultimodalSearchService(db)


# ============ Search Endpoints ============


@router.post("/text-to-image", response_model=SearchResponse)
async def search_text_to_image(
    request: TextSearchRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Search for images using a text description.

    Uses CLIP to find images that match the text query semantically.
    """
    service = MultimodalSearchService(db)

    try:
        results = await service.search_text_to_image(
            query=request.query,
            limit=request.limit,
            document_ids=request.document_ids,
            image_types=request.image_types,
            min_score=request.min_score,
            user_id=str(current_user.id),
        )

        return {
            "query_type": results.query_type,
            "results": [
                {
                    "id": r.id,
                    "result_type": r.result_type,
                    "document_id": r.document_id,
                    "page_number": r.page_number,
                    "score": r.score,
                    "content": r.content,
                }
                for r in results.results
            ],
            "total_count": results.total_count,
            "search_time_ms": results.search_time_ms,
        }
    except ImportError as e:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"CLIP model not available: {str(e)}",
        )
    except Exception as e:
        logger.error("text_to_image_search_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}",
        )


@router.post("/image-to-text", response_model=SearchResponse)
async def search_image_to_text(
    image: UploadFile = File(...),
    limit: int = Query(20, ge=1, le=100),
    document_ids: Optional[str] = Query(None, description="Comma-separated document IDs"),
    min_score: float = Query(0.2, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Search for text using an image query.

    Upload an image to find related text content across documents.
    """
    service = MultimodalSearchService(db)

    # Read image
    image_bytes = await image.read()

    # Parse document IDs
    doc_ids = document_ids.split(",") if document_ids else None

    try:
        results = await service.search_image_to_text(
            image_bytes=image_bytes,
            limit=limit,
            document_ids=doc_ids,
            min_score=min_score,
            user_id=str(current_user.id),
        )

        return {
            "query_type": results.query_type,
            "results": [
                {
                    "id": r.id,
                    "result_type": r.result_type,
                    "document_id": r.document_id,
                    "page_number": r.page_number,
                    "score": r.score,
                    "content": r.content,
                }
                for r in results.results
            ],
            "total_count": results.total_count,
            "search_time_ms": results.search_time_ms,
        }
    except ImportError as e:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"CLIP model not available: {str(e)}",
        )
    except Exception as e:
        logger.error("image_to_text_search_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}",
        )


@router.post("/image-to-image", response_model=SearchResponse)
async def search_image_to_image(
    image: UploadFile = File(...),
    limit: int = Query(20, ge=1, le=100),
    document_ids: Optional[str] = Query(None, description="Comma-separated document IDs"),
    min_score: float = Query(0.3, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Find similar images using an image query.

    Upload an image to find visually similar images across documents.
    """
    service = MultimodalSearchService(db)

    # Read image
    image_bytes = await image.read()

    # Parse document IDs
    doc_ids = document_ids.split(",") if document_ids else None

    try:
        results = await service.search_image_to_image(
            image_bytes=image_bytes,
            limit=limit,
            document_ids=doc_ids,
            min_score=min_score,
            user_id=str(current_user.id),
        )

        return {
            "query_type": results.query_type,
            "results": [
                {
                    "id": r.id,
                    "result_type": r.result_type,
                    "document_id": r.document_id,
                    "page_number": r.page_number,
                    "score": r.score,
                    "content": r.content,
                }
                for r in results.results
            ],
            "total_count": results.total_count,
            "search_time_ms": results.search_time_ms,
        }
    except ImportError as e:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"CLIP model not available: {str(e)}",
        )
    except Exception as e:
        logger.error("image_to_image_search_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}",
        )


@router.post("/text-to-all", response_model=SearchResponse)
async def search_text_to_all(
    request: TextSearchRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Search for both images and text using a text query.

    Returns a mixed list of image and text results ranked by relevance.
    """
    service = MultimodalSearchService(db)

    try:
        results = await service.search_text_to_all(
            query=request.query,
            limit=request.limit,
            document_ids=request.document_ids,
            include_images=request.include_images,
            include_text=request.include_text,
            min_score=request.min_score,
            user_id=str(current_user.id),
        )

        return {
            "query_type": results.query_type,
            "results": [
                {
                    "id": r.id,
                    "result_type": r.result_type,
                    "document_id": r.document_id,
                    "page_number": r.page_number,
                    "score": r.score,
                    "content": r.content,
                }
                for r in results.results
            ],
            "total_count": results.total_count,
            "search_time_ms": results.search_time_ms,
        }
    except ImportError as e:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"CLIP model not available: {str(e)}",
        )
    except Exception as e:
        logger.error("text_to_all_search_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}",
        )


@router.post("/image-search-base64", response_model=SearchResponse)
async def search_with_base64_image(
    request: ImageSearchRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Search using a base64 encoded image.

    Alternative to file upload for programmatic access.
    """
    service = MultimodalSearchService(db)

    try:
        # Decode base64 image
        image_bytes = base64.b64decode(request.image_base64)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 image data",
        )

    try:
        if request.search_type == "image_to_text":
            results = await service.search_image_to_text(
                image_bytes=image_bytes,
                limit=request.limit,
                document_ids=request.document_ids,
                min_score=request.min_score,
                user_id=str(current_user.id),
            )
        elif request.search_type == "image_to_image":
            results = await service.search_image_to_image(
                image_bytes=image_bytes,
                limit=request.limit,
                document_ids=request.document_ids,
                min_score=request.min_score,
                user_id=str(current_user.id),
            )
        else:
            # Default: search both
            # For image queries, we do image-to-image and image-to-text
            image_results = await service.search_image_to_image(
                image_bytes=image_bytes,
                limit=request.limit // 2,
                document_ids=request.document_ids,
                min_score=request.min_score,
                user_id=str(current_user.id),
            )
            text_results = await service.search_image_to_text(
                image_bytes=image_bytes,
                limit=request.limit // 2,
                document_ids=request.document_ids,
                min_score=request.min_score,
                user_id=str(current_user.id),
            )

            # Merge results
            all_results = image_results.results + text_results.results
            all_results.sort(key=lambda x: x.score, reverse=True)
            all_results = all_results[:request.limit]

            return {
                "query_type": "image_to_all",
                "results": [
                    {
                        "id": r.id,
                        "result_type": r.result_type,
                        "document_id": r.document_id,
                        "page_number": r.page_number,
                        "score": r.score,
                        "content": r.content,
                    }
                    for r in all_results
                ],
                "total_count": len(all_results),
                "search_time_ms": image_results.search_time_ms + text_results.search_time_ms,
            }

        return {
            "query_type": results.query_type,
            "results": [
                {
                    "id": r.id,
                    "result_type": r.result_type,
                    "document_id": r.document_id,
                    "page_number": r.page_number,
                    "score": r.score,
                    "content": r.content,
                }
                for r in results.results
            ],
            "total_count": results.total_count,
            "search_time_ms": results.search_time_ms,
        }
    except ImportError as e:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"CLIP model not available: {str(e)}",
        )
    except Exception as e:
        logger.error("base64_image_search_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}",
        )


# ============ Document Image Endpoints ============


@router.get("/documents/{document_id}/images", response_model=List[ImageResponse])
async def get_document_images(
    document_id: str,
    page_number: Optional[int] = Query(None, description="Filter to specific page"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """
    Get all images extracted from a document.

    Optionally filter by page number.
    """
    service = MultimodalSearchService(db)
    images = service.get_document_images(document_id, page_number)

    return [
        {
            "id": str(img.id),
            "document_id": str(img.document_id),
            "page_number": img.page_number,
            "image_index": img.image_index,
            "storage_path": img.storage_path,
            "thumbnail_path": img.thumbnail_path,
            "image_format": img.image_format,
            "width": img.width,
            "height": img.height,
            "caption": img.caption,
            "image_type": img.image_type,
            "has_embedding": img.clip_embedding is not None,
        }
        for img in images
    ]


@router.get("/images/{image_id}")
async def get_image(
    image_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get detailed information about a specific image.
    """
    service = MultimodalSearchService(db)
    image = service.get_image(image_id)

    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    return image.to_dict()


@router.get("/images/{image_id}/file")
async def get_image_file(
    image_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """
    Download the actual image file.
    """
    from fastapi.responses import FileResponse

    service = MultimodalSearchService(db)
    image = service.get_image(image_id)

    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    import os

    if not os.path.exists(image.storage_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image file not found")

    return FileResponse(
        image.storage_path,
        media_type=f"image/{image.image_format or 'png'}",
        filename=f"image_{image_id}.{image.image_format or 'png'}",
    )


# ============ Extraction Endpoints ============


@router.post("/documents/{document_id}/extract-images")
async def extract_document_images(
    document_id: str,
    request: ExtractionRequest = ExtractionRequest(),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Extract images from a document and generate CLIP embeddings.

    This operation may take several seconds for large documents.
    """
    service = MultimodalSearchService(db)

    try:
        result = await service.extract_and_embed_document_images(
            document_id=document_id, force_reprocess=request.force_reprocess
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ImportError as e:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"Required dependencies not available: {str(e)}",
        )
    except Exception as e:
        logger.error("image_extraction_failed", document_id=document_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extraction failed: {str(e)}",
        )


@router.get("/documents/{document_id}/extraction-status")
async def get_extraction_status(
    document_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get image extraction status for a document.
    """
    from app.models.multimodal import DocumentImageExtraction

    extraction = db.query(DocumentImageExtraction).filter(
        DocumentImageExtraction.document_id == document_id
    ).first()

    if not extraction:
        return {
            "document_id": document_id,
            "status": "not_started",
            "images_count": None,
            "pages_processed": None,
            "total_pages": None,
            "progress_percentage": 0,
        }

    return {
        "document_id": document_id,
        "status": extraction.status,
        "images_count": extraction.images_count,
        "pages_processed": extraction.pages_processed,
        "total_pages": extraction.total_pages,
        "progress_percentage": extraction.progress_percentage,
    }


# ============ Statistics Endpoints ============


@router.get("/stats")
async def get_multimodal_stats(
    days: int = Query(30, ge=1, le=365, description="Days to analyze"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get multi-modal search statistics.
    """
    service = MultimodalSearchService(db)
    stats = service.get_search_stats(days)

    # Add additional stats
    from sqlalchemy import func
    from app.models.multimodal import DocumentImage, MultimodalTextChunk

    total_images = db.query(func.count(DocumentImage.id)).scalar() or 0
    images_with_embeddings = db.query(func.count(DocumentImage.id)).filter(
        DocumentImage.clip_embedding.isnot(None)
    ).scalar() or 0

    total_text_chunks = db.query(func.count(MultimodalTextChunk.id)).scalar() or 0
    text_with_embeddings = db.query(func.count(MultimodalTextChunk.id)).filter(
        MultimodalTextChunk.clip_embedding.isnot(None)
    ).scalar() or 0

    return {
        **stats,
        "total_images": total_images,
        "images_with_embeddings": images_with_embeddings,
        "total_text_chunks": total_text_chunks,
        "text_with_embeddings": text_with_embeddings,
    }


# ============ Admin Endpoints ============


@router.post("/admin/bulk-extract")
async def bulk_extract_images(
    document_ids: List[str],
    force_reprocess: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """
    Queue multiple documents for image extraction (admin only).
    """
    if len(document_ids) > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 20 documents per bulk extraction request",
        )

    service = MultimodalSearchService(db)
    results = []

    for doc_id in document_ids:
        try:
            result = await service.extract_and_embed_document_images(
                document_id=doc_id, force_reprocess=force_reprocess
            )
            results.append({"document_id": doc_id, "status": "success", "result": result})
        except Exception as e:
            results.append({"document_id": doc_id, "status": "error", "error": str(e)})

    successful = sum(1 for r in results if r["status"] == "success")
    failed = sum(1 for r in results if r["status"] == "error")

    return {
        "total": len(document_ids),
        "successful": successful,
        "failed": failed,
        "results": results,
    }


@router.get("/admin/extractions")
async def list_extraction_statuses(
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """
    List all document image extraction statuses (admin only).
    """
    from app.models.multimodal import DocumentImageExtraction

    query = db.query(DocumentImageExtraction)

    if status_filter:
        query = query.filter(DocumentImageExtraction.status == status_filter)

    total = query.count()
    offset = (page - 1) * page_size

    extractions = query.order_by(
        DocumentImageExtraction.created_at.desc()
    ).offset(offset).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "extractions": [e.to_dict() for e in extractions],
    }


@router.put("/admin/images/{image_id}/caption")
async def update_image_caption(
    image_id: str,
    caption: str,
    alt_text: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """
    Update image caption and alt text (admin only).
    """
    from app.models.multimodal import DocumentImage

    image = db.query(DocumentImage).filter(DocumentImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    image.caption = caption
    if alt_text is not None:
        image.alt_text = alt_text

    db.commit()
    db.refresh(image)

    logger.info("image_caption_updated", image_id=image_id)

    return image.to_dict()


@router.put("/admin/images/{image_id}/type")
async def update_image_type(
    image_id: str,
    image_type: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """
    Update image type classification (admin only).
    """
    from app.models.multimodal import DocumentImage

    if image_type not in DocumentImage.VALID_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image type. Valid types: {DocumentImage.VALID_IMAGE_TYPES}",
        )

    image = db.query(DocumentImage).filter(DocumentImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    image.image_type = image_type
    db.commit()
    db.refresh(image)

    logger.info("image_type_updated", image_id=image_id, image_type=image_type)

    return image.to_dict()

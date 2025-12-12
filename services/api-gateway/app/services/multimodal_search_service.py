"""
Multi-modal search service using CLIP embeddings.

Enables searching documents using text queries to find images,
image queries to find relevant text, and image-to-image similarity.
"""

import base64
import io
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from app.core.config import settings
from app.core.logging import get_logger
from app.models.document import Document
from app.models.multimodal import (
    DocumentImage,
    DocumentImageExtraction,
    MultimodalSearchLog,
    MultimodalTextChunk,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = get_logger(__name__)


@dataclass
class SearchResult:
    """A single search result."""

    id: str
    result_type: str  # 'image' or 'text'
    document_id: str
    page_number: Optional[int]
    score: float
    content: Dict[str, Any]


@dataclass
class MultimodalSearchResults:
    """Collection of search results."""

    query_type: str
    results: List[SearchResult]
    total_count: int
    search_time_ms: int


class MultimodalSearchService:
    """
    Service for multi-modal search using CLIP embeddings.

    Supports:
    - Text-to-image search: Find images matching a text description
    - Image-to-text search: Find text related to an image
    - Image-to-image search: Find similar images
    - Text-to-all search: Find both images and text matching a query
    """

    # CLIP model settings
    CLIP_MODEL = "openai/clip-vit-base-patch32"
    EMBEDDING_DIM = 512

    def __init__(self, db: Session):
        self.db = db
        self._clip_model = None
        self._clip_processor = None

    def _get_clip_model(self):
        """Lazy load CLIP model."""
        if self._clip_model is None:
            try:
                from transformers import CLIPModel, CLIPProcessor

                self._clip_model = CLIPModel.from_pretrained(self.CLIP_MODEL)
                self._clip_processor = CLIPProcessor.from_pretrained(self.CLIP_MODEL)
                logger.info("clip_model_loaded", model=self.CLIP_MODEL)
            except ImportError:
                logger.warning("transformers_not_installed", message="Install transformers for CLIP support")
                raise ImportError("transformers package required for CLIP. Install with: pip install transformers")
        return self._clip_model, self._clip_processor

    def _encode_text(self, text: str) -> np.ndarray:
        """Encode text to CLIP embedding."""
        model, processor = self._get_clip_model()
        import torch

        with torch.no_grad():
            inputs = processor(text=[text], return_tensors="pt", padding=True, truncation=True, max_length=77)
            text_features = model.get_text_features(**inputs)
            # Normalize embedding
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            return text_features.cpu().numpy().flatten()

    def _encode_image(self, image_bytes: bytes) -> np.ndarray:
        """Encode image to CLIP embedding."""
        model, processor = self._get_clip_model()
        import torch
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        with torch.no_grad():
            inputs = processor(images=image, return_tensors="pt")
            image_features = model.get_image_features(**inputs)
            # Normalize embedding
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            return image_features.cpu().numpy().flatten()

    def _cosine_similarity(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """Calculate cosine similarity between two embeddings."""
        return float(np.dot(embedding1, embedding2))

    async def search_text_to_image(
        self,
        query: str,
        limit: int = 20,
        document_ids: Optional[List[str]] = None,
        image_types: Optional[List[str]] = None,
        min_score: float = 0.2,
        user_id: Optional[str] = None,
    ) -> MultimodalSearchResults:
        """
        Search for images using a text query.

        Args:
            query: Text description to search for
            limit: Maximum number of results
            document_ids: Filter to specific documents
            image_types: Filter to specific image types
            min_score: Minimum similarity score threshold
            user_id: User ID for logging

        Returns:
            MultimodalSearchResults with matching images
        """
        start_time = time.time()

        # Encode query
        query_embedding = self._encode_text(query)

        # Get images with embeddings
        images_query = self.db.query(DocumentImage).filter(DocumentImage.clip_embedding.isnot(None))

        if document_ids:
            images_query = images_query.filter(DocumentImage.document_id.in_(document_ids))
        if image_types:
            images_query = images_query.filter(DocumentImage.image_type.in_(image_types))

        images = images_query.all()

        # Calculate similarities
        scored_results = []
        for image in images:
            if image.clip_embedding:
                image_embedding = np.array(image.clip_embedding)
                score = self._cosine_similarity(query_embedding, image_embedding)
                if score >= min_score:
                    scored_results.append((image, score))

        # Sort by score descending
        scored_results.sort(key=lambda x: x[1], reverse=True)
        scored_results = scored_results[:limit]

        # Convert to search results
        results = [
            SearchResult(
                id=str(img.id),
                result_type="image",
                document_id=str(img.document_id),
                page_number=img.page_number,
                score=score,
                content=img.to_search_result(score),
            )
            for img, score in scored_results
        ]

        search_time_ms = int((time.time() - start_time) * 1000)

        # Log search
        self._log_search(
            user_id=user_id,
            query_text=query,
            search_type=MultimodalSearchLog.TEXT_TO_IMAGE,
            results_count=len(results),
            top_score=results[0].score if results else None,
            response_time_ms=search_time_ms,
        )

        return MultimodalSearchResults(
            query_type="text_to_image",
            results=results,
            total_count=len(results),
            search_time_ms=search_time_ms,
        )

    async def search_image_to_text(
        self,
        image_bytes: bytes,
        limit: int = 20,
        document_ids: Optional[List[str]] = None,
        min_score: float = 0.2,
        user_id: Optional[str] = None,
    ) -> MultimodalSearchResults:
        """
        Search for text chunks using an image query.

        Args:
            image_bytes: Query image as bytes
            limit: Maximum number of results
            document_ids: Filter to specific documents
            min_score: Minimum similarity score threshold
            user_id: User ID for logging

        Returns:
            MultimodalSearchResults with matching text chunks
        """
        start_time = time.time()

        # Encode query image
        query_embedding = self._encode_image(image_bytes)

        # Get text chunks with embeddings
        chunks_query = self.db.query(MultimodalTextChunk).filter(
            MultimodalTextChunk.clip_embedding.isnot(None)
        )

        if document_ids:
            chunks_query = chunks_query.filter(MultimodalTextChunk.document_id.in_(document_ids))

        chunks = chunks_query.all()

        # Calculate similarities
        scored_results = []
        for chunk in chunks:
            if chunk.clip_embedding:
                chunk_embedding = np.array(chunk.clip_embedding)
                score = self._cosine_similarity(query_embedding, chunk_embedding)
                if score >= min_score:
                    scored_results.append((chunk, score))

        # Sort by score descending
        scored_results.sort(key=lambda x: x[1], reverse=True)
        scored_results = scored_results[:limit]

        # Convert to search results
        results = [
            SearchResult(
                id=str(chunk.id),
                result_type="text",
                document_id=str(chunk.document_id),
                page_number=chunk.page_number,
                score=score,
                content=chunk.to_search_result(score),
            )
            for chunk, score in scored_results
        ]

        search_time_ms = int((time.time() - start_time) * 1000)

        # Log search
        self._log_search(
            user_id=user_id,
            query_text=None,
            search_type=MultimodalSearchLog.IMAGE_TO_TEXT,
            results_count=len(results),
            top_score=results[0].score if results else None,
            response_time_ms=search_time_ms,
        )

        return MultimodalSearchResults(
            query_type="image_to_text",
            results=results,
            total_count=len(results),
            search_time_ms=search_time_ms,
        )

    async def search_image_to_image(
        self,
        image_bytes: bytes,
        limit: int = 20,
        document_ids: Optional[List[str]] = None,
        exclude_same_document: bool = False,
        min_score: float = 0.3,
        user_id: Optional[str] = None,
    ) -> MultimodalSearchResults:
        """
        Find similar images using an image query.

        Args:
            image_bytes: Query image as bytes
            limit: Maximum number of results
            document_ids: Filter to specific documents
            exclude_same_document: Exclude images from query's document
            min_score: Minimum similarity score threshold
            user_id: User ID for logging

        Returns:
            MultimodalSearchResults with similar images
        """
        start_time = time.time()

        # Encode query image
        query_embedding = self._encode_image(image_bytes)

        # Get images with embeddings
        images_query = self.db.query(DocumentImage).filter(DocumentImage.clip_embedding.isnot(None))

        if document_ids:
            images_query = images_query.filter(DocumentImage.document_id.in_(document_ids))

        images = images_query.all()

        # Calculate similarities
        scored_results = []
        for image in images:
            if image.clip_embedding:
                image_embedding = np.array(image.clip_embedding)
                score = self._cosine_similarity(query_embedding, image_embedding)
                if score >= min_score:
                    scored_results.append((image, score))

        # Sort by score descending
        scored_results.sort(key=lambda x: x[1], reverse=True)
        scored_results = scored_results[:limit]

        # Convert to search results
        results = [
            SearchResult(
                id=str(img.id),
                result_type="image",
                document_id=str(img.document_id),
                page_number=img.page_number,
                score=score,
                content=img.to_search_result(score),
            )
            for img, score in scored_results
        ]

        search_time_ms = int((time.time() - start_time) * 1000)

        # Log search
        self._log_search(
            user_id=user_id,
            query_text=None,
            search_type=MultimodalSearchLog.IMAGE_TO_IMAGE,
            results_count=len(results),
            top_score=results[0].score if results else None,
            response_time_ms=search_time_ms,
        )

        return MultimodalSearchResults(
            query_type="image_to_image",
            results=results,
            total_count=len(results),
            search_time_ms=search_time_ms,
        )

    async def search_text_to_all(
        self,
        query: str,
        limit: int = 20,
        document_ids: Optional[List[str]] = None,
        include_images: bool = True,
        include_text: bool = True,
        min_score: float = 0.2,
        user_id: Optional[str] = None,
    ) -> MultimodalSearchResults:
        """
        Search for both images and text using a text query.

        Args:
            query: Text query
            limit: Maximum number of results per type
            document_ids: Filter to specific documents
            include_images: Include image results
            include_text: Include text results
            min_score: Minimum similarity score threshold
            user_id: User ID for logging

        Returns:
            MultimodalSearchResults with both images and text
        """
        start_time = time.time()

        # Encode query
        query_embedding = self._encode_text(query)

        all_results = []

        # Search images
        if include_images:
            images_query = self.db.query(DocumentImage).filter(
                DocumentImage.clip_embedding.isnot(None)
            )
            if document_ids:
                images_query = images_query.filter(DocumentImage.document_id.in_(document_ids))

            for image in images_query.all():
                if image.clip_embedding:
                    score = self._cosine_similarity(query_embedding, np.array(image.clip_embedding))
                    if score >= min_score:
                        all_results.append(
                            SearchResult(
                                id=str(image.id),
                                result_type="image",
                                document_id=str(image.document_id),
                                page_number=image.page_number,
                                score=score,
                                content=image.to_search_result(score),
                            )
                        )

        # Search text chunks
        if include_text:
            chunks_query = self.db.query(MultimodalTextChunk).filter(
                MultimodalTextChunk.clip_embedding.isnot(None)
            )
            if document_ids:
                chunks_query = chunks_query.filter(MultimodalTextChunk.document_id.in_(document_ids))

            for chunk in chunks_query.all():
                if chunk.clip_embedding:
                    score = self._cosine_similarity(query_embedding, np.array(chunk.clip_embedding))
                    if score >= min_score:
                        all_results.append(
                            SearchResult(
                                id=str(chunk.id),
                                result_type="text",
                                document_id=str(chunk.document_id),
                                page_number=chunk.page_number,
                                score=score,
                                content=chunk.to_search_result(score),
                            )
                        )

        # Sort by score and limit
        all_results.sort(key=lambda x: x.score, reverse=True)
        all_results = all_results[:limit]

        search_time_ms = int((time.time() - start_time) * 1000)

        # Log search
        self._log_search(
            user_id=user_id,
            query_text=query,
            search_type=MultimodalSearchLog.TEXT_TO_ALL,
            results_count=len(all_results),
            top_score=all_results[0].score if all_results else None,
            response_time_ms=search_time_ms,
        )

        return MultimodalSearchResults(
            query_type="text_to_all",
            results=all_results,
            total_count=len(all_results),
            search_time_ms=search_time_ms,
        )

    async def extract_and_embed_document_images(
        self,
        document_id: str,
        force_reprocess: bool = False,
    ) -> Dict[str, Any]:
        """
        Extract images from a document and generate CLIP embeddings.

        Args:
            document_id: Document to process
            force_reprocess: Force re-extraction

        Returns:
            Extraction status and statistics
        """
        # Check existing extraction
        extraction = self.db.query(DocumentImageExtraction).filter(
            DocumentImageExtraction.document_id == document_id
        ).first()

        if extraction and extraction.status == "complete" and not force_reprocess:
            return {
                "status": "already_complete",
                "images_count": extraction.images_count,
                "message": "Document already processed. Use force_reprocess=True to re-extract.",
            }

        # Get document
        document = self.db.query(Document).filter(Document.document_id == document_id).first()
        if not document:
            raise ValueError(f"Document not found: {document_id}")

        # Create or update extraction record
        if not extraction:
            extraction = DocumentImageExtraction(document_id=document_id)
            self.db.add(extraction)

        extraction.mark_processing()
        self.db.commit()

        try:
            # Extract images using PyMuPDF (fitz)
            images_extracted = await self._extract_images_from_pdf(document, extraction)

            # Generate CLIP embeddings for each image
            embedded_count = 0
            for image in self.db.query(DocumentImage).filter(
                DocumentImage.document_id == document_id
            ).all():
                try:
                    embedding = await self._generate_image_embedding(image.storage_path)
                    if embedding is not None:
                        image.clip_embedding = embedding.tolist()
                        image.embedding_model = self.CLIP_MODEL
                        embedded_count += 1
                except Exception as e:
                    logger.warning(
                        "image_embedding_failed",
                        image_id=str(image.id),
                        error=str(e),
                    )

            self.db.commit()

            extraction.mark_complete(images_extracted, extraction.total_pages or 0)
            self.db.commit()

            logger.info(
                "document_images_extracted",
                document_id=document_id,
                images_count=images_extracted,
                embedded_count=embedded_count,
            )

            return {
                "status": "complete",
                "images_count": images_extracted,
                "embedded_count": embedded_count,
                "document_id": document_id,
            }

        except Exception as e:
            extraction.mark_failed(str(e))
            self.db.commit()
            logger.error("image_extraction_failed", document_id=document_id, error=str(e))
            raise

    async def _extract_images_from_pdf(
        self,
        document: Document,
        extraction: DocumentImageExtraction,
    ) -> int:
        """Extract images from PDF document."""
        try:
            import fitz  # PyMuPDF
        except ImportError:
            raise ImportError("PyMuPDF required. Install with: pip install pymupdf")

        # Get document file path
        file_path = document.file_path
        if not file_path:
            raise ValueError("Document has no file path")

        # Open PDF
        pdf = fitz.open(file_path)
        extraction.total_pages = len(pdf)
        images_count = 0

        try:
            for page_num in range(len(pdf)):
                page = pdf[page_num]
                image_list = page.get_images()

                for img_index, img_info in enumerate(image_list):
                    try:
                        xref = img_info[0]
                        base_image = pdf.extract_image(xref)
                        image_bytes = base_image["image"]
                        image_ext = base_image["ext"]

                        # Save image
                        storage_path = await self._save_image(
                            document.document_id,
                            page_num + 1,
                            img_index,
                            image_bytes,
                            image_ext,
                        )

                        # Create database record
                        doc_image = DocumentImage(
                            document_id=document.document_id,
                            page_number=page_num + 1,
                            image_index=img_index,
                            storage_path=storage_path,
                            image_format=image_ext,
                            file_size=len(image_bytes),
                            extraction_method="pymupdf",
                        )

                        # Get image dimensions
                        try:
                            from PIL import Image

                            img = Image.open(io.BytesIO(image_bytes))
                            doc_image.width = img.width
                            doc_image.height = img.height
                        except Exception:
                            pass

                        self.db.add(doc_image)
                        images_count += 1

                    except Exception as e:
                        logger.warning(
                            "image_extraction_error",
                            document_id=document.document_id,
                            page=page_num + 1,
                            index=img_index,
                            error=str(e),
                        )

                extraction.update_progress(page_num + 1, len(pdf))
                self.db.commit()

        finally:
            pdf.close()

        return images_count

    async def _save_image(
        self,
        document_id: str,
        page_number: int,
        image_index: int,
        image_bytes: bytes,
        image_ext: str,
    ) -> str:
        """Save extracted image to storage."""
        import os

        # Create storage directory
        storage_dir = os.path.join(
            settings.UPLOAD_DIR or "/tmp/uploads",
            "document_images",
            str(document_id),
        )
        os.makedirs(storage_dir, exist_ok=True)

        # Save image
        filename = f"page_{page_number:04d}_img_{image_index:03d}.{image_ext}"
        filepath = os.path.join(storage_dir, filename)

        with open(filepath, "wb") as f:
            f.write(image_bytes)

        return filepath

    async def _generate_image_embedding(self, image_path: str) -> Optional[np.ndarray]:
        """Generate CLIP embedding for an image file."""
        try:
            with open(image_path, "rb") as f:
                image_bytes = f.read()
            return self._encode_image(image_bytes)
        except Exception as e:
            logger.warning("embedding_generation_failed", path=image_path, error=str(e))
            return None

    async def embed_text_chunks(
        self,
        document_id: str,
        chunks: List[Dict[str, Any]],
    ) -> int:
        """
        Generate CLIP embeddings for text chunks.

        Args:
            document_id: Document ID
            chunks: List of text chunks with content

        Returns:
            Number of chunks embedded
        """
        embedded_count = 0

        for chunk in chunks:
            try:
                text = chunk.get("text", chunk.get("content", ""))
                if not text or len(text) < 10:
                    continue

                # Truncate to CLIP's max length (77 tokens ~ 300 chars)
                text_truncated = text[:300]

                embedding = self._encode_text(text_truncated)

                mm_chunk = MultimodalTextChunk(
                    document_id=document_id,
                    chunk_id=chunk.get("id"),
                    page_number=chunk.get("page_number"),
                    text_content=text,
                    text_type=chunk.get("type", "paragraph"),
                    clip_embedding=embedding.tolist(),
                    embedding_model=self.CLIP_MODEL,
                    metadata=chunk.get("metadata"),
                )
                self.db.add(mm_chunk)
                embedded_count += 1

            except Exception as e:
                logger.warning(
                    "text_embedding_failed",
                    document_id=document_id,
                    chunk_id=chunk.get("id"),
                    error=str(e),
                )

        self.db.commit()
        return embedded_count

    def _log_search(
        self,
        user_id: Optional[str],
        query_text: Optional[str],
        search_type: str,
        results_count: int,
        top_score: Optional[float],
        response_time_ms: int,
    ) -> None:
        """Log search for analytics."""
        log = MultimodalSearchLog(
            user_id=user_id,
            query_text=query_text,
            search_type=search_type,
            results_count=results_count,
            top_result_score=top_score,
            response_time_ms=response_time_ms,
        )
        self.db.add(log)
        self.db.commit()

    def get_search_stats(
        self,
        days: int = 30,
    ) -> Dict[str, Any]:
        """Get search statistics for analytics."""
        from datetime import timedelta

        cutoff = datetime.utcnow() - timedelta(days=days)

        # Total searches
        total = self.db.query(func.count(MultimodalSearchLog.id)).filter(
            MultimodalSearchLog.created_at >= cutoff
        ).scalar() or 0

        # By type
        by_type = (
            self.db.query(
                MultimodalSearchLog.search_type,
                func.count(MultimodalSearchLog.id),
            )
            .filter(MultimodalSearchLog.created_at >= cutoff)
            .group_by(MultimodalSearchLog.search_type)
            .all()
        )

        # Average response time
        avg_time = self.db.query(
            func.avg(MultimodalSearchLog.response_time_ms)
        ).filter(MultimodalSearchLog.created_at >= cutoff).scalar() or 0

        # Average results
        avg_results = self.db.query(
            func.avg(MultimodalSearchLog.results_count)
        ).filter(MultimodalSearchLog.created_at >= cutoff).scalar() or 0

        return {
            "total_searches": total,
            "by_type": {row[0]: row[1] for row in by_type},
            "avg_response_time_ms": round(avg_time, 2),
            "avg_results_count": round(avg_results, 2),
            "period_days": days,
        }

    def get_document_images(
        self,
        document_id: str,
        page_number: Optional[int] = None,
    ) -> List[DocumentImage]:
        """Get images for a document."""
        query = self.db.query(DocumentImage).filter(
            DocumentImage.document_id == document_id
        )
        if page_number:
            query = query.filter(DocumentImage.page_number == page_number)
        return query.order_by(DocumentImage.page_number, DocumentImage.image_index).all()

    def get_image(self, image_id: str) -> Optional[DocumentImage]:
        """Get a specific image."""
        return self.db.query(DocumentImage).filter(DocumentImage.id == image_id).first()

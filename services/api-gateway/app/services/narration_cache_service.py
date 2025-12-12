"""
Narration Cache Service for managing pre-generated TTS audio.

Provides:
- Cache lookup and management
- Batch generation of narrations
- Cache invalidation on content changes
- LRU-style cleanup for old narrations
"""

import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.models.audio_narration import AudioNarration
from app.models.document import Document
from app.services.audio_storage_service import AudioStorageService, get_audio_storage_service
from app.services.tts_service import TTSConfig, TTSService, get_tts_service
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

logger = get_logger(__name__)


class NarrationCacheService:
    """
    Service for managing cached page narrations.

    Coordinates between TTS generation, storage, and database records.
    """

    def __init__(
        self,
        db: Session,
        tts_service: Optional[TTSService] = None,
        storage_service: Optional[AudioStorageService] = None,
    ):
        self.db = db
        self.tts = tts_service or get_tts_service()
        self.storage = storage_service or get_audio_storage_service()

    def get_narration(
        self,
        document_id: str,
        page_number: int,
    ) -> Optional[AudioNarration]:
        """
        Get cached narration for a page.

        Args:
            document_id: Document UUID
            page_number: Page number (1-indexed)

        Returns:
            AudioNarration if found and ready, None otherwise
        """
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return None

        narration = (
            self.db.query(AudioNarration)
            .filter(
                and_(
                    AudioNarration.document_id == doc_uuid,
                    AudioNarration.page_number == page_number,
                    AudioNarration.status == "ready",
                )
            )
            .first()
        )

        if narration:
            # Update access timestamp
            narration.record_access()
            self.db.commit()

        return narration

    def get_narration_status(
        self,
        document_id: str,
        page_number: int,
    ) -> Dict[str, Any]:
        """
        Get status of narration for a page.

        Returns:
            Dict with status info
        """
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return {"status": "not_found", "error": "Invalid document ID"}

        narration = (
            self.db.query(AudioNarration)
            .filter(
                and_(
                    AudioNarration.document_id == doc_uuid,
                    AudioNarration.page_number == page_number,
                )
            )
            .first()
        )

        if not narration:
            return {
                "status": "not_generated",
                "document_id": document_id,
                "page_number": page_number,
            }

        return narration.to_dict()

    def get_document_narrations(
        self,
        document_id: str,
    ) -> List[AudioNarration]:
        """
        Get all narrations for a document.

        Returns:
            List of AudioNarration records
        """
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return []

        return (
            self.db.query(AudioNarration)
            .filter(AudioNarration.document_id == doc_uuid)
            .order_by(AudioNarration.page_number)
            .all()
        )

    def get_document_narration_summary(
        self,
        document_id: str,
    ) -> Dict[str, Any]:
        """
        Get summary of narration coverage for a document.

        Returns:
            Dict with coverage statistics
        """
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return {"error": "Invalid document ID"}

        # Get document info
        document = self.db.query(Document).filter_by(document_id=document_id).first()
        if not document:
            return {"error": "Document not found"}

        total_pages = document.total_pages or 0

        # Get narration counts by status
        status_counts = dict(
            self.db.query(AudioNarration.status, func.count(AudioNarration.id))
            .filter(AudioNarration.document_id == doc_uuid)
            .group_by(AudioNarration.status)
            .all()
        )

        ready_count = status_counts.get("ready", 0)
        generating_count = status_counts.get("generating", 0)
        pending_count = status_counts.get("pending", 0)
        failed_count = status_counts.get("failed", 0)

        # Total duration
        total_duration = (
            self.db.query(func.sum(AudioNarration.duration_seconds))
            .filter(
                and_(
                    AudioNarration.document_id == doc_uuid,
                    AudioNarration.status == "ready",
                )
            )
            .scalar()
            or 0
        )

        return {
            "document_id": document_id,
            "total_pages": total_pages,
            "ready": ready_count,
            "generating": generating_count,
            "pending": pending_count,
            "failed": failed_count,
            "coverage_percent": round((ready_count / total_pages) * 100, 1) if total_pages > 0 else 0,
            "total_duration_seconds": round(total_duration, 1),
            "total_duration_formatted": self._format_duration(total_duration),
        }

    async def generate_narration(
        self,
        document_id: str,
        page_number: int,
        narration_text: str,
        voice_config: Optional[Dict[str, Any]] = None,
        force_regenerate: bool = False,
    ) -> AudioNarration:
        """
        Generate and cache narration for a page.

        Args:
            document_id: Document UUID
            page_number: Page number
            narration_text: Text to synthesize
            voice_config: TTS voice configuration
            force_regenerate: Force regeneration even if cached

        Returns:
            AudioNarration record
        """
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            raise ValueError("Invalid document ID")

        text_hash = AudioNarration.hash_text(narration_text)

        # Check for existing narration
        existing = (
            self.db.query(AudioNarration)
            .filter(
                and_(
                    AudioNarration.document_id == doc_uuid,
                    AudioNarration.page_number == page_number,
                )
            )
            .first()
        )

        if existing:
            # Check if we can use cached version
            if (
                not force_regenerate
                and existing.status == "ready"
                and existing.narration_hash == text_hash
            ):
                existing.record_access()
                self.db.commit()
                logger.debug(f"Using cached narration for doc={document_id} page={page_number}")
                return existing

            # Update existing record
            narration = existing
            narration.narration_text = narration_text
            narration.narration_hash = text_hash
        else:
            # Create new record
            narration = AudioNarration(
                document_id=doc_uuid,
                page_number=page_number,
                narration_text=narration_text,
                narration_hash=text_hash,
            )
            self.db.add(narration)

        # Set configuration
        config = TTSConfig(
            voice_id=voice_config.get("voice_id", "alloy") if voice_config else "alloy",
            speed=voice_config.get("speed", 1.0) if voice_config else 1.0,
            format=voice_config.get("format", "mp3") if voice_config else "mp3",
            provider=voice_config.get("provider", "openai") if voice_config else "openai",
        )

        narration.voice_id = config.voice_id
        narration.voice_provider = config.provider
        narration.voice_settings = voice_config
        narration.audio_format = config.format
        narration.mark_generating()
        self.db.commit()

        try:
            # Synthesize audio
            logger.info(f"Generating narration for doc={document_id} page={page_number}")
            result = await self.tts.synthesize(narration_text, config)

            # Store audio
            storage_path = self.storage.store_audio(
                audio_bytes=result.audio_bytes,
                document_id=document_id,
                page_number=page_number,
                format=config.format,
            )

            # Calculate duration
            duration = self.storage.get_audio_duration(result.audio_bytes, config.format)

            # Update record
            narration.mark_ready(
                storage_path=storage_path,
                duration_seconds=duration,
                file_size_bytes=len(result.audio_bytes),
            )
            narration.sample_rate = result.sample_rate
            self.db.commit()

            logger.info(
                f"Generated narration: doc={document_id} page={page_number} "
                f"duration={duration:.1f}s size={len(result.audio_bytes)}"
            )

            return narration

        except Exception as e:
            narration.mark_failed(str(e))
            self.db.commit()
            logger.error(f"Failed to generate narration: {e}")
            raise

    async def generate_document_narrations(
        self,
        document_id: str,
        voice_config: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[callable] = None,
    ) -> Dict[str, Any]:
        """
        Generate narrations for all pages in a document.

        Args:
            document_id: Document UUID
            voice_config: TTS voice configuration
            progress_callback: Callback for progress updates (page_number, total_pages)

        Returns:
            Summary of generation results
        """
        # Get document with enhanced structure
        document = self.db.query(Document).filter_by(document_id=document_id).first()
        if not document:
            raise ValueError("Document not found")

        if not document.enhanced_structure:
            raise ValueError("Document has no enhanced structure with narrations")

        pages = document.enhanced_structure.get("pages", [])
        total_pages = len(pages)

        results = {
            "document_id": document_id,
            "total_pages": total_pages,
            "generated": 0,
            "cached": 0,
            "failed": 0,
            "errors": [],
        }

        for i, page_data in enumerate(pages):
            page_number = page_data.get("page_number", i + 1)
            narration_text = page_data.get("voice_narration", "")

            if not narration_text:
                results["failed"] += 1
                results["errors"].append(f"Page {page_number}: No narration text")
                continue

            try:
                narration = await self.generate_narration(
                    document_id=document_id,
                    page_number=page_number,
                    narration_text=narration_text,
                    voice_config=voice_config,
                )

                if narration.generated_at and (
                    datetime.utcnow() - narration.generated_at
                ).seconds < 5:
                    results["generated"] += 1
                else:
                    results["cached"] += 1

            except Exception as e:
                results["failed"] += 1
                results["errors"].append(f"Page {page_number}: {str(e)}")

            if progress_callback:
                progress_callback(i + 1, total_pages)

        return results

    def invalidate_narration(
        self,
        document_id: str,
        page_number: int,
    ) -> bool:
        """
        Invalidate (delete) cached narration for a page.

        Returns:
            True if deleted, False if not found
        """
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return False

        narration = (
            self.db.query(AudioNarration)
            .filter(
                and_(
                    AudioNarration.document_id == doc_uuid,
                    AudioNarration.page_number == page_number,
                )
            )
            .first()
        )

        if not narration:
            return False

        # Delete audio file
        if narration.storage_path:
            self.storage.delete_audio(narration.storage_path)

        # Delete record
        self.db.delete(narration)
        self.db.commit()

        return True

    def invalidate_document_narrations(
        self,
        document_id: str,
    ) -> int:
        """
        Invalidate all narrations for a document.

        Returns:
            Number of narrations deleted
        """
        # Delete audio files
        self.storage.delete_document_audio(document_id)

        # Delete records
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return 0

        deleted = (
            self.db.query(AudioNarration)
            .filter(AudioNarration.document_id == doc_uuid)
            .delete()
        )
        self.db.commit()

        return deleted

    def cleanup_old_narrations(
        self,
        days_since_access: int = 30,
        max_to_delete: int = 100,
    ) -> int:
        """
        Clean up narrations that haven't been accessed recently.

        Args:
            days_since_access: Delete narrations not accessed in this many days
            max_to_delete: Maximum number to delete in one call

        Returns:
            Number of narrations deleted
        """
        cutoff = datetime.utcnow() - timedelta(days=days_since_access)

        # Get old narrations
        old_narrations = (
            self.db.query(AudioNarration)
            .filter(
                and_(
                    AudioNarration.status == "ready",
                    AudioNarration.last_accessed_at < cutoff,
                )
            )
            .limit(max_to_delete)
            .all()
        )

        deleted = 0
        for narration in old_narrations:
            if narration.storage_path:
                self.storage.delete_audio(narration.storage_path)
            self.db.delete(narration)
            deleted += 1

        self.db.commit()
        return deleted

    def _format_duration(self, seconds: float) -> str:
        """Format duration in human-readable format."""
        if seconds < 60:
            return f"{int(seconds)}s"
        elif seconds < 3600:
            minutes = int(seconds // 60)
            secs = int(seconds % 60)
            return f"{minutes}m {secs}s"
        else:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            return f"{hours}h {minutes}m"


def get_narration_cache_service(db: Session) -> NarrationCacheService:
    """Factory function to get NarrationCacheService."""
    return NarrationCacheService(db)

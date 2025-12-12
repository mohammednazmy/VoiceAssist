"""
Audio Storage Service for managing TTS audio files.

Handles:
- Local file storage
- S3 storage (for production)
- Audio file metadata extraction
- Storage cleanup and management
"""

import io
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class AudioStorageService:
    """
    Service for storing and retrieving TTS audio files.

    Supports both local filesystem and S3 storage backends.
    """

    def __init__(
        self,
        storage_type: str = "local",
        base_path: Optional[str] = None,
        s3_bucket: Optional[str] = None,
    ):
        """
        Initialize audio storage service.

        Args:
            storage_type: 'local' or 's3'
            base_path: Base path for local storage
            s3_bucket: S3 bucket name for S3 storage
        """
        self.storage_type = storage_type
        self.base_path = Path(
            base_path or getattr(settings, "AUDIO_STORAGE_PATH", "./uploads/audio")
        )
        self.s3_bucket = s3_bucket or getattr(settings, "AUDIO_S3_BUCKET", None)

        # Ensure local storage directory exists
        if self.storage_type == "local":
            self.base_path.mkdir(parents=True, exist_ok=True)

        # Initialize S3 client if needed
        self._s3_client = None
        if self.storage_type == "s3" and self.s3_bucket:
            self._init_s3_client()

    def _init_s3_client(self) -> None:
        """Initialize S3 client."""
        try:
            import boto3

            self._s3_client = boto3.client(
                "s3",
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
                region_name=os.getenv("AWS_REGION", "us-east-1"),
            )
            logger.info(f"S3 client initialized for bucket: {self.s3_bucket}")
        except Exception as e:
            logger.warning(f"Failed to initialize S3 client: {e}")
            self.storage_type = "local"

    def store_audio(
        self,
        audio_bytes: bytes,
        document_id: str,
        page_number: int,
        format: str = "mp3",
    ) -> str:
        """
        Store audio file and return storage path.

        Args:
            audio_bytes: Audio data
            document_id: Document ID for organization
            page_number: Page number for filename
            format: Audio format extension

        Returns:
            Storage path (local path or S3 key)
        """
        # Generate organized path
        filename = f"page_{page_number}.{format}"
        relative_path = f"narrations/{document_id}/{filename}"

        if self.storage_type == "s3" and self._s3_client:
            return self._store_s3(audio_bytes, relative_path, format)
        else:
            return self._store_local(audio_bytes, relative_path)

    def _store_local(self, audio_bytes: bytes, relative_path: str) -> str:
        """Store audio file locally."""
        full_path = self.base_path / relative_path
        full_path.parent.mkdir(parents=True, exist_ok=True)

        with open(full_path, "wb") as f:
            f.write(audio_bytes)

        logger.debug(f"Stored audio locally: {full_path}")
        return str(full_path)

    def _store_s3(self, audio_bytes: bytes, s3_key: str, format: str) -> str:
        """Store audio file in S3."""
        content_type = {
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "opus": "audio/opus",
            "aac": "audio/aac",
        }.get(format, "audio/mpeg")

        self._s3_client.put_object(
            Bucket=self.s3_bucket,
            Key=s3_key,
            Body=audio_bytes,
            ContentType=content_type,
        )

        logger.debug(f"Stored audio in S3: s3://{self.s3_bucket}/{s3_key}")
        return s3_key

    def get_audio(self, storage_path: str) -> Optional[bytes]:
        """
        Retrieve audio file by storage path.

        Args:
            storage_path: Path returned from store_audio()

        Returns:
            Audio bytes or None if not found
        """
        if self.storage_type == "s3" and self._s3_client:
            return self._get_s3(storage_path)
        else:
            return self._get_local(storage_path)

    def _get_local(self, path: str) -> Optional[bytes]:
        """Get audio from local storage."""
        try:
            full_path = Path(path)
            if not full_path.is_absolute():
                full_path = self.base_path / path

            if full_path.exists():
                with open(full_path, "rb") as f:
                    return f.read()
            return None
        except Exception as e:
            logger.error(f"Failed to read local audio: {e}")
            return None

    def _get_s3(self, s3_key: str) -> Optional[bytes]:
        """Get audio from S3."""
        try:
            response = self._s3_client.get_object(
                Bucket=self.s3_bucket,
                Key=s3_key,
            )
            return response["Body"].read()
        except Exception as e:
            logger.error(f"Failed to read S3 audio: {e}")
            return None

    def stream_audio(self, storage_path: str, chunk_size: int = 8192):
        """
        Stream audio file in chunks.

        Yields:
            Chunks of audio data
        """
        if self.storage_type == "s3" and self._s3_client:
            yield from self._stream_s3(storage_path, chunk_size)
        else:
            yield from self._stream_local(storage_path, chunk_size)

    def _stream_local(self, path: str, chunk_size: int):
        """Stream audio from local storage."""
        full_path = Path(path)
        if not full_path.is_absolute():
            full_path = self.base_path / path

        if full_path.exists():
            with open(full_path, "rb") as f:
                while chunk := f.read(chunk_size):
                    yield chunk

    def _stream_s3(self, s3_key: str, chunk_size: int):
        """Stream audio from S3."""
        try:
            response = self._s3_client.get_object(
                Bucket=self.s3_bucket,
                Key=s3_key,
            )
            for chunk in response["Body"].iter_chunks(chunk_size):
                yield chunk
        except Exception as e:
            logger.error(f"Failed to stream S3 audio: {e}")

    def delete_audio(self, storage_path: str) -> bool:
        """
        Delete audio file.

        Returns:
            True if deleted, False otherwise
        """
        if self.storage_type == "s3" and self._s3_client:
            return self._delete_s3(storage_path)
        else:
            return self._delete_local(storage_path)

    def _delete_local(self, path: str) -> bool:
        """Delete audio from local storage."""
        try:
            full_path = Path(path)
            if not full_path.is_absolute():
                full_path = self.base_path / path

            if full_path.exists():
                full_path.unlink()
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete local audio: {e}")
            return False

    def _delete_s3(self, s3_key: str) -> bool:
        """Delete audio from S3."""
        try:
            self._s3_client.delete_object(
                Bucket=self.s3_bucket,
                Key=s3_key,
            )
            return True
        except Exception as e:
            logger.error(f"Failed to delete S3 audio: {e}")
            return False

    def delete_document_audio(self, document_id: str) -> int:
        """
        Delete all audio files for a document.

        Returns:
            Number of files deleted
        """
        if self.storage_type == "s3" and self._s3_client:
            return self._delete_document_s3(document_id)
        else:
            return self._delete_document_local(document_id)

    def _delete_document_local(self, document_id: str) -> int:
        """Delete all local audio for a document."""
        doc_path = self.base_path / "narrations" / document_id
        if not doc_path.exists():
            return 0

        import shutil

        file_count = len(list(doc_path.glob("*")))
        shutil.rmtree(doc_path)
        return file_count

    def _delete_document_s3(self, document_id: str) -> int:
        """Delete all S3 audio for a document."""
        prefix = f"narrations/{document_id}/"

        # List and delete objects
        paginator = self._s3_client.get_paginator("list_objects_v2")
        deleted = 0

        for page in paginator.paginate(Bucket=self.s3_bucket, Prefix=prefix):
            if "Contents" in page:
                objects = [{"Key": obj["Key"]} for obj in page["Contents"]]
                if objects:
                    self._s3_client.delete_objects(
                        Bucket=self.s3_bucket,
                        Delete={"Objects": objects},
                    )
                    deleted += len(objects)

        return deleted

    def get_audio_duration(self, audio_bytes: bytes, format: str = "mp3") -> float:
        """
        Get duration of audio in seconds.

        Args:
            audio_bytes: Audio data
            format: Audio format

        Returns:
            Duration in seconds
        """
        try:
            if format == "mp3":
                return self._get_mp3_duration(audio_bytes)
            elif format == "wav":
                return self._get_wav_duration(audio_bytes)
            else:
                # Fallback: estimate from file size
                # Rough estimate: 128kbps = 16KB/sec
                return len(audio_bytes) / 16000
        except Exception as e:
            logger.warning(f"Failed to get audio duration: {e}")
            return len(audio_bytes) / 16000

    def _get_mp3_duration(self, audio_bytes: bytes) -> float:
        """Get MP3 duration using mutagen."""
        try:
            from mutagen.mp3 import MP3

            audio = MP3(io.BytesIO(audio_bytes))
            return audio.info.length
        except ImportError:
            # mutagen not installed, use estimate
            return len(audio_bytes) / 16000
        except Exception as e:
            logger.warning(f"MP3 duration extraction failed: {e}")
            return len(audio_bytes) / 16000

    def _get_wav_duration(self, audio_bytes: bytes) -> float:
        """Get WAV duration from header."""
        import struct

        try:
            # WAV header parsing
            header = io.BytesIO(audio_bytes)
            header.seek(22)
            channels = struct.unpack("<H", header.read(2))[0]
            sample_rate = struct.unpack("<I", header.read(4))[0]
            header.seek(34)
            bits_per_sample = struct.unpack("<H", header.read(2))[0]

            # Data size is after "data" chunk header
            header.seek(40)
            data_size = struct.unpack("<I", header.read(4))[0]

            bytes_per_sample = bits_per_sample / 8
            num_samples = data_size / (channels * bytes_per_sample)
            return num_samples / sample_rate
        except Exception as e:
            logger.warning(f"WAV duration extraction failed: {e}")
            return len(audio_bytes) / 48000  # Assume 24-bit stereo 48kHz

    def get_storage_stats(self) -> Dict[str, Any]:
        """Get storage statistics."""
        if self.storage_type == "s3":
            return self._get_s3_stats()
        else:
            return self._get_local_stats()

    def _get_local_stats(self) -> Dict[str, Any]:
        """Get local storage statistics."""
        narrations_path = self.base_path / "narrations"
        if not narrations_path.exists():
            return {
                "storage_type": "local",
                "total_files": 0,
                "total_bytes": 0,
                "documents": 0,
            }

        total_files = 0
        total_bytes = 0
        documents = set()

        for file_path in narrations_path.rglob("*"):
            if file_path.is_file():
                total_files += 1
                total_bytes += file_path.stat().st_size
                # Extract document_id from path
                if file_path.parent.name != "narrations":
                    documents.add(file_path.parent.name)

        return {
            "storage_type": "local",
            "base_path": str(self.base_path),
            "total_files": total_files,
            "total_bytes": total_bytes,
            "total_mb": round(total_bytes / (1024 * 1024), 2),
            "documents": len(documents),
        }

    def _get_s3_stats(self) -> Dict[str, Any]:
        """Get S3 storage statistics."""
        # Note: This can be expensive for large buckets
        return {
            "storage_type": "s3",
            "bucket": self.s3_bucket,
            "prefix": "narrations/",
        }


# Singleton instance
_storage_service: Optional[AudioStorageService] = None


def get_audio_storage_service() -> AudioStorageService:
    """Get or create audio storage service singleton."""
    global _storage_service
    if _storage_service is None:
        storage_type = getattr(settings, "AUDIO_STORAGE_TYPE", "local")
        _storage_service = AudioStorageService(storage_type=storage_type)
    return _storage_service

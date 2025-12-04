"""
Speaker Diarization Service - Voice Mode v4.1 Phase 3

Multi-speaker detection and attribution for conversations using pyannote.audio.

Features:
- Real-time speaker change detection
- Speaker embedding database for recurring speakers
- Integration with Thinker for multi-party context
- Support for up to 4 concurrent speakers

Reference: docs/voice/phase3-implementation-plan.md

Feature Flag: backend.voice_v4_speaker_diarization
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.core.feature_flags import feature_flag_service

logger = logging.getLogger(__name__)


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class SpeakerSegment:
    """A segment of audio attributed to a speaker."""

    speaker_id: str
    start_ms: int
    end_ms: int
    confidence: float
    embedding: Optional[List[float]] = None

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms

    def to_dict(self) -> Dict[str, Any]:
        return {
            "speakerId": self.speaker_id,
            "startMs": self.start_ms,
            "endMs": self.end_ms,
            "confidence": round(self.confidence, 3),
            "durationMs": self.duration_ms,
        }


@dataclass
class SpeakerProfile:
    """Profile for a known/recurring speaker."""

    speaker_id: str
    name: Optional[str] = None
    embedding: Optional[List[float]] = None
    voice_samples: int = 0
    first_seen: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DiarizationResult:
    """Result of speaker diarization on an audio segment."""

    segments: List[SpeakerSegment]
    num_speakers: int
    total_duration_ms: int
    processing_time_ms: float
    model_version: str = "pyannote-3.1"

    def get_speaker_summary(self) -> Dict[str, int]:
        """Get total speaking time per speaker."""
        summary: Dict[str, int] = {}
        for seg in self.segments:
            summary[seg.speaker_id] = summary.get(seg.speaker_id, 0) + seg.duration_ms
        return summary

    def to_dict(self) -> Dict[str, Any]:
        return {
            "segments": [s.to_dict() for s in self.segments],
            "numSpeakers": self.num_speakers,
            "totalDurationMs": self.total_duration_ms,
            "processingTimeMs": round(self.processing_time_ms, 2),
            "modelVersion": self.model_version,
            "speakerSummary": self.get_speaker_summary(),
        }


class DiarizationMode(str, Enum):
    """Diarization processing mode."""

    OFFLINE = "offline"  # Process complete audio file
    STREAMING = "streaming"  # Real-time streaming diarization
    INCREMENTAL = "incremental"  # Process audio chunks incrementally


# ==============================================================================
# Configuration
# ==============================================================================


@dataclass
class DiarizationConfig:
    """Configuration for speaker diarization."""

    # Model settings
    model_name: str = "pyannote/speaker-diarization-3.1"
    use_gpu: bool = True
    device: str = "cuda"  # "cuda" or "cpu"

    # Detection settings
    min_speakers: int = 1
    max_speakers: int = 4
    min_segment_duration_ms: int = 200
    min_cluster_size: int = 3

    # Embedding settings
    embedding_model: str = "pyannote/embedding"
    embedding_dim: int = 512
    similarity_threshold: float = 0.75  # For speaker matching

    # Streaming settings
    chunk_duration_ms: int = 1000
    overlap_duration_ms: int = 200

    # Performance settings
    max_processing_time_ms: int = 500  # Target latency


# ==============================================================================
# Speaker Diarization Service
# ==============================================================================


class SpeakerDiarizationService:
    """
    Service for multi-speaker detection and attribution.

    Uses pyannote.audio for state-of-the-art speaker diarization.
    Supports both offline and streaming modes.

    Usage:
        service = SpeakerDiarizationService()
        await service.initialize()

        # Offline mode
        result = await service.process_audio(audio_bytes)

        # Streaming mode
        async for segment in service.stream_diarization(audio_stream):
            print(f"Speaker {segment.speaker_id}: {segment.start_ms}-{segment.end_ms}")
    """

    def __init__(self, config: Optional[DiarizationConfig] = None):
        self.config = config or DiarizationConfig()
        self._pipeline = None
        self._embedding_model = None
        self._speaker_profiles: Dict[str, SpeakerProfile] = {}
        self._initialized = False
        self._lock = asyncio.Lock()

    async def initialize(self) -> bool:
        """
        Initialize the diarization pipeline.

        Returns:
            True if initialization successful, False otherwise.
        """
        if self._initialized:
            return True

        async with self._lock:
            if self._initialized:
                return True

            try:
                # Check feature flag
                if not await feature_flag_service.is_enabled(
                    "backend.voice_v4_speaker_diarization"
                ):
                    logger.info("Speaker diarization feature flag is disabled")
                    return False

                # Lazy import pyannote to avoid loading if not needed
                from pyannote.audio import Pipeline

                logger.info(
                    f"Loading diarization model: {self.config.model_name}",
                    extra={"device": self.config.device},
                )

                # Load the diarization pipeline
                self._pipeline = Pipeline.from_pretrained(
                    self.config.model_name,
                    use_auth_token=settings.huggingface_token,
                )

                # Move to GPU if available
                if self.config.use_gpu:
                    import torch

                    if torch.cuda.is_available():
                        self._pipeline.to(torch.device(self.config.device))
                        logger.info("Diarization pipeline moved to GPU")
                    else:
                        logger.warning("GPU requested but not available, using CPU")

                self._initialized = True
                logger.info("Speaker diarization service initialized successfully")
                return True

            except ImportError as e:
                logger.error(f"Failed to import pyannote: {e}")
                logger.info("Install with: pip install pyannote.audio")
                return False
            except Exception as e:
                logger.error(f"Failed to initialize diarization service: {e}")
                return False

    async def process_audio(
        self,
        audio_data: bytes,
        sample_rate: int = 16000,
        num_speakers: Optional[int] = None,
    ) -> Optional[DiarizationResult]:
        """
        Process audio and detect speakers (offline mode).

        Args:
            audio_data: Raw audio bytes (WAV format)
            sample_rate: Audio sample rate (default 16kHz)
            num_speakers: Expected number of speakers (optional)

        Returns:
            DiarizationResult with speaker segments, or None on failure.
        """
        if not self._initialized:
            if not await self.initialize():
                return None

        start_time = time.monotonic()

        try:
            import io

            import numpy as np
            import torch
            from scipy.io import wavfile

            # Convert bytes to numpy array
            audio_file = io.BytesIO(audio_data)
            sr, audio_np = wavfile.read(audio_file)

            # Resample if needed
            if sr != sample_rate:
                from scipy import signal

                audio_np = signal.resample(
                    audio_np, int(len(audio_np) * sample_rate / sr)
                )

            # Normalize to float32
            if audio_np.dtype == np.int16:
                audio_np = audio_np.astype(np.float32) / 32768.0

            # Create torch tensor
            waveform = torch.from_numpy(audio_np).unsqueeze(0)

            # Run diarization
            diarization_params = {}
            if num_speakers:
                diarization_params["num_speakers"] = num_speakers
            elif self.config.min_speakers == self.config.max_speakers:
                diarization_params["num_speakers"] = self.config.max_speakers
            else:
                diarization_params["min_speakers"] = self.config.min_speakers
                diarization_params["max_speakers"] = self.config.max_speakers

            diarization = self._pipeline(
                {"waveform": waveform, "sample_rate": sample_rate},
                **diarization_params,
            )

            # Convert to segments
            segments = []
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                segment = SpeakerSegment(
                    speaker_id=speaker,
                    start_ms=int(turn.start * 1000),
                    end_ms=int(turn.end * 1000),
                    confidence=0.85,  # pyannote doesn't provide per-segment confidence
                )
                segments.append(segment)

            # Count unique speakers
            unique_speakers = set(s.speaker_id for s in segments)

            processing_time_ms = (time.monotonic() - start_time) * 1000
            total_duration_ms = int(len(audio_np) / sample_rate * 1000)

            result = DiarizationResult(
                segments=segments,
                num_speakers=len(unique_speakers),
                total_duration_ms=total_duration_ms,
                processing_time_ms=processing_time_ms,
            )

            logger.info(
                "Diarization complete",
                extra={
                    "num_speakers": result.num_speakers,
                    "num_segments": len(segments),
                    "duration_ms": total_duration_ms,
                    "processing_ms": processing_time_ms,
                },
            )

            return result

        except Exception as e:
            logger.error(f"Diarization failed: {e}")
            return None

    async def stream_diarization(
        self,
        audio_stream,
        sample_rate: int = 16000,
    ):
        """
        Stream speaker diarization for real-time audio.

        Args:
            audio_stream: Async generator yielding audio chunks
            sample_rate: Audio sample rate

        Yields:
            SpeakerSegment for each detected speaker change.
        """
        if not self._initialized:
            if not await self.initialize():
                return

        # Placeholder for streaming implementation
        # Real implementation would use incremental diarization
        logger.warning("Streaming diarization not yet implemented - using chunked mode")

        buffer = bytearray()
        chunk_size = int(sample_rate * self.config.chunk_duration_ms / 1000 * 2)

        async for audio_chunk in audio_stream:
            buffer.extend(audio_chunk)

            if len(buffer) >= chunk_size:
                # Process chunk
                result = await self.process_audio(bytes(buffer), sample_rate)
                if result:
                    for segment in result.segments:
                        yield segment

                # Keep overlap for continuity
                overlap_bytes = int(
                    sample_rate * self.config.overlap_duration_ms / 1000 * 2
                )
                buffer = buffer[-overlap_bytes:]

    def get_speaker_profile(self, speaker_id: str) -> Optional[SpeakerProfile]:
        """Get or create speaker profile."""
        if speaker_id not in self._speaker_profiles:
            self._speaker_profiles[speaker_id] = SpeakerProfile(speaker_id=speaker_id)
        return self._speaker_profiles.get(speaker_id)

    def update_speaker_profile(
        self,
        speaker_id: str,
        name: Optional[str] = None,
        embedding: Optional[List[float]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> SpeakerProfile:
        """Update speaker profile with new information."""
        profile = self.get_speaker_profile(speaker_id)
        if profile:
            if name:
                profile.name = name
            if embedding:
                profile.embedding = embedding
            if metadata:
                profile.metadata.update(metadata)
            profile.last_seen = datetime.now(timezone.utc)
            profile.voice_samples += 1
        return profile

    async def match_speaker(
        self,
        embedding: List[float],
        threshold: Optional[float] = None,
    ) -> Optional[Tuple[str, float]]:
        """
        Match an embedding to known speakers.

        Args:
            embedding: Speaker embedding vector
            threshold: Similarity threshold (default from config)

        Returns:
            Tuple of (speaker_id, similarity_score) or None if no match.
        """
        threshold = threshold or self.config.similarity_threshold
        best_match: Optional[Tuple[str, float]] = None

        for speaker_id, profile in self._speaker_profiles.items():
            if profile.embedding:
                similarity = self._compute_similarity(embedding, profile.embedding)
                if similarity >= threshold:
                    if best_match is None or similarity > best_match[1]:
                        best_match = (speaker_id, similarity)

        return best_match

    def _compute_similarity(
        self, embedding1: List[float], embedding2: List[float]
    ) -> float:
        """Compute cosine similarity between embeddings."""
        import numpy as np

        e1 = np.array(embedding1)
        e2 = np.array(embedding2)

        dot_product = np.dot(e1, e2)
        norm1 = np.linalg.norm(e1)
        norm2 = np.linalg.norm(e2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(dot_product / (norm1 * norm2))


# ==============================================================================
# Singleton Instance
# ==============================================================================

_speaker_diarization_service: Optional[SpeakerDiarizationService] = None


def get_speaker_diarization_service() -> SpeakerDiarizationService:
    """Get or create speaker diarization service instance."""
    global _speaker_diarization_service
    if _speaker_diarization_service is None:
        _speaker_diarization_service = SpeakerDiarizationService()
    return _speaker_diarization_service

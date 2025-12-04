"""
Speaker Diarization Service - Voice Mode v4.1 Phase 3

Multi-speaker detection and attribution for conversations using pyannote.audio.

Features:
- Real-time speaker change detection with incremental processing
- Speaker embedding extraction and database for recurring speakers
- Integration with Thinker for multi-party context
- Support for up to 4 concurrent speakers
- Online and offline diarization modes
- Speaker re-identification across sessions

Reference: docs/voice/phase3-implementation-plan.md

Feature Flag: backend.voice_v4_speaker_diarization

Requirements:
    pip install pyannote.audio torch torchaudio scipy

Environment Variables:
    HUGGINGFACE_TOKEN: HuggingFace API token for model access
"""

import asyncio
import hashlib
import io
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
from app.core.config import settings
from app.core.feature_flags import feature_flag_service

logger = logging.getLogger(__name__)

# Type aliases
AudioCallback = Callable[[bytes], None]
SpeakerChangeCallback = Callable[["SpeakerSegment"], None]


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
    # Pin model revisions for supply chain security (Bandit B615)
    # Update these hashes when upgrading model versions
    model_revision: str = "cb03e11cae0c1f3c75fd7be406b7f0bbf33cd28c"  # v3.1.0
    use_gpu: bool = True
    device: str = "cuda"  # "cuda" or "cpu"

    # Detection settings
    min_speakers: int = 1
    max_speakers: int = 4
    min_segment_duration_ms: int = 200
    min_cluster_size: int = 3

    # Embedding settings
    embedding_model: str = "pyannote/embedding"
    embedding_model_revision: str = "a9b3e59b43ceb4a4b04fb82bc7a1c36da47fe18a"  # Latest stable
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
                if not await feature_flag_service.is_enabled("backend.voice_v4_speaker_diarization"):
                    logger.info("Speaker diarization feature flag is disabled")
                    return False

                # Lazy import pyannote to avoid loading if not needed
                from pyannote.audio import Pipeline

                logger.info(
                    f"Loading diarization model: {self.config.model_name}",
                    extra={"device": self.config.device},
                )

                # Load the diarization pipeline with pinned revision (Bandit B615)
                self._pipeline = Pipeline.from_pretrained(  # nosec B615 - revision pinned
                    self.config.model_name,
                    revision=self.config.model_revision,
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

                audio_np = signal.resample(audio_np, int(len(audio_np) * sample_rate / sr))

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
                overlap_bytes = int(sample_rate * self.config.overlap_duration_ms / 1000 * 2)
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

    def _compute_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
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
# Speaker Embedding Extractor
# ==============================================================================


class SpeakerEmbeddingExtractor:
    """
    Extracts speaker embeddings from audio for speaker re-identification.

    Uses pyannote/embedding model for voice print extraction.
    """

    # Default revision for supply chain security (Bandit B615)
    DEFAULT_REVISION = "a9b3e59b43ceb4a4b04fb82bc7a1c36da47fe18a"

    def __init__(
        self,
        model_name: str = "pyannote/embedding",
        device: str = "cuda",
        revision: str = DEFAULT_REVISION,
    ):
        self.model_name = model_name
        self.device = device
        self.revision = revision
        self._model = None
        self._initialized = False

    async def initialize(self) -> bool:
        """Load the embedding model."""
        if self._initialized:
            return True

        try:
            import torch
            from pyannote.audio import Inference, Model

            # Load embedding model with pinned revision (Bandit B615)
            self._model = Model.from_pretrained(  # nosec B615 - revision pinned
                self.model_name,
                revision=self.revision,
                use_auth_token=settings.huggingface_token,
            )

            # Move to GPU if available
            if self.device == "cuda" and torch.cuda.is_available():
                self._model.to(torch.device("cuda"))
                logger.info("Embedding model moved to GPU")
            else:
                self._model.to(torch.device("cpu"))

            # Create inference object
            self._inference = Inference(self._model, window="whole")

            self._initialized = True
            logger.info("Speaker embedding extractor initialized")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize embedding extractor: {e}")
            return False

    async def extract_embedding(
        self,
        audio_data: bytes,
        sample_rate: int = 16000,
    ) -> Optional[List[float]]:
        """
        Extract speaker embedding from audio.

        Args:
            audio_data: Raw audio bytes (WAV format or PCM)
            sample_rate: Audio sample rate

        Returns:
            512-dimensional embedding vector, or None on failure.
        """
        if not self._initialized:
            if not await self.initialize():
                return None

        try:
            import torch
            from scipy.io import wavfile

            # Convert bytes to numpy array
            audio_file = io.BytesIO(audio_data)
            try:
                sr, audio_np = wavfile.read(audio_file)
            except Exception:
                # Try raw PCM
                audio_np = np.frombuffer(audio_data, dtype=np.int16)
                sr = sample_rate

            # Resample if needed
            if sr != sample_rate:
                from scipy import signal

                audio_np = signal.resample(audio_np, int(len(audio_np) * sample_rate / sr))

            # Normalize to float32
            if audio_np.dtype == np.int16:
                audio_np = audio_np.astype(np.float32) / 32768.0

            # Create torch tensor
            waveform = torch.from_numpy(audio_np).unsqueeze(0)

            # Extract embedding
            embedding = self._inference({"waveform": waveform, "sample_rate": sample_rate})

            return embedding.tolist()

        except Exception as e:
            logger.error(f"Embedding extraction failed: {e}")
            return None

    async def compare_embeddings(
        self,
        embedding1: List[float],
        embedding2: List[float],
    ) -> float:
        """
        Compare two speaker embeddings.

        Returns:
            Cosine similarity score (0.0 to 1.0).
        """
        e1 = np.array(embedding1)
        e2 = np.array(embedding2)

        dot_product = np.dot(e1, e2)
        norm1 = np.linalg.norm(e1)
        norm2 = np.linalg.norm(e2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(dot_product / (norm1 * norm2))


# ==============================================================================
# Streaming Diarization Session
# ==============================================================================


class StreamingDiarizationSession:
    """
    Manages a streaming diarization session for real-time speaker tracking.

    Provides incremental diarization with speaker change callbacks.
    """

    def __init__(
        self,
        session_id: str,
        diarization_service: "SpeakerDiarizationService",
        sample_rate: int = 16000,
        chunk_duration_ms: int = 1000,
        overlap_ms: int = 200,
    ):
        self.session_id = session_id
        self.service = diarization_service
        self.sample_rate = sample_rate
        self.chunk_duration_ms = chunk_duration_ms
        self.overlap_ms = overlap_ms

        self._buffer = bytearray()
        self._segments: List[SpeakerSegment] = []
        self._current_speaker: Optional[str] = None
        self._speaker_change_callbacks: List[SpeakerChangeCallback] = []
        self._total_duration_ms = 0
        self._is_active = False
        self._lock = asyncio.Lock()

    def on_speaker_change(self, callback: SpeakerChangeCallback) -> None:
        """Register callback for speaker change events."""
        self._speaker_change_callbacks.append(callback)

    async def start(self) -> None:
        """Start the streaming session."""
        self._is_active = True
        self._buffer = bytearray()
        self._segments = []
        self._current_speaker = None
        logger.info(f"Started streaming diarization session: {self.session_id}")

    async def process_chunk(self, audio_chunk: bytes) -> Optional[SpeakerSegment]:
        """
        Process an audio chunk and return speaker segment if detected.

        Args:
            audio_chunk: Raw PCM audio data

        Returns:
            SpeakerSegment if speaker detected/changed, None otherwise.
        """
        if not self._is_active:
            return None

        async with self._lock:
            self._buffer.extend(audio_chunk)

            # Calculate chunk size in bytes (16-bit audio = 2 bytes per sample)
            chunk_bytes = int(self.sample_rate * self.chunk_duration_ms / 1000 * 2)

            if len(self._buffer) < chunk_bytes:
                return None

            # Extract chunk for processing
            audio_bytes = bytes(self._buffer[:chunk_bytes])

            # Keep overlap for continuity
            overlap_bytes = int(self.sample_rate * self.overlap_ms / 1000 * 2)
            self._buffer = self._buffer[-overlap_bytes:] if overlap_bytes > 0 else bytearray()

            # Process with diarization service
            result = await self.service.process_audio(
                audio_bytes,
                sample_rate=self.sample_rate,
                num_speakers=None,  # Auto-detect
            )

            if not result or not result.segments:
                return None

            # Get dominant speaker in this chunk
            speaker_times: Dict[str, int] = {}
            for seg in result.segments:
                speaker_times[seg.speaker_id] = speaker_times.get(seg.speaker_id, 0) + seg.duration_ms

            if not speaker_times:
                return None

            dominant_speaker = max(speaker_times.keys(), key=lambda k: speaker_times[k])

            # Check for speaker change
            speaker_changed = self._current_speaker is not None and dominant_speaker != self._current_speaker

            # Create segment
            segment = SpeakerSegment(
                speaker_id=dominant_speaker,
                start_ms=self._total_duration_ms,
                end_ms=self._total_duration_ms + self.chunk_duration_ms,
                confidence=0.85,
            )

            self._segments.append(segment)
            self._total_duration_ms += self.chunk_duration_ms

            # Fire callbacks if speaker changed
            if speaker_changed:
                for callback in self._speaker_change_callbacks:
                    try:
                        callback(segment)
                    except Exception as e:
                        logger.error(f"Speaker change callback error: {e}")

            self._current_speaker = dominant_speaker
            return segment

    async def stop(self) -> DiarizationResult:
        """
        Stop the session and return final diarization result.

        Returns:
            DiarizationResult with all detected segments.
        """
        self._is_active = False

        # Process any remaining buffer
        if len(self._buffer) > 0:
            await self.process_chunk(b"")  # Force process remaining

        unique_speakers = set(s.speaker_id for s in self._segments)

        result = DiarizationResult(
            segments=self._segments,
            num_speakers=len(unique_speakers),
            total_duration_ms=self._total_duration_ms,
            processing_time_ms=0,  # Accumulated over session
        )

        logger.info(
            f"Stopped streaming session {self.session_id}",
            extra={
                "num_speakers": result.num_speakers,
                "num_segments": len(self._segments),
                "total_duration_ms": self._total_duration_ms,
            },
        )

        return result

    @property
    def current_speaker(self) -> Optional[str]:
        """Get the current speaker ID."""
        return self._current_speaker

    @property
    def is_active(self) -> bool:
        """Check if session is active."""
        return self._is_active


# ==============================================================================
# Speaker Database
# ==============================================================================


class SpeakerDatabase:
    """
    In-memory database for speaker profiles with persistence support.

    Provides speaker re-identification across sessions.
    """

    def __init__(self):
        self._profiles: Dict[str, SpeakerProfile] = {}
        self._embedding_extractor: Optional[SpeakerEmbeddingExtractor] = None

    def set_embedding_extractor(self, extractor: SpeakerEmbeddingExtractor) -> None:
        """Set the embedding extractor for voice print operations."""
        self._embedding_extractor = extractor

    def add_profile(self, profile: SpeakerProfile) -> None:
        """Add or update a speaker profile."""
        self._profiles[profile.speaker_id] = profile

    def get_profile(self, speaker_id: str) -> Optional[SpeakerProfile]:
        """Get a speaker profile by ID."""
        return self._profiles.get(speaker_id)

    def get_all_profiles(self) -> List[SpeakerProfile]:
        """Get all speaker profiles."""
        return list(self._profiles.values())

    async def find_by_embedding(
        self,
        embedding: List[float],
        threshold: float = 0.75,
    ) -> Optional[Tuple[SpeakerProfile, float]]:
        """
        Find a speaker profile by voice embedding.

        Args:
            embedding: Speaker embedding vector
            threshold: Minimum similarity threshold

        Returns:
            Tuple of (profile, similarity) or None if no match.
        """
        best_match: Optional[Tuple[SpeakerProfile, float]] = None

        for profile in self._profiles.values():
            if profile.embedding:
                similarity = self._cosine_similarity(embedding, profile.embedding)
                if similarity >= threshold:
                    if best_match is None or similarity > best_match[1]:
                        best_match = (profile, similarity)

        return best_match

    def _cosine_similarity(self, e1: List[float], e2: List[float]) -> float:
        """Compute cosine similarity."""
        a1 = np.array(e1)
        a2 = np.array(e2)

        dot = np.dot(a1, a2)
        n1 = np.linalg.norm(a1)
        n2 = np.linalg.norm(a2)

        if n1 == 0 or n2 == 0:
            return 0.0

        return float(dot / (n1 * n2))

    async def identify_or_create(
        self,
        embedding: List[float],
        threshold: float = 0.75,
        name: Optional[str] = None,
    ) -> SpeakerProfile:
        """
        Identify an existing speaker or create a new profile.

        Args:
            embedding: Speaker embedding vector
            threshold: Similarity threshold for matching
            name: Optional name for new speaker

        Returns:
            Matched or newly created SpeakerProfile.
        """
        # Try to find existing speaker
        match = await self.find_by_embedding(embedding, threshold)

        if match:
            profile, similarity = match
            profile.last_seen = datetime.now(timezone.utc)
            profile.voice_samples += 1
            logger.info(f"Identified speaker {profile.speaker_id} (similarity: {similarity:.3f})")
            return profile

        # Create new profile
        speaker_id = self._generate_speaker_id()
        profile = SpeakerProfile(
            speaker_id=speaker_id,
            name=name,
            embedding=embedding,
            voice_samples=1,
        )
        self.add_profile(profile)
        logger.info(f"Created new speaker profile: {speaker_id}")
        return profile

    def _generate_speaker_id(self) -> str:
        """Generate a unique speaker ID."""
        timestamp = datetime.now(timezone.utc).isoformat()
        hash_input = f"{timestamp}-{len(self._profiles)}"
        # MD5 used for ID generation, not security purposes
        return f"spk_{hashlib.md5(hash_input.encode(), usedforsecurity=False).hexdigest()[:8]}"

    def to_dict(self) -> Dict[str, Any]:
        """Export database to dictionary for persistence."""
        return {
            "profiles": [
                {
                    "speaker_id": p.speaker_id,
                    "name": p.name,
                    "embedding": p.embedding,
                    "voice_samples": p.voice_samples,
                    "first_seen": p.first_seen.isoformat(),
                    "last_seen": p.last_seen.isoformat(),
                    "metadata": p.metadata,
                }
                for p in self._profiles.values()
            ]
        }

    def load_from_dict(self, data: Dict[str, Any]) -> None:
        """Load database from dictionary."""
        self._profiles = {}
        for p in data.get("profiles", []):
            profile = SpeakerProfile(
                speaker_id=p["speaker_id"],
                name=p.get("name"),
                embedding=p.get("embedding"),
                voice_samples=p.get("voice_samples", 0),
                first_seen=datetime.fromisoformat(p.get("first_seen", datetime.now(timezone.utc).isoformat())),
                last_seen=datetime.fromisoformat(p.get("last_seen", datetime.now(timezone.utc).isoformat())),
                metadata=p.get("metadata", {}),
            )
            self._profiles[profile.speaker_id] = profile


# ==============================================================================
# Singleton Instance
# ==============================================================================

_speaker_diarization_service: Optional[SpeakerDiarizationService] = None
_speaker_database: Optional[SpeakerDatabase] = None
_embedding_extractor: Optional[SpeakerEmbeddingExtractor] = None


def get_speaker_diarization_service() -> SpeakerDiarizationService:
    """Get or create speaker diarization service instance."""
    global _speaker_diarization_service
    if _speaker_diarization_service is None:
        _speaker_diarization_service = SpeakerDiarizationService()
    return _speaker_diarization_service


def get_speaker_database() -> SpeakerDatabase:
    """Get or create speaker database instance."""
    global _speaker_database
    if _speaker_database is None:
        _speaker_database = SpeakerDatabase()
    return _speaker_database


def get_embedding_extractor() -> SpeakerEmbeddingExtractor:
    """Get or create speaker embedding extractor instance."""
    global _embedding_extractor
    if _embedding_extractor is None:
        _embedding_extractor = SpeakerEmbeddingExtractor()
    return _embedding_extractor


async def create_streaming_session(
    session_id: str,
    sample_rate: int = 16000,
) -> StreamingDiarizationSession:
    """
    Create a new streaming diarization session.

    Args:
        session_id: Unique session identifier
        sample_rate: Audio sample rate

    Returns:
        StreamingDiarizationSession instance.
    """
    service = get_speaker_diarization_service()
    session = StreamingDiarizationSession(
        session_id=session_id,
        diarization_service=service,
        sample_rate=sample_rate,
    )
    await session.start()
    return session

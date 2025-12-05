"""
Local Whisper Service - PHI-Safe On-Premise Speech-to-Text

Voice Mode v4 - Phase 1 Foundation (Privacy & Compliance)

Provides local STT transcription using OpenAI Whisper for:
- PHI-containing sessions (data stays on-premise)
- Offline/air-gapped environments
- Reduced cloud dependency
- HIPAA-compliant transcription

Targets <500ms latency with GPU acceleration.
"""

import asyncio
import logging
import os
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import numpy as np

logger = logging.getLogger(__name__)


class WhisperModelSize(Enum):
    """Available Whisper model sizes."""

    TINY = "tiny"  # 39M params, ~1GB VRAM, fastest
    BASE = "base"  # 74M params, ~1GB VRAM
    SMALL = "small"  # 244M params, ~2GB VRAM
    MEDIUM = "medium"  # 769M params, ~5GB VRAM
    LARGE = "large"  # 1550M params, ~10GB VRAM, most accurate
    LARGE_V2 = "large-v2"  # Improved large model
    LARGE_V3 = "large-v3"  # Latest large model


class TranscriptionLanguage(Enum):
    """Supported transcription languages."""

    ENGLISH = "en"
    ARABIC = "ar"
    SPANISH = "es"
    FRENCH = "fr"
    GERMAN = "de"
    CHINESE = "zh"
    HINDI = "hi"
    URDU = "ur"
    AUTO = "auto"  # Auto-detect


class ComputeDevice(Enum):
    """Compute device for inference."""

    CPU = "cpu"
    CUDA = "cuda"
    MPS = "mps"  # Apple Silicon
    AUTO = "auto"


@dataclass
class WhisperConfig:
    """Configuration for local Whisper service."""

    # Model settings
    model_size: WhisperModelSize = WhisperModelSize.BASE
    compute_device: ComputeDevice = ComputeDevice.AUTO
    compute_type: str = "float16"  # float16, int8, float32

    # Model paths
    model_cache_dir: str = "/opt/whisper-models"
    download_models: bool = True

    # Transcription settings
    default_language: TranscriptionLanguage = TranscriptionLanguage.AUTO
    task: str = "transcribe"  # transcribe or translate
    beam_size: int = 5
    best_of: int = 5
    temperature: float = 0.0  # 0 for greedy, higher for sampling

    # VAD settings
    vad_enabled: bool = True
    vad_threshold: float = 0.5
    min_speech_duration_ms: int = 250
    max_speech_duration_s: int = 30

    # Performance
    enable_batching: bool = True
    batch_size: int = 16
    chunk_length_s: int = 30

    # Quality
    word_timestamps: bool = True
    condition_on_previous_text: bool = True
    compression_ratio_threshold: float = 2.4
    logprob_threshold: float = -1.0
    no_speech_threshold: float = 0.6


@dataclass
class TranscriptionResult:
    """Result of a transcription."""

    text: str
    language: str
    language_probability: float
    segments: List["TranscriptionSegment"]
    duration_seconds: float
    processing_time_ms: float
    model_size: str
    is_phi_safe: bool = True  # Always true for local processing

    @property
    def words_per_minute(self) -> float:
        word_count = len(self.text.split())
        if self.duration_seconds > 0:
            return (word_count / self.duration_seconds) * 60
        return 0.0


@dataclass
class TranscriptionSegment:
    """A segment of transcribed text."""

    id: int
    start: float  # Start time in seconds
    end: float  # End time in seconds
    text: str
    confidence: float
    words: List["TranscriptionWord"] = field(default_factory=list)

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass
class TranscriptionWord:
    """A word with timing information."""

    word: str
    start: float
    end: float
    probability: float


@dataclass
class WhisperMetrics:
    """Metrics for Whisper service performance."""

    total_transcriptions: int = 0
    total_audio_seconds: float = 0.0
    total_processing_ms: float = 0.0
    avg_latency_ms: float = 0.0
    avg_real_time_factor: float = 0.0  # Processing time / audio duration
    languages_detected: Dict[str, int] = field(default_factory=dict)
    model_loads: int = 0
    gpu_memory_mb: float = 0.0
    errors: int = 0

    @property
    def throughput_factor(self) -> float:
        """How much faster than real-time (>1 = faster)."""
        if self.avg_real_time_factor > 0:
            return 1.0 / self.avg_real_time_factor
        return 0.0


class LocalWhisperService:
    """
    Local Whisper STT service for PHI-safe transcription.

    Uses OpenAI Whisper models running locally for HIPAA-compliant
    speech-to-text without sending data to external services.
    """

    def __init__(self, config: Optional[WhisperConfig] = None):
        self.config = config or WhisperConfig()
        self._initialized = False
        self._model = None
        self._processor = None
        self._device = None
        self._metrics = WhisperMetrics()

        # Lazy imports
        self._whisper = None
        self._torch = None

    async def initialize(self) -> bool:
        """
        Initialize the Whisper model.

        Returns:
            True if initialization successful
        """
        if self._initialized:
            return True

        try:
            logger.info(
                "Initializing LocalWhisperService",
                extra={
                    "model_size": self.config.model_size.value,
                    "device": self.config.compute_device.value,
                    "cache_dir": self.config.model_cache_dir,
                },
            )

            # Import dependencies
            await self._load_dependencies()

            # Determine compute device
            self._device = await self._get_compute_device()

            # Load model
            await self._load_model()

            self._initialized = True
            self._metrics.model_loads += 1

            logger.info(
                f"LocalWhisperService initialized on {self._device}", extra={"model": self.config.model_size.value}
            )

            return True

        except Exception as e:
            logger.error(f"Failed to initialize LocalWhisperService: {e}")
            self._metrics.errors += 1
            return False

    async def _load_dependencies(self) -> None:
        """Lazy load heavy dependencies."""
        try:
            import torch

            self._torch = torch
        except ImportError:
            logger.warning("PyTorch not available, using CPU-only mode")
            self._torch = None

        # Try faster-whisper first (CTranslate2 backend)
        try:
            import faster_whisper

            self._whisper = faster_whisper
            self._whisper_backend = "faster-whisper"
            logger.info("Using faster-whisper backend (CTranslate2)")
        except ImportError:
            # Fall back to openai-whisper
            try:
                import whisper

                self._whisper = whisper
                self._whisper_backend = "openai-whisper"
                logger.info("Using openai-whisper backend")
            except ImportError:
                raise ImportError("No Whisper implementation found. " "Install faster-whisper or openai-whisper")

    async def _get_compute_device(self) -> str:
        """Determine the best compute device."""
        if self.config.compute_device != ComputeDevice.AUTO:
            return self.config.compute_device.value

        if self._torch is None:
            return "cpu"

        if self._torch.cuda.is_available():
            device = "cuda"
            # Log GPU info
            gpu_name = self._torch.cuda.get_device_name(0)
            gpu_mem = self._torch.cuda.get_device_properties(0).total_memory / 1e9
            logger.info(f"Using CUDA: {gpu_name} ({gpu_mem:.1f}GB)")
            self._metrics.gpu_memory_mb = gpu_mem * 1024
        elif hasattr(self._torch.backends, "mps") and self._torch.backends.mps.is_available():
            device = "mps"
            logger.info("Using Apple Silicon MPS")
        else:
            device = "cpu"
            logger.info("Using CPU (no GPU available)")

        return device

    async def _load_model(self) -> None:
        """Load the Whisper model."""
        model_name = self.config.model_size.value

        # Ensure cache directory exists
        os.makedirs(self.config.model_cache_dir, exist_ok=True)

        if self._whisper_backend == "faster-whisper":
            # faster-whisper uses CTranslate2 format
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                model_name,
                device=self._device,
                compute_type=self.config.compute_type,
                download_root=self.config.model_cache_dir,
            )
        else:
            # openai-whisper
            self._model = self._whisper.load_model(
                model_name,
                device=self._device,
                download_root=self.config.model_cache_dir,
            )

    async def transcribe(
        self,
        audio: Union[bytes, np.ndarray, str, Path],
        language: Optional[TranscriptionLanguage] = None,
        task: Optional[str] = None,
        prompt: Optional[str] = None,
    ) -> TranscriptionResult:
        """
        Transcribe audio to text.

        Args:
            audio: Audio data (bytes, numpy array, or file path)
            language: Language hint (None for auto-detect)
            task: "transcribe" or "translate"
            prompt: Initial prompt for context

        Returns:
            TranscriptionResult with text and metadata
        """
        if not self._initialized:
            await self.initialize()

        start_time = time.time()

        try:
            # Prepare audio
            audio_array, duration = await self._prepare_audio(audio)

            # Set options
            language_code = None
            if language and language != TranscriptionLanguage.AUTO:
                language_code = language.value
            elif self.config.default_language != TranscriptionLanguage.AUTO:
                language_code = self.config.default_language.value

            task = task or self.config.task

            # Transcribe based on backend
            if self._whisper_backend == "faster-whisper":
                result = await self._transcribe_faster_whisper(audio_array, language_code, task, prompt)
            else:
                result = await self._transcribe_openai_whisper(audio_array, language_code, task, prompt)

            # Calculate metrics
            processing_time_ms = (time.time() - start_time) * 1000
            result.duration_seconds = duration
            result.processing_time_ms = processing_time_ms
            result.model_size = self.config.model_size.value

            # Update metrics
            self._update_metrics(result)

            logger.debug(
                f"Transcribed {duration:.1f}s audio in {processing_time_ms:.0f}ms",
                extra={
                    "language": result.language,
                    "text_length": len(result.text),
                },
            )

            return result

        except Exception as e:
            self._metrics.errors += 1
            logger.error(f"Transcription error: {e}")
            raise

    async def _prepare_audio(self, audio: Union[bytes, np.ndarray, str, Path]) -> Tuple[np.ndarray, float]:
        """
        Prepare audio for transcription.

        Returns:
            Tuple of (audio_array, duration_seconds)
        """
        sample_rate = 16000  # Whisper expects 16kHz

        if isinstance(audio, (str, Path)):
            # Load from file
            import librosa

            audio_array, sr = librosa.load(str(audio), sr=sample_rate)
        elif isinstance(audio, bytes):
            # Convert PCM16 bytes to float array
            audio_array = np.frombuffer(audio, dtype=np.int16).astype(np.float32)
            audio_array /= 32768.0  # Normalize to [-1, 1]
        else:
            audio_array = audio.astype(np.float32)
            if audio_array.max() > 1.0:
                audio_array /= 32768.0

        duration = len(audio_array) / sample_rate
        return audio_array, duration

    async def _transcribe_faster_whisper(
        self,
        audio: np.ndarray,
        language: Optional[str],
        task: str,
        prompt: Optional[str],
    ) -> TranscriptionResult:
        """Transcribe using faster-whisper backend."""
        # Run in thread pool for async compatibility
        loop = asyncio.get_event_loop()

        def _transcribe():
            segments, info = self._model.transcribe(
                audio,
                language=language,
                task=task,
                beam_size=self.config.beam_size,
                best_of=self.config.best_of,
                temperature=self.config.temperature,
                word_timestamps=self.config.word_timestamps,
                condition_on_previous_text=self.config.condition_on_previous_text,
                compression_ratio_threshold=self.config.compression_ratio_threshold,
                log_prob_threshold=self.config.logprob_threshold,
                no_speech_threshold=self.config.no_speech_threshold,
                initial_prompt=prompt,
                vad_filter=self.config.vad_enabled,
                vad_parameters=(
                    {
                        "threshold": self.config.vad_threshold,
                        "min_speech_duration_ms": self.config.min_speech_duration_ms,
                        "max_speech_duration_s": self.config.max_speech_duration_s,
                    }
                    if self.config.vad_enabled
                    else None
                ),
            )
            return list(segments), info

        segments, info = await loop.run_in_executor(None, _transcribe)

        # Convert to our format
        result_segments = []
        full_text_parts = []

        for seg in segments:
            words = []
            if hasattr(seg, "words") and seg.words:
                for w in seg.words:
                    words.append(
                        TranscriptionWord(
                            word=w.word,
                            start=w.start,
                            end=w.end,
                            probability=w.probability,
                        )
                    )

            result_segments.append(
                TranscriptionSegment(
                    id=seg.id,
                    start=seg.start,
                    end=seg.end,
                    text=seg.text.strip(),
                    confidence=getattr(seg, "avg_logprob", 0.0),
                    words=words,
                )
            )
            full_text_parts.append(seg.text)

        return TranscriptionResult(
            text=" ".join(full_text_parts).strip(),
            language=info.language,
            language_probability=info.language_probability,
            segments=result_segments,
            duration_seconds=0.0,  # Set by caller
            processing_time_ms=0.0,  # Set by caller
            model_size="",  # Set by caller
        )

    async def _transcribe_openai_whisper(
        self,
        audio: np.ndarray,
        language: Optional[str],
        task: str,
        prompt: Optional[str],
    ) -> TranscriptionResult:
        """Transcribe using openai-whisper backend."""
        loop = asyncio.get_event_loop()

        def _transcribe():
            return self._model.transcribe(
                audio,
                language=language,
                task=task,
                beam_size=self.config.beam_size,
                best_of=self.config.best_of,
                temperature=self.config.temperature,
                word_timestamps=self.config.word_timestamps,
                condition_on_previous_text=self.config.condition_on_previous_text,
                compression_ratio_threshold=self.config.compression_ratio_threshold,
                logprob_threshold=self.config.logprob_threshold,
                no_speech_threshold=self.config.no_speech_threshold,
                initial_prompt=prompt,
            )

        result = await loop.run_in_executor(None, _transcribe)

        # Convert segments
        result_segments = []
        for seg in result.get("segments", []):
            words = []
            for w in seg.get("words", []):
                words.append(
                    TranscriptionWord(
                        word=w["word"],
                        start=w["start"],
                        end=w["end"],
                        probability=w.get("probability", 0.0),
                    )
                )

            result_segments.append(
                TranscriptionSegment(
                    id=seg["id"],
                    start=seg["start"],
                    end=seg["end"],
                    text=seg["text"].strip(),
                    confidence=seg.get("avg_logprob", 0.0),
                    words=words,
                )
            )

        return TranscriptionResult(
            text=result["text"].strip(),
            language=result.get("language", "unknown"),
            language_probability=1.0,  # Not provided by openai-whisper
            segments=result_segments,
            duration_seconds=0.0,
            processing_time_ms=0.0,
            model_size="",
        )

    async def transcribe_stream(
        self,
        audio_chunks: asyncio.Queue,
        on_partial: Optional[Callable[[str], None]] = None,
        on_final: Optional[Callable[[TranscriptionResult], None]] = None,
        language: Optional[TranscriptionLanguage] = None,
    ) -> TranscriptionResult:
        """
        Transcribe streaming audio with partial results.

        Args:
            audio_chunks: Queue of audio chunks (bytes)
            on_partial: Callback for partial transcriptions
            on_final: Callback for final transcription
            language: Language hint

        Returns:
            Final TranscriptionResult
        """
        buffer = []
        chunk_duration_s = 0.5  # Process every 0.5s of audio
        sample_rate = 16000
        samples_per_chunk = int(sample_rate * chunk_duration_s)

        accumulated_audio = np.array([], dtype=np.float32)
        last_transcription = ""

        while True:
            try:
                chunk = await asyncio.wait_for(audio_chunks.get(), timeout=5.0)

                if chunk is None:  # End of stream
                    break

                # Add to buffer
                chunk_array = np.frombuffer(chunk, dtype=np.int16).astype(np.float32)
                chunk_array /= 32768.0
                accumulated_audio = np.concatenate([accumulated_audio, chunk_array])

                # Process when we have enough audio
                if len(accumulated_audio) >= samples_per_chunk:
                    result = await self.transcribe(
                        accumulated_audio,
                        language=language,
                    )

                    if result.text != last_transcription:
                        last_transcription = result.text
                        if on_partial:
                            on_partial(result.text)

            except asyncio.TimeoutError:
                continue

        # Final transcription
        if len(accumulated_audio) > 0:
            final_result = await self.transcribe(
                accumulated_audio,
                language=language,
            )

            if on_final:
                on_final(final_result)

            return final_result

        return TranscriptionResult(
            text="",
            language="unknown",
            language_probability=0.0,
            segments=[],
            duration_seconds=0.0,
            processing_time_ms=0.0,
            model_size=self.config.model_size.value,
        )

    def _update_metrics(self, result: TranscriptionResult) -> None:
        """Update service metrics."""
        self._metrics.total_transcriptions += 1
        self._metrics.total_audio_seconds += result.duration_seconds
        self._metrics.total_processing_ms += result.processing_time_ms

        # Update averages
        n = self._metrics.total_transcriptions
        self._metrics.avg_latency_ms = self._metrics.total_processing_ms / n

        if self._metrics.total_audio_seconds > 0:
            rtf = (self._metrics.total_processing_ms / 1000) / self._metrics.total_audio_seconds
            self._metrics.avg_real_time_factor = rtf

        # Track language distribution
        lang = result.language
        self._metrics.languages_detected[lang] = self._metrics.languages_detected.get(lang, 0) + 1

    def get_metrics(self) -> WhisperMetrics:
        """Get current service metrics."""
        return self._metrics

    def reset_metrics(self) -> None:
        """Reset service metrics."""
        self._metrics = WhisperMetrics()

    async def change_model(self, model_size: WhisperModelSize) -> bool:
        """
        Change to a different model size.

        Args:
            model_size: New model size

        Returns:
            True if successful
        """
        if model_size == self.config.model_size:
            return True

        logger.info(f"Changing Whisper model from {self.config.model_size.value} to {model_size.value}")

        # Unload current model
        self._model = None
        self._initialized = False

        # Update config and reload
        self.config.model_size = model_size
        return await self.initialize()

    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model."""
        return {
            "model_size": self.config.model_size.value,
            "backend": getattr(self, "_whisper_backend", "unknown"),
            "device": self._device,
            "compute_type": self.config.compute_type,
            "initialized": self._initialized,
            "cache_dir": self.config.model_cache_dir,
        }

    async def cleanup(self) -> None:
        """Clean up resources."""
        self._model = None
        self._initialized = False

        # Clear CUDA cache if available
        if self._torch and self._torch.cuda.is_available():
            self._torch.cuda.empty_cache()

        logger.info("LocalWhisperService cleaned up")


# Singleton instance
_local_whisper_service: Optional[LocalWhisperService] = None


def get_local_whisper_service() -> LocalWhisperService:
    """Get or create the singleton LocalWhisperService instance."""
    global _local_whisper_service
    if _local_whisper_service is None:
        _local_whisper_service = LocalWhisperService()
    return _local_whisper_service


async def transcribe_local(
    audio: Union[bytes, np.ndarray, str, Path],
    language: Optional[TranscriptionLanguage] = None,
) -> TranscriptionResult:
    """
    Convenience function for local transcription.

    Args:
        audio: Audio data
        language: Language hint

    Returns:
        TranscriptionResult
    """
    service = get_local_whisper_service()
    await service.initialize()
    return await service.transcribe(audio, language=language)

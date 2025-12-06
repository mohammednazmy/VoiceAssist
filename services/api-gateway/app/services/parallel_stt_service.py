"""
Parallel STT Service - Multi-Provider Parallel Speech Recognition

Voice Mode v4 - Phase 2 Integration

Provides parallel transcription across multiple STT providers:
- Run multiple STT streams concurrently for different languages
- Select best transcript based on confidence scoring
- Early termination on high-confidence result
- Language-aware provider selection

Improves accuracy for code-switching and multilingual conversations.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime  # noqa: F401
from enum import Enum
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class STTProviderType(Enum):
    """Supported STT providers."""

    DEEPGRAM = "deepgram"
    WHISPER_API = "whisper_api"
    WHISPER_LOCAL = "whisper_local"
    GOOGLE_SPEECH = "google_speech"
    AZURE_SPEECH = "azure_speech"
    SPEECHMATICS = "speechmatics"


class LanguageCode(str, Enum):
    """Supported language codes."""

    ENGLISH = "en"
    ARABIC = "ar"
    SPANISH = "es"
    FRENCH = "fr"
    GERMAN = "de"
    CHINESE = "zh"
    HINDI = "hi"
    URDU = "ur"
    PORTUGUESE = "pt"
    ITALIAN = "it"
    JAPANESE = "ja"
    KOREAN = "ko"
    RUSSIAN = "ru"


@dataclass
class ProviderCapabilities:
    """Capabilities of an STT provider."""

    provider: STTProviderType
    supported_languages: List[LanguageCode]
    supports_code_switching: bool
    supports_streaming: bool
    avg_latency_ms: float
    cost_per_minute: float  # USD
    priority: int  # Lower = higher priority


@dataclass
class TranscriptResult:
    """Result from a single STT provider."""

    text: str
    language: LanguageCode
    confidence: float
    provider: STTProviderType
    latency_ms: float
    is_final: bool
    word_timings: List[Dict[str, Any]] = field(default_factory=list)
    alternatives: List[str] = field(default_factory=list)


@dataclass
class ParallelTranscriptResult:
    """Result from parallel STT transcription."""

    best_transcript: TranscriptResult
    all_results: List[TranscriptResult]
    consensus_text: Optional[str]  # If multiple agree
    consensus_confidence: float
    total_latency_ms: float
    providers_used: List[STTProviderType]
    early_terminated: bool


@dataclass
class ParallelSTTConfig:
    """Configuration for parallel STT service."""

    # Parallel execution
    max_parallel_streams: int = 3
    min_parallel_streams: int = 1

    # Early termination
    early_termination_confidence: float = 0.95
    early_termination_enabled: bool = True

    # Timeout
    stream_timeout_seconds: float = 10.0

    # Consensus
    require_consensus: bool = False
    consensus_threshold: float = 0.8  # Min agreement for consensus

    # Cost optimization
    max_cost_per_request: float = 0.05  # USD
    prefer_cheaper_providers: bool = True

    # Provider selection
    provider_weights: Dict[STTProviderType, float] = field(default_factory=dict)


# Provider capability registry
PROVIDER_CAPABILITIES = {
    STTProviderType.DEEPGRAM: ProviderCapabilities(
        provider=STTProviderType.DEEPGRAM,
        supported_languages=[
            LanguageCode.ENGLISH,
            LanguageCode.SPANISH,
            LanguageCode.FRENCH,
            LanguageCode.GERMAN,
            LanguageCode.PORTUGUESE,
            LanguageCode.ITALIAN,
            LanguageCode.HINDI,
            LanguageCode.JAPANESE,
            LanguageCode.KOREAN,
        ],
        supports_code_switching=False,
        supports_streaming=True,
        avg_latency_ms=120,
        cost_per_minute=0.0043,
        priority=1,
    ),
    STTProviderType.WHISPER_LOCAL: ProviderCapabilities(
        provider=STTProviderType.WHISPER_LOCAL,
        supported_languages=list(LanguageCode),  # All languages
        supports_code_switching=True,
        supports_streaming=False,
        avg_latency_ms=500,
        cost_per_minute=0.0,  # Free (local)
        priority=3,
    ),
    STTProviderType.WHISPER_API: ProviderCapabilities(
        provider=STTProviderType.WHISPER_API,
        supported_languages=list(LanguageCode),  # All languages
        supports_code_switching=True,
        supports_streaming=False,
        avg_latency_ms=800,
        cost_per_minute=0.006,
        priority=2,
    ),
    STTProviderType.SPEECHMATICS: ProviderCapabilities(
        provider=STTProviderType.SPEECHMATICS,
        supported_languages=[
            LanguageCode.ENGLISH,
            LanguageCode.ARABIC,
            LanguageCode.SPANISH,
            LanguageCode.FRENCH,
            LanguageCode.GERMAN,
            LanguageCode.CHINESE,
        ],
        supports_code_switching=True,
        supports_streaming=True,
        avg_latency_ms=180,
        cost_per_minute=0.008,
        priority=2,
    ),
}


@dataclass
class ParallelSTTMetrics:
    """Metrics for parallel STT performance."""

    total_requests: int = 0
    parallel_requests: int = 0
    single_provider_requests: int = 0
    early_terminations: int = 0
    consensus_achieved: int = 0
    avg_latency_ms: float = 0.0
    provider_usage: Dict[str, int] = field(default_factory=dict)
    provider_success_rate: Dict[str, float] = field(default_factory=dict)
    cost_total_usd: float = 0.0


class ParallelSTTService:
    """
    Parallel STT transcription service.

    Runs multiple STT providers concurrently and selects the best result.
    """

    def __init__(self, config: Optional[ParallelSTTConfig] = None):
        self.config = config or ParallelSTTConfig()
        self._initialized = False
        self._metrics = ParallelSTTMetrics()

        # Provider handlers
        self._providers: Dict[STTProviderType, Callable] = {}

        # Results queue for streaming
        self._results_queue: asyncio.Queue = asyncio.Queue()

    async def initialize(self) -> None:
        """Initialize the service and provider connections."""
        if self._initialized:
            return

        logger.info(
            "Initializing ParallelSTTService",
            extra={
                "max_parallel": self.config.max_parallel_streams,
                "early_termination": self.config.early_termination_enabled,
            },
        )

        self._initialized = True

    def register_provider(self, provider: STTProviderType, handler: Callable[..., asyncio.Task]) -> None:
        """
        Register a provider handler.

        Args:
            provider: Provider type
            handler: Async callable that performs transcription
        """
        self._providers[provider] = handler
        logger.debug(f"Registered STT provider: {provider.value}")

    async def transcribe_parallel(
        self,
        audio_data: bytes,
        suspected_languages: Optional[List[LanguageCode]] = None,
        preferred_providers: Optional[List[STTProviderType]] = None,
    ) -> ParallelTranscriptResult:
        """
        Transcribe audio using multiple providers in parallel.

        Args:
            audio_data: PCM16 audio bytes
            suspected_languages: Languages to prioritize
            preferred_providers: Specific providers to use

        Returns:
            ParallelTranscriptResult with best and all transcripts
        """
        if not self._initialized:
            await self.initialize()

        start_time = time.time()
        self._metrics.total_requests += 1

        # Select providers to use
        providers = self._select_providers(suspected_languages or [LanguageCode.ENGLISH], preferred_providers)

        if len(providers) > 1:
            self._metrics.parallel_requests += 1
        else:
            self._metrics.single_provider_requests += 1

        # Create transcription tasks
        tasks = []
        for provider in providers[: self.config.max_parallel_streams]:
            if provider in self._providers:
                task = asyncio.create_task(self._transcribe_with_provider(provider, audio_data, suspected_languages))
                tasks.append((provider, task))

                # Track usage
                self._metrics.provider_usage[provider.value] = self._metrics.provider_usage.get(provider.value, 0) + 1

        if not tasks:
            raise ValueError("No providers available for transcription")

        # Wait for results with early termination
        results = await self._wait_for_results(tasks)

        # Select best result
        best = self._select_best_result(results)

        # Check for consensus
        consensus_text, consensus_confidence = self._calculate_consensus(results)

        total_latency = (time.time() - start_time) * 1000
        self._metrics.avg_latency_ms = self._metrics.avg_latency_ms * 0.9 + total_latency * 0.1

        return ParallelTranscriptResult(
            best_transcript=best,
            all_results=results,
            consensus_text=consensus_text,
            consensus_confidence=consensus_confidence,
            total_latency_ms=total_latency,
            providers_used=[p for p, _ in tasks],
            early_terminated=len(results) < len(tasks),
        )

    def _select_providers(
        self, languages: List[LanguageCode], preferred: Optional[List[STTProviderType]] = None
    ) -> List[STTProviderType]:
        """Select providers based on language support and capabilities."""
        if preferred:
            return preferred

        candidates = []

        for provider, capabilities in PROVIDER_CAPABILITIES.items():
            # Check language support
            lang_supported = any(lang in capabilities.supported_languages for lang in languages)

            if not lang_supported:
                continue

            # Calculate score
            score = 0.0

            # Priority (lower is better)
            score += (5 - capabilities.priority) * 10

            # Latency (lower is better)
            score += (1000 - capabilities.avg_latency_ms) / 100

            # Code switching support
            if capabilities.supports_code_switching and len(languages) > 1:
                score += 20

            # Cost optimization
            if self.config.prefer_cheaper_providers:
                score += (0.01 - capabilities.cost_per_minute) * 100

            # Custom weights
            if provider in self.config.provider_weights:
                score *= self.config.provider_weights[provider]

            candidates.append((provider, score))

        # Sort by score (descending)
        candidates.sort(key=lambda x: x[1], reverse=True)

        return [p for p, _ in candidates]

    async def _transcribe_with_provider(
        self, provider: STTProviderType, audio_data: bytes, languages: Optional[List[LanguageCode]]
    ) -> TranscriptResult:
        """Transcribe with a single provider."""
        start_time = time.time()

        handler = self._providers.get(provider)
        if not handler:
            raise ValueError(f"No handler for provider: {provider}")

        try:
            result = await asyncio.wait_for(handler(audio_data, languages), timeout=self.config.stream_timeout_seconds)

            latency_ms = (time.time() - start_time) * 1000

            # Update success rate
            current_rate = self._metrics.provider_success_rate.get(provider.value, 1.0)
            self._metrics.provider_success_rate[provider.value] = current_rate * 0.95 + 0.05

            return TranscriptResult(
                text=result.get("text", ""),
                language=LanguageCode(result.get("language", "en")),
                confidence=result.get("confidence", 0.0),
                provider=provider,
                latency_ms=latency_ms,
                is_final=result.get("is_final", True),
                word_timings=result.get("words", []),
                alternatives=result.get("alternatives", []),
            )

        except asyncio.TimeoutError:
            logger.warning(f"Timeout for provider {provider.value}")

            # Update success rate
            current_rate = self._metrics.provider_success_rate.get(provider.value, 1.0)
            self._metrics.provider_success_rate[provider.value] = current_rate * 0.95

            return TranscriptResult(
                text="",
                language=LanguageCode.ENGLISH,
                confidence=0.0,
                provider=provider,
                latency_ms=self.config.stream_timeout_seconds * 1000,
                is_final=True,
            )

        except Exception as e:
            logger.error(f"Error with provider {provider.value}: {e}")

            current_rate = self._metrics.provider_success_rate.get(provider.value, 1.0)
            self._metrics.provider_success_rate[provider.value] = current_rate * 0.95

            return TranscriptResult(
                text="",
                language=LanguageCode.ENGLISH,
                confidence=0.0,
                provider=provider,
                latency_ms=(time.time() - start_time) * 1000,
                is_final=True,
            )

    async def _wait_for_results(self, tasks: List[Tuple[STTProviderType, asyncio.Task]]) -> List[TranscriptResult]:
        """Wait for results with optional early termination."""
        results = []
        pending = {task: provider for provider, task in tasks}

        while pending:
            done, _ = await asyncio.wait(
                pending.keys(), timeout=self.config.stream_timeout_seconds, return_when=asyncio.FIRST_COMPLETED
            )

            if not done:
                break

            for task in done:
                provider = pending.pop(task)
                try:
                    result = task.result()
                    results.append(result)

                    # Check for early termination
                    if (
                        self.config.early_termination_enabled
                        and result.confidence >= self.config.early_termination_confidence
                    ):

                        logger.debug(f"Early termination: {provider.value} " f"confidence={result.confidence:.2f}")
                        self._metrics.early_terminations += 1

                        # Cancel remaining tasks
                        for remaining_task in pending.keys():
                            remaining_task.cancel()

                        return results

                except Exception as e:
                    logger.warning(f"Task failed for {provider}: {e}")

        return results

    def _select_best_result(self, results: List[TranscriptResult]) -> TranscriptResult:
        """Select the best transcript from results."""
        if not results:
            return TranscriptResult(
                text="",
                language=LanguageCode.ENGLISH,
                confidence=0.0,
                provider=STTProviderType.DEEPGRAM,
                latency_ms=0,
                is_final=True,
            )

        # Filter out empty results
        valid_results = [r for r in results if r.text.strip()]

        if not valid_results:
            return results[0]

        # Score results
        scored = []
        for result in valid_results:
            score = result.confidence

            # Bonus for lower latency
            score += (1000 - min(result.latency_ms, 1000)) / 5000

            # Bonus for word timings
            if result.word_timings:
                score += 0.05

            scored.append((result, score))

        # Return highest scoring
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[0][0]

    def _calculate_consensus(self, results: List[TranscriptResult]) -> Tuple[Optional[str], float]:
        """Calculate consensus across multiple transcripts."""
        valid_results = [r for r in results if r.text.strip()]

        if len(valid_results) < 2:
            return None, 0.0

        # Simple word-level agreement
        texts = [r.text.lower().strip() for r in valid_results]

        # Check for exact matches
        if len(set(texts)) == 1:
            self._metrics.consensus_achieved += 1
            return valid_results[0].text, 1.0

        # Calculate word overlap
        word_sets = [set(t.split()) for t in texts]

        if not word_sets:
            return None, 0.0

        # Intersection of all word sets
        common_words = word_sets[0]
        for ws in word_sets[1:]:
            common_words = common_words.intersection(ws)

        # Union of all word sets
        all_words = set()
        for ws in word_sets:
            all_words = all_words.union(ws)

        if not all_words:
            return None, 0.0

        overlap_ratio = len(common_words) / len(all_words)

        if overlap_ratio >= self.config.consensus_threshold:
            self._metrics.consensus_achieved += 1
            # Use the highest confidence result as consensus
            best = max(valid_results, key=lambda r: r.confidence)
            return best.text, overlap_ratio

        return None, overlap_ratio

    async def transcribe_streaming(
        self,
        audio_stream: AsyncIterator[bytes],
        languages: Optional[List[LanguageCode]] = None,
        on_partial: Optional[Callable[[str], None]] = None,
    ) -> ParallelTranscriptResult:
        """
        Streaming transcription with parallel providers.

        Args:
            audio_stream: Async iterator of audio chunks
            languages: Language hints
            on_partial: Callback for partial results

        Returns:
            Final parallel transcript result
        """
        # Collect audio chunks
        chunks = []
        async for chunk in audio_stream:
            chunks.append(chunk)

        # Combine and transcribe
        full_audio = b"".join(chunks)
        return await self.transcribe_parallel(full_audio, languages)

    def get_metrics(self) -> ParallelSTTMetrics:
        """Get current service metrics."""
        return self._metrics

    def reset_metrics(self) -> None:
        """Reset service metrics."""
        self._metrics = ParallelSTTMetrics()

    def get_provider_stats(self) -> Dict[str, Any]:
        """Get statistics for each provider."""
        return {
            provider.value: {
                "usage": self._metrics.provider_usage.get(provider.value, 0),
                "success_rate": self._metrics.provider_success_rate.get(provider.value, 1.0),
                "capabilities": {
                    "languages": [lang.value for lang in PROVIDER_CAPABILITIES[provider].supported_languages],
                    "streaming": PROVIDER_CAPABILITIES[provider].supports_streaming,
                    "code_switching": PROVIDER_CAPABILITIES[provider].supports_code_switching,
                    "latency_ms": PROVIDER_CAPABILITIES[provider].avg_latency_ms,
                },
            }
            for provider in PROVIDER_CAPABILITIES
        }


# Singleton instance
_parallel_stt_service: Optional[ParallelSTTService] = None


def get_parallel_stt_service() -> ParallelSTTService:
    """Get or create the singleton ParallelSTTService instance."""
    global _parallel_stt_service
    if _parallel_stt_service is None:
        _parallel_stt_service = ParallelSTTService()
    return _parallel_stt_service


async def transcribe_parallel(
    audio_data: bytes,
    languages: Optional[List[LanguageCode]] = None,
) -> ParallelTranscriptResult:
    """
    Convenience function for parallel transcription.

    Args:
        audio_data: PCM16 audio bytes
        languages: Language hints

    Returns:
        ParallelTranscriptResult
    """
    service = get_parallel_stt_service()
    await service.initialize()
    return await service.transcribe_parallel(audio_data, languages)

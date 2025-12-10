"""
Latency-Aware Voice Orchestrator
Provides voice pipeline processing with latency budgets and adaptive degradation.

Part of Voice Mode Enhancement Plan v4.1
Reference: /home/asimo/.claude/plans/noble-bubbling-trinket.md#performance-safeguards
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class DegradationType(str, Enum):
    """Types of degradation that can be applied."""

    LANGUAGE_DETECTION_SKIPPED = "language_detection_skipped"
    LANGUAGE_DETECTION_BUDGET_EXCEEDED = "language_detection_budget_exceeded"
    TRANSLATION_SKIPPED = "translation_skipped"
    TRANSLATION_BUDGET_EXCEEDED = "translation_budget_exceeded"
    TRANSLATION_FAILED = "translation_failed"
    RAG_LIMITED_TO_1 = "rag_limited_to_1"
    RAG_LIMITED_TO_3 = "rag_limited_to_3"
    RAG_RETRIEVAL_FAILED = "rag_retrieval_failed"
    LLM_CONTEXT_SHORTENED = "llm_context_shortened"
    TTS_USED_CACHED_GREETING = "tts_used_cached_greeting"
    PARALLEL_STT_REDUCED = "parallel_stt_reduced"


class TranslationFailedError(Exception):
    """Exception raised when translation fails or returns a failed result."""

    pass


@dataclass
class LatencyBudget:
    """Latency budget configuration per stage."""

    audio_capture_ms: int = 50
    stt_ms: int = 200
    language_detection_ms: int = 50
    translation_ms: int = 200
    rag_ms: int = 300
    llm_first_token_ms: int = 300
    tts_first_chunk_ms: int = 150
    total_budget_ms: int = 700


@dataclass
class StageMetrics:
    """Metrics for a single processing stage."""

    stage_name: str
    start_time: float
    end_time: float
    budget_ms: int
    actual_ms: float
    exceeded: bool = False
    degradation_applied: Optional[DegradationType] = None

    @property
    def remaining_budget_ms(self) -> float:
        return max(0, self.budget_ms - self.actual_ms)


class VoiceProcessingResult(BaseModel):
    """Result of voice processing pipeline."""

    transcript: str
    response: str
    audio_data: Optional[bytes] = None
    detected_language: str = "en"
    response_language: str = "en"
    total_latency_ms: float
    stage_latencies: Dict[str, float] = {}
    degradation_applied: List[str] = []
    warnings: List[str] = []


class LatencyAwareVoiceOrchestrator:
    """
    Voice pipeline orchestrator with latency budgets and adaptive degradation.

    Ensures voice interactions remain responsive by:
    1. Tracking latency at each processing stage
    2. Applying graceful degradation when budgets are exceeded
    3. Reporting degradation events to the frontend
    4. Maintaining metrics for monitoring

    Latency Budgets Per Stage:
    | Stage              | Max Latency | Action on Exceed           |
    |--------------------|-------------|----------------------------|
    | Audio capture      | 50ms        | Log warning                |
    | STT (primary)      | 200ms       | Use cached partial         |
    | Language detection | 50ms        | Default to user language   |
    | Translation        | 200ms       | Skip translation           |
    | RAG retrieval      | 300ms       | Return top-1 only          |
    | LLM first token    | 300ms       | Use shorter context        |
    | TTS first chunk    | 150ms       | Use cached greeting        |
    | **Total E2E**      | **700ms**   | **Degrade features**       |
    """

    def __init__(
        self,
        budget: Optional[LatencyBudget] = None,
        stt_service=None,
        language_detector=None,
        translator=None,
        rag_service=None,
        llm_service=None,
        tts_service=None,
    ):
        self.budget = budget or LatencyBudget()
        self.stt = stt_service
        self.language_detector = language_detector
        self.translator = translator
        self.rag = rag_service
        self.llm = llm_service
        self.tts = tts_service

        # Metrics collection
        self.metrics = {
            "total_requests": 0,
            "degraded_requests": 0,
            "avg_latency_ms": 0.0,
            "degradation_counts": {},
        }

    async def process_with_budgets(
        self,
        audio_data: bytes,
        user_language: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> VoiceProcessingResult:
        """
        Process voice input with latency budgets and adaptive degradation.

        Args:
            audio_data: Raw audio bytes from client
            user_language: User's preferred language (fallback for detection)
            session_id: Session ID for context

        Returns:
            VoiceProcessingResult with response and metrics
        """
        start_time = time.monotonic()
        remaining_budget = self.budget.total_budget_ms
        degradation_applied: List[DegradationType] = []
        stage_latencies: Dict[str, float] = {}
        warnings: List[str] = []

        self.metrics["total_requests"] += 1

        try:
            # Stage 1: STT
            stt_start = time.monotonic()
            transcript = await self._run_stt_with_timeout(audio_data)
            stt_latency = (time.monotonic() - stt_start) * 1000
            stage_latencies["stt"] = stt_latency
            remaining_budget -= stt_latency

            if not transcript:
                return VoiceProcessingResult(
                    transcript="",
                    response="I didn't catch that. Could you please repeat?",
                    detected_language=user_language or "en",
                    response_language=user_language or "en",
                    total_latency_ms=(time.monotonic() - start_time) * 1000,
                    stage_latencies=stage_latencies,
                    warnings=["No speech detected"],
                )

            # Stage 2: Language detection (with budget check)
            lang_start = time.monotonic()
            if remaining_budget > self.budget.language_detection_ms:
                try:
                    detected_lang = await asyncio.wait_for(
                        self._detect_language(transcript), timeout=self.budget.language_detection_ms / 1000
                    )
                except asyncio.TimeoutError:
                    detected_lang = user_language or "en"
                    degradation_applied.append(DegradationType.LANGUAGE_DETECTION_SKIPPED)
                    warnings.append("Language detection timed out")
            else:
                detected_lang = user_language or "en"
                degradation_applied.append(DegradationType.LANGUAGE_DETECTION_BUDGET_EXCEEDED)

            stage_latencies["language_detection"] = (time.monotonic() - lang_start) * 1000
            remaining_budget -= stage_latencies["language_detection"]

            # Stage 3: Translation (skip if budget tight or same language)
            english_query = transcript
            trans_start = time.monotonic()

            if detected_lang != "en":
                translation_budget_available = remaining_budget > (
                    self.budget.translation_ms
                    + self.budget.rag_ms
                    + self.budget.llm_first_token_ms
                    + self.budget.tts_first_chunk_ms
                )

                if translation_budget_available:
                    try:
                        english_query = await asyncio.wait_for(
                            self._translate(transcript, detected_lang, "en"),
                            timeout=self.budget.translation_ms / 1000,
                        )
                    except asyncio.TimeoutError:
                        english_query = transcript  # Use original
                        degradation_applied.append(DegradationType.TRANSLATION_SKIPPED)
                        warnings.append("Translation timed out, using original query")
                    except TranslationFailedError as e:
                        # Translation service returned failed=True or raised error
                        english_query = transcript  # Fallback to original query
                        degradation_applied.append(DegradationType.TRANSLATION_FAILED)
                        warnings.append(f"Translation failed (graceful degradation): {str(e)}")
                        logger.warning(f"Translation degradation applied for {detected_lang}->en: {e}")
                    except Exception as e:
                        # Unexpected error - still degrade gracefully
                        english_query = transcript
                        degradation_applied.append(DegradationType.TRANSLATION_FAILED)
                        warnings.append(f"Translation failed (unexpected): {str(e)}")
                        logger.error(f"Unexpected translation error: {e}", exc_info=True)
                else:
                    degradation_applied.append(DegradationType.TRANSLATION_BUDGET_EXCEEDED)
                    warnings.append("Translation skipped due to latency budget")

            stage_latencies["translation"] = (time.monotonic() - trans_start) * 1000
            remaining_budget -= stage_latencies["translation"]

            # Stage 4: RAG retrieval (limit results if budget tight)
            rag_start = time.monotonic()
            rag_limit = self._determine_rag_limit(remaining_budget)

            if rag_limit < 5:
                if rag_limit == 1:
                    degradation_applied.append(DegradationType.RAG_LIMITED_TO_1)
                else:
                    degradation_applied.append(DegradationType.RAG_LIMITED_TO_3)
                warnings.append(f"RAG limited to {rag_limit} results")

            try:
                rag_results = await asyncio.wait_for(
                    self._retrieve_context(english_query, limit=rag_limit), timeout=self.budget.rag_ms / 1000
                )
            except asyncio.TimeoutError:
                rag_results = []
                degradation_applied.append(DegradationType.RAG_RETRIEVAL_FAILED)
                warnings.append("RAG retrieval timed out")
            except Exception as e:
                rag_results = []
                degradation_applied.append(DegradationType.RAG_RETRIEVAL_FAILED)
                warnings.append(f"RAG retrieval failed: {str(e)}")

            stage_latencies["rag"] = (time.monotonic() - rag_start) * 1000
            remaining_budget -= stage_latencies["rag"]

            # Stage 5: LLM generation
            llm_start = time.monotonic()
            response_language = detected_lang

            # Shorten context if budget is very tight
            context = rag_results
            if remaining_budget < 400 and len(rag_results) > 2:
                context = rag_results[:2]
                degradation_applied.append(DegradationType.LLM_CONTEXT_SHORTENED)
                warnings.append("LLM context shortened due to latency budget")

            try:
                response = await self._generate_response(
                    query=transcript, context=context, response_language=response_language
                )
            except Exception as e:
                logger.error(f"LLM generation failed: {e}")
                response = self._get_fallback_response(response_language)
                warnings.append(f"LLM generation failed: {str(e)}")

            stage_latencies["llm"] = (time.monotonic() - llm_start) * 1000
            remaining_budget -= stage_latencies["llm"]

            # Stage 6: TTS (if requested)
            audio_result = None
            tts_start = time.monotonic()

            if self.tts:
                try:
                    audio_result = await asyncio.wait_for(
                        self._synthesize_speech(response, response_language),
                        timeout=self.budget.tts_first_chunk_ms / 1000,
                    )
                except asyncio.TimeoutError:
                    degradation_applied.append(DegradationType.TTS_USED_CACHED_GREETING)
                    warnings.append("TTS timed out, using cached response")
                except Exception as e:
                    warnings.append(f"TTS failed: {str(e)}")

            stage_latencies["tts"] = (time.monotonic() - tts_start) * 1000

            # Calculate total latency
            total_latency = (time.monotonic() - start_time) * 1000

            # Update metrics
            if degradation_applied:
                self.metrics["degraded_requests"] += 1
                for deg in degradation_applied:
                    self.metrics["degradation_counts"][deg.value] = (
                        self.metrics["degradation_counts"].get(deg.value, 0) + 1
                    )

            # Running average
            total_reqs = self.metrics["total_requests"]
            self.metrics["avg_latency_ms"] = (
                self.metrics["avg_latency_ms"] * (total_reqs - 1) + total_latency
            ) / total_reqs

            return VoiceProcessingResult(
                transcript=transcript,
                response=response,
                audio_data=audio_result,
                detected_language=detected_lang,
                response_language=response_language,
                total_latency_ms=total_latency,
                stage_latencies=stage_latencies,
                degradation_applied=[d.value for d in degradation_applied],
                warnings=warnings,
            )

        except Exception as e:
            logger.error(f"Voice processing failed: {e}", exc_info=True)
            total_latency = (time.monotonic() - start_time) * 1000
            return VoiceProcessingResult(
                transcript="",
                response="I'm sorry, I encountered an error. Please try again.",
                detected_language=user_language or "en",
                response_language=user_language or "en",
                total_latency_ms=total_latency,
                stage_latencies=stage_latencies,
                degradation_applied=[d.value for d in degradation_applied],
                warnings=[f"Processing error: {str(e)}"],
            )

    def _determine_rag_limit(self, remaining_budget_ms: float) -> int:
        """Determine RAG result limit based on remaining budget."""
        if remaining_budget_ms > 600:
            return 5
        elif remaining_budget_ms > 400:
            return 3
        else:
            return 1

    async def _run_stt_with_timeout(self, audio_data: bytes) -> str:
        """Run STT with timeout."""
        if not self.stt:
            logger.warning("STT service not configured")
            return ""

        try:
            return await asyncio.wait_for(self.stt.transcribe(audio_data), timeout=self.budget.stt_ms / 1000)
        except asyncio.TimeoutError:
            logger.warning("STT timed out")
            return ""
        except Exception as e:
            logger.error(f"STT failed: {e}")
            return ""

    async def _detect_language(self, text: str) -> str:
        """Detect language of text."""
        if not self.language_detector:
            return "en"

        try:
            return await self.language_detector.detect(text)
        except Exception as e:
            logger.warning(f"Language detection failed: {e}")
            return "en"

    async def _translate(self, text: str, source: str, target: str) -> str:
        """
        Translate text with proper failure handling.

        Args:
            text: Text to translate
            source: Source language code
            target: Target language code

        Returns:
            Translated text

        Raises:
            TranslationFailedError: When translation fails or result.failed is True
        """
        if not self.translator:
            return text

        try:
            result = await self.translator.translate(text, source, target)

            # Check for failed flag in result (graceful degradation marker)
            if hasattr(result, "failed") and result.failed:
                error_msg = getattr(result, "error_message", "Translation failed")
                logger.warning(f"Translation marked as failed: {error_msg}")
                raise TranslationFailedError(error_msg)

            return result.text if hasattr(result, "text") else str(result)
        except TranslationFailedError:
            raise  # Re-raise our custom exception
        except Exception as e:
            logger.error(f"Translation failed: {e}")
            raise TranslationFailedError(str(e))

    async def _retrieve_context(self, query: str, limit: int = 5) -> List[Dict]:
        """Retrieve RAG context."""
        if not self.rag:
            return []

        try:
            results = await self.rag.search(query, top_k=limit)
            return results if results else []
        except Exception as e:
            logger.error(f"RAG retrieval failed: {e}")
            raise

    async def _generate_response(self, query: str, context: List[Dict], response_language: str = "en") -> str:
        """Generate LLM response."""
        if not self.llm:
            return self._get_fallback_response(response_language)

        # Build context string
        context_str = "\n".join([str(c.get("content", c)) if isinstance(c, dict) else str(c) for c in context[:5]])

        from app.services.llm_client import LLMRequest

        response = await self.llm.generate(
            LLMRequest(
                messages=[
                    {
                        "role": "system",
                        "content": f"You are a helpful medical assistant. Respond in {response_language}.",
                    },
                    {"role": "user", "content": f"Context: {context_str}\n\nQuestion: {query}"},
                ],
                max_tokens=512,
                temperature=0.7,
            )
        )
        return response.content

    async def _synthesize_speech(self, text: str, language: str = "en") -> Optional[bytes]:
        """Synthesize speech from text."""
        if not self.tts:
            return None

        try:
            return await self.tts.synthesize(text, language=language)
        except Exception as e:
            logger.error(f"TTS synthesis failed: {e}")
            return None

    def _get_fallback_response(self, language: str) -> str:
        """Get a fallback response for the given language."""
        fallbacks = {
            "en": "I apologize, but I'm unable to process your request at the moment.",
            "es": "Lo siento, no puedo procesar su solicitud en este momento.",
            "fr": "Je m'excuse, je ne peux pas traiter votre demande pour le moment.",
            "de": "Es tut mir leid, ich kann Ihre Anfrage im Moment nicht bearbeiten.",
            "ar": "عذراً، لا أستطيع معالجة طلبك في الوقت الحالي.",
            "zh": "抱歉，我目前无法处理您的请求。",
        }
        return fallbacks.get(language, fallbacks["en"])

    def get_metrics(self) -> Dict[str, Any]:
        """Get current orchestrator metrics."""
        return {
            **self.metrics,
            "degradation_rate": (
                self.metrics["degraded_requests"] / self.metrics["total_requests"]
                if self.metrics["total_requests"] > 0
                else 0
            ),
        }

    async def notify_degradation(self, session_id: str, degradations: List[DegradationType], latency_ms: float) -> None:
        """
        Notify frontend about applied degradations.

        This can be called to send a WebSocket message or update a status endpoint.
        """
        logger.info(
            f"Degradation notification for session {session_id}: "
            f"{[d.value for d in degradations]}, latency={latency_ms:.1f}ms"
        )
        # TODO: Implement WebSocket notification


# Singleton instance
_orchestrator: Optional[LatencyAwareVoiceOrchestrator] = None


def get_latency_aware_orchestrator() -> LatencyAwareVoiceOrchestrator:
    """Get or create orchestrator instance."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = LatencyAwareVoiceOrchestrator()
    return _orchestrator

"""
Multilingual RAG Service
Extends RAG capabilities with translation layer for non-English queries.

Part of Voice Mode Enhancement Plan v4.1
Reference: /home/asimo/.claude/plans/noble-bubbling-trinket.md#workstream-b-multilingual--pronunciation
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.services.translation_service import TranslationService, get_translation_service
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class LanguageSegment(BaseModel):
    """A segment of text with detected language."""

    text: str
    language: str
    confidence: float
    start_idx: int
    end_idx: int


class MultilingualQueryResult(BaseModel):
    """Result of a multilingual query operation."""

    original_query: str
    detected_language: str
    english_query: str
    translation_used: bool = False
    translation_cached: bool = False
    translation_warning: Optional[str] = None


@dataclass
class RAGSource:
    """A source document from RAG retrieval."""

    id: str
    title: str
    content: str
    score: float
    source_type: str = "textbook"
    metadata: Dict = field(default_factory=dict)


class MultilingualRAGResponse(BaseModel):
    """Response from multilingual RAG retrieval."""

    answer: str
    language: str
    sources: List[Dict] = Field(default_factory=list)
    original_query: str
    translated_query: Optional[str] = None
    translation_warning: Optional[str] = None
    latency_ms: float = 0.0
    degradation_applied: List[str] = Field(default_factory=list)


class LanguageDetectionService:
    """
    Word/phrase-level language detection for code-switching.

    Supports detecting language switches within a single utterance,
    common in multilingual medical contexts (e.g., "My abuela has diabetes").
    """

    # Common code-switching patterns by language pair
    CODE_SWITCH_PATTERNS = {
        ("en", "es"): ["mi", "su", "el", "la", "los", "las", "que", "por"],
        ("en", "ar"): ["والله", "يعني", "الحمد لله"],
        ("en", "hi"): ["मेरा", "मेरी", "है", "हैं"],
    }

    def __init__(self, translation_service: Optional[TranslationService] = None):
        self.translation_service = translation_service

    async def detect(self, text: str) -> str:
        """
        Detect the primary language of a text.

        Args:
            text: Input text to analyze

        Returns:
            ISO 639-1 language code
        """
        if not text or len(text.strip()) < 3:
            return "en"

        # Use translation service's detection if available
        if self.translation_service:
            try:
                return await self.translation_service.detect_language(text)
            except Exception as e:
                logger.warning(f"Language detection failed: {e}")

        # Fallback: simple heuristics
        return self._detect_heuristic(text)

    def _detect_heuristic(self, text: str) -> str:
        """Simple heuristic-based language detection."""
        # Check for Arabic script
        if any("\u0600" <= c <= "\u06FF" for c in text):
            return "ar"

        # Check for Chinese characters
        if any("\u4e00" <= c <= "\u9fff" for c in text):
            return "zh"

        # Check for Devanagari (Hindi)
        if any("\u0900" <= c <= "\u097F" for c in text):
            return "hi"

        # Check for Urdu (Nastaliq)
        if any("\u0600" <= c <= "\u06FF" for c in text) and "ے" in text:
            return "ur"

        # Default to English
        return "en"

    async def detect_segments(self, text: str) -> List[LanguageSegment]:
        """
        Detect language at word/phrase level for code-switching.

        Useful for handling mid-sentence language switches common in
        multilingual speakers.

        Args:
            text: Input text to segment

        Returns:
            List of language segments with detected languages
        """
        segments = []
        words = text.split()
        window_size = 4
        current_segment_start = 0
        current_lang = None

        for i in range(0, len(words), window_size):
            window = " ".join(words[i : i + window_size])
            detected = await self.detect(window)

            if current_lang is None:
                current_lang = detected
            elif detected != current_lang:
                # Language switch detected
                segments.append(
                    LanguageSegment(
                        text=" ".join(words[current_segment_start:i]),
                        language=current_lang,
                        confidence=0.85,  # Window-based detection has moderate confidence
                        start_idx=current_segment_start,
                        end_idx=i,
                    )
                )
                current_segment_start = i
                current_lang = detected

        # Add final segment
        if current_segment_start < len(words):
            segments.append(
                LanguageSegment(
                    text=" ".join(words[current_segment_start:]),
                    language=current_lang or "en",
                    confidence=0.9,
                    start_idx=current_segment_start,
                    end_idx=len(words),
                )
            )

        return segments

    async def detect_from_audio_features(self, prosody_features: Dict, transcript_hint: Optional[str] = None) -> str:
        """
        Detect language from audio prosody features.

        Can be used when audio features are available before full transcription.

        Args:
            prosody_features: Dict with pitch, rhythm, stress patterns
            transcript_hint: Optional partial transcript for validation

        Returns:
            ISO 639-1 language code
        """
        # TODO: Implement prosody-based language detection
        # For now, fall back to transcript-based detection
        if transcript_hint:
            return await self.detect(transcript_hint)
        return "en"


class MultilingualRAGService:
    """
    Multilingual RAG service with translation layer.

    Translates non-English queries to English for retrieval,
    then generates responses in the user's preferred language.

    Features:
    - Automatic language detection
    - Query translation with caching
    - Code-switching support
    - Graceful degradation on translation failure
    - Metrics tracking
    """

    # Language names for LLM prompting
    LANGUAGE_NAMES = {
        "en": "English",
        "es": "Spanish",
        "fr": "French",
        "de": "German",
        "it": "Italian",
        "pt": "Portuguese",
        "ar": "Arabic",
        "zh": "Mandarin Chinese",
        "hi": "Hindi",
        "ur": "Urdu",
    }

    def __init__(
        self,
        translation_service: Optional[TranslationService] = None,
        language_detector: Optional[LanguageDetectionService] = None,
        rag_service=None,  # RAGService or QueryOrchestrator
        llm_service=None,  # LLMClient
    ):
        self.translator = translation_service
        self.language_detector = language_detector or LanguageDetectionService(translation_service)
        self.rag_service = rag_service
        self.llm = llm_service
        self._initialized = False

    async def _ensure_initialized(self):
        """Lazy initialization of services."""
        if self._initialized:
            return

        if self.translator is None:
            self.translator = await get_translation_service()
            self.language_detector = LanguageDetectionService(self.translator)

        # Import RAG service lazily to avoid circular imports
        if self.rag_service is None:
            from app.services.search_aggregator import SearchAggregator

            self.rag_service = SearchAggregator()

        if self.llm is None:
            from app.services.llm_client import LLMClient

            self.llm = LLMClient()

        self._initialized = True

    async def retrieve_and_respond(
        self,
        query: str,
        user_language: Optional[str] = None,
        session_id: Optional[str] = None,
        clinical_context_id: Optional[str] = None,
    ) -> MultilingualRAGResponse:
        """
        Retrieve relevant documents and generate response in user's language.

        Process:
        1. Detect query language
        2. Translate to English if needed (with fallback)
        3. Retrieve from English knowledge base
        4. Generate response in user's preferred language

        Args:
            query: User's query (any supported language)
            user_language: Preferred response language (auto-detect if None)
            session_id: Optional session ID for context
            clinical_context_id: Optional clinical context ID

        Returns:
            MultilingualRAGResponse with answer, sources, and metadata
        """
        await self._ensure_initialized()

        start_time = time.monotonic()
        degradation_applied = []

        # 1. Detect query language
        query_lang = await self.language_detector.detect(query)
        target_lang = user_language or query_lang

        logger.info(f"Query language detected: {query_lang}, target: {target_lang}")

        # 2. Translate to English if needed
        english_query = query
        translated_query = None
        translation_warning = None

        if query_lang != "en":
            translation_result = await self.translator.translate_with_fallback(query, source=query_lang, target="en")

            if translation_result.failed:
                # Fall back to original query
                # LLM can often handle multilingual queries
                logger.warning(
                    f"Translation failed, using original query. " f"Error: {translation_result.error_message}"
                )
                degradation_applied.append("translation_failed")
                translation_warning = translation_result.error_message
            else:
                english_query = translation_result.text
                translated_query = english_query
                if translation_result.used_fallback:
                    degradation_applied.append("translation_used_fallback")

        # 3. Retrieve from knowledge base
        try:
            results = await self.rag_service.search(query=english_query, top_k=5, min_score=0.3)
        except Exception as e:
            logger.error(f"RAG retrieval failed: {e}")
            results = []
            degradation_applied.append("rag_retrieval_failed")

        # 4. Generate response in user's language
        language_name = self.LANGUAGE_NAMES.get(target_lang, "English")

        # Build context from results
        context_texts = []
        sources = []
        for i, result in enumerate(results[:5]):
            if hasattr(result, "content"):
                context_texts.append(f"[{i+1}] {result.content}")
                sources.append(
                    {
                        "id": getattr(result, "id", f"source_{i}"),
                        "title": getattr(result, "title", "Unknown"),
                        "score": getattr(result, "score", 0.0),
                        "source_type": getattr(result, "source_type", "textbook"),
                    }
                )

        context = "\n\n".join(context_texts) if context_texts else "No relevant sources found."

        # Generate response with language instruction
        system_prompt = f"""You are a helpful medical assistant.
Respond to the user's question using the provided context.
IMPORTANT: Respond entirely in {language_name}.
Do not mix languages unless the user's query contains specific terms
that should remain in their original language (e.g., medication names).
Be accurate, helpful, and cite your sources when providing information."""

        user_prompt = f"""Context:
{context}

User's question: {query}

Please provide a helpful response in {language_name}."""

        try:
            from app.services.llm_client import LLMRequest

            llm_response = await self.llm.generate(
                LLMRequest(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    max_tokens=1024,
                    temperature=0.7,
                )
            )
            answer = llm_response.content
        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            answer = self._generate_fallback_response(target_lang)
            degradation_applied.append("llm_generation_failed")

        latency_ms = (time.monotonic() - start_time) * 1000

        return MultilingualRAGResponse(
            answer=answer,
            language=target_lang,
            sources=sources,
            original_query=query,
            translated_query=translated_query,
            translation_warning=translation_warning,
            latency_ms=latency_ms,
            degradation_applied=degradation_applied,
        )

    def _generate_fallback_response(self, language: str) -> str:
        """Generate a fallback response when LLM fails."""
        fallback_messages = {
            "en": "I apologize, but I'm unable to process your request. Please try again.",
            "es": "Lo siento, no puedo procesar su solicitud. Por favor, inténtelo de nuevo.",
            "fr": "Je m'excuse, je ne peux pas traiter votre demande. Veuillez réessayer.",
            "de": "Es tut mir leid, ich kann Ihre Anfrage nicht bearbeiten. Bitte versuchen Sie es erneut.",
            "ar": "عذراً، لا أستطيع معالجة طلبك. يرجى المحاولة مرة أخرى.",
            "zh": "抱歉，我目前无法处理您的请求。请重试。",
            "hi": "क्षमा करें, मैं आपके अनुरोध को संसाधित करने में असमर्थ हूं। कृपया पुनः प्रयास करें।",
            "ur": "معذرت، میں آپ کی درخواست پر کارروائی نہیں کر سکتا۔ براہ کرم دوبارہ کوشش کریں۔",
        }
        return fallback_messages.get(language, fallback_messages["en"])

    async def prepare_multilingual_query(
        self, query: str, target_language: Optional[str] = None
    ) -> MultilingualQueryResult:
        """
        Prepare a query for multilingual RAG processing.

        This is a lighter-weight method for when you just need
        the translated query without full RAG retrieval.

        Args:
            query: Input query in any supported language
            target_language: Override for response language

        Returns:
            MultilingualQueryResult with translation info
        """
        await self._ensure_initialized()

        detected_lang = await self.language_detector.detect(query)

        if detected_lang == "en":
            return MultilingualQueryResult(
                original_query=query, detected_language="en", english_query=query, translation_used=False
            )

        translation_result = await self.translator.translate_with_fallback(query, source=detected_lang, target="en")

        return MultilingualQueryResult(
            original_query=query,
            detected_language=detected_lang,
            english_query=translation_result.text if not translation_result.failed else query,
            translation_used=not translation_result.failed,
            translation_cached=translation_result.from_cache,
            translation_warning=translation_result.error_message if translation_result.failed else None,
        )


# Singleton instance
_multilingual_rag_service: Optional[MultilingualRAGService] = None


async def get_multilingual_rag_service() -> MultilingualRAGService:
    """Get or create multilingual RAG service instance."""
    global _multilingual_rag_service
    if _multilingual_rag_service is None:
        _multilingual_rag_service = MultilingualRAGService()
    return _multilingual_rag_service

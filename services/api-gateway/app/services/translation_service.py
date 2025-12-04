"""
Translation Service with Graceful Fallback
Provides translation capabilities with caching and multi-provider fallback.

Part of Voice Mode Enhancement Plan v4.1
Reference: /home/asimo/.claude/plans/noble-bubbling-trinket.md#translation-fallback--error-handling
"""

import asyncio
import hashlib
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional

import httpx
from app.core.config import settings
from app.services.cache_service import CacheService
from redis.asyncio import Redis

logger = logging.getLogger(__name__)


class LanguageCode(str, Enum):
    """Supported language codes."""

    EN = "en"
    ES = "es"
    FR = "fr"
    DE = "de"
    IT = "it"
    PT = "pt"
    AR = "ar"
    ZH = "zh"
    HI = "hi"
    UR = "ur"


@dataclass
class TranslationResult:
    """Result of a translation operation."""

    text: str
    source_language: str
    target_language: str
    from_cache: bool = False
    used_fallback: bool = False
    failed: bool = False
    error_message: Optional[str] = None
    latency_ms: float = 0.0
    provider: Optional[str] = None


@dataclass
class TranslationMetrics:
    """Metrics for translation operations."""

    total_requests: int = 0
    cache_hits: int = 0
    primary_successes: int = 0
    fallback_successes: int = 0
    total_failures: int = 0
    avg_latency_ms: float = 0.0


class TranslationProvider:
    """Base class for translation providers."""

    async def translate(self, text: str, source: str, target: str) -> str:
        """Translate text from source to target language."""
        raise NotImplementedError


class GoogleTranslateProvider(TranslationProvider):
    """Google Cloud Translation API provider."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.google_translate_api_key
        self.base_url = "https://translation.googleapis.com/language/translate/v2"

    async def translate(self, text: str, source: str, target: str) -> str:
        """Translate using Google Cloud Translation API."""
        if not self.api_key:
            raise TranslationError("Google Translate API key not configured")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.base_url,
                params={"key": self.api_key},
                json={"q": text, "source": source, "target": target, "format": "text"},
                timeout=5.0,
            )
            response.raise_for_status()
            data = response.json()
            return data["data"]["translations"][0]["translatedText"]


class DeepLTranslateProvider(TranslationProvider):
    """DeepL Translation API provider."""

    # DeepL language code mapping
    LANGUAGE_MAP = {
        "en": "EN",
        "es": "ES",
        "fr": "FR",
        "de": "DE",
        "it": "IT",
        "pt": "PT-PT",
        "ar": "AR",  # Note: DeepL has limited Arabic support
        "zh": "ZH",
        "hi": "HI",  # Note: DeepL may not support Hindi
        "ur": "UR",  # Note: DeepL may not support Urdu
    }

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.deepl_api_key
        self.base_url = "https://api-free.deepl.com/v2/translate"

    async def translate(self, text: str, source: str, target: str) -> str:
        """Translate using DeepL API."""
        if not self.api_key:
            raise TranslationError("DeepL API key not configured")

        source_lang = self.LANGUAGE_MAP.get(source, source.upper())
        target_lang = self.LANGUAGE_MAP.get(target, target.upper())

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.base_url,
                headers={"Authorization": f"DeepL-Auth-Key {self.api_key}"},
                data={"text": text, "source_lang": source_lang, "target_lang": target_lang},
                timeout=5.0,
            )
            response.raise_for_status()
            data = response.json()
            return data["translations"][0]["text"]


class TranslationError(Exception):
    """Exception raised when translation fails."""

    pass


class TranslationService:
    """
    Translation service with caching and graceful fallback.

    Features:
    - Multi-provider support with automatic fallback
    - Redis caching for common translations (7-day TTL)
    - Graceful degradation with user-friendly error messages
    - Latency tracking and metrics
    """

    COMMON_TRANSLATIONS_CACHE_TTL = 86400 * 7  # 7 days

    # Fallback messages for when all translation providers fail
    FALLBACK_MESSAGES: Dict[str, str] = {
        "en": "Translation temporarily unavailable. Please try again.",
        "es": "Traducción no disponible temporalmente. Por favor, inténtelo de nuevo.",
        "fr": "Traduction temporairement indisponible. Veuillez réessayer.",
        "de": "Übersetzung vorübergehend nicht verfügbar. Bitte versuchen Sie es erneut.",
        "it": "Traduzione temporaneamente non disponibile. Per favore riprova.",
        "pt": "Tradução temporariamente indisponível. Por favor, tente novamente.",
        "ar": "الترجمة غير متوفرة مؤقتاً. يرجى المحاولة مرة أخرى.",
        "zh": "翻译暂时不可用。请重试。",
        "hi": "अनुवाद अस्थायी रूप से अनुपलब्ध है। कृपया पुनः प्रयास करें।",
        "ur": "ترجمہ عارضی طور پر دستیاب نہیں ہے۔ براہ کرم دوبارہ کوشش کریں۔",
    }

    # Common medical phrases to pre-cache
    COMMON_PHRASES: List[str] = [
        "How can I help you today?",
        "Please describe your symptoms.",
        "Do you have any allergies?",
        "Are you currently taking any medications?",
        "When did the symptoms start?",
        "On a scale of 1 to 10, how would you rate your pain?",
        "I understand. Let me help you with that.",
        "Please wait while I process your request.",
        "Thank you for your patience.",
        "Is there anything else I can help you with?",
    ]

    def __init__(
        self,
        cache_service: Optional[CacheService] = None,
        redis_client: Optional[Redis] = None,
        primary_provider: Optional[TranslationProvider] = None,
        fallback_provider: Optional[TranslationProvider] = None,
    ):
        self.cache = cache_service
        self.redis = redis_client
        self.providers = {
            "primary": primary_provider or GoogleTranslateProvider(),
            "fallback": fallback_provider or DeepLTranslateProvider(),
        }
        self.metrics = TranslationMetrics()

    def _generate_cache_key(self, text: str, source: str, target: str) -> str:
        """Generate a cache key for a translation."""
        # Use first 100 chars of text for hash to keep keys manageable
        text_hash = hashlib.sha256(text[:100].encode()).hexdigest()[:16]
        return f"translation:{source}:{target}:{text_hash}"

    async def translate(
        self, text: str, source: LanguageCode | str, target: LanguageCode | str, timeout_seconds: float = 2.0
    ) -> TranslationResult:
        """
        Translate text with fallback handling.

        Args:
            text: Text to translate
            source: Source language code
            target: Target language code
            timeout_seconds: Timeout for each provider attempt

        Returns:
            TranslationResult with translated text or error info
        """
        import time

        start_time = time.monotonic()
        self.metrics.total_requests += 1

        # Convert enum to string if needed
        source_str = source.value if isinstance(source, LanguageCode) else source
        target_str = target.value if isinstance(target, LanguageCode) else target

        # 1. Check cache first
        cache_key = self._generate_cache_key(text, source_str, target_str)
        if self.redis:
            try:
                cached = await self.redis.get(cache_key)
                if cached:
                    self.metrics.cache_hits += 1
                    logger.debug(f"Translation cache hit for {cache_key}")
                    return TranslationResult(
                        text=cached.decode() if isinstance(cached, bytes) else cached,
                        source_language=source_str,
                        target_language=target_str,
                        from_cache=True,
                        latency_ms=(time.monotonic() - start_time) * 1000,
                    )
            except Exception as e:
                logger.warning(f"Cache lookup failed: {e}")

        # 2. Try primary provider
        try:
            result = await asyncio.wait_for(
                self.providers["primary"].translate(text, source_str, target_str), timeout=timeout_seconds
            )
            self.metrics.primary_successes += 1

            # Cache the result
            await self._cache_translation(cache_key, result, text)

            return TranslationResult(
                text=result,
                source_language=source_str,
                target_language=target_str,
                from_cache=False,
                latency_ms=(time.monotonic() - start_time) * 1000,
                provider="primary",
            )

        except (TranslationError, asyncio.TimeoutError, httpx.HTTPError) as e:
            logger.warning(f"Primary translation provider failed: {e}")

            # 3. Try fallback provider
            try:
                result = await asyncio.wait_for(
                    self.providers["fallback"].translate(text, source_str, target_str),
                    timeout=timeout_seconds + 1.0,  # Slightly longer timeout for fallback
                )
                self.metrics.fallback_successes += 1

                # Cache the result
                await self._cache_translation(cache_key, result, text)

                return TranslationResult(
                    text=result,
                    source_language=source_str,
                    target_language=target_str,
                    from_cache=False,
                    used_fallback=True,
                    latency_ms=(time.monotonic() - start_time) * 1000,
                    provider="fallback",
                )

            except Exception as fallback_error:
                logger.error(f"All translation providers failed: {fallback_error}")
                self.metrics.total_failures += 1

                # 4. Return original text with error message
                return TranslationResult(
                    text=text,  # Return original text
                    source_language=source_str,
                    target_language=target_str,
                    failed=True,
                    error_message=self.FALLBACK_MESSAGES.get(target_str, self.FALLBACK_MESSAGES["en"]),
                    latency_ms=(time.monotonic() - start_time) * 1000,
                )

    async def translate_with_fallback(
        self, text: str, source: LanguageCode | str, target: LanguageCode | str
    ) -> TranslationResult:
        """
        Convenience method matching the plan API.
        Alias for translate() with default timeout.
        """
        return await self.translate(text, source, target)

    async def _cache_translation(self, cache_key: str, result: str, original_text: str) -> None:
        """Cache translation if appropriate (short common phrases)."""
        if not self.redis:
            return

        try:
            # Cache short phrases (likely to be reused)
            if len(original_text) < 200:
                await self.redis.setex(cache_key, self.COMMON_TRANSLATIONS_CACHE_TTL, result)
                logger.debug(f"Cached translation: {cache_key}")
        except Exception as e:
            logger.warning(f"Failed to cache translation: {e}")

    async def pre_cache_common_phrases(self, languages: List[str] = None) -> Dict[str, int]:
        """
        Pre-cache common medical phrases for specified languages.

        Args:
            languages: List of target language codes (default: all supported)

        Returns:
            Dict with language codes and number of phrases cached
        """
        if languages is None:
            languages = [lang.value for lang in LanguageCode if lang != LanguageCode.EN]

        cached_counts = {}

        for lang in languages:
            count = 0
            for phrase in self.COMMON_PHRASES:
                try:
                    result = await self.translate(phrase, "en", lang, timeout_seconds=5.0)
                    if not result.failed:
                        count += 1
                except Exception as e:
                    logger.warning(f"Failed to pre-cache '{phrase}' for {lang}: {e}")

            cached_counts[lang] = count
            logger.info(f"Pre-cached {count} phrases for {lang}")

        return cached_counts

    async def detect_language(self, text: str) -> str:
        """
        Detect the language of input text.
        Uses Google Translate detection API.

        Returns:
            ISO 639-1 language code
        """
        if not hasattr(self.providers["primary"], "api_key"):
            return "en"  # Default to English

        api_key = getattr(self.providers["primary"], "api_key", None)
        if not api_key:
            return "en"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://translation.googleapis.com/language/translate/v2/detect",
                    params={"key": api_key},
                    json={"q": text[:500]},  # Limit text length
                    timeout=2.0,
                )
                response.raise_for_status()
                data = response.json()
                return data["data"]["detections"][0][0]["language"]
        except Exception as e:
            logger.warning(f"Language detection failed: {e}")
            return "en"

    def get_metrics(self) -> TranslationMetrics:
        """Get current translation metrics."""
        if self.metrics.total_requests > 0:
            self.metrics.avg_latency_ms = (
                self.metrics.primary_successes + self.metrics.fallback_successes
            ) / self.metrics.total_requests
        return self.metrics

    def get_supported_languages(self) -> List[Dict[str, str]]:
        """Get list of supported languages with their codes and names."""
        return [
            {"code": "en", "name": "English", "native": "English"},
            {"code": "es", "name": "Spanish", "native": "Español"},
            {"code": "fr", "name": "French", "native": "Français"},
            {"code": "de", "name": "German", "native": "Deutsch"},
            {"code": "it", "name": "Italian", "native": "Italiano"},
            {"code": "pt", "name": "Portuguese", "native": "Português"},
            {"code": "ar", "name": "Arabic", "native": "العربية", "rtl": True},
            {"code": "zh", "name": "Chinese (Mandarin)", "native": "中文"},
            {"code": "hi", "name": "Hindi", "native": "हिन्दी"},
            {"code": "ur", "name": "Urdu", "native": "اردو", "rtl": True},
        ]


# Singleton instance for dependency injection
_translation_service: Optional[TranslationService] = None


async def get_translation_service() -> TranslationService:
    """Get or create translation service instance."""
    global _translation_service
    if _translation_service is None:
        from app.core.redis import get_redis_client

        redis = await get_redis_client()
        _translation_service = TranslationService(redis_client=redis)
    return _translation_service

"""
Language Detection Service - Code-switching and language identification

Voice Mode v4 - Phase 2 Integration

Provides real-time language detection for:
- Automatic language identification from text/audio
- Code-switching detection (mixing languages)
- Language confidence scoring
- Integration with STT and TTS for language-appropriate processing
"""

import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class SupportedLanguage(Enum):
    """Supported languages for detection."""

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
    TURKISH = "tr"
    UNKNOWN = "unknown"


@dataclass
class LanguageDetectionResult:
    """Result of language detection."""

    primary_language: SupportedLanguage
    confidence: float  # 0.0 to 1.0
    detected_languages: Dict[SupportedLanguage, float]  # All detected with scores
    is_code_switched: bool  # Multiple languages detected
    segments: List["LanguageSegment"] = field(default_factory=list)
    detection_method: str = "rule_based"


@dataclass
class LanguageSegment:
    """A segment of text with detected language."""

    text: str
    language: SupportedLanguage
    confidence: float
    start_idx: int
    end_idx: int


@dataclass
class LanguageDetectionConfig:
    """Configuration for language detection."""

    # Detection thresholds
    min_confidence_threshold: float = 0.6
    code_switch_threshold: float = 0.2  # Min secondary language ratio

    # Feature flags
    enable_code_switch_detection: bool = True
    enable_script_detection: bool = True
    enable_statistical_detection: bool = True

    # Supported languages
    supported_languages: List[SupportedLanguage] = field(
        default_factory=lambda: [
            SupportedLanguage.ENGLISH,
            SupportedLanguage.ARABIC,
            SupportedLanguage.SPANISH,
            SupportedLanguage.FRENCH,
            SupportedLanguage.GERMAN,
            SupportedLanguage.HINDI,
            SupportedLanguage.URDU,
            SupportedLanguage.CHINESE,
        ]
    )

    # Default language when uncertain
    default_language: SupportedLanguage = SupportedLanguage.ENGLISH


# Unicode script ranges for script-based detection
SCRIPT_RANGES = {
    SupportedLanguage.ARABIC: [
        (0x0600, 0x06FF),  # Arabic
        (0x0750, 0x077F),  # Arabic Supplement
        (0x08A0, 0x08FF),  # Arabic Extended-A
        (0xFB50, 0xFDFF),  # Arabic Presentation Forms-A
        (0xFE70, 0xFEFF),  # Arabic Presentation Forms-B
    ],
    SupportedLanguage.CHINESE: [
        (0x4E00, 0x9FFF),  # CJK Unified Ideographs
        (0x3400, 0x4DBF),  # CJK Extension A
    ],
    SupportedLanguage.HINDI: [
        (0x0900, 0x097F),  # Devanagari
        (0xA8E0, 0xA8FF),  # Devanagari Extended
    ],
    SupportedLanguage.URDU: [
        (0x0600, 0x06FF),  # Arabic (Urdu uses Arabic script)
        (0x0750, 0x077F),  # Arabic Supplement
    ],
    SupportedLanguage.JAPANESE: [
        (0x3040, 0x309F),  # Hiragana
        (0x30A0, 0x30FF),  # Katakana
    ],
    SupportedLanguage.KOREAN: [
        (0xAC00, 0xD7AF),  # Hangul Syllables
        (0x1100, 0x11FF),  # Hangul Jamo
    ],
    SupportedLanguage.RUSSIAN: [
        (0x0400, 0x04FF),  # Cyrillic
        (0x0500, 0x052F),  # Cyrillic Supplement
    ],
}

# Common words for statistical detection (top 20 per language)
COMMON_WORDS = {
    SupportedLanguage.ENGLISH: {
        "the",
        "a",
        "an",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "can",
        "could",
        "should",
        "may",
        "might",
        "must",
        "shall",
        "to",
        "of",
        "in",
        "for",
        "on",
        "with",
        "at",
        "by",
        "from",
        "this",
        "that",
        "these",
        "those",
        "it",
        "its",
        "what",
        "which",
    },
    SupportedLanguage.SPANISH: {
        "el",
        "la",
        "los",
        "las",
        "un",
        "una",
        "es",
        "son",
        "está",
        "están",
        "de",
        "en",
        "que",
        "y",
        "a",
        "por",
        "con",
        "para",
        "no",
        "se",
        "su",
        "sus",
        "pero",
        "si",
        "como",
        "más",
        "muy",
    },
    SupportedLanguage.FRENCH: {
        "le",
        "la",
        "les",
        "un",
        "une",
        "est",
        "sont",
        "de",
        "du",
        "des",
        "en",
        "que",
        "et",
        "à",
        "pour",
        "avec",
        "dans",
        "sur",
        "ne",
        "pas",
        "se",
        "ce",
        "qui",
        "plus",
        "très",
        "bien",
        "fait",
    },
    SupportedLanguage.GERMAN: {
        "der",
        "die",
        "das",
        "ein",
        "eine",
        "ist",
        "sind",
        "war",
        "und",
        "in",
        "zu",
        "den",
        "von",
        "mit",
        "auf",
        "für",
        "nicht",
        "es",
        "sich",
        "auch",
        "als",
        "an",
        "noch",
        "nach",
        "wie",
    },
    SupportedLanguage.ITALIAN: {
        "il",
        "la",
        "i",
        "le",
        "un",
        "una",
        "è",
        "sono",
        "di",
        "del",
        "della",
        "in",
        "che",
        "e",
        "a",
        "per",
        "con",
        "da",
        "non",
        "si",
        "su",
        "come",
        "più",
        "molto",
        "anche",
        "ma",
        "se",
    },
    SupportedLanguage.PORTUGUESE: {
        "o",
        "a",
        "os",
        "as",
        "um",
        "uma",
        "é",
        "são",
        "de",
        "do",
        "da",
        "em",
        "que",
        "e",
        "para",
        "com",
        "não",
        "se",
        "por",
        "mais",
        "como",
        "muito",
        "também",
        "mas",
        "seu",
        "sua",
    },
}


class LanguageDetectionService:
    """
    Service for detecting languages and code-switching in text.

    Uses multiple detection strategies:
    1. Script detection (Unicode ranges)
    2. Statistical word frequency
    3. Character n-gram analysis
    """

    def __init__(self, config: Optional[LanguageDetectionConfig] = None):
        self.config = config or LanguageDetectionConfig()
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the service."""
        if self._initialized:
            return

        logger.info(
            "Initializing LanguageDetectionService",
            extra={
                "supported_languages": [lang.value for lang in self.config.supported_languages],
                "code_switch_enabled": self.config.enable_code_switch_detection,
            },
        )

        self._initialized = True

    async def detect(self, text: str) -> LanguageDetectionResult:
        """
        Detect language(s) in text.

        Args:
            text: Text to analyze

        Returns:
            LanguageDetectionResult with detected languages
        """
        if not text or not text.strip():
            return LanguageDetectionResult(
                primary_language=self.config.default_language,
                confidence=0.0,
                detected_languages={},
                is_code_switched=False,
                detection_method="empty_input",
            )

        # Collect scores from different methods
        scores: Dict[SupportedLanguage, float] = {}

        # 1. Script-based detection
        if self.config.enable_script_detection:
            script_scores = self._detect_by_script(text)
            for lang, score in script_scores.items():
                scores[lang] = scores.get(lang, 0) + score * 0.5

        # 2. Statistical word frequency
        if self.config.enable_statistical_detection:
            word_scores = self._detect_by_words(text)
            for lang, score in word_scores.items():
                scores[lang] = scores.get(lang, 0) + score * 0.5

        # Determine primary language
        if scores:
            primary = max(scores.items(), key=lambda x: x[1])
            primary_language = primary[0]
            confidence = min(primary[1], 1.0)
        else:
            primary_language = self.config.default_language
            confidence = 0.0

        # Check for code-switching
        is_code_switched = False
        if self.config.enable_code_switch_detection and len(scores) > 1:
            total = sum(scores.values())
            if total > 0:
                sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
                if len(sorted_scores) > 1:
                    secondary_ratio = sorted_scores[1][1] / total
                    is_code_switched = secondary_ratio >= self.config.code_switch_threshold

        # Detect segments if code-switched
        segments = []
        if is_code_switched:
            segments = self._detect_segments(text)

        return LanguageDetectionResult(
            primary_language=primary_language,
            confidence=confidence,
            detected_languages=scores,
            is_code_switched=is_code_switched,
            segments=segments,
            detection_method="hybrid",
        )

    def _detect_by_script(self, text: str) -> Dict[SupportedLanguage, float]:
        """Detect languages by Unicode script ranges."""
        char_counts: Dict[SupportedLanguage, int] = Counter()
        total_chars = 0

        for char in text:
            code_point = ord(char)

            # Skip ASCII letters (ambiguous)
            if 0x0041 <= code_point <= 0x007A:
                continue

            # Skip whitespace and punctuation
            if char.isspace() or not char.isalnum():
                continue

            total_chars += 1

            for lang, ranges in SCRIPT_RANGES.items():
                if lang in self.config.supported_languages:
                    for start, end in ranges:
                        if start <= code_point <= end:
                            char_counts[lang] += 1
                            break

        # Convert to ratios
        scores = {}
        if total_chars > 0:
            for lang, count in char_counts.items():
                scores[lang] = count / total_chars

        return scores

    def _detect_by_words(self, text: str) -> Dict[SupportedLanguage, float]:
        """Detect languages by common word frequency."""
        # Tokenize (simple whitespace split)
        words = re.findall(r"\b\w+\b", text.lower())

        if not words:
            return {}

        word_counts: Dict[SupportedLanguage, int] = Counter()

        for word in words:
            for lang, common in COMMON_WORDS.items():
                if lang in self.config.supported_languages:
                    if word in common:
                        word_counts[lang] += 1

        # Convert to ratios
        total_matches = sum(word_counts.values())
        scores = {}
        if total_matches > 0:
            for lang, count in word_counts.items():
                scores[lang] = count / total_matches

        return scores

    def _detect_segments(self, text: str) -> List[LanguageSegment]:
        """Detect language segments in code-switched text."""
        segments = []

        # Simple segmentation by sentence
        sentences = re.split(r"[.!?]+", text)

        current_idx = 0
        for sentence in sentences:
            if not sentence.strip():
                current_idx += len(sentence) + 1
                continue

            # Detect language for this segment
            script_scores = self._detect_by_script(sentence)
            word_scores = self._detect_by_words(sentence)

            # Combine scores
            combined = {}
            for lang in set(list(script_scores.keys()) + list(word_scores.keys())):
                combined[lang] = script_scores.get(lang, 0) * 0.5 + word_scores.get(lang, 0) * 0.5

            if combined:
                best = max(combined.items(), key=lambda x: x[1])
                lang = best[0]
                confidence = min(best[1], 1.0)
            else:
                lang = self.config.default_language
                confidence = 0.0

            start_idx = text.find(sentence.strip(), current_idx)
            end_idx = start_idx + len(sentence.strip())

            segments.append(
                LanguageSegment(
                    text=sentence.strip(), language=lang, confidence=confidence, start_idx=start_idx, end_idx=end_idx
                )
            )

            current_idx = end_idx + 1

        return segments

    def detect_script(self, text: str) -> Optional[SupportedLanguage]:
        """
        Quick script-only detection for single characters or short text.

        Args:
            text: Text to check

        Returns:
            Detected language or None
        """
        for char in text:
            code_point = ord(char)

            for lang, ranges in SCRIPT_RANGES.items():
                for start, end in ranges:
                    if start <= code_point <= end:
                        return lang

        return None

    def is_rtl(self, language: SupportedLanguage) -> bool:
        """Check if a language is right-to-left."""
        return language in [
            SupportedLanguage.ARABIC,
            SupportedLanguage.URDU,
        ]

    def get_tts_language_code(self, language: SupportedLanguage) -> str:
        """
        Get TTS provider language code.

        Args:
            language: Detected language

        Returns:
            Language code for TTS (e.g., 'en-US', 'ar-SA')
        """
        mapping = {
            SupportedLanguage.ENGLISH: "en-US",
            SupportedLanguage.ARABIC: "ar-SA",
            SupportedLanguage.SPANISH: "es-ES",
            SupportedLanguage.FRENCH: "fr-FR",
            SupportedLanguage.GERMAN: "de-DE",
            SupportedLanguage.CHINESE: "zh-CN",
            SupportedLanguage.HINDI: "hi-IN",
            SupportedLanguage.URDU: "ur-PK",
            SupportedLanguage.PORTUGUESE: "pt-BR",
            SupportedLanguage.ITALIAN: "it-IT",
            SupportedLanguage.JAPANESE: "ja-JP",
            SupportedLanguage.KOREAN: "ko-KR",
            SupportedLanguage.RUSSIAN: "ru-RU",
            SupportedLanguage.TURKISH: "tr-TR",
        }
        return mapping.get(language, "en-US")

    def get_stt_language_code(self, language: SupportedLanguage) -> str:
        """
        Get STT provider language code.

        Args:
            language: Detected language

        Returns:
            Language code for STT
        """
        # Most STT providers use BCP-47 codes
        return self.get_tts_language_code(language)


# Singleton instance
_language_detection_service: Optional[LanguageDetectionService] = None


def get_language_detection_service() -> LanguageDetectionService:
    """Get or create the singleton LanguageDetectionService instance."""
    global _language_detection_service
    if _language_detection_service is None:
        _language_detection_service = LanguageDetectionService()
    return _language_detection_service


async def detect_language(text: str) -> LanguageDetectionResult:
    """
    Convenience function for language detection.

    Args:
        text: Text to analyze

    Returns:
        LanguageDetectionResult
    """
    service = get_language_detection_service()
    await service.initialize()
    return await service.detect(text)

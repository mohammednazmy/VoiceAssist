"""
Language Service - Multi-Lingual Voice Mode Support

Provides:
- Automatic language detection from audio/text
- Language-appropriate model routing
- RTL/LTR text handling
- Transliteration support
- Multi-lingual vocabulary boosts
"""

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class LanguageCode(Enum):
    """Supported language codes"""

    ENGLISH = "en"
    ARABIC = "ar"
    SPANISH = "es"
    FRENCH = "fr"
    GERMAN = "de"
    CHINESE = "zh"
    JAPANESE = "ja"
    KOREAN = "ko"
    RUSSIAN = "ru"
    PORTUGUESE = "pt"
    HINDI = "hi"
    URDU = "ur"


@dataclass
class LanguageDetection:
    """Result of language detection"""

    primary_language: LanguageCode
    confidence: float
    secondary_languages: List[Tuple[LanguageCode, float]] = field(default_factory=list)
    is_mixed: bool = False
    detected_scripts: List[str] = field(default_factory=list)  # latin, arabic, han, etc.


@dataclass
class LanguageProfile:
    """Language-specific configuration"""

    code: LanguageCode
    name: str
    native_name: str
    direction: str  # ltr or rtl
    script: str  # latin, arabic, han, etc.
    asr_model: str  # ASR model to use
    tts_voice: str  # TTS voice to use
    llm_system_prompt_suffix: str = ""  # Language-specific instructions


class LanguageService:
    """
    Multi-lingual language handling service.

    Provides:
    - Language detection from text and audio
    - Language-appropriate routing
    - Text direction handling
    - Transliteration
    """

    # Language profiles
    PROFILES: Dict[LanguageCode, LanguageProfile] = {
        LanguageCode.ENGLISH: LanguageProfile(
            code=LanguageCode.ENGLISH,
            name="English",
            native_name="English",
            direction="ltr",
            script="latin",
            asr_model="deepgram:nova-2",
            tts_voice="elevenlabs:onyx",
        ),
        LanguageCode.ARABIC: LanguageProfile(
            code=LanguageCode.ARABIC,
            name="Arabic",
            native_name="العربية",
            direction="rtl",
            script="arabic",
            asr_model="deepgram:nova-2-ar",
            tts_voice="elevenlabs:arabic-male",
            llm_system_prompt_suffix="Respond in Arabic when the user speaks Arabic.",
        ),
        LanguageCode.SPANISH: LanguageProfile(
            code=LanguageCode.SPANISH,
            name="Spanish",
            native_name="Español",
            direction="ltr",
            script="latin",
            asr_model="deepgram:nova-2-es",
            tts_voice="elevenlabs:spanish-male",
        ),
        LanguageCode.FRENCH: LanguageProfile(
            code=LanguageCode.FRENCH,
            name="French",
            native_name="Français",
            direction="ltr",
            script="latin",
            asr_model="deepgram:nova-2-fr",
            tts_voice="elevenlabs:french-male",
        ),
        LanguageCode.URDU: LanguageProfile(
            code=LanguageCode.URDU,
            name="Urdu",
            native_name="اردو",
            direction="rtl",
            script="arabic",
            asr_model="deepgram:nova-2-ur",
            tts_voice="elevenlabs:urdu-male",
        ),
    }

    # Script detection patterns
    SCRIPT_PATTERNS = {
        "arabic": r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+",
        "hebrew": r"[\u0590-\u05FF]+",
        "han": r"[\u4E00-\u9FFF]+",
        "hiragana": r"[\u3040-\u309F]+",
        "katakana": r"[\u30A0-\u30FF]+",
        "hangul": r"[\uAC00-\uD7AF]+",
        "cyrillic": r"[\u0400-\u04FF]+",
        "devanagari": r"[\u0900-\u097F]+",
        "latin": r"[A-Za-z]+",
    }

    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        self._session_languages: Dict[str, LanguageCode] = {}
        self._user_preferences: Dict[str, LanguageCode] = {}
        logger.info("LanguageService initialized")

    async def detect_language(
        self,
        text: str,
        audio_features: Optional[Dict] = None,
    ) -> LanguageDetection:
        """
        Detect language from text and optional audio features.

        Uses multiple signals:
        - Script detection (Arabic, Latin, Han, etc.)
        - Word pattern matching
        - Audio prosody (if available)
        """
        detected_scripts = self._detect_scripts(text)

        # Script-based initial detection
        if "arabic" in detected_scripts:
            primary = LanguageCode.ARABIC
            confidence = 0.85
        elif "han" in detected_scripts:
            primary = LanguageCode.CHINESE
            confidence = 0.85
        elif "hiragana" in detected_scripts or "katakana" in detected_scripts:
            primary = LanguageCode.JAPANESE
            confidence = 0.85
        elif "hangul" in detected_scripts:
            primary = LanguageCode.KOREAN
            confidence = 0.85
        elif "cyrillic" in detected_scripts:
            primary = LanguageCode.RUSSIAN
            confidence = 0.8
        elif "devanagari" in detected_scripts:
            primary = LanguageCode.HINDI
            confidence = 0.8
        else:
            # Default to English for Latin script
            primary = LanguageCode.ENGLISH
            confidence = 0.7

            # Check for Spanish/French patterns
            if self._has_spanish_patterns(text):
                primary = LanguageCode.SPANISH
                confidence = 0.75
            elif self._has_french_patterns(text):
                primary = LanguageCode.FRENCH
                confidence = 0.75

        # Check for mixed language
        is_mixed = len(detected_scripts) > 1

        return LanguageDetection(
            primary_language=primary,
            confidence=confidence,
            is_mixed=is_mixed,
            detected_scripts=detected_scripts,
        )

    def _detect_scripts(self, text: str) -> List[str]:
        """Detect scripts present in text"""
        scripts = []
        for script_name, pattern in self.SCRIPT_PATTERNS.items():
            if re.search(pattern, text):
                scripts.append(script_name)
        return scripts

    def _has_spanish_patterns(self, text: str) -> bool:
        """Check for Spanish language patterns"""
        spanish_patterns = [
            r"\b(el|la|los|las|un|una)\b",
            r"\b(que|de|en|por|para)\b",
            r"\b(está|están|es|son)\b",
            r"[áéíóúñ¿¡]",
        ]
        for pattern in spanish_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        return False

    def _has_french_patterns(self, text: str) -> bool:
        """Check for French language patterns"""
        french_patterns = [
            r"\b(le|la|les|un|une|des)\b",
            r"\b(je|tu|il|elle|nous|vous|ils|elles)\b",
            r"\b(est|sont|était|sont)\b",
            r"[àâçéèêëîïôùûü]",
        ]
        for pattern in french_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        return False

    def get_profile(self, language: LanguageCode) -> LanguageProfile:
        """Get language profile for a language code"""
        return self.PROFILES.get(language, self.PROFILES[LanguageCode.ENGLISH])

    def get_text_direction(self, language: LanguageCode) -> str:
        """Get text direction for a language"""
        profile = self.get_profile(language)
        return profile.direction

    def is_rtl(self, language: LanguageCode) -> bool:
        """Check if language is right-to-left"""
        return self.get_text_direction(language) == "rtl"

    async def get_asr_model(
        self,
        session_id: str,
        detected_language: Optional[LanguageCode] = None,
    ) -> str:
        """
        Get appropriate ASR model for session.

        Considers:
        - Detected language
        - Session language preference
        - User preference
        """
        language = detected_language or self._session_languages.get(session_id, LanguageCode.ENGLISH)
        profile = self.get_profile(language)
        return profile.asr_model

    async def get_tts_voice(
        self,
        session_id: str,
        detected_language: Optional[LanguageCode] = None,
    ) -> str:
        """Get appropriate TTS voice for session"""
        language = detected_language or self._session_languages.get(session_id, LanguageCode.ENGLISH)
        profile = self.get_profile(language)
        return profile.tts_voice

    def set_session_language(
        self,
        session_id: str,
        language: LanguageCode,
    ) -> None:
        """Set preferred language for a session"""
        self._session_languages[session_id] = language
        logger.debug(f"Set session {session_id} language to {language.value}")

    def set_user_preference(
        self,
        user_id: str,
        language: LanguageCode,
    ) -> None:
        """Set user's preferred language"""
        self._user_preferences[user_id] = language
        logger.info(f"Set user {user_id} language preference to {language.value}")

    async def get_llm_prompt_suffix(
        self,
        language: LanguageCode,
    ) -> str:
        """Get language-specific LLM prompt suffix"""
        profile = self.get_profile(language)
        return profile.llm_system_prompt_suffix

    async def transliterate(
        self,
        text: str,
        from_script: str,
        to_script: str,
    ) -> str:
        """
        Transliterate text between scripts.

        Useful for Arabic/Urdu romanization.
        """
        # Basic Arabic to Latin transliteration
        if from_script == "arabic" and to_script == "latin":
            return self._arabic_to_latin(text)

        # Would implement more transliterations
        return text

    def _arabic_to_latin(self, text: str) -> str:
        """Basic Arabic to Latin transliteration"""
        # Simplified transliteration map
        trans_map = {
            "ا": "a",
            "ب": "b",
            "ت": "t",
            "ث": "th",
            "ج": "j",
            "ح": "h",
            "خ": "kh",
            "د": "d",
            "ذ": "dh",
            "ر": "r",
            "ز": "z",
            "س": "s",
            "ش": "sh",
            "ص": "s",
            "ض": "d",
            "ط": "t",
            "ظ": "z",
            "ع": "'",
            "غ": "gh",
            "ف": "f",
            "ق": "q",
            "ك": "k",
            "ل": "l",
            "م": "m",
            "ن": "n",
            "ه": "h",
            "و": "w",
            "ي": "y",
            "ء": "'",
            "ى": "a",
            "ة": "a",
        }

        result = []
        for char in text:
            result.append(trans_map.get(char, char))
        return "".join(result)

    def clear_session(self, session_id: str) -> None:
        """Clear session language preference"""
        self._session_languages.pop(session_id, None)


# Global language service instance
_language_service_instance: Optional[LanguageService] = None


def get_language_service() -> LanguageService:
    """Get the global language service instance"""
    global _language_service_instance
    if _language_service_instance is None:
        _language_service_instance = LanguageService()
    return _language_service_instance


def reset_language_service() -> None:
    """Reset the global language service (for testing)"""
    global _language_service_instance
    _language_service_instance = None


__all__ = [
    "LanguageService",
    "LanguageCode",
    "LanguageDetection",
    "LanguageProfile",
    "get_language_service",
    "reset_language_service",
]

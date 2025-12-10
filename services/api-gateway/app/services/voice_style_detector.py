"""
Voice Style Detector Service

Detects appropriate voice style/tone based on content context for medical AI assistant.
Used to automatically adjust TTS parameters for more natural, context-appropriate speech.

Voice Styles:
- CALM: Default medical explanations (stable, measured pace)
- URGENT: Medical warnings, emergencies (dynamic, faster)
- EMPATHETIC: Sensitive health topics (warm, slower)
- INSTRUCTIONAL: Step-by-step guidance (clear, deliberate)
- CONVERSATIONAL: General chat (natural, varied)
"""

import re
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


class VoiceStyleContext(str, Enum):
    """Voice style contexts for medical AI assistant."""

    CALM = "calm"  # Default explanations
    URGENT = "urgent"  # Medical warnings/emergencies
    EMPATHETIC = "empathetic"  # Sensitive health topics
    INSTRUCTIONAL = "instructional"  # Step-by-step guidance
    CONVERSATIONAL = "conversational"  # General chat


@dataclass
class VoiceStylePreset:
    """TTS parameters preset for a voice style."""

    context: VoiceStyleContext
    stability: float  # 0-1: lower = more expressive
    similarity_boost: float  # 0-1: voice matching fidelity
    style: float  # 0-1: style/emotion exaggeration (ElevenLabs)
    speech_rate: float  # 0.5-2.0: speech rate multiplier

    def to_dict(self) -> Dict[str, float]:
        """Convert to dictionary for API responses."""
        return {
            "context": self.context.value,
            "stability": self.stability,
            "similarity_boost": self.similarity_boost,
            "style": self.style,
            "speech_rate": self.speech_rate,
        }


# Predefined presets for medical context
MEDICAL_VOICE_PRESETS: Dict[VoiceStyleContext, VoiceStylePreset] = {
    VoiceStyleContext.CALM: VoiceStylePreset(
        context=VoiceStyleContext.CALM,
        stability=0.65,
        similarity_boost=0.75,
        style=0.2,
        speech_rate=0.95,
    ),
    VoiceStyleContext.URGENT: VoiceStylePreset(
        context=VoiceStyleContext.URGENT,
        stability=0.45,  # More dynamic for emphasis
        similarity_boost=0.7,
        style=0.5,  # More expressive
        speech_rate=1.1,  # Slightly faster
    ),
    VoiceStyleContext.EMPATHETIC: VoiceStylePreset(
        context=VoiceStyleContext.EMPATHETIC,
        stability=0.7,
        similarity_boost=0.8,
        style=0.3,
        speech_rate=0.9,  # Slower, more deliberate
    ),
    VoiceStyleContext.INSTRUCTIONAL: VoiceStylePreset(
        context=VoiceStyleContext.INSTRUCTIONAL,
        stability=0.6,
        similarity_boost=0.75,
        style=0.15,
        speech_rate=1.0,  # Clear, measured pace
    ),
    VoiceStyleContext.CONVERSATIONAL: VoiceStylePreset(
        context=VoiceStyleContext.CONVERSATIONAL,
        stability=0.55,
        similarity_boost=0.7,
        style=0.25,
        speech_rate=1.0,
    ),
}


class VoiceStyleDetector:
    """
    Detects appropriate voice style from text content.

    Uses keyword matching and pattern detection to determine
    the appropriate tone for medical AI responses.
    """

    # Keywords indicating urgent/emergency content
    URGENT_KEYWORDS = [
        "emergency",
        "immediately",
        "call 911",
        "seek medical attention",
        "warning",
        "urgent",
        "danger",
        "critical",
        "life-threatening",
        "poison control",
        "go to the er",
        "emergency room",
        "chest pain",
        "difficulty breathing",
        "stroke symptoms",
        "heart attack",
        "allergic reaction",
        "anaphylaxis",
    ]

    # Keywords indicating empathetic/sensitive content
    EMPATHETIC_KEYWORDS = [
        "understand",
        "difficult",
        "concerning",
        "worried",
        "anxious",
        "scared",
        "sorry to hear",
        "must be hard",
        "challenging",
        "grief",
        "loss",
        "depression",
        "anxiety",
        "mental health",
        "emotional",
        "sensitive",
        "support",
        "comfort",
        "care",
    ]

    # Patterns indicating instructional content
    INSTRUCTIONAL_PATTERNS = [
        r"step\s+\d+",
        r"first[,\s]",
        r"then[,\s]",
        r"next[,\s]",
        r"finally[,\s]",
        r"follow\s+these\s+steps",
        r"here's\s+how",
        r"instructions",
        r"to\s+do\s+this",
        r"you\s+should",
        r"make\s+sure\s+to",
        r"\d+\.\s+",  # Numbered lists
    ]

    # Keywords indicating conversational/casual content
    CONVERSATIONAL_KEYWORDS = [
        "hello",
        "hi there",
        "how are you",
        "nice to",
        "great question",
        "that's interesting",
        "by the way",
        "anyway",
        "so basically",
        "you know",
    ]

    def __init__(self):
        self._urgent_pattern = re.compile(
            "|".join(re.escape(kw) for kw in self.URGENT_KEYWORDS),
            re.IGNORECASE,
        )
        self._empathetic_pattern = re.compile(
            "|".join(re.escape(kw) for kw in self.EMPATHETIC_KEYWORDS),
            re.IGNORECASE,
        )
        self._instructional_pattern = re.compile(
            "|".join(self.INSTRUCTIONAL_PATTERNS),
            re.IGNORECASE,
        )
        self._conversational_pattern = re.compile(
            "|".join(re.escape(kw) for kw in self.CONVERSATIONAL_KEYWORDS),
            re.IGNORECASE,
        )

    def detect_style(
        self,
        text: str,
        clinical_context: Optional[Dict] = None,
    ) -> VoiceStyleContext:
        """
        Detect appropriate voice style from text content.

        Args:
            text: The text to analyze
            clinical_context: Optional clinical context metadata

        Returns:
            VoiceStyleContext enum value
        """
        if not text:
            return VoiceStyleContext.CALM

        text_lower = text.lower()

        # Priority 1: Urgent content (most important to catch)
        if self._urgent_pattern.search(text_lower):
            logger.debug("Detected URGENT style", extra={"text_preview": text[:100]})
            return VoiceStyleContext.URGENT

        # Priority 2: Empathetic content
        if self._empathetic_pattern.search(text_lower):
            logger.debug("Detected EMPATHETIC style", extra={"text_preview": text[:100]})
            return VoiceStyleContext.EMPATHETIC

        # Priority 3: Instructional content
        if self._instructional_pattern.search(text_lower):
            logger.debug("Detected INSTRUCTIONAL style", extra={"text_preview": text[:100]})
            return VoiceStyleContext.INSTRUCTIONAL

        # Priority 4: Conversational content
        if self._conversational_pattern.search(text_lower):
            logger.debug("Detected CONVERSATIONAL style", extra={"text_preview": text[:100]})
            return VoiceStyleContext.CONVERSATIONAL

        # Default: Calm medical explanation
        return VoiceStyleContext.CALM

    def get_preset(self, style: VoiceStyleContext) -> VoiceStylePreset:
        """Get the voice preset for a given style."""
        return MEDICAL_VOICE_PRESETS.get(style, MEDICAL_VOICE_PRESETS[VoiceStyleContext.CALM])

    def get_all_presets(self) -> Dict[str, Dict]:
        """Get all available style presets."""
        return {style.value: preset.to_dict() for style, preset in MEDICAL_VOICE_PRESETS.items()}

    def apply_style_to_synthesis(
        self,
        text: str,
        base_stability: float = 0.5,
        base_similarity_boost: float = 0.75,
        base_style: float = 0.0,
        base_speech_rate: float = 1.0,
        auto_detect: bool = True,
        explicit_style: Optional[VoiceStyleContext] = None,
    ) -> Dict[str, float]:
        """
        Apply style-based adjustments to TTS parameters.

        Args:
            text: Text to synthesize
            base_stability: User's base stability preference
            base_similarity_boost: User's base similarity boost preference
            base_style: User's base style preference
            base_speech_rate: User's base speech rate preference
            auto_detect: Whether to auto-detect style from content
            explicit_style: Explicitly requested style (overrides auto-detect)

        Returns:
            Dictionary with adjusted TTS parameters
        """
        # Determine style
        if explicit_style is not None:
            style = explicit_style
        elif auto_detect:
            style = self.detect_style(text)
        else:
            style = VoiceStyleContext.CALM

        preset = self.get_preset(style)

        # Blend user preferences with style preset (60% user, 40% preset)
        user_weight = 0.6
        preset_weight = 0.4

        adjusted_params = {
            "stability": base_stability * user_weight + preset.stability * preset_weight,
            "similarity_boost": base_similarity_boost * user_weight + preset.similarity_boost * preset_weight,
            "style": base_style * user_weight + preset.style * preset_weight,
            "speech_rate": base_speech_rate * user_weight + preset.speech_rate * preset_weight,
            "detected_style": style.value,
        }

        # Clamp values to valid ranges
        adjusted_params["stability"] = max(0.0, min(1.0, adjusted_params["stability"]))
        adjusted_params["similarity_boost"] = max(0.0, min(1.0, adjusted_params["similarity_boost"]))
        adjusted_params["style"] = max(0.0, min(1.0, adjusted_params["style"]))
        adjusted_params["speech_rate"] = max(0.5, min(2.0, adjusted_params["speech_rate"]))

        logger.debug(
            f"Applied voice style: {style.value}",
            extra={
                "style": style.value,
                "stability": adjusted_params["stability"],
                "speech_rate": adjusted_params["speech_rate"],
            },
        )

        return adjusted_params


# Global service instance
voice_style_detector = VoiceStyleDetector()

"""
Emotion Fusion - Multi-Modal Emotion Combination

Combines emotion signals from multiple sources:
- Audio (Hume AI): 60% weight
- Prosody (Deepgram): 30% weight
- Text sentiment: 10% weight
"""

import logging
from dataclasses import dataclass
from typing import Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class FusionWeights:
    """Configurable weights for multi-modal fusion"""

    audio: float = 0.6
    prosody: float = 0.3
    text: float = 0.1

    def normalize(self) -> "FusionWeights":
        """Normalize weights to sum to 1.0"""
        total = self.audio + self.prosody + self.text
        if total > 0:
            return FusionWeights(
                audio=self.audio / total,
                prosody=self.prosody / total,
                text=self.text / total,
            )
        return FusionWeights()


class EmotionFusion:
    """
    Multi-modal emotion fusion service.

    Combines:
    - Hume AI audio emotions (primary signal)
    - Deepgram prosody features (speech rate, pitch, pauses)
    - Text sentiment analysis (when available)

    Higher confidence when sources agree.
    """

    # Prosody patterns mapped to emotions
    PROSODY_EMOTION_MAP = {
        # (speech_rate_high, pitch_variance_high, pause_ratio_low)
        "fast_irregular": "frustration",
        "fast_steady": "excitement",
        "slow_steady": "sadness",
        "slow_irregular": "confusion",
        "normal_steady": "neutral",
    }

    # Speech rate thresholds (words per minute normalized)
    SPEECH_RATE_FAST = 1.3
    SPEECH_RATE_SLOW = 0.7

    def __init__(self, weights: Optional[FusionWeights] = None):
        self.weights = weights or FusionWeights()
        logger.info(f"EmotionFusion initialized with weights: {self.weights}")

    async def fuse(
        self,
        audio_emotion: "EmotionState",
        prosody_features: Optional[Dict] = None,
        text: Optional[str] = None,
    ) -> "EmotionState":
        """
        Fuse emotions from multiple sources.

        Args:
            audio_emotion: Emotion from Hume AI audio analysis
            prosody_features: Deepgram prosody features (speech_rate, pitch, etc.)
            text: Transcript for text sentiment analysis

        Returns:
            Fused EmotionState with combined confidence
        """
        from . import EmotionState

        sources_used = ["audio"]
        valence_sum = audio_emotion.valence * self.weights.audio
        arousal_sum = audio_emotion.arousal * self.weights.audio
        confidence_factors = [audio_emotion.confidence * self.weights.audio]
        weight_sum = self.weights.audio

        # Fuse prosody if available
        if prosody_features:
            prosody_emotion = self._analyze_prosody(prosody_features)
            valence_sum += prosody_emotion["valence"] * self.weights.prosody
            arousal_sum += prosody_emotion["arousal"] * self.weights.prosody
            confidence_factors.append(prosody_emotion["confidence"] * self.weights.prosody)
            weight_sum += self.weights.prosody
            sources_used.append("prosody")

        # Fuse text sentiment if available
        if text:
            text_sentiment = await self._analyze_text(text)
            valence_sum += text_sentiment["valence"] * self.weights.text
            arousal_sum += text_sentiment["arousal"] * self.weights.text
            confidence_factors.append(text_sentiment["confidence"] * self.weights.text)
            weight_sum += self.weights.text
            sources_used.append("text")

        # Normalize
        fused_valence = valence_sum / weight_sum if weight_sum > 0 else 0.0
        fused_arousal = arousal_sum / weight_sum if weight_sum > 0 else 0.3

        # Calculate agreement bonus
        agreement_bonus = self._calculate_agreement_bonus(audio_emotion, prosody_features, text)
        base_confidence = sum(confidence_factors) / weight_sum if weight_sum > 0 else 0.0
        fused_confidence = min(1.0, base_confidence * (1 + agreement_bonus))

        # Determine dominant emotion from fused valence/arousal
        dominant_emotion = self._valence_arousal_to_emotion(fused_valence, fused_arousal)

        return EmotionState(
            valence=fused_valence,
            arousal=fused_arousal,
            dominant_emotion=dominant_emotion,
            confidence=fused_confidence,
            emotions=audio_emotion.emotions,  # Keep original emotion breakdown
            source=f"fusion({'+'.join(sources_used)})",
        )

    def _analyze_prosody(self, features: Dict) -> Dict[str, float]:
        """Extract emotion signals from prosody features"""
        speech_rate = features.get("speech_rate", 1.0)
        pitch_variance = features.get("pitch_variance", 0.5)
        pause_ratio = features.get("pause_ratio", 0.2)

        # Map prosody pattern to emotion
        is_fast = speech_rate > self.SPEECH_RATE_FAST
        is_slow = speech_rate < self.SPEECH_RATE_SLOW
        is_irregular = pitch_variance > 0.6

        if is_fast and is_irregular:
            valence, arousal = -0.3, 0.7  # frustration
        elif is_fast and not is_irregular:
            valence, arousal = 0.3, 0.7  # excitement
        elif is_slow and not is_irregular:
            valence, arousal = -0.4, 0.2  # sadness
        elif is_slow and is_irregular:
            valence, arousal = -0.2, 0.4  # confusion
        else:
            valence, arousal = 0.0, 0.4  # neutral

        return {
            "valence": valence,
            "arousal": arousal,
            "confidence": 0.6,  # Prosody alone is less reliable
        }

    async def _analyze_text(self, text: str) -> Dict[str, float]:
        """Extract sentiment from text (simple keyword approach)"""
        text_lower = text.lower()

        # Simple sentiment keywords
        positive_words = [
            "great",
            "good",
            "happy",
            "love",
            "thanks",
            "wonderful",
            "excellent",
        ]
        negative_words = [
            "bad",
            "wrong",
            "hate",
            "frustrated",
            "confused",
            "angry",
            "sad",
        ]

        positive_count = sum(1 for w in positive_words if w in text_lower)
        negative_count = sum(1 for w in negative_words if w in text_lower)

        if positive_count > negative_count:
            valence = min(0.5, positive_count * 0.2)
        elif negative_count > positive_count:
            valence = max(-0.5, -negative_count * 0.2)
        else:
            valence = 0.0

        return {
            "valence": valence,
            "arousal": 0.4,
            "confidence": 0.4,  # Text sentiment is least reliable
        }

    def _calculate_agreement_bonus(
        self,
        audio_emotion: "EmotionState",
        prosody_features: Optional[Dict],
        text: Optional[str],
    ) -> float:
        """Calculate confidence bonus when sources agree"""
        # TODO: Implement proper agreement calculation
        # For now, return small bonus if multiple sources
        source_count = 1
        if prosody_features:
            source_count += 1
        if text:
            source_count += 1

        return 0.1 * (source_count - 1)

    def _valence_arousal_to_emotion(self, valence: float, arousal: float) -> str:
        """Map valence/arousal to emotion label"""
        if arousal > 0.6:
            if valence > 0.3:
                return "excitement"
            elif valence < -0.3:
                return "anger"
            else:
                return "surprise"
        elif arousal < 0.3:
            if valence > 0.2:
                return "contentment"
            elif valence < -0.2:
                return "sadness"
            else:
                return "neutral"
        else:
            if valence > 0.3:
                return "joy"
            elif valence < -0.3:
                return "frustration"
            else:
                return "neutral"


__all__ = ["EmotionFusion", "FusionWeights"]

"""
Emotion Detection - Hume AI Integration

Handles audio emotion analysis using Hume AI's expression measurement API.
"""

import logging
from dataclasses import dataclass
from typing import Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class HumeEmotionResult:
    """Raw result from Hume AI emotion detection"""

    emotions: Dict[str, float]  # emotion_name -> confidence
    top_emotion: str
    top_confidence: float
    face_detected: bool = False
    voice_detected: bool = True


class EmotionDetection:
    """
    Hume AI integration for audio emotion analysis.

    Wraps the existing emotion_detection_service with cleaner interface.
    Will be migrated from services/emotion_detection_service.py
    """

    # Emotion mappings for valence/arousal
    EMOTION_VALENCE = {
        "joy": 0.8,
        "amusement": 0.7,
        "contentment": 0.5,
        "interest": 0.3,
        "surprise": 0.1,
        "concentration": 0.0,
        "contemplation": 0.0,
        "confusion": -0.2,
        "disappointment": -0.4,
        "sadness": -0.6,
        "anger": -0.5,
        "fear": -0.4,
        "disgust": -0.6,
        "frustration": -0.5,
        "anxiety": -0.3,
        "neutral": 0.0,
    }

    EMOTION_AROUSAL = {
        "anger": 0.9,
        "fear": 0.8,
        "surprise": 0.7,
        "excitement": 0.8,
        "joy": 0.6,
        "frustration": 0.7,
        "anxiety": 0.6,
        "interest": 0.5,
        "amusement": 0.5,
        "confusion": 0.4,
        "disappointment": 0.3,
        "sadness": 0.2,
        "contemplation": 0.2,
        "contentment": 0.3,
        "concentration": 0.4,
        "neutral": 0.3,
    }

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self._client = None
        logger.info("EmotionDetection initialized")

    async def _ensure_client(self):
        """Lazily initialize Hume client"""
        if self._client is None:
            # Import existing service for now, will be refactored
            try:
                from app.services.emotion_detection_service import EmotionDetectionService

                self._client = EmotionDetectionService()
                await self._client.initialize()
            except ImportError:
                logger.warning("EmotionDetectionService not available, using mock")
                self._client = "mock"

    async def analyze_audio(self, audio_data: bytes) -> "EmotionState":
        """
        Analyze audio for emotions using Hume AI.

        Args:
            audio_data: Raw audio bytes (16kHz, mono, 16-bit PCM)

        Returns:
            EmotionState with detected emotions
        """
        from . import EmotionState

        await self._ensure_client()

        if self._client == "mock":
            # Return neutral mock for testing
            return EmotionState(
                valence=0.0,
                arousal=0.3,
                dominant_emotion="neutral",
                confidence=0.5,
                emotions={"neutral": 0.5},
                source="mock",
            )

        try:
            # Use existing service
            result = await self._client.detect_emotions(audio_data)

            # Convert to EmotionState
            top_emotion = result.get("top_emotion", "neutral")
            emotions = result.get("emotions", {"neutral": 0.5})
            confidence = result.get("confidence", 0.5)

            valence = self.EMOTION_VALENCE.get(top_emotion, 0.0)
            arousal = self.EMOTION_AROUSAL.get(top_emotion, 0.3)

            return EmotionState(
                valence=valence,
                arousal=arousal,
                dominant_emotion=top_emotion,
                confidence=confidence,
                emotions=emotions,
                source="hume",
            )

        except Exception as e:
            logger.error(f"Emotion detection failed: {e}")
            return EmotionState(
                valence=0.0,
                arousal=0.3,
                dominant_emotion="neutral",
                confidence=0.0,
                emotions={"neutral": 1.0},
                source="fallback",
            )

    def map_to_valence_arousal(self, emotions: Dict[str, float]) -> tuple[float, float]:
        """Map emotion probabilities to valence/arousal space"""
        total_weight = sum(emotions.values())
        if total_weight == 0:
            return 0.0, 0.3

        weighted_valence = sum(self.EMOTION_VALENCE.get(e, 0.0) * p for e, p in emotions.items()) / total_weight

        weighted_arousal = sum(self.EMOTION_AROUSAL.get(e, 0.3) * p for e, p in emotions.items()) / total_weight

        return weighted_valence, weighted_arousal


__all__ = ["EmotionDetection", "HumeEmotionResult"]

"""
Emotion Engine - Consolidated Emotional Intelligence

This engine handles all emotion-related functionality:
- Detection: Hume AI integration for audio emotion analysis
- Personalization: User-specific baseline learning and deviation detection
- Fusion: Multi-modal emotion fusion (audio + prosody + text)
- Response Adaptation: Emotion-aware prompt injection for LLM
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class EmotionState:
    """Current emotion state with confidence and source tracking"""

    valence: float = 0.0  # -1 (negative) to 1 (positive)
    arousal: float = 0.5  # 0 (calm) to 1 (excited)
    dominant_emotion: str = "neutral"
    confidence: float = 0.0
    emotions: Dict[str, float] = field(default_factory=dict)
    source: str = "unknown"  # hume, prosody, fusion
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class UserEmotionBaseline:
    """User-specific emotion baseline for personalization"""

    user_id: str
    baseline_valence: float = 0.0
    baseline_arousal: float = 0.5
    variance_valence: float = 0.3
    variance_arousal: float = 0.2
    emotion_baselines: Dict[str, float] = field(default_factory=dict)
    cultural_profile: str = "western_individualist"
    total_samples: int = 0
    confidence_level: float = 0.0


class EmotionEngine:
    """
    Facade for all emotion-related functionality.

    Consolidates:
    - emotion_detection_service.py → detection.py
    - NEW personalization.py (baseline learning)
    - NEW fusion.py (multi-modal fusion)
    - NEW response_adaptation.py (prompt injection)
    """

    def __init__(self, event_bus=None, policy_config=None):
        self.event_bus = event_bus
        self.policy_config = policy_config
        self._detection = None
        self._personalization = None
        self._fusion = None
        self._response_adaptation = None
        logger.info("EmotionEngine initialized")

    async def initialize(self):
        """Initialize sub-components lazily"""
        from .detection import EmotionDetection
        from .fusion import EmotionFusion
        from .personalization import EmotionPersonalization
        from .response_adaptation import ResponseAdaptation

        self._detection = EmotionDetection()
        self._personalization = EmotionPersonalization(self.policy_config)
        self._fusion = EmotionFusion()
        self._response_adaptation = ResponseAdaptation()
        logger.info("EmotionEngine sub-components initialized")

    async def detect_emotion(
        self,
        audio_data: bytes,
        session_id: str,
        user_id: Optional[str] = None,
        prosody_features: Optional[Dict] = None,
        text: Optional[str] = None,
    ) -> EmotionState:
        """
        Detect emotion from audio with optional fusion.

        Args:
            audio_data: Raw audio bytes
            session_id: Current session ID
            user_id: Optional user ID for personalization
            prosody_features: Optional Deepgram prosody features
            text: Optional transcript for sentiment analysis

        Returns:
            EmotionState with fused emotion analysis
        """
        if not self._detection:
            await self.initialize()

        # Get raw emotion from audio (Hume AI)
        audio_emotion = await self._detection.analyze_audio(audio_data)

        # Fuse with prosody and text if available
        if prosody_features or text:
            fused_emotion = await self._fusion.fuse(
                audio_emotion=audio_emotion,
                prosody_features=prosody_features,
                text=text,
            )
        else:
            fused_emotion = audio_emotion

        # Apply personalization if user_id provided
        if user_id and self._personalization:
            baseline = await self._personalization.get_baseline(user_id)
            deviation = await self._personalization.check_deviation(fused_emotion, baseline)

            # Update baseline with new sample (EMA)
            await self._personalization.update_baseline(user_id, fused_emotion)

            # Publish deviation event if significant
            if deviation and self.event_bus:
                await self.event_bus.publish_event(
                    event_type="emotion.deviation",
                    data={
                        "user_id": user_id,
                        "session_id": session_id,
                        "emotion": fused_emotion.dominant_emotion,
                        "deviation_score": deviation,
                    },
                    session_id=session_id,
                    source_engine="emotion",
                )

        # Publish emotion update event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="emotion.updated",
                data={
                    "session_id": session_id,
                    "emotion": fused_emotion.dominant_emotion,
                    "valence": fused_emotion.valence,
                    "arousal": fused_emotion.arousal,
                    "confidence": fused_emotion.confidence,
                },
                session_id=session_id,
                source_engine="emotion",
            )

        return fused_emotion

    async def get_prompt_adaptation(
        self,
        emotion_state: EmotionState,
        context: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Get prompt adaptation based on detected emotion.

        Returns dict with:
        - system_prompt_addition: Text to inject into system prompt
        - tone_guidance: Recommended response tone
        - pacing_hint: Suggested response pacing
        """
        if not self._response_adaptation:
            await self.initialize()

        return await self._response_adaptation.get_adaptation(emotion_state, context)

    async def get_user_baseline(self, user_id: str) -> Optional[UserEmotionBaseline]:
        """Get user's emotion baseline if available"""
        if not self._personalization:
            await self.initialize()
        return await self._personalization.get_baseline(user_id)

    async def reset_user_baseline(self, user_id: str) -> bool:
        """Reset user's emotion baseline (privacy feature)"""
        if not self._personalization:
            await self.initialize()
        return await self._personalization.reset_baseline(user_id)


__all__ = ["EmotionEngine", "EmotionState", "UserEmotionBaseline"]

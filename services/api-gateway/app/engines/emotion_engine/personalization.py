"""
Emotion Personalization - User Baseline Learning

Learns user-specific emotional baselines using exponential moving average.
Detects significant deviations from baseline for adaptive responses.
"""

import logging
import math
from dataclasses import dataclass
from typing import Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class DeviationResult:
    """Result of deviation check from baseline"""

    is_significant: bool
    deviation_score: float  # z-score
    direction: str  # "positive", "negative", "neutral"
    emotion_change: Optional[str] = None


class EmotionPersonalization:
    """
    User-specific emotion baseline learning and deviation detection.

    Uses exponential moving average (EMA) to learn baseline:
    - baseline_new = alpha * current + (1 - alpha) * baseline_old

    Uses z-score for deviation detection:
    - z = (current - baseline) / std_dev
    - Significant if |z| > threshold (default: 1.5)
    """

    DEFAULT_ALPHA = 0.05  # Learning rate for EMA
    DEFAULT_DEVIATION_THRESHOLD = 1.5  # Z-score threshold
    MIN_SAMPLES_FOR_BASELINE = 10  # Samples before baseline is reliable

    def __init__(self, policy_config=None):
        self.policy_config = policy_config
        self._baselines: Dict[str, "UserEmotionBaseline"] = {}

        # Get config values
        if policy_config:
            self.alpha = getattr(policy_config, "baseline_learning_rate", self.DEFAULT_ALPHA)
            self.deviation_threshold = getattr(
                policy_config,
                "emotion_deviation_threshold",
                self.DEFAULT_DEVIATION_THRESHOLD,
            )
        else:
            self.alpha = self.DEFAULT_ALPHA
            self.deviation_threshold = self.DEFAULT_DEVIATION_THRESHOLD

        logger.info(
            f"EmotionPersonalization initialized " f"(alpha={self.alpha}, threshold={self.deviation_threshold})"
        )

    async def get_baseline(self, user_id: str) -> Optional["UserEmotionBaseline"]:
        """Get user's emotion baseline, loading from DB if needed"""
        from . import UserEmotionBaseline

        if user_id in self._baselines:
            return self._baselines[user_id]

        # Try to load from database
        baseline = await self._load_from_db(user_id)
        if baseline:
            self._baselines[user_id] = baseline
            return baseline

        # Create new baseline
        baseline = UserEmotionBaseline(user_id=user_id)
        self._baselines[user_id] = baseline
        return baseline

    async def update_baseline(self, user_id: str, emotion_state: "EmotionState") -> "UserEmotionBaseline":
        """Update baseline with new emotion sample using EMA"""

        baseline = await self.get_baseline(user_id)

        # Update valence/arousal using EMA
        baseline.baseline_valence = self.alpha * emotion_state.valence + (1 - self.alpha) * baseline.baseline_valence
        baseline.baseline_arousal = self.alpha * emotion_state.arousal + (1 - self.alpha) * baseline.baseline_arousal

        # Update variance estimates (simple running variance)
        if baseline.total_samples > 0:
            # Welford's online algorithm for variance
            delta = emotion_state.valence - baseline.baseline_valence
            baseline.variance_valence = (1 - self.alpha) * baseline.variance_valence + self.alpha * delta * delta
            delta_arousal = emotion_state.arousal - baseline.baseline_arousal
            baseline.variance_arousal = (
                1 - self.alpha
            ) * baseline.variance_arousal + self.alpha * delta_arousal * delta_arousal

        # Update per-emotion baselines
        for emotion, score in emotion_state.emotions.items():
            if emotion in baseline.emotion_baselines:
                baseline.emotion_baselines[emotion] = (
                    self.alpha * score + (1 - self.alpha) * baseline.emotion_baselines[emotion]
                )
            else:
                baseline.emotion_baselines[emotion] = score

        baseline.total_samples += 1

        # Update confidence level (asymptotically approaches 1.0)
        baseline.confidence_level = min(1.0, baseline.total_samples / self.MIN_SAMPLES_FOR_BASELINE)

        # Persist to database periodically
        if baseline.total_samples % 10 == 0:
            await self._save_to_db(baseline)

        return baseline

    async def check_deviation(
        self,
        emotion_state: "EmotionState",
        baseline: Optional["UserEmotionBaseline"],
    ) -> Optional[float]:
        """
        Check if current emotion significantly deviates from baseline.

        Returns deviation score (z-score) if significant, None otherwise.
        """
        if not baseline or baseline.confidence_level < 0.5:
            # Not enough data for reliable deviation detection
            return None

        # Calculate z-score for valence
        std_valence = math.sqrt(max(baseline.variance_valence, 0.01))
        z_valence = abs(emotion_state.valence - baseline.baseline_valence) / std_valence

        # Calculate z-score for arousal
        std_arousal = math.sqrt(max(baseline.variance_arousal, 0.01))
        z_arousal = abs(emotion_state.arousal - baseline.baseline_arousal) / std_arousal

        # Combined deviation score
        deviation_score = max(z_valence, z_arousal)

        if deviation_score > self.deviation_threshold:
            logger.info(
                f"Significant emotion deviation for user {baseline.user_id}: "
                f"z={deviation_score:.2f} (threshold={self.deviation_threshold})"
            )
            return deviation_score

        return None

    async def get_deviation_details(
        self,
        emotion_state: "EmotionState",
        baseline: "UserEmotionBaseline",
    ) -> DeviationResult:
        """Get detailed deviation analysis"""
        std_valence = math.sqrt(max(baseline.variance_valence, 0.01))
        z_valence = (emotion_state.valence - baseline.baseline_valence) / std_valence

        std_arousal = math.sqrt(max(baseline.variance_arousal, 0.01))
        z_arousal = (emotion_state.arousal - baseline.baseline_arousal) / std_arousal

        deviation_score = max(abs(z_valence), abs(z_arousal))
        is_significant = deviation_score > self.deviation_threshold

        # Determine direction
        if z_valence > 0.5:
            direction = "positive"
        elif z_valence < -0.5:
            direction = "negative"
        else:
            direction = "neutral"

        # Check for emotion change
        emotion_change = None
        if is_significant:
            # Find which emotion changed most
            for emotion, score in emotion_state.emotions.items():
                baseline_score = baseline.emotion_baselines.get(emotion, 0.0)
                if abs(score - baseline_score) > 0.2:
                    emotion_change = emotion
                    break

        return DeviationResult(
            is_significant=is_significant,
            deviation_score=deviation_score,
            direction=direction,
            emotion_change=emotion_change,
        )

    async def reset_baseline(self, user_id: str) -> bool:
        """Reset user's emotion baseline (privacy feature)"""

        if user_id in self._baselines:
            del self._baselines[user_id]

        # Delete from database
        await self._delete_from_db(user_id)

        logger.info(f"Reset emotion baseline for user {user_id}")
        return True

    async def _load_from_db(self, user_id: str) -> Optional["UserEmotionBaseline"]:
        """Load baseline from database"""
        # TODO: Implement database loading
        # For now, return None to use in-memory only
        return None

    async def _save_to_db(self, baseline: "UserEmotionBaseline") -> None:
        """Save baseline to database"""
        # TODO: Implement database persistence
        logger.debug(f"Would save baseline for user {baseline.user_id}")

    async def _delete_from_db(self, user_id: str) -> None:
        """Delete baseline from database"""
        # TODO: Implement database deletion
        logger.debug(f"Would delete baseline for user {user_id}")


__all__ = ["EmotionPersonalization", "DeviationResult"]

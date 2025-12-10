"""
PHI Confidence Calibrator - Platt Scaling for Model Confidence

Calibrates raw model confidence scores to better reflect true
probabilities using Platt scaling (logistic regression).

Phase 4 Features:
- Platt scaling calibration
- Per-category calibration parameters
- Online learning from user feedback
- Persistence of calibration parameters
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


@dataclass
class CalibrationParameters:
    """Platt scaling parameters for a PHI category"""

    a: float = 0.0  # Logistic slope
    b: float = 0.0  # Logistic intercept
    n_samples: int = 0  # Number of training samples
    last_updated: datetime = field(default_factory=datetime.utcnow)


@dataclass
class CalibrationFeedback:
    """Feedback for calibration learning"""

    phi_category: str
    raw_confidence: float
    is_correct: bool  # Whether detection was true positive
    timestamp: datetime = field(default_factory=datetime.utcnow)


class PHIConfidenceCalibrator:
    """
    Calibrates PHI detection confidence using Platt scaling.

    Platt scaling fits a sigmoid function to transform raw model
    scores into calibrated probabilities:

        P(y=1|f) = 1 / (1 + exp(A*f + B))

    Where A and B are learned from labeled validation data.

    Features:
    - Per-category calibration parameters
    - Online learning from user corrections
    - Default parameters for cold start
    - Persists calibration state to Redis

    Usage:
        calibrator = PHIConfidenceCalibrator()
        calibrated_detections = calibrator.calibrate_batch(detections)
    """

    # Default calibration parameters (trained offline)
    # These are reasonable defaults that slightly reduce overconfidence
    DEFAULT_PARAMS = {
        "name": CalibrationParameters(a=-2.5, b=0.8),
        "date": CalibrationParameters(a=-1.5, b=0.3),
        "dob": CalibrationParameters(a=-1.8, b=0.5),
        "ssn": CalibrationParameters(a=-0.5, b=0.1),  # Regex is accurate
        "mrn": CalibrationParameters(a=-1.0, b=0.2),
        "phone": CalibrationParameters(a=-0.8, b=0.15),
        "email": CalibrationParameters(a=-0.3, b=0.05),  # Regex is accurate
        "address": CalibrationParameters(a=-2.8, b=0.9),  # NER often overconfident
        "default": CalibrationParameters(a=-1.5, b=0.4),
    }

    # Learning rate for online updates
    LEARNING_RATE = 0.01
    MIN_SAMPLES_FOR_UPDATE = 10

    def __init__(
        self,
        redis_client=None,
        persist_key: str = "phi:calibration",
    ):
        self.redis_client = redis_client
        self._persist_key = persist_key
        self._params: Dict[str, CalibrationParameters] = {}
        self._feedback_buffer: List[CalibrationFeedback] = []

        # Initialize with defaults
        for category, params in self.DEFAULT_PARAMS.items():
            self._params[category] = CalibrationParameters(
                a=params.a,
                b=params.b,
            )

        logger.info("PHIConfidenceCalibrator initialized")

    async def initialize(self) -> None:
        """Load persisted calibration parameters"""
        if self.redis_client:
            await self._load_from_redis()

    def calibrate(
        self,
        detection: "EnhancedPHIDetection",
    ) -> "EnhancedPHIDetection":
        """
        Calibrate confidence for a single detection.

        Args:
            detection: Detection with raw confidence

        Returns:
            Detection with calibrated confidence
        """
        category = detection.phi_category.value
        params = self._get_params(category)

        calibrated = self._apply_platt_scaling(
            detection.raw_confidence,
            params.a,
            params.b,
        )

        detection.calibrated_confidence = calibrated
        return detection

    def calibrate_batch(
        self,
        detections: List["EnhancedPHIDetection"],
    ) -> List["EnhancedPHIDetection"]:
        """
        Calibrate confidence for a batch of detections.

        Args:
            detections: List of detections with raw confidence

        Returns:
            List of detections with calibrated confidence
        """
        return [self.calibrate(d) for d in detections]

    def _apply_platt_scaling(
        self,
        raw_score: float,
        a: float,
        b: float,
    ) -> float:
        """
        Apply Platt scaling sigmoid transformation.

        P(y=1|f) = 1 / (1 + exp(A*f + B))
        """
        try:
            logit = a * raw_score + b
            # Clip to prevent overflow
            logit = max(-50, min(50, logit))
            return 1.0 / (1.0 + math.exp(logit))
        except (ValueError, OverflowError):
            return raw_score

    def _get_params(self, category: str) -> CalibrationParameters:
        """Get calibration parameters for category"""
        return self._params.get(category, self._params["default"])

    async def record_feedback(
        self,
        phi_category: str,
        raw_confidence: float,
        is_correct: bool,
    ) -> None:
        """
        Record feedback for calibration learning.

        Args:
            phi_category: PHI category string
            raw_confidence: Raw model confidence
            is_correct: Whether detection was correct (true positive)
        """
        feedback = CalibrationFeedback(
            phi_category=phi_category,
            raw_confidence=raw_confidence,
            is_correct=is_correct,
        )
        self._feedback_buffer.append(feedback)

        # Trigger update if enough samples
        category_feedback = [f for f in self._feedback_buffer if f.phi_category == phi_category]

        if len(category_feedback) >= self.MIN_SAMPLES_FOR_UPDATE:
            await self._update_parameters(phi_category, category_feedback)
            # Clear processed feedback
            self._feedback_buffer = [f for f in self._feedback_buffer if f.phi_category != phi_category]

    async def _update_parameters(
        self,
        category: str,
        feedback_samples: List[CalibrationFeedback],
    ) -> None:
        """
        Update calibration parameters using gradient descent.

        Uses online logistic regression to update Platt parameters.
        """
        if category not in self._params:
            self._params[category] = CalibrationParameters()

        params = self._params[category]

        # Compute gradients from feedback
        grad_a = 0.0
        grad_b = 0.0

        for sample in feedback_samples:
            pred = self._apply_platt_scaling(
                sample.raw_confidence,
                params.a,
                params.b,
            )
            error = pred - (1.0 if sample.is_correct else 0.0)

            grad_a += error * sample.raw_confidence
            grad_b += error

        # Average gradients
        n = len(feedback_samples)
        grad_a /= n
        grad_b /= n

        # Update parameters with gradient descent
        params.a -= self.LEARNING_RATE * grad_a
        params.b -= self.LEARNING_RATE * grad_b
        params.n_samples += n
        params.last_updated = datetime.utcnow()

        logger.info(f"Updated calibration for {category}: " f"a={params.a:.4f}, b={params.b:.4f}, n={params.n_samples}")

        # Persist to Redis
        if self.redis_client:
            await self._save_to_redis()

    async def _load_from_redis(self) -> bool:
        """Load calibration parameters from Redis"""
        try:
            import json

            data = await self.redis_client.get(self._persist_key)
            if data:
                params_dict = json.loads(data)
                for category, values in params_dict.items():
                    self._params[category] = CalibrationParameters(
                        a=values.get("a", 0.0),
                        b=values.get("b", 0.0),
                        n_samples=values.get("n_samples", 0),
                    )
                logger.info(f"Loaded calibration params for {len(params_dict)} categories")
                return True
        except Exception as e:
            logger.error(f"Failed to load calibration from Redis: {e}")
        return False

    async def _save_to_redis(self) -> bool:
        """Save calibration parameters to Redis"""
        try:
            import json

            params_dict = {
                category: {
                    "a": params.a,
                    "b": params.b,
                    "n_samples": params.n_samples,
                    "last_updated": params.last_updated.isoformat(),
                }
                for category, params in self._params.items()
            }
            await self.redis_client.set(
                self._persist_key,
                json.dumps(params_dict),
            )
            return True
        except Exception as e:
            logger.error(f"Failed to save calibration to Redis: {e}")
        return False

    def get_category_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get calibration statistics per category"""
        return {
            category: {
                "a": params.a,
                "b": params.b,
                "n_samples": params.n_samples,
                "last_updated": params.last_updated.isoformat(),
            }
            for category, params in self._params.items()
        }

    def reset_category(self, category: str) -> bool:
        """Reset calibration parameters for a category to defaults"""
        if category in self.DEFAULT_PARAMS:
            default = self.DEFAULT_PARAMS[category]
            self._params[category] = CalibrationParameters(
                a=default.a,
                b=default.b,
            )
            return True
        return False

    def set_parameters(
        self,
        category: str,
        a: float,
        b: float,
    ) -> None:
        """Manually set calibration parameters"""
        self._params[category] = CalibrationParameters(a=a, b=b)
        logger.info(f"Set calibration for {category}: a={a}, b={b}")


__all__ = [
    "PHIConfidenceCalibrator",
    "CalibrationParameters",
    "CalibrationFeedback",
]

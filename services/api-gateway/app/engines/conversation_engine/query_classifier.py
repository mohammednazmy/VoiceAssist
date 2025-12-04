"""
Query Classifier - ML-Based Query Type Classification

Classifies user queries to determine optimal response strategy.
Uses lightweight ONNX model (fine-tuned DistilBERT) or heuristics fallback.

Supports A/B testing between ML and heuristic approaches.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ClassificationFeatures:
    """Features extracted for classification"""

    text_length: int
    word_count: int
    has_question_mark: bool
    starts_with_question_word: bool
    contains_urgent_words: bool
    contains_command_words: bool
    speech_rate: float
    is_fast_speech: bool


@dataclass
class ClassificationLog:
    """Log entry for A/B testing analytics"""

    text: str
    query_type: str
    domain: str
    confidence: float
    variant: str  # "ml" or "heuristic"
    latency_ms: float
    timestamp: datetime = field(default_factory=datetime.utcnow)
    user_id: Optional[str] = None
    session_id: Optional[str] = None


class QueryClassifier:
    """
    ML-based query type classifier.

    Query types:
    - simple: Quick factual questions, short responses
    - complex: Multi-step reasoning, detailed responses
    - urgent: Time-sensitive, prioritize speed
    - clarification: User asking for clarification
    - command: Direct command/request

    Domains:
    - medical: Clinical/health-related
    - calendar: Scheduling/time management
    - technical: Technical/system queries
    - general: Everything else
    """

    QUESTION_WORDS = {
        "what",
        "who",
        "where",
        "when",
        "why",
        "how",
        "which",
        "is",
        "are",
        "do",
        "does",
        "can",
        "could",
        "would",
        "should",
    }
    URGENT_WORDS = {"urgent", "emergency", "asap", "immediately", "quickly", "stat", "critical", "now"}
    COMMAND_WORDS = {"do", "make", "create", "send", "order", "prescribe", "schedule", "cancel", "stop", "start"}
    MEDICAL_WORDS = {
        "patient",
        "medication",
        "diagnosis",
        "symptom",
        "prescription",
        "lab",
        "vital",
        "blood",
        "pain",
        "dose",
    }

    # Response timing configuration
    TIMING_CONFIG = {
        "simple": {"delay_ms": 200, "use_filler": False, "length": "brief"},
        "complex": {"delay_ms": 600, "use_filler": True, "length": "detailed"},
        "urgent": {"delay_ms": 100, "use_filler": False, "length": "brief"},
        "clarification": {"delay_ms": 300, "use_filler": False, "length": "normal"},
        "command": {"delay_ms": 150, "use_filler": False, "length": "brief"},
    }

    def __init__(
        self,
        use_ml: bool = False,
        event_bus=None,
        policy_service=None,
    ):
        self.use_ml = use_ml
        self.event_bus = event_bus
        self.policy_service = policy_service
        self._model = None
        self._ml_classifier = None
        self._classification_logs: List[ClassificationLog] = []
        self._max_logs = 1000
        logger.info(f"QueryClassifier initialized (ml={use_ml})")

    async def classify(
        self,
        text: str,
        prosody_features: Optional[Dict] = None,
        emotion_state: Optional[Dict] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> "QueryClassification":
        """
        Classify query and return response strategy.

        Uses A/B testing to compare ML vs heuristic classification.
        Publishes query.classified event through event bus.
        """
        import time

        start_time = time.time()

        # Determine variant from A/B test
        variant = self._get_ab_variant(user_id)

        # Classify based on variant
        if variant == "ml" and self._ml_classifier:
            result = await self._classify_with_ml(text, prosody_features, emotion_state)
        else:
            result = self._classify_heuristic(text, prosody_features, emotion_state)
            variant = "heuristic"

        latency_ms = (time.time() - start_time) * 1000

        # Log for A/B test analytics
        log_entry = ClassificationLog(
            text=text[:200],  # Truncate for privacy
            query_type=result.query_type,
            domain=result.domain,
            confidence=result.confidence,
            variant=variant,
            latency_ms=latency_ms,
            user_id=user_id,
            session_id=session_id,
        )
        self._add_log(log_entry)

        # Publish event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="query.classified",
                data={
                    "query_type": result.query_type,
                    "domain": result.domain,
                    "confidence": result.confidence,
                    "variant": variant,
                    "latency_ms": latency_ms,
                    "recommended_delay_ms": result.recommended_delay_ms,
                },
                session_id=session_id or "unknown",
                source_engine="conversation",
            )

        return result

    def _get_ab_variant(self, user_id: Optional[str]) -> str:
        """Get A/B test variant for user"""
        if not self.policy_service or not user_id:
            return "heuristic"

        variant = self.policy_service.get_variant("ml_query_classifier", user_id)
        return variant if variant else "heuristic"

    def _add_log(self, log: ClassificationLog) -> None:
        """Add log entry with size limit"""
        self._classification_logs.append(log)
        if len(self._classification_logs) > self._max_logs:
            self._classification_logs.pop(0)

    async def get_ab_metrics(self) -> Dict[str, Any]:
        """Get A/B test metrics for comparison"""
        ml_logs = [l for l in self._classification_logs if l.variant == "ml"]
        heuristic_logs = [l for l in self._classification_logs if l.variant == "heuristic"]

        def compute_stats(logs: List[ClassificationLog]) -> Dict[str, Any]:
            if not logs:
                return {"count": 0}

            latencies = [l.latency_ms for l in logs]
            confidences = [l.confidence for l in logs]

            return {
                "count": len(logs),
                "avg_latency_ms": sum(latencies) / len(latencies),
                "p95_latency_ms": sorted(latencies)[int(len(latencies) * 0.95)] if len(latencies) >= 20 else None,
                "avg_confidence": sum(confidences) / len(confidences),
                "type_distribution": self._compute_type_distribution(logs),
            }

        return {
            "ml": compute_stats(ml_logs),
            "heuristic": compute_stats(heuristic_logs),
        }

    def _compute_type_distribution(self, logs: List[ClassificationLog]) -> Dict[str, int]:
        """Compute query type distribution"""
        dist = {}
        for log in logs:
            dist[log.query_type] = dist.get(log.query_type, 0) + 1
        return dist

    async def _classify_with_ml(
        self,
        text: str,
        prosody_features: Optional[Dict],
        emotion_state: Optional[Dict],
    ) -> "QueryClassification":
        """Classify using ML model with fallback"""
        from . import QueryClassification

        if not self._ml_classifier:
            return self._classify_heuristic(text, prosody_features, emotion_state)

        result = await self._ml_classifier.classify(text, prosody_features, emotion_state)

        # Convert to QueryClassification
        timing = self.TIMING_CONFIG.get(result.query_type, self.TIMING_CONFIG["simple"])

        return QueryClassification(
            query_type=result.query_type,
            confidence=result.confidence,
            estimated_response_length=timing["length"],
            recommended_delay_ms=timing["delay_ms"],
            use_filler=timing["use_filler"],
            domain=result.domain,
        )

    async def load_ml_classifier(
        self,
        model_path: str,
        tokenizer_path: str,
    ) -> bool:
        """Load ML classifier for production use"""
        from .ml_classifier import MLQueryClassifier

        self._ml_classifier = MLQueryClassifier(
            model_path=model_path,
            tokenizer_path=tokenizer_path,
        )

        success = await self._ml_classifier.load()
        if success:
            self.use_ml = True
            logger.info("ML classifier loaded successfully")
        return success

    def _classify_heuristic(
        self,
        text: str,
        prosody_features: Optional[Dict] = None,
        emotion_state: Optional[Dict] = None,
    ) -> "QueryClassification":
        """Heuristic-based classification"""
        from . import QueryClassification

        text_lower = text.lower().strip()
        words = text_lower.split()
        word_count = len(words)

        # Extract features
        has_question_mark = "?" in text
        starts_with_question = bool(words and words[0] in self.QUESTION_WORDS)
        contains_urgent = any(w in text_lower for w in self.URGENT_WORDS)
        contains_command = bool(words and words[0] in self.COMMAND_WORDS)
        contains_medical = any(w in text_lower for w in self.MEDICAL_WORDS)

        # Determine domain
        if contains_medical:
            domain = "medical"
        elif any(w in text_lower for w in ["schedule", "calendar", "meeting", "appointment"]):
            domain = "calendar"
        elif any(w in text_lower for w in ["system", "error", "debug", "code"]):
            domain = "technical"
        else:
            domain = "general"

        # Determine query type
        confidence = 0.7

        if contains_urgent:
            query_type = "urgent"
            confidence = 0.9
        elif contains_command:
            query_type = "command"
            confidence = 0.8
        elif "clarify" in text_lower or "explain" in text_lower or "what do you mean" in text_lower:
            query_type = "clarification"
            confidence = 0.85
        elif word_count < 10 and (has_question_mark or starts_with_question):
            query_type = "simple"
            confidence = 0.75
        elif word_count > 20 or "explain" in text_lower or "describe" in text_lower:
            query_type = "complex"
            confidence = 0.7
        else:
            query_type = "simple"
            confidence = 0.6

        # Adjust for emotion if frustrated/confused → prefer brief responses
        if emotion_state:
            emotion = emotion_state.get("dominant_emotion", "neutral")
            if emotion in ["frustration", "anger"]:
                if query_type == "complex":
                    query_type = "simple"  # Switch to brief for frustrated users

        # Get timing config
        timing = self.TIMING_CONFIG[query_type]

        return QueryClassification(
            query_type=query_type,
            confidence=confidence,
            estimated_response_length=timing["length"],
            recommended_delay_ms=timing["delay_ms"],
            use_filler=timing["use_filler"],
            domain=domain,
        )

    async def _classify_ml(
        self,
        text: str,
        prosody_features: Optional[Dict],
        emotion_state: Optional[Dict],
    ) -> "QueryClassification":
        """ML-based classification using ONNX model"""

        # TODO: Implement ONNX model inference
        # For now, fall back to heuristics
        logger.warning("ML classifier not implemented, using heuristics")
        return self._classify_heuristic(text, prosody_features, emotion_state)

    async def load_model(self, model_path: str) -> bool:
        """Load ONNX model for ML classification"""
        try:
            import onnxruntime as ort

            self._model = ort.InferenceSession(model_path)
            self.use_ml = True
            logger.info(f"Loaded query classifier model from {model_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return False


__all__ = ["QueryClassifier", "ClassificationFeatures", "ClassificationLog"]

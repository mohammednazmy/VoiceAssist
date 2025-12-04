"""
Conversation Engine - Turn-Taking and Repair Strategies

This engine handles all conversation flow functionality:
- Query Classification: ML-based query type classification
- Turn-Taking: Predictive turn-taking using prosody and content signals
- Repair Tracking: Multi-turn repair strategy management
- Progressive Response: Domain-specific fillers and timing
- Reference Resolution: Pronoun and entity disambiguation (Phase 3)
- A/B Testing: Feature flag integration for phased rollout

Phase 3 Enhancements:
- prosody.turn_signal events for cross-engine coordination
- Emotion-aware repair escalation
- Reference resolution with clarification prompts
- Per-user calibration support
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class QueryClassification:
    """Result of query classification"""

    query_type: str  # simple, complex, urgent, clarification, command
    confidence: float
    estimated_response_length: str  # brief, normal, detailed
    recommended_delay_ms: int
    use_filler: bool
    domain: Optional[str] = None  # medical, calendar, general, etc.


@dataclass
class TurnState:
    """Current turn-taking state"""

    is_user_speaking: bool = False
    turn_probability: float = 0.0  # Probability user has finished
    completion_signals: List[str] = field(default_factory=list)
    continuation_signals: List[str] = field(default_factory=list)
    last_update: datetime = field(default_factory=datetime.utcnow)


@dataclass
class RepairAttempt:
    """Record of a repair attempt"""

    strategy: str
    transcript_before: str
    transcript_after: Optional[str] = None
    resolved: bool = False
    timestamp: datetime = field(default_factory=datetime.utcnow)


class ConversationEngine:
    """
    Facade for all conversation management functionality.

    Consolidates:
    - query_classifier.py (ML-based classification)
    - turn_taking.py (predictive turn-taking with prosody signals)
    - repair_tracker.py (multi-turn repair with emotion-aware escalation)
    - progressive_response.py (fillers and timing)
    - reference_resolver.py (pronoun/entity resolution) [Phase 3]

    Phase 3 Features (A/B tested):
    - predictive_turn_signal_events: Emit prosody.turn_signal events
    - emotion_aware_backchannels: Select phrases based on emotion
    - reference_resolution: Resolve pronouns using memory context
    - repair_emotion_escalation: Emotion-based repair thresholds
    """

    def __init__(self, event_bus=None, policy_config=None, policy_service=None):
        self.event_bus = event_bus
        self.policy_config = policy_config
        self.policy_service = policy_service
        self._query_classifier = None
        self._turn_taking = None
        self._repair_tracker = None
        self._progressive_response = None
        self._reference_resolver = None
        self._memory_engine = None
        # Legacy feature flags (superseded by policy_service when available)
        self._active_features = {
            "predictive_turn_taking": True,
            "progressive_response": True,
        }
        logger.info("ConversationEngine initialized")

    async def initialize(self, memory_engine=None):
        """Initialize sub-components lazily"""
        from .progressive_response import ProgressiveResponse
        from .query_classifier import QueryClassifier
        from .reference_resolver import ReferenceResolver
        from .repair_tracker import RepairTracker
        from .turn_taking import PredictiveTurnTakingEngine

        self._memory_engine = memory_engine
        self._query_classifier = QueryClassifier()
        # Pass event_bus for prosody.turn_signal events
        self._turn_taking = PredictiveTurnTakingEngine(
            policy_config=self.policy_config,
            event_bus=self.event_bus,
        )
        # Pass policy_service for emotion-aware escalation thresholds
        self._repair_tracker = RepairTracker(
            event_bus=self.event_bus,
            policy_service=self.policy_service,
        )
        self._progressive_response = ProgressiveResponse()
        # Initialize reference resolver for Phase 3
        self._reference_resolver = ReferenceResolver(
            memory_engine=memory_engine,
            event_bus=self.event_bus,
        )
        logger.info("ConversationEngine sub-components initialized")

    async def classify_query(
        self,
        text: str,
        prosody_features: Optional[Dict] = None,
        emotion_state: Optional[Dict] = None,
        session_id: Optional[str] = None,
    ) -> QueryClassification:
        """
        Classify query to determine response strategy.

        Args:
            text: User's query text
            prosody_features: Optional prosody features from STT
            emotion_state: Optional current emotion state
            session_id: Optional session ID for event publishing

        Returns:
            QueryClassification with type, timing, and filler guidance
        """
        if not self._query_classifier:
            await self.initialize()

        classification = await self._query_classifier.classify(text, prosody_features, emotion_state)

        # Publish classification event
        if self.event_bus and session_id:
            await self.event_bus.publish_event(
                event_type="query.classified",
                data={
                    "session_id": session_id,
                    "query_type": classification.query_type,
                    "confidence": classification.confidence,
                    "domain": classification.domain,
                },
                session_id=session_id,
                source_engine="conversation",
            )

        return classification

    def _is_feature_enabled(self, feature: str, user_id: Optional[str] = None) -> bool:
        """
        Check if a feature is enabled via policy service or legacy flags.

        Uses A/B test variant assignment when policy_service is available.
        """
        if self.policy_service:
            return self.policy_service.is_feature_enabled(feature, user_id)
        # Fallback to legacy feature flags
        return self._active_features.get(feature, False)

    def _get_ab_variant(self, test_name: str, user_id: str) -> Optional[str]:
        """Get A/B test variant for a user"""
        if self.policy_service:
            return self.policy_service.get_variant(test_name, user_id)
        return None

    async def check_turn_completion(
        self,
        transcript: str,
        prosody_features: Optional[Dict] = None,
        silence_duration_ms: int = 0,
        user_id: Optional[str] = None,
    ) -> TurnState:
        """
        Check if user has completed their turn.

        Uses syntactic and prosodic signals to predict turn completion.
        """
        if not self._turn_taking:
            await self.initialize()

        if not self._is_feature_enabled("predictive_turn_taking", user_id):
            # Fallback to simple silence-based detection
            return TurnState(
                is_user_speaking=silence_duration_ms < 500,
                turn_probability=1.0 if silence_duration_ms > 700 else 0.0,
            )

        return await self._turn_taking.check_completion(transcript, prosody_features, silence_duration_ms, user_id)

    async def get_filler_response(
        self,
        query_classification: QueryClassification,
        emotion_state: Optional[Dict] = None,
    ) -> Optional[str]:
        """
        Get appropriate filler/thinking response.

        Returns None if no filler should be used.
        """
        if not self._progressive_response:
            await self.initialize()

        if not self._active_features.get("progressive_response", True):
            return None

        if not query_classification.use_filler:
            return None

        return await self._progressive_response.get_filler(query_classification, emotion_state)

    async def start_repair(
        self,
        session_id: str,
        user_id: str,
        transcript: str,
        error_type: str,
        emotion_state: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Start a repair sequence for failed understanding.

        Returns repair strategy with suggested response.
        """
        if not self._repair_tracker:
            await self.initialize()

        return await self._repair_tracker.start_repair(session_id, user_id, transcript, error_type, emotion_state)

    async def record_repair_outcome(
        self,
        session_id: str,
        resolved: bool,
        transcript_after: Optional[str] = None,
    ) -> None:
        """Record outcome of repair attempt"""
        if not self._repair_tracker:
            await self.initialize()

        await self._repair_tracker.record_outcome(session_id, resolved, transcript_after)

    def disable_feature(self, feature: str) -> None:
        """Disable a feature (e.g., during degradation)"""
        if feature in self._active_features:
            self._active_features[feature] = False
            logger.info(f"ConversationEngine: disabled feature '{feature}'")

    def enable_feature(self, feature: str) -> None:
        """Enable a previously disabled feature"""
        if feature in self._active_features:
            self._active_features[feature] = True
            logger.info(f"ConversationEngine: enabled feature '{feature}'")

    def boost_topic(self, topic: str) -> None:
        """Boost relevance of a topic for upcoming responses"""
        # Used for clinical alert follow-ups
        logger.info(f"ConversationEngine: boosting topic '{topic}'")
        # TODO: Implement topic boosting in query classifier

    # ===== Phase 3: Enhanced Turn-Taking with Prosody Signals =====

    async def analyze_turn_signal(
        self,
        transcript: str,
        prosody_features: Optional[Dict] = None,
        silence_duration_ms: int = 0,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Analyze turn signals and optionally publish prosody.turn_signal events.

        Phase 3 enhancement that returns detailed signal analysis and
        publishes events for cross-engine coordination when A/B test
        variant is 'v2_prosody'.

        Args:
            transcript: Current transcript text
            prosody_features: Optional prosody features from STT
            silence_duration_ms: Duration of silence in milliseconds
            session_id: Session ID for event publishing
            user_id: User ID for A/B test assignment

        Returns:
            Dict with signal_type, confidence, should_respond, wait_ms
        """
        if not self._turn_taking:
            await self.initialize()

        # Check A/B test variant
        variant = self._get_ab_variant("predictive_turn_taking_v2", user_id) if user_id else None
        use_prosody_events = variant == "v2_prosody" or self._is_feature_enabled(
            "predictive_turn_signal_events", user_id
        )

        if use_prosody_events:
            # Use enhanced analysis with event publishing
            result = await self._turn_taking.analyze_turn_signal(
                transcript=transcript,
                prosody_features=prosody_features,
                silence_duration_ms=silence_duration_ms,
                session_id=session_id,
                user_id=user_id,
            )
            return {
                "signal_type": result.signal_type.value,
                "confidence": result.confidence,
                "should_respond": result.should_respond,
                "wait_ms": result.wait_ms,
                "signals": result.signals,
                "prosody_features": result.prosody_features,
                "variant": "v2_prosody",
            }
        else:
            # Fallback to basic turn completion check
            turn_state = await self.check_turn_completion(transcript, prosody_features, silence_duration_ms, user_id)
            return {
                "signal_type": "ready" if turn_state.turn_probability > 0.7 else "wait",
                "confidence": turn_state.turn_probability,
                "should_respond": turn_state.turn_probability > 0.7,
                "wait_ms": 0 if turn_state.turn_probability > 0.7 else 200,
                "signals": turn_state.completion_signals + turn_state.continuation_signals,
                "prosody_features": {},
                "variant": "v1_basic",
            }

    async def record_turn_outcome(
        self,
        session_id: str,
        user_id: str,
        was_correct: bool,
        actual_wait_ms: int,
    ) -> None:
        """
        Record outcome of turn prediction for per-user calibration.

        Used to learn user-specific pause thresholds over time.

        Args:
            session_id: Session identifier
            user_id: User identifier
            was_correct: Whether the turn prediction was correct
            actual_wait_ms: How long user waited before speaking again
        """
        if not self._turn_taking:
            await self.initialize()

        await self._turn_taking.record_turn_outcome(
            session_id=session_id,
            user_id=user_id,
            was_correct=was_correct,
            actual_wait_ms=actual_wait_ms,
        )

        # Publish analytics event for tuning
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="analytics.tune",
                data={
                    "component": "turn_taking",
                    "user_id": user_id,
                    "was_correct": was_correct,
                    "actual_wait_ms": actual_wait_ms,
                },
                session_id=session_id,
                source_engine="conversation",
            )

    # ===== Phase 3: Reference Resolution =====

    async def resolve_references(
        self,
        text: str,
        session_id: str,
        user_id: Optional[str] = None,
        memory_context: Optional[Dict] = None,
    ) -> List[Dict[str, Any]]:
        """
        Resolve pronouns and ambiguous references in text.

        Phase 3 feature that uses memory context to resolve references
        like "it", "he", "the patient", etc. When confidence is low,
        returns clarification prompts.

        Args:
            text: Text containing potential references
            session_id: Session identifier for context
            user_id: User ID for A/B test assignment
            memory_context: Optional memory context from MemoryEngine

        Returns:
            List of resolved references with confidence scores
        """
        if not self._reference_resolver:
            await self.initialize()

        # Check A/B test for reference resolution
        variant = self._get_ab_variant("reference_resolution", user_id) if user_id else None
        if variant == "disabled":
            return []

        if not self._is_feature_enabled("reference_resolution", user_id):
            return []

        resolved = await self._reference_resolver.resolve_references(
            text=text,
            session_id=session_id,
            memory_context=memory_context,
        )

        # Convert to dictionaries for API response
        return [
            {
                "original_text": r.original_text,
                "reference_type": r.reference_type.value,
                "resolved_entity": r.resolved_entity,
                "resolved_value": r.resolved_value,
                "confidence": r.confidence,
                "alternatives": r.alternatives,
                "needs_clarification": r.needs_clarification,
                "clarification_prompt": r.clarification_prompt,
            }
            for r in resolved
        ]

    async def get_clarification_options(
        self,
        session_id: str,
        reference_text: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get clarification options for an ambiguous reference.

        Args:
            session_id: Session identifier
            reference_text: The ambiguous reference text

        Returns:
            Dict with options for clarification, or None if not applicable
        """
        if not self._reference_resolver:
            await self.initialize()

        return await self._reference_resolver.get_clarification_options(
            session_id=session_id,
            reference_text=reference_text,
        )

    async def update_reference_context(
        self,
        session_id: str,
        entities: List[Dict[str, Any]],
        topics: Optional[List[str]] = None,
    ) -> None:
        """
        Update reference context with new entities and topics.

        Called after processing user input to maintain entity salience.

        Args:
            session_id: Session identifier
            entities: List of entity dicts with type, value, salience
            topics: Optional list of recent topics
        """
        if not self._reference_resolver:
            await self.initialize()

        await self._reference_resolver.update_context(
            session_id=session_id,
            entities=entities,
            topics=topics,
        )

    # ===== Phase 3: Repair Metrics =====

    def get_repair_metrics(self) -> Dict[str, Any]:
        """
        Get repair metrics for analytics dashboard.

        Returns comprehensive metrics including:
        - Total repairs and success rate
        - Strategy effectiveness
        - Emotion-triggered escalations
        - Average attempts to resolve
        """
        if not self._repair_tracker:
            return {}
        return self._repair_tracker.get_metrics_summary()

    def get_user_repair_metrics(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get repair metrics for a specific user"""
        if not self._repair_tracker:
            return None
        metrics = self._repair_tracker.get_user_metrics(user_id)
        if not metrics:
            return None
        return {
            "total_repairs": metrics.total_repairs,
            "successful_repairs": metrics.successful_repairs,
            "strategy_usage": metrics.strategy_usage,
            "strategy_success": metrics.strategy_success,
        }

    # ===== Session Cleanup =====

    def clear_session(self, session_id: str) -> None:
        """Clear all session-related state"""
        if self._turn_taking:
            self._turn_taking.clear_session(session_id)
        if self._reference_resolver:
            self._reference_resolver.clear_session(session_id)
        logger.debug(f"Cleared conversation session: {session_id}")


__all__ = [
    "ConversationEngine",
    "QueryClassification",
    "TurnState",
    "RepairAttempt",
]

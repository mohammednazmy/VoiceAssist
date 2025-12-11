"""
Voice Turn Orchestrator

Orchestrates all voice turn detection components for intelligent
conversation flow. Integrates:
- SemanticVADService: Turn completion detection
- ContinuationDetector: Pause analysis
- HybridVADDecider: Barge-in detection
- SpeculativeExecutionService: Early response generation
- DuplexVoiceHandler: Duplex state management

Phase 6: Edge Case Hardening
Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
"""

from dataclasses import dataclass
from enum import Enum
from typing import Callable, Dict, List, Optional, Tuple
import asyncio
import time

from app.core.logging import get_logger
from app.services.semantic_vad_service import (
    SemanticVADService,
    SemanticVADResult,
    ProsodyHints as SemanticProsodyHints,
    semantic_vad_service,
)
from app.services.continuation_detector import (
    ContinuationDetector,
    ContinuationAnalysis,
    ProsodyHints as ContinuationProsodyHints,
    get_continuation_detector,
)
from app.services.hybrid_vad_decider import (
    HybridVADDecider,
    VADState,
    DeepgramEvent,
    BargeInDecision,
    create_hybrid_vad_decider,
)
from app.services.speculative_execution_service import SpeculativeExecutionService
from app.services.duplex_voice_handler import DuplexVoiceHandler, DuplexState

logger = get_logger(__name__)


# =============================================================================
# Types
# =============================================================================


class TurnState(str, Enum):
    """Current state of the voice turn."""

    IDLE = "idle"  # No active conversation
    LISTENING = "listening"  # User is speaking
    PROCESSING = "processing"  # Analyzing turn completion
    RESPONDING = "responding"  # AI is generating response
    SPEAKING = "speaking"  # AI is speaking
    BARGE_IN = "barge_in"  # User interrupted AI


@dataclass
class TurnDecision:
    """Final decision about the current turn."""

    action: str  # 'respond', 'wait', 'continue_listening', 'stop_ai'
    confidence: float
    wait_ms: int
    use_filler: bool
    reason: str
    semantic_result: Optional[SemanticVADResult] = None
    continuation_result: Optional[ContinuationAnalysis] = None
    barge_in_decision: Optional[BargeInDecision] = None


@dataclass
class OrchestratorConfig:
    """Configuration for the voice turn orchestrator."""

    # Feature enablement (controlled by flags)
    enable_semantic_vad: bool = True
    enable_continuation_detection: bool = True
    enable_hybrid_vad: bool = True
    enable_speculative_execution: bool = False
    enable_duplex: bool = False

    # Thresholds
    semantic_confidence_override: float = 0.85
    continuation_override_threshold: float = 0.7
    min_response_delay_ms: int = 100

    # Timing
    turn_timeout_ms: int = 10000
    max_silence_before_respond_ms: int = 3000


# =============================================================================
# Voice Turn Orchestrator
# =============================================================================


class VoiceTurnOrchestrator:
    """
    Orchestrates all voice turn detection components.

    This is the main entry point for voice turn management, coordinating
    between semantic VAD, continuation detection, hybrid VAD, and
    speculative execution.
    """

    def __init__(
        self,
        config: Optional[OrchestratorConfig] = None,
        semantic_vad: Optional[SemanticVADService] = None,
        continuation_detector: Optional[ContinuationDetector] = None,
        hybrid_vad: Optional[HybridVADDecider] = None,
        speculative_service: Optional[SpeculativeExecutionService] = None,
        duplex_handler: Optional[DuplexVoiceHandler] = None,
    ):
        self._config = config or OrchestratorConfig()
        self._semantic_vad = semantic_vad or semantic_vad_service
        self._continuation_detector = continuation_detector or get_continuation_detector()
        self._hybrid_vad = hybrid_vad or create_hybrid_vad_decider()
        self._speculative_service = speculative_service
        self._duplex_handler = duplex_handler

        self._state = TurnState.IDLE
        self._current_transcript = ""
        self._last_speech_time = 0.0
        self._turn_start_time = 0.0
        self._decision_callbacks: List[Callable[[TurnDecision], None]] = []

        logger.info(
            "VoiceTurnOrchestrator initialized",
            extra={
                "semantic_vad": self._config.enable_semantic_vad,
                "continuation": self._config.enable_continuation_detection,
                "hybrid_vad": self._config.enable_hybrid_vad,
            },
        )

    def set_signal_freshness_ms(self, value: int) -> None:
        """
        Configure the HybridVADDecider's signal freshness window (ms).

        Intended to be called from startup wiring so that the orchestrator
        shares the same Hybrid VAD tuning as the main Thinker/Talker pipeline.
        """
        try:
            self._hybrid_vad.set_signal_freshness_ms(value)
        except AttributeError:
            # Older HybridVADDecider versions may not support this helper.
            self._hybrid_vad.config.signal_freshness_ms = value

    # =========================================================================
    # State Management
    # =========================================================================

    @property
    def state(self) -> TurnState:
        """Get current turn state."""
        return self._state

    def set_state(self, state: TurnState) -> None:
        """Set the current turn state."""
        old_state = self._state
        self._state = state
        if old_state != state:
            logger.debug(f"Turn state: {old_state.value} -> {state.value}")

    def start_listening(self) -> None:
        """Called when user starts speaking."""
        self._state = TurnState.LISTENING
        self._turn_start_time = time.time()
        self._last_speech_time = time.time()

        if self._duplex_handler:
            self._duplex_handler.user_started_speaking()

    def stop_listening(self) -> None:
        """Called when user stops speaking."""
        if self._state == TurnState.LISTENING:
            self._state = TurnState.PROCESSING

    def start_responding(self) -> None:
        """Called when AI starts generating response."""
        self._state = TurnState.RESPONDING

    def start_speaking(self) -> None:
        """Called when AI starts speaking."""
        self._state = TurnState.SPEAKING
        self._hybrid_vad.set_tts_playing(True)

        if self._duplex_handler:
            self._duplex_handler.start_speaking()

    def stop_speaking(self) -> None:
        """Called when AI stops speaking."""
        self._hybrid_vad.set_tts_playing(False)

        if self._duplex_handler:
            self._duplex_handler.stop_speaking()

        if self._state == TurnState.SPEAKING:
            self._state = TurnState.IDLE

    # =========================================================================
    # Main Decision Logic
    # =========================================================================

    def analyze_turn(
        self,
        transcript: str,
        silence_duration_ms: int,
        is_partial: bool = False,
        language: str = "en",
        prosody_hints: Optional[Dict] = None,
        silero_state: Optional[VADState] = None,
        deepgram_event: Optional[DeepgramEvent] = None,
    ) -> TurnDecision:
        """
        Analyze the current turn and decide what action to take.

        This is the main entry point for turn analysis, combining
        all detection methods.

        Args:
            transcript: Current transcript text
            silence_duration_ms: Duration of silence after last speech
            is_partial: Whether this is a partial transcript
            language: Language code
            prosody_hints: Optional prosody data
            silero_state: Optional Silero VAD state
            deepgram_event: Optional Deepgram event

        Returns:
            TurnDecision with recommended action
        """
        self._current_transcript = transcript
        self._last_speech_time = time.time()

        # Build prosody hints for different services
        semantic_prosody = None
        continuation_prosody = None
        if prosody_hints:
            semantic_prosody = SemanticProsodyHints(
                rising_intonation=prosody_hints.get("rising_intonation", False),
                mid_word_cutoff=prosody_hints.get("mid_word_cutoff", False),
                energy_decline=prosody_hints.get("energy_decline", False),
            )
            continuation_prosody = ContinuationProsodyHints(
                pitch_trend=prosody_hints.get("pitch_trend"),
                speaking_rate=prosody_hints.get("speaking_rate"),
                energy_trend=prosody_hints.get("energy_trend"),
            )

        # =============================================
        # Phase 1: Semantic VAD Analysis
        # =============================================
        semantic_result = None
        if self._config.enable_semantic_vad:
            semantic_result = self._semantic_vad.analyze(
                transcript=transcript,
                silence_duration_ms=silence_duration_ms,
                is_partial=is_partial,
                prosody_hints=semantic_prosody,
            )
            logger.debug(
                f"Semantic VAD: confidence={semantic_result.completion_confidence:.2f}, "
                f"action={semantic_result.action}"
            )

        # =============================================
        # Phase 2: Continuation Detection
        # =============================================
        continuation_result = None
        if self._config.enable_continuation_detection:
            continuation_result = self._continuation_detector.analyze(
                transcript=transcript,
                language=language,
                prosody=continuation_prosody,
            )
            logger.debug(
                f"Continuation: prob={continuation_result.continuation_probability:.2f}, "
                f"wait={continuation_result.should_wait}"
            )

        # =============================================
        # Phase 3: Hybrid VAD (for barge-in)
        # =============================================
        barge_in_decision = None
        if self._config.enable_hybrid_vad and self._state == TurnState.SPEAKING:
            barge_in_decision = self._hybrid_vad.decide_barge_in(
                silero_state=silero_state,
                deepgram_event=deepgram_event,
            )
            if barge_in_decision.trigger:
                logger.info(
                    f"Barge-in triggered: source={barge_in_decision.source}, "
                    f"confidence={barge_in_decision.confidence:.2f}"
                )
                return TurnDecision(
                    action="stop_ai",
                    confidence=barge_in_decision.confidence,
                    wait_ms=0,
                    use_filler=False,
                    reason=barge_in_decision.reason,
                    barge_in_decision=barge_in_decision,
                )

        # =============================================
        # Phase 4: Combined Decision
        # =============================================
        return self._make_decision(
            semantic_result=semantic_result,
            continuation_result=continuation_result,
            silence_duration_ms=silence_duration_ms,
            is_partial=is_partial,
        )

    def _make_decision(
        self,
        semantic_result: Optional[SemanticVADResult],
        continuation_result: Optional[ContinuationAnalysis],
        silence_duration_ms: int,
        is_partial: bool,
    ) -> TurnDecision:
        """
        Combine analysis results into a final decision.
        """
        # Default values
        action = "wait"
        confidence = 0.5
        wait_ms = 1000
        use_filler = False
        reason = "Default wait"

        # Semantic VAD has primary weight
        if semantic_result:
            action = semantic_result.action
            confidence = semantic_result.completion_confidence
            wait_ms = semantic_result.recommended_wait_ms
            use_filler = semantic_result.use_filler_phrase
            reason = semantic_result.reason

            # High confidence override
            if semantic_result.completion_confidence >= self._config.semantic_confidence_override:
                action = "respond"
                wait_ms = min(wait_ms, self._config.min_response_delay_ms)
                reason = "High confidence semantic completion"

        # Continuation detection can override to wait
        if continuation_result and continuation_result.should_wait:
            if continuation_result.continuation_probability >= self._config.continuation_override_threshold:
                action = "wait"
                wait_ms = max(wait_ms, continuation_result.recommended_wait_ms)
                reason = f"Continuation likely: {continuation_result.reason}"
                confidence = 1 - continuation_result.continuation_probability

        # Partial transcripts default to wait
        if is_partial and action == "respond":
            action = "wait"
            wait_ms = max(wait_ms, 500)
            reason = "Waiting for final transcript"

        # Long silence overrides to respond
        if silence_duration_ms >= self._config.max_silence_before_respond_ms:
            action = "respond"
            wait_ms = 0
            confidence = 0.9
            reason = f"Long silence ({silence_duration_ms}ms)"

        return TurnDecision(
            action=action,
            confidence=confidence,
            wait_ms=wait_ms,
            use_filler=use_filler,
            reason=reason,
            semantic_result=semantic_result,
            continuation_result=continuation_result,
        )

    # =========================================================================
    # Speculative Execution
    # =========================================================================

    async def maybe_start_speculation(
        self,
        partial_transcript: str,
        conversation_id: str,
        system_prompt: str,
    ) -> bool:
        """
        Start speculative execution if conditions are met.

        Returns True if speculation was started.
        """
        if not self._config.enable_speculative_execution:
            return False

        if not self._speculative_service:
            return False

        # Check if transcript is stable enough for speculation
        if len(partial_transcript) < 15:
            return False

        # Check if semantic VAD suggests completion is likely
        semantic_result = self._semantic_vad.analyze(
            transcript=partial_transcript,
            silence_duration_ms=0,
            is_partial=True,
        )

        if semantic_result.completion_confidence >= 0.6:
            await self._speculative_service.start_speculation(
                partial_transcript=partial_transcript,
                conversation_id=conversation_id,
                system_prompt=system_prompt,
            )
            logger.info("Speculative execution started")
            return True

        return False

    # =========================================================================
    # Duplex Support
    # =========================================================================

    def handle_duplex_speech(
        self,
        transcript: str,
        silence_duration_ms: int,
    ) -> Tuple[bool, Optional[int]]:
        """
        Handle speech during duplex mode (AI is speaking and user is speaking).

        Returns:
            Tuple of (should_truncate_ai, truncation_position)
        """
        if not self._duplex_handler:
            return False, None

        if self._duplex_handler.state != DuplexState.DUPLEX:
            return False, None

        # Check if this is meaningful user input
        semantic_result = self._semantic_vad.analyze(
            transcript=transcript,
            silence_duration_ms=silence_duration_ms,
            is_partial=False,
        )

        if semantic_result.completion_confidence >= 0.5:
            # User has something meaningful to say
            truncation_pos = self._duplex_handler.get_truncation_point()
            return True, truncation_pos

        return False, None

    # =========================================================================
    # Callbacks
    # =========================================================================

    def on_decision(self, callback: Callable[[TurnDecision], None]) -> None:
        """Register a callback for turn decisions."""
        self._decision_callbacks.append(callback)

    def _emit_decision(self, decision: TurnDecision) -> None:
        """Emit a decision to all registered callbacks."""
        for callback in self._decision_callbacks:
            try:
                callback(decision)
            except Exception as e:
                logger.error(f"Decision callback error: {e}")

    # =========================================================================
    # Reset
    # =========================================================================

    def reset(self) -> None:
        """Reset the orchestrator state."""
        self._state = TurnState.IDLE
        self._current_transcript = ""
        self._last_speech_time = 0.0
        self._turn_start_time = 0.0

        if self._duplex_handler:
            self._duplex_handler.reset()

        logger.debug("VoiceTurnOrchestrator reset")


# =============================================================================
# Factory Functions
# =============================================================================


def create_voice_turn_orchestrator(
    config: Optional[OrchestratorConfig] = None,
    feature_flags: Optional[Dict[str, bool]] = None,
) -> VoiceTurnOrchestrator:
    """
    Create a new VoiceTurnOrchestrator with feature flag support.

    Args:
        config: Optional configuration
        feature_flags: Optional dict of feature flags

    Returns:
        Configured VoiceTurnOrchestrator
    """
    if config is None:
        config = OrchestratorConfig()

    # Apply feature flags
    if feature_flags:
        config.enable_semantic_vad = feature_flags.get(
            "backend.voice_semantic_vad", config.enable_semantic_vad
        )
        config.enable_continuation_detection = feature_flags.get(
            "backend.voice_continuation_detection", config.enable_continuation_detection
        )
        config.enable_hybrid_vad = feature_flags.get(
            "backend.voice_hybrid_vad_fusion", config.enable_hybrid_vad
        )
        config.enable_speculative_execution = feature_flags.get(
            "backend.voice_speculative_continuation", config.enable_speculative_execution
        )
        config.enable_duplex = feature_flags.get(
            "backend.voice_duplex_stt", config.enable_duplex
        )

    return VoiceTurnOrchestrator(config=config)


# =============================================================================
# Singleton Instance
# =============================================================================

_orchestrator: Optional[VoiceTurnOrchestrator] = None


def get_voice_turn_orchestrator() -> VoiceTurnOrchestrator:
    """Get or create the global VoiceTurnOrchestrator instance."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = create_voice_turn_orchestrator()
    return _orchestrator

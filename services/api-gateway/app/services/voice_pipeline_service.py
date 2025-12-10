"""
Voice Pipeline Service - Thinker/Talker Orchestrator

Orchestrates the complete voice interaction flow:
    Audio Input → STT → Thinker (LLM) → Talker (TTS) → Audio Output

Features:
- Streaming at every stage for low latency
- Unified conversation context across voice and chat
- Barge-in support (interrupt AI response)
- State machine for session management
- Metrics collection

Phase: Thinker/Talker Voice Pipeline Migration
"""

import asyncio
import base64
import random
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.core.event_bus import VoiceEventBus, get_event_bus
from app.core.logging import get_logger
from app.core.voice_constants import DEFAULT_TTS_MODEL, DEFAULT_TTS_OUTPUT_FORMAT, DEFAULT_VOICE_ID
from app.services.backchannel_service import (
    BackchannelAudio,
    BackchannelService,
    BackchannelSession,
    backchannel_service,
)

# Natural Conversation Flow: Phase 3 - Barge-In Classification
from app.services.barge_in_classifier import BargeInClassifier, ClassificationResult, create_barge_in_classifier

# Natural Conversation Flow: Phase 2 - Continuation Detection
from app.services.continuation_detector import (
    ContinuationAnalysis,
    ContinuationDetector,
    ProsodyHints,
    get_continuation_detector,
)
from app.services.dictation_phi_monitor import DictationPHIMonitor, PatientPHIContext, dictation_phi_monitor
from app.services.dictation_service import (
    DictationEvent,
    DictationSession,
    DictationSessionConfig,
    NoteType,
    dictation_service,
)
from app.services.emotion_detection_service import (
    EmotionDetectionService,
    EmotionDetectionSession,
    EmotionResult,
    emotion_detection_service,
)
from app.services.feature_flags import feature_flag_service
from app.services.feedback_service import FeedbackService, feedback_service

# Natural Conversation Flow: Phase 3 - Hybrid VAD Fusion
from app.services.hybrid_vad_decider import DeepgramEvent, HybridVADDecider, VADState, create_hybrid_vad_decider
from app.services.medical_vocabulary_service import MedicalSpecialty
from app.services.memory_context_service import ConversationMemoryManager, MemoryType, memory_context_service
from app.services.note_formatter_service import FormattingConfig, FormattingLevel, note_formatter_service
from app.services.patient_context_service import DictationContext, PatientContextService, patient_context_service
from app.services.prosody_analysis_service import ProsodySession, ProsodySnapshot, prosody_service
from app.services.session_analytics_service import (
    InteractionType,
    SessionAnalytics,
    SessionAnalyticsService,
    session_analytics_service,
)
from app.services.streaming_stt_service import (
    DeepgramStreamingSession,
    StreamingSTTService,
    STTSessionConfig,
    streaming_stt_service,
)
from app.services.talker_service import AudioChunk, TalkerService, TalkerSession, VoiceConfig, talker_service
from app.services.thinker_service import ThinkerService, ThinkerSession, ToolCallEvent, ToolResultEvent, thinker_service

# Natural Conversation Flow: Phase 1 - Clean Transcript Truncation
from app.services.transcript_sync_service import TranscriptSyncService, TruncationResult, get_transcript_sync_service

# Natural Conversation Flow: Phase 3 - Utterance Aggregation
from app.services.utterance_aggregator import (
    AggregatedUtterance,
    AggregatorConfig,
    UtteranceAggregator,
    get_utterance_aggregator,
    remove_utterance_aggregator,
)
from app.services.voice_command_service import voice_command_service

logger = get_logger(__name__)


# ==============================================================================
# Data Classes and Enums
# ==============================================================================


class PipelineState(str, Enum):
    """State of the voice pipeline."""

    IDLE = "idle"
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"
    CANCELLED = "cancelled"
    ERROR = "error"


class PipelineMode(str, Enum):
    """
    Phase 8: Mode of the voice pipeline.

    - CONVERSATION: Normal conversational voice mode with Thinker/Talker
    - DICTATION: Medical dictation mode with transcription + formatting
    """

    CONVERSATION = "conversation"
    DICTATION = "dictation"


class QueryType(str, Enum):
    """
    Phase 6: Classification of user query types for response timing.

    Different query types warrant different response delays to feel natural:
    - URGENT: Medical emergencies, immediate answers needed
    - SIMPLE: Yes/no questions, confirmations, short factual answers
    - COMPLEX: Multi-part questions, explanations, comparisons
    - CLARIFICATION: Requests for clarification after misunderstanding
    """

    URGENT = "urgent"
    SIMPLE = "simple"
    COMPLEX = "complex"
    CLARIFICATION = "clarification"
    UNKNOWN = "unknown"


@dataclass
class ResponseTimingConfig:
    """
    Phase 6: Configuration for human-like response timing.

    Different query types warrant different response patterns:
    - delay_ms: How long to wait before starting to respond
    - use_filler: Whether to use a thinking filler ("Hmm, let me think...")
    - filler_phrases: Available filler phrases for this query type
    """

    delay_ms: int
    use_filler: bool
    filler_phrases: list = field(default_factory=list)


# Phase 6: Response timing configuration by query type
RESPONSE_TIMING: Dict[QueryType, ResponseTimingConfig] = {
    QueryType.URGENT: ResponseTimingConfig(
        delay_ms=0,
        use_filler=False,
        filler_phrases=[],
    ),
    QueryType.SIMPLE: ResponseTimingConfig(
        delay_ms=200,
        use_filler=False,
        filler_phrases=[],
    ),
    QueryType.COMPLEX: ResponseTimingConfig(
        delay_ms=600,
        use_filler=True,
        filler_phrases=[
            "Hmm, let me think about that...",
            "That's a good question...",
            "Let me consider this...",
        ],
    ),
    QueryType.CLARIFICATION: ResponseTimingConfig(
        delay_ms=0,
        use_filler=False,
        filler_phrases=[],
    ),
    QueryType.UNKNOWN: ResponseTimingConfig(
        delay_ms=300,
        use_filler=False,
        filler_phrases=[],
    ),
}


def classify_query_type(transcript: str) -> QueryType:
    """
    Phase 6: Classify user query to determine appropriate response timing.

    Uses keyword matching and pattern detection to categorize queries:
    - URGENT: Emergency keywords, medical distress
    - SIMPLE: Yes/no questions, confirmations, short queries
    - COMPLEX: Multiple questions, comparisons, explanations
    - CLARIFICATION: "what did you mean", "I said", etc.

    Args:
        transcript: User's spoken text

    Returns:
        QueryType classification
    """
    text = transcript.lower().strip()
    words = text.split()
    word_count = len(words)

    # Urgent keywords (medical emergencies, distress)
    urgent_keywords = {
        "emergency",
        "help",
        "urgent",
        "911",
        "ambulance",
        "bleeding",
        "chest pain",
        "can't breathe",
        "heart attack",
        "stroke",
        "overdose",
        "unconscious",
        "dying",
        "severe pain",
    }
    if any(keyword in text for keyword in urgent_keywords):
        return QueryType.URGENT

    # Clarification patterns (user correcting or asking for clarification)
    clarification_patterns = [
        "what did you mean",
        "i said",
        "no i meant",
        "that's not what",
        "i was asking",
        "let me clarify",
        "to clarify",
        "what i meant",
        "i didn't say",
        "i actually said",
        "sorry i meant",
    ]
    if any(pattern in text for pattern in clarification_patterns):
        return QueryType.CLARIFICATION

    # Simple queries (yes/no, confirmations, short questions)
    simple_starters = [
        "is ",
        "are ",
        "do ",
        "does ",
        "did ",
        "can ",
        "will ",
        "should ",
    ]
    simple_endings = [
        "yes",
        "no",
        "ok",
        "okay",
        "sure",
        "thanks",
        "thank you",
        "got it",
    ]
    if word_count <= 5 and (
        any(text.startswith(s) for s in simple_starters)
        or text in simple_endings
        or text.endswith("?")
        and word_count <= 8
    ):
        return QueryType.SIMPLE

    # Complex queries (multiple questions, comparisons, explanations)
    complex_indicators = [
        "explain",
        "describe",
        "compare",
        "difference between",
        "how does",
        "why does",
        "what are the",
        "tell me about",
        "can you walk me through",
        "i need to understand",
        "what's the relationship",
        "pros and cons",
    ]
    if any(indicator in text for indicator in complex_indicators):
        return QueryType.COMPLEX

    # Multiple questions or very long queries
    question_count = text.count("?")
    if question_count >= 2 or word_count >= 25:
        return QueryType.COMPLEX

    # Longer explanatory questions
    if word_count >= 15 and ("how" in text or "why" in text or "what" in text):
        return QueryType.COMPLEX

    return QueryType.UNKNOWN


@dataclass
class PipelineConfig:
    """Configuration for the voice pipeline."""

    # STT settings
    stt_language: str = "en"
    stt_sample_rate: int = 16000
    # Endpointing: 800ms allows natural speech pauses (was 200ms - too aggressive)
    stt_endpointing_ms: int = 800
    # Utterance end: 1500ms wait after speech stops before finalizing
    stt_utterance_end_ms: int = 1500

    # LLM settings
    max_response_tokens: int = 1024
    temperature: float = 0.7

    # TTS settings - defaults from voice_constants.py (single source of truth)
    voice_id: str = DEFAULT_VOICE_ID
    tts_model: str = DEFAULT_TTS_MODEL
    tts_output_format: str = DEFAULT_TTS_OUTPUT_FORMAT

    # Voice quality parameters
    stability: float = 0.65
    similarity_boost: float = 0.80
    style: float = 0.15

    # Barge-in settings
    barge_in_enabled: bool = True
    # VAD sensitivity: 0-100 scale (higher = more sensitive, triggers on quieter speech)
    # Used as confidence threshold for barge-in: lower values require higher confidence
    # 0 = max threshold (0.95 confidence required), 100 = min threshold (0.5 confidence required)
    vad_sensitivity: int = 50

    # Phase 8: Pipeline mode and dictation settings
    mode: PipelineMode = PipelineMode.CONVERSATION
    dictation_note_type: NoteType = NoteType.SOAP
    dictation_specialty: Optional[MedicalSpecialty] = None
    dictation_auto_format: bool = True
    dictation_enable_commands: bool = True

    # Phase 9: Patient context integration
    patient_id: Optional[str] = None  # Patient ID for context-aware dictation
    enable_phi_monitoring: bool = True  # Enable real-time PHI detection
    enable_patient_context: bool = True  # Enable patient context retrieval

    # Natural Conversation Flow: Continuation Detection
    # When enabled, analyzes transcripts for continuation signals before processing
    enable_continuation_detection: bool = True
    # Maximum additional wait time (ms) when continuation is detected
    continuation_max_wait_ms: int = 3000
    # Minimum confidence threshold to trigger continuation wait
    continuation_confidence_threshold: float = 0.4

    # Natural Conversation Flow: Utterance Aggregation
    # When enabled, merges speech segments within a time window
    enable_utterance_aggregation: bool = True
    # Maximum time to wait for additional segments (ms)
    utterance_aggregation_window_ms: int = 3000
    # Maximum segments to aggregate before forcing processing
    utterance_max_segments: int = 5

    # Natural Conversation Flow: Pre-emptive Listening
    # When enabled, keeps STT active during AI speech for faster barge-in
    enable_preemptive_listening: bool = True


@dataclass
class PipelineMessage:
    """A message to send to the client via WebSocket."""

    type: str
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PipelineMetrics:
    """Metrics for a pipeline session."""

    session_id: str = ""
    start_time: float = 0.0
    end_time: float = 0.0

    # Latency breakdown
    stt_latency_ms: int = 0
    first_token_latency_ms: int = 0
    tts_latency_ms: int = 0
    total_latency_ms: int = 0

    # Counts
    audio_chunks_received: int = 0
    audio_chunks_sent: int = 0
    tokens_generated: int = 0
    tool_calls_count: int = 0

    # Natural Conversation Flow: Phase 2.4 - Barge-in metrics
    barge_in_count: int = 0
    barge_in_misfires: int = 0

    # State
    cancelled: bool = False
    error: Optional[str] = None


# ==============================================================================
# Voice Pipeline Session
# ==============================================================================


class VoicePipelineSession:
    """
    A single voice interaction session.

    Manages the complete flow:
    1. Receive audio chunks from client
    2. Stream to STT for transcription
    3. On speech end, send to Thinker for response
    4. Stream Thinker tokens to Talker for TTS
    5. Stream TTS audio back to client
    """

    def __init__(
        self,
        session_id: str,
        conversation_id: str,
        config: PipelineConfig,
        stt_service: StreamingSTTService,
        thinker_service: ThinkerService,
        talker_service: TalkerService,
        on_message: Callable[[PipelineMessage], Awaitable[None]],
        user_id: Optional[str] = None,
        emotion_service: Optional[EmotionDetectionService] = None,
        backchannel_svc: Optional[BackchannelService] = None,
    ):
        self.session_id = session_id
        self.conversation_id = conversation_id
        self.config = config
        self.user_id = user_id  # User ID for tool authentication
        self._stt_service = stt_service
        self._thinker_service = thinker_service
        self._talker_service = talker_service
        self._on_message = on_message
        self._emotion_service = emotion_service or emotion_detection_service
        self._backchannel_service = backchannel_svc or backchannel_service
        self._prosody_service = prosody_service

        # Session components
        self._stt_session: Optional[DeepgramStreamingSession] = None
        self._thinker_session: Optional[ThinkerSession] = None
        self._talker_session: Optional[TalkerSession] = None
        self._emotion_session: Optional[EmotionDetectionSession] = None
        self._backchannel_session: Optional[BackchannelSession] = None
        self._prosody_session: Optional[ProsodySession] = None

        # Phase 4: Memory context manager for conversation continuity
        self._memory_manager: Optional[ConversationMemoryManager] = None

        # Phase 8: Dictation session for medical documentation
        self._dictation_session: Optional[DictationSession] = None

        # Phase 9: Patient context and PHI monitoring
        self._patient_context: Optional[DictationContext] = None
        self._phi_monitor: DictationPHIMonitor = dictation_phi_monitor
        self._patient_context_service: PatientContextService = patient_context_service

        # Phase 10: Analytics and feedback
        self._analytics: Optional[SessionAnalytics] = None
        self._analytics_service: SessionAnalyticsService = session_analytics_service
        self._feedback_service: FeedbackService = feedback_service

        # State
        self._state = PipelineState.IDLE
        self._cancelled = False
        self._deepgram_vad_active: bool = False

        # Transcript accumulation
        self._partial_transcript = ""
        self._final_transcript = ""
        self._transcript_confidence = 1.0  # Phase 7: Track STT confidence for repair strategies

        # Current emotion state (for response adaptation)
        self._current_emotion: Optional[EmotionResult] = None

        # Current prosody analysis (for response timing)
        self._current_prosody: Optional[ProsodySnapshot] = None

        # Speech timing for backchannels
        self._speech_start_time: Optional[float] = None
        self._last_audio_time: float = 0.0
        self._last_transcript_time: float = 0.0  # For pause detection

        # Metrics
        self._metrics = PipelineMetrics(session_id=session_id)

        # Locks for thread safety
        self._state_lock = asyncio.Lock()

        # Event bus for cross-engine communication (Issue 3: Turn management)
        self._event_bus: VoiceEventBus = get_event_bus()

        # Natural Conversation Flow: Phase 2 - Continuation Detection
        self._continuation_detector: ContinuationDetector = get_continuation_detector()
        self._continuation_wait_task: Optional[asyncio.Task] = None
        self._pending_continuation: bool = False
        self._continuation_analysis: Optional[ContinuationAnalysis] = None

        # Natural Conversation Flow: Phase 3 - Barge-In Classification
        # Classifies interruptions as backchannel, soft_barge, or hard_barge
        self._barge_in_classifier: BargeInClassifier = create_barge_in_classifier(
            language=self.config.language if hasattr(self.config, "language") else "en"
        )
        self._last_classification: Optional[ClassificationResult] = None
        self._barge_in_start_time: Optional[float] = None

        # Natural Conversation Flow: Phase 3 - Hybrid VAD Fusion
        # Combines frontend Silero VAD with backend Deepgram VAD for optimal barge-in detection
        self._hybrid_vad_decider: HybridVADDecider = create_hybrid_vad_decider()
        self._hybrid_vad_enabled: bool = False  # Set based on feature flag at start

        # Natural Conversation Flow: Phase 3 - Utterance Aggregation
        self._utterance_aggregator: Optional[UtteranceAggregator] = None
        if self.config.enable_utterance_aggregation:
            aggregator_config = AggregatorConfig(
                window_duration_ms=self.config.utterance_aggregation_window_ms,
                max_segments_per_window=self.config.utterance_max_segments,
            )
            self._utterance_aggregator = get_utterance_aggregator(
                session_id=session_id,
                config=aggregator_config,
                on_utterance_ready=self._handle_aggregated_utterance,
            )

        # Natural Conversation Flow: Phase 4 - Pre-emptive Listening
        # Buffer transcripts captured during AI speech for immediate use on barge-in
        self._preemptive_transcript_buffer: str = ""
        self._preemptive_listening_active: bool = False

        # Phase 2: VAD Confidence Sharing - Store frontend Silero VAD state
        self._frontend_vad_state: Optional[Dict[str, Any]] = None
        self._frontend_vad_update_time: float = 0.0

        # Natural Conversation Flow: Phase 1 - Clean Transcript Truncation
        # Tracks AI response text for word-accurate truncation during barge-in
        self._transcript_sync: TranscriptSyncService = get_transcript_sync_service()
        self._transcript_sync.create_session(session_id)
        self._current_response_text: str = ""
        self._current_response_chunk_idx: int = 0
        self._word_timestamps_enabled: bool = False  # Set based on feature flag at start
        self._tts_playback_start_time: Optional[float] = None
        self._last_truncation_result: Optional[TruncationResult] = None

        # Natural Conversation Flow: Phase 2.4 - Misfire Rollback
        # Stores state for potential rollback if barge-in is a false positive
        self._barge_in_interrupted_response: str = ""
        self._barge_in_playback_position_ms: int = 0
        self._misfire_check_task: Optional[asyncio.Task] = None

    @property
    def state(self) -> PipelineState:
        """Get current pipeline state."""
        return self._state

    def is_cancelled(self) -> bool:
        """Check if session was cancelled."""
        return self._cancelled

    async def start(self) -> bool:
        """
        Start the voice pipeline session.

        Returns:
            True if started successfully
        """
        async with self._state_lock:
            if self._state != PipelineState.IDLE:
                logger.warning(f"Cannot start pipeline in state {self._state}")
                return False

            self._metrics.start_time = time.time()

            try:
                # Create STT session with lenient endpointing for natural speech
                self._stt_session = await self._stt_service.create_session(
                    on_partial=self._handle_partial_transcript,
                    on_final=self._handle_final_transcript,
                    on_endpoint=self._handle_speech_end,
                    on_speech_start=self._handle_speech_start,
                    on_words=self._handle_word_data,
                    config=STTSessionConfig(
                        language=self.config.stt_language,
                        sample_rate=self.config.stt_sample_rate,
                        endpointing_ms=self.config.stt_endpointing_ms,
                        utterance_end_ms=self.config.stt_utterance_end_ms,
                    ),
                )

                # Start STT
                if not await self._stt_session.start():
                    raise RuntimeError("Failed to start STT session")

                # Create emotion detection session (parallel to STT)
                if self._emotion_service and self._emotion_service.is_enabled():
                    self._emotion_session = await self._emotion_service.create_session(
                        session_id=self.session_id,
                        on_emotion=self._handle_emotion_result,
                    )
                    logger.info(f"Emotion detection enabled for session: {self.session_id}")

                # Create backchannel session for natural verbal cues
                if self._backchannel_service and await self._backchannel_service.is_enabled():
                    self._backchannel_session = await self._backchannel_service.create_session(
                        session_id=self.session_id,
                        voice_id=self.config.voice_id,
                        language=self.config.stt_language,
                        on_backchannel=self._handle_backchannel,
                    )
                    logger.info(f"Backchanneling enabled for session: {self.session_id}")

                # Create prosody analysis session for speech pattern tracking
                if self._prosody_service:
                    self._prosody_session = await self._prosody_service.create_session(
                        session_id=self.session_id,
                        user_id=self.user_id,
                    )
                    logger.info(f"Prosody analysis enabled for session: {self.session_id}")

                # Phase 4: Initialize memory context manager
                if self.user_id:
                    try:
                        session_uuid = (
                            uuid.UUID(self.session_id) if isinstance(self.session_id, str) else self.session_id
                        )
                        user_uuid = uuid.UUID(self.user_id) if isinstance(self.user_id, str) else self.user_id
                        self._memory_manager = memory_context_service.get_conversation_memory(
                            session_id=session_uuid,
                            user_id=user_uuid,
                        )
                        logger.info(f"Memory context enabled for session: {self.session_id}")
                    except Exception as e:
                        logger.warning(f"Failed to initialize memory context: {e}")

                # Phase 8: Initialize dictation session if in dictation mode
                if self.config.mode == PipelineMode.DICTATION:
                    dictation_config = DictationSessionConfig(
                        note_type=self.config.dictation_note_type,
                        language=self.config.stt_language,
                        specialty=(self.config.dictation_specialty.value if self.config.dictation_specialty else None),
                        auto_punctuate=True,
                        auto_format=self.config.dictation_auto_format,
                        enable_commands=self.config.dictation_enable_commands,
                    )
                    self._dictation_session = await dictation_service.create_session(
                        user_id=self.user_id or "anonymous",
                        config=dictation_config,
                        on_event=self._handle_dictation_event,
                    )
                    await self._dictation_session.start()
                    logger.info(
                        f"Dictation mode enabled for session: {self.session_id}, "
                        f"type={self.config.dictation_note_type.value}"
                    )

                    # Phase 9: Load patient context if patient_id is provided
                    if self.config.patient_id and self.config.enable_patient_context:
                        try:
                            self._patient_context = await self._patient_context_service.get_context_for_dictation(
                                user_id=self.user_id or "anonymous",
                                patient_id=self.config.patient_id,
                            )
                            logger.info(
                                f"Patient context loaded for {self.config.patient_id}: "
                                f"{len(self._patient_context.medications)} meds, "
                                f"{len(self._patient_context.allergies)} allergies, "
                                f"{len(self._patient_context.conditions)} conditions"
                            )

                            # Set up PHI monitor with patient context
                            if self.config.enable_phi_monitoring:
                                phi_context = PatientPHIContext(
                                    patient_id=self.config.patient_id,
                                    known_mrn=self._patient_context.demographics.mrn,
                                )
                                # Add known names if available
                                if self._patient_context.demographics.name:
                                    phi_context.known_names.add(self._patient_context.demographics.name)
                                self._phi_monitor.set_patient_context(phi_context)
                                logger.info(f"PHI monitor configured for patient {self.config.patient_id}")

                            # Generate and send context prompts to frontend
                            prompts = self._patient_context_service.generate_context_prompts(self._patient_context)
                            if prompts:
                                await self._on_message(
                                    PipelineMessage(
                                        type="patient.context_loaded",
                                        data={
                                            "patient_id": self.config.patient_id,
                                            "prompts": [
                                                {
                                                    "type": p.prompt_type,
                                                    "category": p.category.value,
                                                    "message": p.message,
                                                    "priority": p.priority,
                                                }
                                                for p in prompts
                                            ],
                                            "summaries": {
                                                "medications": self._patient_context.medication_summary,
                                                "allergies": self._patient_context.allergy_summary,
                                                "conditions": self._patient_context.condition_summary,
                                            },
                                        },
                                    )
                                )
                        except Exception as e:
                            logger.warning(f"Failed to load patient context: {e}")

                # Create Thinker session with user_id for tool authentication
                self._thinker_session = self._thinker_service.create_session(
                    conversation_id=self.conversation_id,
                    on_token=self._handle_llm_token,
                    on_tool_call=self._handle_tool_call,
                    on_tool_result=self._handle_tool_result,
                    user_id=self.user_id,
                )

                # Phase 10: Initialize analytics session
                pipeline_mode = "dictation" if self.config.mode == PipelineMode.DICTATION else "conversation"
                self._analytics = self._analytics_service.create_session(
                    session_id=self.session_id,
                    user_id=self.user_id,
                    mode=pipeline_mode,
                    on_analytics_update=self._send_analytics_update,
                )
                self._analytics_service.set_session_active(self.session_id)
                logger.info(f"Analytics session created: {self.session_id}, mode={pipeline_mode}")

                # Natural Conversation Flow: Phase 1 - Check word timestamps feature flag
                self._word_timestamps_enabled = await feature_flag_service.is_enabled(
                    "backend.voice_word_timestamps",
                    default=False,
                )
                if self._word_timestamps_enabled:
                    logger.info(f"Word timestamps enabled for session: {self.session_id}")

                self._state = PipelineState.LISTENING

                # Notify client
                await self._send_state_update()

                logger.info(f"Voice pipeline started: {self.session_id}")
                return True

            except Exception as e:
                logger.error(f"Failed to start pipeline: {e}")
                self._state = PipelineState.ERROR
                self._metrics.error = str(e)
                return False

    async def send_audio(self, audio_data: bytes) -> None:
        """
        Send audio data to the pipeline.

        Args:
            audio_data: Raw PCM16 audio bytes
        """
        # Natural Conversation Flow: Phase 4 - Pre-emptive Listening
        # When enabled, continue sending audio to STT during SPEAKING state
        # This allows faster barge-in detection with ready transcript
        is_preemptive = self.config.enable_preemptive_listening and self._state == PipelineState.SPEAKING

        if self._cancelled:
            if self._metrics.audio_chunks_received == 0:
                logger.warning(f"Dropping audio - cancelled: {self._cancelled}")
            return

        if self._state not in (PipelineState.LISTENING, PipelineState.IDLE):
            if not is_preemptive:
                if self._metrics.audio_chunks_received == 0:
                    logger.warning(f"Dropping audio - state: {self._state}")
                return
            # Pre-emptive listening: mark that we're actively listening during speech
            if not self._preemptive_listening_active:
                self._preemptive_listening_active = True
                self._preemptive_transcript_buffer = ""
                logger.debug("[Pipeline] Pre-emptive listening activated during AI speech")

        self._metrics.audio_chunks_received += 1

        # Log every 100 chunks to confirm audio flow
        if self._metrics.audio_chunks_received % 100 == 0:
            mode = "preemptive" if is_preemptive else "normal"
            logger.debug(f"Audio chunk #{self._metrics.audio_chunks_received}, {len(audio_data)} bytes ({mode})")

        # Send to STT
        if self._stt_session:
            await self._stt_session.send_audio(audio_data)

        # Send to emotion detection (parallel, non-blocking) - only during normal listening
        if self._emotion_session and not is_preemptive:
            await self._emotion_session.add_audio(audio_data, sample_rate=self.config.stt_sample_rate)

        # Track speech duration for backchanneling - only during normal listening
        current_time = time.time()
        if self._backchannel_session and self._speech_start_time and not is_preemptive:
            speech_duration_ms = int((current_time - self._speech_start_time) * 1000)
            await self._backchannel_session.on_speech_continue(speech_duration_ms)

            # Pause detection: if we haven't received a transcript in 150-400ms,
            # it might be a natural pause suitable for backchanneling
            if self._last_transcript_time > 0:
                pause_ms = int((current_time - self._last_transcript_time) * 1000)
                # Only check pause window if we're in the right range (150-400ms)
                # and the pipeline is in listening state (user speaking)
                if 150 <= pause_ms <= 400 and self._state == PipelineState.LISTENING:
                    await self._backchannel_session.on_pause_detected(pause_ms)

        self._last_audio_time = current_time

    async def send_audio_base64(self, audio_b64: str) -> None:
        """
        Send base64-encoded audio to the pipeline.

        Args:
            audio_b64: Base64-encoded PCM16 audio
        """
        try:
            audio_data = base64.b64decode(audio_b64)
            # Debug: log every 50th chunk at base64 level
            if not hasattr(self, "_b64_chunk_count"):
                self._b64_chunk_count = 0
            self._b64_chunk_count += 1
            if self._b64_chunk_count % 50 == 0:
                logger.debug(
                    f"[Pipeline] B64 chunk #{self._b64_chunk_count}, "
                    f"decoded {len(audio_data)} bytes, state={self._state}"
                )
            await self.send_audio(audio_data)
        except Exception as e:
            logger.error(f"Failed to decode audio: {e}")

    async def commit_audio(self) -> None:
        """
        Signal that the current audio input is complete.

        This triggers immediate processing without waiting for VAD.
        """
        if self._stt_session and self._state == PipelineState.LISTENING:
            # Stop STT and get final transcript
            final = await self._stt_session.stop()
            if final:
                self._final_transcript = final
            await self._process_transcript()

    async def barge_in(
        self,
        transcript: Optional[str] = None,
        duration_ms: int = 0,
        vad_probability: float = 0.8,
    ) -> None:
        """
        Handle barge-in (user interrupts AI).

        Phase 3: Intelligent Barge-In Classification
        - Classifies the interruption as backchannel, soft_barge, or hard_barge
        - Backchannel: Continue AI speech (don't interrupt)
        - Soft barge: Pause AI at reduced volume, wait for user
        - Hard barge: Full stop and process new query

        Phase 4: Barge-in Latency Optimization
        - Sends immediate `barge_in.initiated` signal before any async operations
        - This allows frontend to optimistically transition to listening state
        - Target: <50ms from frontend trigger to audio stop

        Args:
            transcript: User's transcribed speech (for classification)
            duration_ms: Duration of the utterance in milliseconds
            vad_probability: VAD confidence from frontend (0-1)
        """
        if not self.config.barge_in_enabled:
            return

        self._barge_in_start_time = time.time()

        # Get transcript for classification (use provided or buffered)
        classification_transcript = transcript or ""
        if not classification_transcript and self._preemptive_transcript_buffer:
            classification_transcript = self._preemptive_transcript_buffer
        if not classification_transcript and self._partial_transcript:
            classification_transcript = self._partial_transcript

        # Get VAD probability from frontend state if available
        effective_vad_prob = vad_probability
        if self._frontend_vad_state:
            effective_vad_prob = self._frontend_vad_state.get("silero_confidence", vad_probability)

        # Check if barge-in classification is enabled via feature flag
        classifier_enabled = await feature_flag_service.is_enabled(
            "backend.voice_barge_in_classifier_enabled", default=False
        )

        # Classify the barge-in event
        classification: Optional[ClassificationResult] = None
        if classifier_enabled and classification_transcript:
            classification = self._barge_in_classifier.classify(
                transcript=classification_transcript,
                duration_ms=duration_ms,
                vad_probability=effective_vad_prob,
                during_ai_speech=self._state == PipelineState.SPEAKING,
                time_since_last_utterance_ms=(
                    int((time.time() - self._last_transcript_time) * 1000) if self._last_transcript_time else 0
                ),
            )
            self._last_classification = classification

            logger.info(
                "[Pipeline] Barge-in classified",
                extra={
                    "session_id": self.session_id,
                    "classification": classification.classification,
                    "intent": classification.intent,
                    "confidence": classification.confidence,
                    "transcript": classification_transcript[:50],
                    "action": classification.action.type,
                },
            )

            # Handle backchannel - don't interrupt AI
            if classification.classification == "backchannel":
                await self._on_message(
                    PipelineMessage(
                        type="barge_in.classified",
                        data={
                            "classification": "backchannel",
                            "intent": classification.intent,
                            "confidence": classification.confidence,
                            "action": "continue",
                            "transcript": classification_transcript,
                            "timestamp": time.time(),
                        },
                    )
                )
                logger.info(f"[Pipeline] Backchannel detected, AI continues: '{classification_transcript}'")
                return  # Don't actually barge in

            # Handle soft barge - pause AI, wait for user
            if classification.classification == "soft_barge":
                await self._handle_soft_barge(classification, classification_transcript)
                return

        # Hard barge or unknown - proceed with full interruption
        logger.info(f"Barge-in triggered (hard): {self.session_id}")

        # Phase 4: Send immediate confirmation before any async operations
        # This allows frontend to optimistically stop audio playback
        await self._on_message(
            PipelineMessage(
                type="barge_in.initiated",
                data={
                    "timestamp": time.time(),
                    "session_id": self.session_id,
                    "classification": classification.classification if classification else "hard_barge",
                    "intent": classification.intent if classification else "stop",
                    "confidence": classification.confidence if classification else 0.5,
                },
            )
        )

        # Natural Conversation Flow: Phase 2.4 - Start misfire rollback timer
        # If no valid transcript within 500ms, this was a false positive
        if self._hybrid_vad_enabled:
            self._hybrid_vad_decider.start_misfire_timer()
            self._barge_in_interrupted_response = self._current_response_text
            self._barge_in_playback_position_ms = (
                int((time.time() - self._tts_playback_start_time) * 1000) if self._tts_playback_start_time else 0
            )
            # Start background task to check for misfire after 500ms
            if self._misfire_check_task:
                self._misfire_check_task.cancel()
            self._misfire_check_task = asyncio.create_task(self._start_misfire_check())

        async with self._state_lock:
            self._metrics.cancelled = True
            # CRITICAL FIX: Set _cancelled to stop _handle_audio_chunk from sending
            # stale audio chunks that were already generated before barge-in
            self._cancelled = True

            # Cancel Talker if speaking
            if self._talker_session:
                await self._talker_session.cancel()

            # Cancel Thinker if processing and recreate for new utterance
            # CRITICAL: Must recreate the session because the cancelled session
            # cannot be reused for think() calls
            if self._thinker_session:
                await self._thinker_session.cancel()
                self._thinker_session = self._thinker_service.create_session(
                    conversation_id=self.conversation_id,
                    on_token=self._handle_llm_token,
                    on_tool_call=self._handle_tool_call,
                    on_tool_result=self._handle_tool_result,
                    user_id=self.user_id,
                )
                logger.debug("[Pipeline] Recreated Thinker session for new input after barge-in")

            # Natural Conversation Flow: Phase 4 - Pre-emptive Listening
            # Use the pre-emptive transcript buffer if available
            preemptive_transcript = ""
            if self._preemptive_listening_active and self._preemptive_transcript_buffer:
                preemptive_transcript = self._preemptive_transcript_buffer
                logger.info(f"[Pipeline] Using pre-emptive buffer for barge-in: '{preemptive_transcript}'")
            self._preemptive_listening_active = False
            self._preemptive_transcript_buffer = ""

            # Reset to listening state
            self._state = PipelineState.LISTENING
            self._partial_transcript = preemptive_transcript  # Start with buffered text
            self._final_transcript = ""
            self._transcript_confidence = 1.0  # Phase 7: Reset confidence

            # Restart STT for new input
            if self._stt_session:
                await self._stt_session.stop()

            self._stt_session = await self._stt_service.create_session(
                on_partial=self._handle_partial_transcript,
                on_final=self._handle_final_transcript,
                on_endpoint=self._handle_speech_end,
                on_speech_start=self._handle_speech_start,
            )
            await self._stt_session.start()

            # Send barge_in reason so frontend knows to stop audio playback
            await self._send_state_update(reason="barge_in")
            # Issue 3: Publish turn.yielded when user interrupts
            await self._publish_turn_yielded("user_barge_in")

            # Send classification result to frontend
            if classification:
                await self._on_message(
                    PipelineMessage(
                        type="barge_in.classified",
                        data={
                            "classification": classification.classification,
                            "intent": classification.intent,
                            "confidence": classification.confidence,
                            "action": classification.action.type,
                            "priority": classification.priority,
                            "transcript": classification_transcript,
                            "latency_ms": int((time.time() - self._barge_in_start_time) * 1000),
                        },
                    )
                )

            # Natural Conversation Flow: Phase 1 - Clean Transcript Truncation
            # Truncate the AI response at the word boundary where playback stopped
            if self._word_timestamps_enabled and self._current_response_text:
                await self._perform_transcript_truncation()

    async def _perform_transcript_truncation(self) -> None:
        """
        Truncate the AI response transcript at the current playback position.

        Uses word-boundary estimation to find the last complete word spoken
        before the barge-in, and sends a truncation event to the frontend.
        """
        # Calculate playback position (time since TTS started)
        if self._tts_playback_start_time:
            playback_position_ms = int((time.time() - self._tts_playback_start_time) * 1000)
        else:
            playback_position_ms = 0

        # Add the current response as a chunk for truncation calculation
        # Estimate duration: 150 WPM average = 2.5 words/second
        # Average 5 chars per word = ~40ms per character (rough estimate)
        estimated_duration_ms = len(self._current_response_text) * 40

        self._transcript_sync.add_chunk(
            session_id=self.session_id,
            text=self._current_response_text,
            chunk_index=0,
            duration_ms=estimated_duration_ms,
        )

        # Truncate at playback position
        truncation_result = self._transcript_sync.truncate_at_position(
            session_id=self.session_id,
            interrupted_at_ms=playback_position_ms,
        )

        if truncation_result:
            self._last_truncation_result = truncation_result

            # Send truncation event to frontend
            truncation_event = self._transcript_sync.get_truncation_event_data(self.session_id)
            if truncation_event:
                await self._on_message(
                    PipelineMessage(
                        type="transcript.truncated",
                        data=truncation_event,
                    )
                )

            logger.info(
                "[Pipeline] Transcript truncated at word boundary",
                extra={
                    "session_id": self.session_id,
                    "playback_position_ms": playback_position_ms,
                    "words_spoken": truncation_result.words_spoken,
                    "words_remaining": truncation_result.words_remaining,
                    "last_word": truncation_result.last_complete_word,
                },
            )

        # Reset for next response
        self._current_response_text = ""
        self._tts_playback_start_time = None

    async def _start_misfire_check(self) -> None:
        """
        Start a background task to check for misfire after 500ms.

        Natural Conversation Flow: Phase 2.4 - Misfire Rollback
        If no valid transcript is received within 500ms, rollback the barge-in.
        """
        try:
            # Wait for the misfire timeout
            await asyncio.sleep(0.5)  # 500ms

            # Check if we should rollback
            if self._hybrid_vad_decider.check_misfire_rollback(""):
                await self._handle_misfire_rollback()
        except asyncio.CancelledError:
            # Timer was cancelled (valid transcript received)
            pass

    async def _handle_misfire_rollback(self) -> None:
        """
        Handle misfire rollback: Resume previous playback state.

        Called when barge-in triggered but no valid speech was detected.
        """
        logger.info(
            "[Pipeline] Misfire rollback triggered - no valid transcript",
            extra={
                "session_id": self.session_id,
                "interrupted_response_length": len(self._barge_in_interrupted_response),
                "playback_position_ms": self._barge_in_playback_position_ms,
            },
        )

        # Send rollback event to frontend
        await self._on_message(
            PipelineMessage(
                type="barge_in.rollback",
                data={
                    "reason": "no_transcript",
                    "playback_position_ms": self._barge_in_playback_position_ms,
                    "can_resume": bool(self._barge_in_interrupted_response),
                    "timestamp": time.time(),
                },
            )
        )

        # If there's interrupted response, tell frontend to resume audio
        # The frontend can resume from the buffered position
        if self._barge_in_interrupted_response:
            await self._on_message(
                PipelineMessage(
                    type="audio.resume",
                    data={
                        "resume_from_ms": self._barge_in_playback_position_ms,
                        "timestamp": time.time(),
                    },
                )
            )

        # Reset misfire state
        self._barge_in_interrupted_response = ""
        self._barge_in_playback_position_ms = 0

        # Update metrics
        self._metrics.barge_in_misfires = getattr(self._metrics, "barge_in_misfires", 0) + 1

    def _cancel_misfire_timer(self) -> None:
        """Cancel the misfire rollback timer when valid transcript is received."""
        if self._misfire_check_task and not self._misfire_check_task.done():
            self._misfire_check_task.cancel()
            self._misfire_check_task = None
        if hasattr(self, "_hybrid_vad_decider"):
            self._hybrid_vad_decider.cancel_misfire_timer()
        # Clear the interrupted response since barge-in is confirmed
        self._barge_in_interrupted_response = ""
        self._barge_in_playback_position_ms = 0

    async def _handle_soft_barge(
        self,
        classification: ClassificationResult,
        transcript: str,
    ) -> None:
        """
        Handle soft barge-in: Pause AI at reduced volume, wait for user to continue.

        Soft barges occur when the user says something like "wait", "hold on", etc.
        The AI pauses and waits for the user to provide more input.
        """
        logger.info(f"[Pipeline] Soft barge detected: '{transcript}'")

        # Send soft_barge notification to frontend
        await self._on_message(
            PipelineMessage(
                type="barge_in.classified",
                data={
                    "classification": "soft_barge",
                    "intent": classification.intent,
                    "confidence": classification.confidence,
                    "action": "pause",
                    "transcript": transcript,
                    "pause_duration_ms": classification.action.pause_duration_ms or 2000,
                    "timestamp": time.time(),
                },
            )
        )

        async with self._state_lock:
            # Pause Talker (reduce volume, don't cancel)
            if self._talker_session:
                # Note: TalkerSession may need a pause() method added
                # For now, we'll cancel but frontend will handle the soft pause
                await self._talker_session.cancel()

            # Set state to soft_paused (or use LISTENING for now)
            self._state = PipelineState.LISTENING
            self._partial_transcript = ""
            self._final_transcript = ""

            # Restart STT for new input
            if self._stt_session:
                await self._stt_session.stop()

            self._stt_session = await self._stt_service.create_session(
                on_partial=self._handle_partial_transcript,
                on_final=self._handle_final_transcript,
                on_endpoint=self._handle_speech_end,
                on_speech_start=self._handle_speech_start,
            )
            await self._stt_session.start()

            await self._send_state_update(reason="soft_barge")

    async def update_frontend_vad_state(
        self,
        silero_confidence: float,
        is_speaking: bool,
        speech_duration_ms: int,
        is_playback_active: bool,
    ) -> None:
        """
        Phase 2: VAD Confidence Sharing - Update frontend Silero VAD state.

        This method receives periodic VAD state updates from the frontend
        Silero VAD and stores them for hybrid VAD decision making.

        Phase 3: Hybrid VAD Fusion - Uses HybridVADDecider for weighted voting.

        Args:
            silero_confidence: Speech probability from Silero VAD (0-1)
            is_speaking: Whether frontend VAD thinks user is speaking
            speech_duration_ms: Duration of current speech in milliseconds
            is_playback_active: Whether AI audio playback is active
        """
        share_enabled = await feature_flag_service.is_enabled(
            "backend.voice_silero_vad_confidence_sharing",
            default=True,
        )
        if not share_enabled:
            return

        self._frontend_vad_state = {
            "silero_confidence": silero_confidence,
            "is_speaking": is_speaking,
            "speech_duration_ms": speech_duration_ms,
            "is_playback_active": is_playback_active,
        }
        self._frontend_vad_update_time = time.time()

        # Check if hybrid VAD fusion is enabled
        hybrid_vad_enabled = await feature_flag_service.is_enabled(
            "backend.voice_hybrid_vad_fusion",
            default=False,
        )

        # Update hybrid VAD decider state
        self._hybrid_vad_decider.set_tts_playing(is_playback_active)
        silero_state = VADState(
            confidence=silero_confidence,
            is_speaking=is_speaking,
            speech_duration_ms=speech_duration_ms,
        )
        self._hybrid_vad_decider.update_silero_state(silero_state)

        # Create Deepgram event from current state
        deepgram_event = DeepgramEvent(
            is_speech_started=self._deepgram_vad_active,
            is_speech_ended=False,
            confidence=1.0 if self._deepgram_vad_active else 0.0,
        )
        self._hybrid_vad_decider.update_deepgram_event(deepgram_event)

        # Use hybrid VAD decider if enabled, otherwise fall back to legacy logic
        if hybrid_vad_enabled and self._state == PipelineState.SPEAKING:
            decision = self._hybrid_vad_decider.decide_barge_in()

            if decision.trigger:
                logger.info(
                    "[Pipeline] Hybrid VAD: Triggering barge-in",
                    extra={
                        "source": decision.source,
                        "confidence": decision.confidence,
                        "silero_weight": decision.silero_weight,
                        "deepgram_weight": decision.deepgram_weight,
                        "reason": decision.reason,
                        "silero_confidence": silero_confidence,
                        "speech_duration_ms": speech_duration_ms,
                        "deepgram_active": self._deepgram_vad_active,
                    },
                )
                # Start misfire timer for rollback
                self._hybrid_vad_decider.start_misfire_timer()
                # Don't await - let it run async to avoid blocking VAD stream
                asyncio.create_task(
                    self.barge_in(
                        transcript=self._preemptive_transcript_buffer or self._partial_transcript,
                        duration_ms=speech_duration_ms,
                        vad_probability=silero_confidence,
                    )
                )
        else:
            # Legacy hybrid VAD logic (fallback when feature flag disabled)
            hybrid_should_barge = False
            if self._state == PipelineState.SPEAKING and is_speaking:
                # If Deepgram and Silero agree, act immediately
                if self._deepgram_vad_active and silero_confidence >= 0.55:
                    hybrid_should_barge = True
                else:
                    # Weighted score gives Deepgram credit when active
                    deepgram_weight = 0.4 if self._deepgram_vad_active else 0.0
                    hybrid_score = silero_confidence * 0.6 + deepgram_weight

                    # Require stronger evidence when Deepgram is not detecting speech yet
                    if silero_confidence >= 0.8 and speech_duration_ms >= 200:
                        hybrid_should_barge = True
                    elif hybrid_score >= 0.75 and speech_duration_ms >= 150:
                        hybrid_should_barge = True

            if hybrid_should_barge:
                logger.info(
                    f"[Pipeline] Legacy Hybrid VAD: Triggering barge-in "
                    f"(conf={silero_confidence:.2f}, duration={speech_duration_ms}ms, "
                    f"deepgram_active={self._deepgram_vad_active})"
                )
                # Don't await - let it run async to avoid blocking VAD stream
                asyncio.create_task(self.barge_in())

    async def stop(self) -> PipelineMetrics:
        """
        Stop the pipeline session.

        Returns:
            PipelineMetrics with session statistics
        """
        self._cancelled = True
        self._metrics.end_time = time.time()
        self._metrics.total_latency_ms = int((self._metrics.end_time - self._metrics.start_time) * 1000)

        # Stop all components
        if self._stt_session:
            await self._stt_session.stop()

        if self._talker_session:
            await self._talker_session.cancel()

        if self._thinker_session:
            await self._thinker_session.cancel()

        # Stop emotion detection session
        if self._emotion_session:
            await self._emotion_session.stop()
            self._emotion_session = None

        # Stop backchannel session
        if self._backchannel_session:
            await self._backchannel_session.stop()
            self._backchannel_session = None

        # Stop prosody session and update user profile
        if self._prosody_session:
            await self._prosody_service.remove_session(self.session_id)
            self._prosody_session = None

        # Phase 4: Clean up memory context session
        if self._memory_manager:
            try:
                session_uuid = uuid.UUID(self.session_id) if isinstance(self.session_id, str) else self.session_id
                memory_context_service.end_session(session_uuid)
                self._memory_manager = None
                logger.debug(f"Memory context cleaned up for session: {self.session_id}")
            except Exception as e:
                logger.warning(f"Failed to clean up memory context: {e}")

        # Phase 9: Clean up patient context and PHI monitor
        if self._patient_context:
            self._patient_context = None
            logger.debug(f"Patient context cleaned up for session: {self.session_id}")

        if self._phi_monitor:
            self._phi_monitor.clear_patient_context()
            logger.debug(f"PHI monitor context cleared for session: {self.session_id}")

        # Natural Conversation Flow: Phase 3 - Clean up utterance aggregator
        if self._utterance_aggregator:
            await self._utterance_aggregator.cancel()
            remove_utterance_aggregator(self.session_id)
            self._utterance_aggregator = None
            logger.debug(f"Utterance aggregator cleaned up for session: {self.session_id}")

        # Natural Conversation Flow: Phase 1 - Clean up transcript sync session
        self._transcript_sync.remove_session(self.session_id)
        logger.debug(f"Transcript sync session cleaned up for session: {self.session_id}")

        # Phase 8: Clean up dictation session
        if self._dictation_session:
            self._dictation_session = None
            logger.debug(f"Dictation session cleaned up for session: {self.session_id}")

        # Phase 10: End analytics session and send feedback prompts
        if self._analytics:
            # Get feedback prompts based on session
            prompts = self._feedback_service.get_feedback_prompts(
                session_id=self.session_id,
                session_duration_ms=self._analytics.duration_ms,
                interaction_count=self._analytics.interactions.user_utterance_count,
                has_errors=self._analytics.error_count > 0,
            )
            if prompts:
                await self._on_message(
                    PipelineMessage(
                        type="feedback.prompts",
                        data={
                            "prompts": [p.to_dict() for p in prompts],
                        },
                    )
                )

            # End the analytics session and send final summary
            final_analytics = self._analytics_service.end_session(self.session_id)
            if final_analytics:
                await self._on_message(
                    PipelineMessage(
                        type="analytics.session_ended",
                        data=final_analytics,
                    )
                )

            self._analytics = None
            logger.debug(f"Analytics session ended for session: {self.session_id}")

        self._state = PipelineState.IDLE

        logger.info(
            f"Voice pipeline stopped: {self.session_id}",
            extra={
                "total_latency_ms": self._metrics.total_latency_ms,
                "audio_chunks": self._metrics.audio_chunks_received,
            },
        )

        return self._metrics

    # ==========================================================================
    # Internal Handlers
    # ==========================================================================

    async def _handle_emotion_result(self, emotion: EmotionResult) -> None:
        """
        Handle emotion detection result from Hume AI.

        Updates internal state and sends to frontend for visualization.
        """
        self._current_emotion = emotion

        # Log emotion detection
        logger.info(
            f"[Pipeline] Emotion detected: {emotion.primary_emotion.value} "
            f"(conf={emotion.primary_confidence:.2f}, valence={emotion.valence:.2f}, arousal={emotion.arousal:.2f})"
        )

        # Send emotion update to frontend
        await self._on_message(
            PipelineMessage(
                type="emotion.detected",
                data=emotion.to_dict(),
            )
        )

    async def _handle_backchannel(self, audio: BackchannelAudio) -> None:
        """
        Handle backchannel audio from the backchannel service.

        Sends the pre-generated audio clip to the frontend for playback.
        """
        logger.info(f"[Pipeline] Emitting backchannel: '{audio.phrase}' ({audio.duration_ms}ms)")

        # Send backchannel audio to frontend
        await self._on_message(
            PipelineMessage(
                type="backchannel.trigger",
                data={
                    "phrase": audio.phrase,
                    "audio": (base64.b64encode(audio.audio_data).decode() if audio.audio_data else ""),
                    "format": audio.format,
                    "duration_ms": audio.duration_ms,
                },
            )
        )

    async def _handle_dictation_event(self, event: DictationEvent) -> None:
        """
        Phase 8: Handle dictation events from the dictation service.

        Forwards dictation state changes and section updates to the frontend.
        """
        logger.info(f"[Pipeline] Dictation event: {event.event_type} - {event.data}")

        if event.event_type == "state_change":
            await self._on_message(
                PipelineMessage(
                    type="dictation.state",
                    data={
                        "state": event.data.get("state"),
                        "note_type": event.data.get("note_type"),
                        "current_section": event.data.get("current_section"),
                    },
                )
            )
        elif event.event_type == "section_update":
            await self._on_message(
                PipelineMessage(
                    type="dictation.section_update",
                    data={
                        "section": event.data.get("section"),
                        "content": event.data.get("content"),
                        "partial_text": event.data.get("partial_text"),
                        "word_count": event.data.get("word_count"),
                        "is_final": event.data.get("is_final", False),
                    },
                )
            )
        elif event.event_type == "section_change":
            await self._on_message(
                PipelineMessage(
                    type="dictation.section_change",
                    data={
                        "previous_section": event.data.get("previous_section"),
                        "current_section": event.data.get("current_section"),
                    },
                )
            )

    async def _handle_word_data(self, words: List[Dict]) -> None:
        """
        Handle word-level data from Deepgram for prosody analysis.

        Updates the prosody session with word timing data for:
        - Speech rate calculation
        - Pause pattern detection
        - Turn-taking signal analysis
        """
        if not self._prosody_session:
            return

        # Feed words to prosody analyzer
        self._prosody_session.add_words(words)

        # Get current analysis for potential backchannel triggers
        snapshot = self._prosody_session.get_current_analysis()
        self._current_prosody = snapshot

        # Log significant prosody events
        if snapshot.word_count > 0 and snapshot.word_count % 20 == 0:
            logger.debug(
                f"[Pipeline] Prosody update: WPM={snapshot.words_per_minute:.0f}, "
                f"pace={snapshot.pace.value}, pauses={snapshot.pause_count}"
            )

        # Check if prosody suggests backchannel timing
        if self._backchannel_session and self._prosody_session.should_backchannel():
            # Trigger a backchannel check during natural pause
            await self._backchannel_session.on_pause_detected(
                int(snapshot.avg_pause_ms) if snapshot.avg_pause_ms > 0 else 300
            )

    def _is_substantial_transcript(self, text: str) -> bool:
        """
        Check if a transcript is substantial enough to trigger barge-in.

        Filters out noise like sighs, "um", "uh", single short sounds that
        Deepgram might transcribe from background noise.

        Returns True if the transcript looks like intentional speech.
        """
        if not text:
            return False

        cleaned = text.strip().lower()

        # Filter out common filler sounds and very short utterances
        # These are often background noise or non-intentional sounds
        noise_patterns = {
            "um",
            "uh",
            "hmm",
            "hm",
            "mm",
            "ah",
            "oh",
            "er",
            "erm",
            "mhm",
            "uhm",
            "ehm",
            "ahem",
            "huh",
            "eh",
        }

        # Single word that's a noise pattern
        if cleaned in noise_patterns:
            logger.debug(f"[Pipeline] Ignoring noise transcript: '{text}'")
            return False

        # Too short (less than 3 characters after stripping) - likely noise
        if len(cleaned) < 3:
            logger.debug(f"[Pipeline] Ignoring too-short transcript: '{text}'")
            return False

        # Require at least 2 words OR a clear command word for barge-in
        # This reduces false positives from sighs/noise
        words = cleaned.split()
        command_words = {
            "stop",
            "wait",
            "hold",
            "pause",
            "no",
            "actually",
            "but",
            "hey",
            "okay",
            "ok",
        }

        if len(words) >= 2:
            return True

        if len(words) == 1 and words[0] in command_words:
            return True

        # Single word that's not a command - might be noise, don't barge-in
        logger.debug(f"[Pipeline] Single non-command word, not triggering barge-in: '{text}'")
        return False

    def _get_barge_in_confidence_threshold(self) -> float:
        """
        Calculate the confidence threshold for barge-in based on VAD sensitivity.

        VAD sensitivity 0-100 maps to confidence threshold:
        - 0 (least sensitive) = 0.95 confidence required (very high bar)
        - 50 (default) = 0.75 confidence required
        - 100 (most sensitive) = 0.50 confidence required (low bar)
        """
        # Linear interpolation: sensitivity 0->0.95, 100->0.50
        # threshold = 0.95 - (sensitivity/100) * 0.45
        threshold = 0.95 - (self.config.vad_sensitivity / 100) * 0.45
        return max(0.50, min(0.95, threshold))

    async def _handle_partial_transcript(self, text: str, confidence: float) -> None:
        """Handle partial transcript from STT."""
        logger.info(f"[Pipeline] Partial transcript received: '{text}' (conf={confidence:.2f})")
        self._partial_transcript = text
        self._transcript_confidence = confidence  # Phase 7: Track for repair strategies
        self._last_transcript_time = time.time()  # Track for pause detection

        # Natural Conversation Flow: Phase 2.4 - Cancel misfire timer on valid transcript
        # If we received a substantial transcript, the barge-in is confirmed
        if text.strip() and len(text.strip()) > 2:
            self._cancel_misfire_timer()

        # Natural Conversation Flow: Phase 4 - Pre-emptive Listening
        # Buffer transcripts during AI speech for instant availability on barge-in
        if self._preemptive_listening_active and self._state == PipelineState.SPEAKING:
            self._preemptive_transcript_buffer = text
            logger.debug(f"[Pipeline] Pre-emptive buffer updated: '{text}'")

        # Trigger barge-in if AI is speaking and we got substantial speech
        # Requires multiple words or a command word to avoid false positives from noise
        # Also requires confidence above threshold based on VAD sensitivity
        if self._state == PipelineState.SPEAKING and self._is_substantial_transcript(text):
            threshold = self._get_barge_in_confidence_threshold()
            if confidence >= threshold:
                logger.info(
                    f"[Pipeline] Triggering barge-in (substantial transcript while AI speaking): "
                    f"'{text}' (conf={confidence:.2f} >= threshold={threshold:.2f}, "
                    f"vad_sensitivity={self.config.vad_sensitivity})"
                )
                await self.barge_in()
                return  # Don't send transcript delta after barge-in
            else:
                logger.info(
                    f"[Pipeline] Skipping barge-in (confidence too low): '{text}' "
                    f"(conf={confidence:.2f} < threshold={threshold:.2f}, "
                    f"vad_sensitivity={self.config.vad_sensitivity})"
                )

        await self._on_message(
            PipelineMessage(
                type="transcript.delta",
                data={
                    "text": text,
                    "is_final": False,
                    "confidence": confidence,
                },
            )
        )

    async def _handle_final_transcript(self, text: str) -> None:
        """Handle final transcript segment from STT."""
        logger.info(f"[Pipeline] Final transcript received: '{text}'")

        # Natural Conversation Flow: Phase 2.4 - Cancel misfire timer on final transcript
        if text.strip():
            self._cancel_misfire_timer()

        # Trigger barge-in if AI is speaking and we got substantial speech
        if self._state == PipelineState.SPEAKING and self._is_substantial_transcript(text):
            logger.info(f"[Pipeline] Triggering barge-in (substantial final transcript while AI speaking): '{text}'")
            await self.barge_in()
            # Store the transcript for the next turn
            self._final_transcript = text
            return

        # Natural Conversation Flow: Phase 3 - Utterance Aggregation
        # If aggregation is enabled, add segment to aggregator instead of
        # directly accumulating. The aggregator will merge segments and
        # call _handle_aggregated_utterance when ready.
        if self._utterance_aggregator and self.config.enable_utterance_aggregation:
            result = await self._utterance_aggregator.add_final(
                text=text,
                confidence=self._transcript_confidence,
                language=self.config.stt_language,
            )
            # If aggregator returned a result, it was forcefully finalized
            # (e.g., max segments reached). The callback handles processing.
            if result:
                await self._handle_aggregated_utterance(result)
            return

        # Standard accumulation (aggregation disabled)
        if self._final_transcript:
            self._final_transcript += " " + text
        else:
            self._final_transcript = text

        # NOTE: Don't emit transcript.delta with is_final=True here.
        # The transcript.complete message in _process_transcript() is the
        # authoritative final transcript. Emitting both causes duplicate
        # messages in the chat UI.

    async def _handle_speech_start(self) -> None:
        """Handle speech start detection from STT (for barge-in).

        NOTE: We do NOT auto-trigger barge-in here because Deepgram's SpeechStarted
        event can fire on background noise or TTS echo. Instead, barge-in is only
        triggered when we receive actual transcript text (partial or final) while
        the AI is speaking. See _handle_partial_transcript() and _handle_final_transcript().
        """
        logger.info(f"[Pipeline] Speech start detected: {self.session_id}, current_state={self._state}")
        self._deepgram_vad_active = True

        # Natural Conversation Flow: Phase 2 - Continuation Detection
        # If we're waiting for continuation and user starts speaking again, cancel the wait
        if self._pending_continuation and self._continuation_wait_task:
            logger.info("[Pipeline] User continued speaking - cancelling continuation wait")
            self._continuation_wait_task.cancel()
            self._pending_continuation = False
            # Note: The transcript will be accumulated and speech_end will be called again

        # Natural Conversation Flow: Phase 3 - Utterance Aggregation
        # Notify aggregator that speech started (cancels its timeout)
        if self._utterance_aggregator:
            await self._utterance_aggregator.on_speech_start()

        # Track speech timing for backchannels
        self._speech_start_time = time.time()

        # Notify backchannel session
        if self._backchannel_session:
            await self._backchannel_session.on_speech_start()

        # Notify frontend of speech start (for UI feedback only)
        logger.info(f"[Pipeline] SENDING input_audio_buffer.speech_started to frontend (state={self._state})")
        await self._on_message(
            PipelineMessage(
                type="input_audio_buffer.speech_started",
                data={
                    "timestamp": time.time(),
                    "vad_confidence": 0.9,  # Deepgram VAD is high confidence
                    "pipeline_state": self._state.value,  # Include state for debugging
                },
            )
        )

        # NOTE: DO NOT auto-trigger barge-in here! SpeechStarted fires on ANY
        # audio that looks like speech (including noise, echo from TTS, etc.)
        # Barge-in is now triggered in _handle_partial_transcript() when we
        # get actual words, which is more reliable.

    async def _handle_speech_end(self) -> None:
        """Handle speech endpoint detection from STT."""
        logger.info(f"[Pipeline] Speech end detected: {self.session_id}, accumulated='{self._final_transcript}', state={self._state}")
        self._deepgram_vad_active = False

        # Guard against duplicate processing: If we're already processing or speaking,
        # this is a duplicate UtteranceEnd event (Deepgram can send multiple for a single
        # speech turn). Just accumulate the transcript but don't trigger another processing cycle.
        if self._state in (PipelineState.PROCESSING, PipelineState.SPEAKING):
            logger.info(f"[Pipeline] Skipping duplicate speech_end - already in {self._state} state")
            return

        # Notify backchannel session of speech end
        if self._backchannel_session:
            await self._backchannel_session.on_speech_end()
        self._speech_start_time = None

        # Finalize prosody analysis for this utterance
        if self._prosody_session:
            prosody_snapshot = self._prosody_session.finalize_utterance()
            self._current_prosody = prosody_snapshot
            logger.info(
                f"[Pipeline] Prosody analysis: WPM={prosody_snapshot.words_per_minute:.0f}, "
                f"pace={prosody_snapshot.pace.value}, finished={prosody_snapshot.likely_finished}"
            )

        # Natural Conversation Flow: Phase 2 - Continuation Detection
        # Check if user might continue speaking before processing
        if self.config.enable_continuation_detection and self._final_transcript:
            # Build prosody hints from current analysis
            prosody_hints: Optional[ProsodyHints] = None
            if self._current_prosody:
                # Map WPM to speaking rate category
                wpm = self._current_prosody.words_per_minute
                speaking_rate = "normal"
                if wpm < 100:
                    speaking_rate = "slower"
                elif wpm > 160:
                    speaking_rate = "faster"

                prosody_hints = ProsodyHints(
                    pitch_trend="rising" if not self._current_prosody.likely_finished else "falling",
                    speaking_rate=speaking_rate,
                    energy_trend="stable",  # Could be enhanced with actual energy analysis
                    preceding_pause_ms=int((time.time() - self._last_transcript_time) * 1000),
                )

            # Analyze for continuation signals
            self._continuation_analysis = self._continuation_detector.analyze(
                transcript=self._final_transcript,
                language=self.config.stt_language.split("-")[0],  # Extract base language
                prosody=prosody_hints,
            )

            analysis = self._continuation_analysis
            logger.info(
                f"[Pipeline] Continuation analysis: prob={analysis.continuation_probability:.2f}, "
                f"wait={analysis.should_wait}, reason='{analysis.reason}'"
            )

            # If continuation is likely, wait for more speech instead of processing immediately
            if (
                self._continuation_analysis.should_wait
                and self._continuation_analysis.continuation_probability
                >= self.config.continuation_confidence_threshold
            ):
                self._pending_continuation = True
                wait_ms = min(
                    self._continuation_analysis.recommended_wait_ms,
                    self.config.continuation_max_wait_ms,
                )
                logger.info(f"[Pipeline] Waiting {wait_ms}ms for potential continuation...")

                # Send turn.continuation_expected event to frontend
                # This allows frontend to show visual feedback that we're waiting for more input
                await self._on_message(
                    PipelineMessage(
                        type="turn.continuation_expected",
                        data={
                            "probability": self._continuation_analysis.continuation_probability,
                            "reason": self._continuation_analysis.reason,
                            "signals": [s.signal_type for s in self._continuation_analysis.signals],
                            "wait_ms": wait_ms,
                            "transcript": self._final_transcript,
                            "timestamp": time.time(),
                        },
                    )
                )

                # Cancel any existing wait task
                if self._continuation_wait_task and not self._continuation_wait_task.done():
                    self._continuation_wait_task.cancel()

                # Schedule delayed processing
                self._continuation_wait_task = asyncio.create_task(self._continuation_timeout_handler(wait_ms))
                return  # Don't process yet, wait for timeout or more speech

        # Natural Conversation Flow: Phase 3 - Utterance Aggregation
        # If aggregation is enabled, let the aggregator callback (_handle_aggregated_utterance)
        # handle processing instead of calling _finalize_and_process() here.
        # This prevents duplicate LLM/TTS turns when aggregation is active.
        if self._utterance_aggregator and self.config.enable_utterance_aggregation:
            logger.debug("[Pipeline] Deferring processing to utterance aggregator callback")
            return

        # No continuation expected and no aggregation, process immediately
        await self._finalize_and_process()

    async def _continuation_timeout_handler(self, wait_ms: int) -> None:
        """Handle timeout for continuation waiting."""
        try:
            await asyncio.sleep(wait_ms / 1000.0)
            # Timeout expired, no more speech detected
            logger.info(f"[Pipeline] Continuation wait expired after {wait_ms}ms, processing transcript")
            self._pending_continuation = False

            # Send turn.continuation_resolved event to frontend
            await self._on_message(
                PipelineMessage(
                    type="turn.continuation_resolved",
                    data={
                        "resolution": "timeout",
                        "wait_ms": wait_ms,
                        "transcript": self._final_transcript,
                        "timestamp": time.time(),
                    },
                )
            )

            # If aggregation is enabled, let the aggregator callback handle processing
            if self._utterance_aggregator and self.config.enable_utterance_aggregation:
                logger.debug("[Pipeline] Continuation timeout: deferring to utterance aggregator")
                return

            await self._finalize_and_process()
        except asyncio.CancelledError:
            # More speech detected, wait was cancelled
            logger.debug("[Pipeline] Continuation wait cancelled (more speech detected)")
            # Send turn.continuation_resolved event with speech_detected resolution
            await self._on_message(
                PipelineMessage(
                    type="turn.continuation_resolved",
                    data={
                        "resolution": "speech_detected",
                        "wait_ms": wait_ms,
                        "transcript": self._partial_transcript or self._final_transcript,
                        "timestamp": time.time(),
                    },
                )
            )

    async def _finalize_and_process(self) -> None:
        """Finalize STT session and process the transcript."""
        self._pending_continuation = False

        # Get final transcript from STT
        # Note: With pre-emptive listening enabled, we DON'T stop the STT session
        # here because we need it to keep running during TTS playback for barge-in
        # detection. The session will be recreated in _process_transcript() before
        # TTS starts.
        if self._stt_session and not self.config.enable_preemptive_listening:
            final = await self._stt_session.stop()
            if final and final != self._final_transcript:
                self._final_transcript = final
        elif self._stt_session and self.config.enable_preemptive_listening:
            # For pre-emptive listening, stop the current session but the new one
            # will be created in _process_transcript() before TTS starts
            logger.debug("[Pipeline] Stopping STT session (will restart for pre-emptive listening)")
            await self._stt_session.stop()
            self._stt_session = None

        await self._process_transcript()

    async def _handle_aggregated_utterance(self, utterance: AggregatedUtterance) -> None:
        """
        Handle an aggregated utterance from the UtteranceAggregator.

        Called when the aggregator has collected and merged multiple speech segments
        into a complete utterance ready for processing.
        """
        logger.info(
            f"[Pipeline] Aggregated utterance ready: segments={utterance.segment_count}, "
            f"merged={utterance.was_merged}, duration={utterance.total_duration_ms}ms, state={self._state}"
        )

        # Guard against duplicate processing: If we're already processing or speaking,
        # store the transcript for later but don't trigger another processing cycle.
        # This can happen when: (1) window timer fires, (2) new segment arrives after
        # window expired causing add_segment to return result immediately + start new window.
        if self._state in (PipelineState.PROCESSING, PipelineState.SPEAKING):
            logger.info(f"[Pipeline] Skipping duplicate aggregated utterance - already in {self._state} state")
            # Store transcript for potential barge-in use
            if utterance.text.strip():
                self._final_transcript = utterance.text
            return

        # Use the merged text as the final transcript
        self._final_transcript = utterance.text

        # Log segment details for debugging
        if utterance.was_merged and len(utterance.segments) > 1:
            segment_texts = [f"'{s.text}'" for s in utterance.segments]
            logger.debug(f"[Pipeline] Merged segments: {' + '.join(segment_texts)}")
            logger.debug(f"[Pipeline] Result: '{utterance.text}'")

        # Process the aggregated transcript
        await self._process_transcript()

    async def _process_transcript(self) -> None:
        """Process the completed transcript through Thinker and Talker."""
        if not self._final_transcript or not self._final_transcript.strip():
            logger.debug("Empty transcript, skipping processing")
            self._state = PipelineState.LISTENING
            return

        async with self._state_lock:
            self._state = PipelineState.PROCESSING
            await self._send_state_update()

        transcript = self._final_transcript.strip()
        self._metrics.stt_latency_ms = int((time.time() - self._metrics.start_time) * 1000)

        # Send final transcript
        message_id = str(uuid.uuid4())
        await self._on_message(
            PipelineMessage(
                type="transcript.complete",
                data={
                    "text": transcript,
                    "message_id": message_id,
                },
            )
        )

        # Reset for next utterance
        self._partial_transcript = ""
        self._final_transcript = ""

        # Phase 8: Handle dictation mode separately
        if self.config.mode == PipelineMode.DICTATION and self._dictation_session:
            await self._process_dictation_transcript(transcript, message_id)
            return

        # Reset cancelled flag before creating new Talker session
        # This allows audio from the NEW response to flow after a barge-in
        self._cancelled = False

        # Create Talker session for TTS
        voice_config = VoiceConfig(
            voice_id=self.config.voice_id,
            model_id=self.config.tts_model,
            output_format=self.config.tts_output_format,
        )

        self._talker_session = await self._talker_service.start_session(
            on_audio_chunk=self._handle_audio_chunk,
            voice_config=voice_config,
        )

        # CRITICAL FIX: Create STT session BEFORE TTS starts playing so that
        # pre-emptive listening has a valid session during SPEAKING state.
        # Without this, pre-emptive listening sends audio to a stopped session,
        # causing "Dropping audio: running=False, ws=None" errors and barge-in failure.
        if self.config.enable_preemptive_listening:
            logger.info("[Pipeline] Creating STT session for pre-emptive listening")
            self._stt_session = await self._stt_service.create_session(
                on_partial=self._handle_partial_transcript,
                on_final=self._handle_final_transcript,
                on_endpoint=self._handle_speech_end,
                on_speech_start=self._handle_speech_start,
                on_words=self._handle_word_data,
                config=STTSessionConfig(
                    language=self.config.stt_language,
                    sample_rate=self.config.stt_sample_rate,
                    endpointing_ms=self.config.stt_endpointing_ms,
                    utterance_end_ms=self.config.stt_utterance_end_ms,
                ),
            )
            if not await self._stt_session.start():
                logger.error("[Pipeline] Failed to start STT session for pre-emptive listening")
            else:
                logger.info("[Pipeline] STT session ready for pre-emptive listening")

        # Build emotion context for response adaptation
        emotion_context = None
        if self._current_emotion and self._emotion_service:
            emotion_context = {
                "emotion": self._current_emotion,
                "trend": (self._emotion_session.get_trend() if self._emotion_session else None),
                "prompt_addition": self._emotion_service.build_emotion_context_prompt(
                    self._current_emotion,
                    (self._emotion_session.get_trend() if self._emotion_session else None),
                ),
            }

        # Phase 4: Track conversation context in memory
        memory_context = None
        if self._memory_manager:
            try:
                # Remember user's utterance as context
                await self._memory_manager.remember(
                    memory_type=MemoryType.CONTEXT,
                    key="last_user_input",
                    value=transcript,
                )

                # Track emotion if detected
                if self._current_emotion:
                    await self._memory_manager.remember(
                        memory_type=MemoryType.EMOTION,
                        key="current_emotion",
                        value=self._current_emotion.primary_emotion,
                        metadata={
                            "confidence": self._current_emotion.primary_confidence,
                            "valence": self._current_emotion.valence,
                        },
                    )

                # Get conversation context summary for LLM
                memory_context = await self._memory_manager.get_context_summary()
                logger.debug(f"Memory context for LLM: {memory_context}")
            except Exception as e:
                logger.warning(f"Failed to track memory context: {e}")

        # Phase 6: Classify query type for response timing
        query_type = classify_query_type(transcript)
        timing_config = RESPONSE_TIMING.get(query_type, RESPONSE_TIMING[QueryType.UNKNOWN])
        logger.debug(
            f"Query type: {query_type.value}, timing: delay={timing_config.delay_ms}ms, "
            f"filler={timing_config.use_filler}"
        )

        # Phase 3, 5 & 6: Apply combined response delay
        total_delay_ms = 0

        # First, apply prosody-based delay with turn-taking awareness
        if self._prosody_session:
            try:
                # Phase 5: Check turn-taking prediction
                turn_prediction = self._prosody_session.get_turn_prediction()
                if turn_prediction.confidence > 0.6:
                    logger.debug(
                        f"Turn prediction: {turn_prediction.state.value} " f"(conf={turn_prediction.confidence:.2f})"
                    )

                    # Send turn state to frontend for UI feedback
                    await self._on_message(
                        PipelineMessage(
                            type="turn.state",
                            data={
                                "state": turn_prediction.state.value,
                                "confidence": turn_prediction.confidence,
                                "recommended_wait_ms": turn_prediction.recommended_wait_ms,
                                "signals": {
                                    "falling_intonation": turn_prediction.has_falling_intonation,
                                    "trailing_off": turn_prediction.has_trailing_off,
                                    "thinking_aloud": turn_prediction.is_thinking_aloud,
                                    "continuation_cue": turn_prediction.has_continuation_cue,
                                },
                            },
                        )
                    )

                    # If user is likely continuing or thinking, wait longer
                    if self._prosody_session.should_wait_for_continuation():
                        logger.info(
                            f"Waiting for user continuation: "
                            f"state={turn_prediction.state.value}, "
                            f"wait={turn_prediction.recommended_wait_ms}ms"
                        )

                # Get prosody-recommended delay
                prosody_delay_ms = self._prosody_session.get_recommended_response_delay_ms()
                total_delay_ms = max(prosody_delay_ms, timing_config.delay_ms)
            except Exception as e:
                logger.warning(f"Failed to get prosody delay: {e}")
                total_delay_ms = timing_config.delay_ms
        else:
            total_delay_ms = timing_config.delay_ms

        # Phase 6: Apply thinking filler for complex queries
        if timing_config.use_filler and timing_config.filler_phrases and self._talker_session:
            try:
                # Select a random filler phrase (not security-sensitive, just for UI variety)
                filler = random.choice(timing_config.filler_phrases)  # nosec B311
                logger.info(f"Sending thinking filler: '{filler}'")

                # Send filler to TTS immediately (before the main response)
                await self._talker_session.add_text(filler + " ")

                # Notify frontend about the filler
                await self._on_message(
                    PipelineMessage(
                        type="response.filler",
                        data={
                            "text": filler,
                            "query_type": query_type.value,
                        },
                    )
                )

                # Reduce delay since we're already responding with filler
                total_delay_ms = max(0, total_delay_ms - 400)
            except Exception as e:
                logger.warning(f"Failed to send thinking filler: {e}")

        # Apply remaining delay
        if total_delay_ms > 0:
            logger.debug(f"Applying response delay: {total_delay_ms}ms")
            await asyncio.sleep(total_delay_ms / 1000.0)

        # Process through Thinker
        try:
            if self._thinker_session:
                response = await self._thinker_session.think(
                    user_input=transcript,
                    source_mode="voice",
                    emotion_context=emotion_context,
                    memory_context=memory_context,  # Phase 4: Pass memory context
                    transcript_confidence=self._transcript_confidence,  # Phase 7: For repair strategies
                    session_id=self.session_id,  # Phase 7: For repair strategy tracking
                )

                self._metrics.tokens_generated = response.tokens_used
                self._metrics.tool_calls_count = len(response.tool_calls_made)

                # Phase 7: Send repair status if a repair strategy was applied
                if response.repair_applied:
                    await self._on_message(
                        PipelineMessage(
                            type="response.repair",
                            data={
                                "confidence": response.confidence,
                                "needs_clarification": response.needs_clarification,
                                "repair_applied": response.repair_applied,
                            },
                        )
                    )
                    logger.info(
                        f"Repair strategy applied: confidence={response.confidence:.2f}, "
                        f"needs_clarification={response.needs_clarification}"
                    )

                # Send response complete
                await self._on_message(
                    PipelineMessage(
                        type="response.complete",
                        data={
                            "text": response.text,
                            "message_id": message_id,
                            "citations": response.citations,
                            "confidence": response.confidence,  # Phase 7: Include confidence
                            "needs_clarification": response.needs_clarification,  # Phase 7
                        },
                    )
                )

        except Exception as e:
            logger.error(f"Thinker error: {e}")
            await self._on_message(
                PipelineMessage(
                    type="error",
                    data={
                        "code": "thinker_error",
                        "message": str(e),
                        "recoverable": True,
                    },
                )
            )

        # Finish TTS
        if self._talker_session:
            await self._talker_session.finish()

        # Wait for TTS audio to finish playing on frontend and echo to settle
        # This prevents the AI's own voice from being transcribed as user speech
        # 800ms accounts for: audio buffer playback (~300ms) + room reverb (~200ms) + safety margin
        logger.info("[Pipeline] Waiting for TTS echo to settle before restarting STT...")
        await asyncio.sleep(0.8)

        # Return to listening
        async with self._state_lock:
            self._state = PipelineState.LISTENING

            # ALWAYS restart STT session when transitioning from SPEAKING to LISTENING
            # Even when pre-emptive listening is enabled, the reused session may have
            # stale utterance detection state that prevents proper end-of-speech detection
            # for the next turn. This was causing the "non-responsive after first turn" bug.
            #
            # The small overhead of creating a new session is worth the reliability.
            if self._stt_session:
                try:
                    await self._stt_session.stop()
                except Exception as e:
                    logger.warning(f"[Pipeline] Error stopping old STT session: {e}")

            # Create fresh STT session for next input
            logger.debug("[Pipeline] Creating fresh STT session for next turn")
            self._stt_session = await self._stt_service.create_session(
                on_partial=self._handle_partial_transcript,
                on_final=self._handle_final_transcript,
                on_endpoint=self._handle_speech_end,
                on_speech_start=self._handle_speech_start,
                on_words=self._handle_word_data,
                config=STTSessionConfig(
                    language=self.config.stt_language,
                    sample_rate=self.config.stt_sample_rate,
                    endpointing_ms=self.config.stt_endpointing_ms,
                    utterance_end_ms=self.config.stt_utterance_end_ms,
                ),
            )
            await self._stt_session.start()

            await self._send_state_update()
            # Issue 3: Publish turn.yielded when AI finishes speaking
            await self._publish_turn_yielded("ai_finished")

    async def _handle_llm_token(self, token: str) -> None:
        """Handle token from Thinker, feed to Talker."""
        if self._cancelled:
            return

        # Track first token latency
        if self._metrics.first_token_latency_ms == 0:
            self._metrics.first_token_latency_ms = int((time.time() - self._metrics.start_time) * 1000)
            logger.info(f"First token latency: {self._metrics.first_token_latency_ms}ms")

        # Natural Conversation Flow: Phase 1 - Track response text for truncation
        # Accumulate tokens for word-accurate transcript truncation during barge-in
        self._current_response_text += token

        # Send token to client for display
        await self._on_message(
            PipelineMessage(
                type="response.delta",
                data={"text": token},
            )
        )

        # Feed to Talker for TTS
        if self._talker_session and not self._talker_session.is_cancelled():
            await self._talker_session.add_token(token)

    async def _process_dictation_transcript(
        self,
        transcript: str,
        message_id: str,
    ) -> None:
        """
        Phase 8: Process transcript in dictation mode.

        In dictation mode:
        1. Check for voice commands first
        2. If command found, execute it
        3. If not a command, add text to current section
        4. Apply formatting if configured
        5. Don't send to Thinker (no AI response needed for regular dictation)
        """
        logger.info(f"[Pipeline] Processing dictation transcript: '{transcript}'")

        # Check for voice commands
        if self.config.dictation_enable_commands:
            parsed_command = voice_command_service.parse_command(transcript)
            if parsed_command:
                logger.info(f"[Pipeline] Voice command detected: {parsed_command.command_type.value}")

                # Execute the command
                result = await voice_command_service.execute_command(
                    parsed_command,
                    self._dictation_session,
                )

                # Send command result to frontend
                await self._on_message(
                    PipelineMessage(
                        type="dictation.command",
                        data={
                            "command": parsed_command.command_type.value,
                            "category": parsed_command.category.value,
                            "executed": result.success,
                            "message": result.message,
                            "data": result.data,
                        },
                    )
                )

                # If there's remaining text after the command, add it to dictation
                if parsed_command.remaining_text:
                    await self._add_dictation_text(parsed_command.remaining_text)

                # If "read back" was requested, speak the content
                if result.data.get("speak") and result.message:
                    await self._speak_dictation_feedback(result.message)

                # Return to listening state
                async with self._state_lock:
                    self._state = PipelineState.LISTENING
                    await self._send_state_update()
                return

        # Not a command - add text to current section
        await self._add_dictation_text(transcript)

        # Return to listening state
        async with self._state_lock:
            self._state = PipelineState.LISTENING
            await self._send_state_update()

    async def _add_dictation_text(self, text: str) -> None:
        """Add text to the current dictation section with optional formatting."""
        if not self._dictation_session:
            return

        # Phase 9: Scan for PHI before adding to dictation
        if self.config.enable_phi_monitoring:
            phi_result = self._phi_monitor.scan_text(text)
            if phi_result.matches:
                logger.info(
                    f"[Pipeline] PHI detected in dictation: {len(phi_result.matches)} matches, "
                    f"critical={phi_result.has_critical_phi}"
                )

                # Send PHI alerts to frontend
                for alert in phi_result.alerts:
                    await self._on_message(
                        PipelineMessage(
                            type="phi.alert",
                            data={
                                "alert_level": alert.alert_level.value,
                                "phi_type": alert.phi_type.value,
                                "message": alert.message,
                                "recommended_action": alert.recommended_action.value,
                            },
                        )
                    )

                # If critical PHI detected outside patient context, use sanitized text
                if phi_result.has_critical_phi:
                    logger.warning("[Pipeline] Critical PHI detected - using sanitized text")
                    text = phi_result.sanitized_text

        # Apply formatting if configured
        if self.config.dictation_auto_format:
            format_result = note_formatter_service.format_text(
                text,
                FormattingConfig(level=FormattingLevel.STANDARD),
            )
            formatted_text = format_result.formatted
            logger.debug(
                f"[Pipeline] Formatted dictation: '{text}' -> '{formatted_text}', "
                f"changes: {format_result.changes_made}"
            )
        else:
            formatted_text = text

        # Add to dictation session
        await self._dictation_session.add_transcript(
            formatted_text,
            is_final=True,
            confidence=self._transcript_confidence,
        )

    async def _speak_dictation_feedback(self, text: str) -> None:
        """Speak feedback during dictation (e.g., read back content)."""
        voice_config = VoiceConfig(
            voice_id=self.config.voice_id,
            model_id=self.config.tts_model,
            output_format=self.config.tts_output_format,
        )

        self._talker_session = await self._talker_service.start_session(
            on_audio_chunk=self._handle_audio_chunk,
            voice_config=voice_config,
        )

        async with self._state_lock:
            self._state = PipelineState.SPEAKING
            await self._send_state_update()

        # Send the text to TTS
        if self._talker_session:
            await self._talker_session.add_token(text)
            await self._talker_session.finish()

    async def _handle_audio_chunk(self, chunk: AudioChunk) -> None:
        """Handle audio chunk from Talker."""
        # Debug: Log audio chunk reception
        logger.info(
            f"[Pipeline] _handle_audio_chunk called: "
            f"has_data={bool(chunk.data)}, data_len={len(chunk.data) if chunk.data else 0}, "
            f"is_final={chunk.is_final}, cancelled={self._cancelled}"
        )

        if self._cancelled:
            logger.info("[Pipeline] Audio chunk dropped - cancelled=True")
            return

        self._metrics.audio_chunks_sent += 1

        # Track TTS latency (first audio)
        if self._metrics.tts_latency_ms == 0 and chunk.data:
            self._metrics.tts_latency_ms = int((time.time() - self._metrics.start_time) * 1000)
            # Natural Conversation Flow: Phase 1 - Initialize playback tracking
            self._tts_playback_start_time = time.time()

        # Natural Conversation Flow: Phase 1 - Track playback position for transcript sync
        if chunk.data and self._word_timestamps_enabled:
            self._transcript_sync.update_playback_position(
                self.session_id,
                int((time.time() - getattr(self, "_tts_playback_start_time", time.time())) * 1000),
            )

        # Update state to speaking
        if self._state != PipelineState.SPEAKING and chunk.data:
            async with self._state_lock:
                self._state = PipelineState.SPEAKING
                await self._send_state_update()
                # Issue 3: Publish turn.taken when AI starts speaking
                await self._publish_turn_taken("ai_speaking")

        # Send audio to client
        await self._on_message(
            PipelineMessage(
                type="audio.output",
                data={
                    "audio": (base64.b64encode(chunk.data).decode() if chunk.data else ""),
                    "format": chunk.format,
                    "is_final": chunk.is_final,
                },
            )
        )

    async def _handle_tool_call(self, event: ToolCallEvent) -> None:
        """Handle tool call from Thinker."""
        await self._on_message(
            PipelineMessage(
                type="tool.call",
                data={
                    "tool_id": event.tool_id,
                    "tool_name": event.tool_name,
                    "arguments": event.arguments,
                },
            )
        )

    async def _handle_tool_result(self, event: ToolResultEvent) -> None:
        """Handle tool result from Thinker."""
        await self._on_message(
            PipelineMessage(
                type="tool.result",
                data={
                    "tool_id": event.tool_id,
                    "tool_name": event.tool_name,
                    "result": event.result,
                    "citations": event.citations,
                },
            )
        )

    async def _send_state_update(self, reason: str = "natural") -> None:
        """Send state update to client.

        Args:
            reason: Reason for state change. "barge_in" indicates user interrupted,
                    "natural" indicates normal completion. Frontend uses this to
                    decide whether to stop audio playback.
        """
        await self._on_message(
            PipelineMessage(
                type="voice.state",
                data={"state": self._state.value, "reason": reason},
            )
        )

    async def _publish_turn_taken(self, reason: str = "ai_speaking") -> None:
        """
        Issue 3: Publish turn.taken event when AI takes the turn.

        This is called when the AI starts speaking. The frontend uses this
        to update UI state and potentially pause listening.
        """
        await self._event_bus.publish_event(
            event_type="turn.taken",
            data={
                "reason": reason,
                "state": self._state.value,
                "timestamp": time.time(),
            },
            session_id=self.session_id,
            source_engine="voice_pipeline",
            priority=5,
        )
        logger.debug(f"[Pipeline] Published turn.taken: {reason}")

    async def _publish_turn_yielded(self, reason: str = "ai_finished") -> None:
        """
        Issue 3: Publish turn.yielded event when AI yields the turn.

        This is called when the AI finishes speaking and is ready to listen.
        The frontend uses this to re-enable listening UI.
        """
        await self._event_bus.publish_event(
            event_type="turn.yielded",
            data={
                "reason": reason,
                "state": self._state.value,
                "timestamp": time.time(),
            },
            session_id=self.session_id,
            source_engine="voice_pipeline",
            priority=5,
        )
        logger.debug(f"[Pipeline] Published turn.yielded: {reason}")

    # ==========================================================================
    # Phase 10: Analytics Methods
    # ==========================================================================

    async def _send_analytics_update(self, analytics_data: Dict[str, Any]) -> None:
        """
        Send analytics update to frontend.

        Called periodically by the analytics service.
        """
        await self._on_message(
            PipelineMessage(
                type="analytics.update",
                data=analytics_data,
            )
        )

    def _track_stt_latency(self, latency_ms: float) -> None:
        """Track STT latency in analytics."""
        if self._analytics:
            self._analytics_service.record_latency(self.session_id, "stt", latency_ms)

    def _track_llm_latency(self, latency_ms: float) -> None:
        """Track LLM latency in analytics."""
        if self._analytics:
            self._analytics_service.record_latency(self.session_id, "llm", latency_ms)

    def _track_tts_latency(self, latency_ms: float) -> None:
        """Track TTS latency in analytics."""
        if self._analytics:
            self._analytics_service.record_latency(self.session_id, "tts", latency_ms)

    def _track_e2e_latency(self, latency_ms: float) -> None:
        """Track end-to-end latency in analytics."""
        if self._analytics:
            self._analytics_service.record_latency(self.session_id, "e2e", latency_ms)

    def _track_user_utterance(self, word_count: int, duration_ms: float) -> None:
        """Track user utterance in analytics."""
        if self._analytics:
            self._analytics_service.record_interaction(
                self.session_id,
                InteractionType.USER_UTTERANCE,
                word_count=word_count,
                duration_ms=duration_ms,
            )

    def _track_ai_response(self, word_count: int, duration_ms: float) -> None:
        """Track AI response in analytics."""
        if self._analytics:
            self._analytics_service.record_interaction(
                self.session_id,
                InteractionType.AI_RESPONSE,
                word_count=word_count,
                duration_ms=duration_ms,
            )

    def _track_tool_call(self) -> None:
        """Track tool call in analytics."""
        if self._analytics:
            self._analytics_service.record_interaction(
                self.session_id,
                InteractionType.TOOL_CALL,
            )

    def _track_barge_in(self) -> None:
        """Track barge-in in analytics."""
        if self._analytics:
            self._analytics_service.record_interaction(
                self.session_id,
                InteractionType.BARGE_IN,
            )

    def _track_emotion(self, emotion: str, valence: float, arousal: float) -> None:
        """Track detected emotion in analytics."""
        if self._analytics:
            self._analytics_service.record_emotion(self.session_id, emotion, valence, arousal)

    def _track_repair(self) -> None:
        """Track repair/clarification in analytics."""
        if self._analytics:
            self._analytics_service.record_repair(self.session_id)

    def _track_dictation_event(self, event_type: str, data: Optional[Dict] = None) -> None:
        """Track dictation event in analytics."""
        if self._analytics:
            self._analytics_service.record_dictation_event(self.session_id, event_type, data)

    def _track_error(self, error_type: str, message: str, recoverable: bool = True) -> None:
        """Track error in analytics."""
        if self._analytics:
            self._analytics_service.record_error(self.session_id, error_type, message, recoverable)

    async def record_feedback(
        self,
        thumbs_up: bool = True,
        message_id: Optional[str] = None,
    ) -> None:
        """
        Record quick feedback from user.

        Args:
            thumbs_up: True for positive feedback
            message_id: Optional ID of message being rated
        """
        self._feedback_service.record_quick_feedback(
            session_id=self.session_id,
            user_id=self.user_id,
            thumbs_up=thumbs_up,
            message_id=message_id,
        )

        # Send confirmation to frontend
        await self._on_message(
            PipelineMessage(
                type="feedback.recorded",
                data={
                    "thumbs_up": thumbs_up,
                    "message_id": message_id,
                },
            )
        )


# ==============================================================================
# Voice Pipeline Service
# ==============================================================================


class VoicePipelineService:
    """
    Factory for creating voice pipeline sessions.

    Usage:
        service = VoicePipelineService()

        session = await service.create_session(
            conversation_id="conv-123",
            on_message=handle_message,
        )

        await session.start()
        await session.send_audio(audio_chunk)
        await session.stop()
    """

    def __init__(self):
        self._stt_service = streaming_stt_service
        self._thinker_service = thinker_service
        self._talker_service = talker_service

        # Active sessions
        self._sessions: Dict[str, VoicePipelineSession] = {}

    def is_available(self) -> bool:
        """Check if the pipeline is available."""
        return self._stt_service.is_streaming_available() and self._talker_service.is_enabled()

    async def create_session(
        self,
        conversation_id: str,
        on_message: Callable[[PipelineMessage], Awaitable[None]],
        config: Optional[PipelineConfig] = None,
        user_id: Optional[str] = None,
    ) -> VoicePipelineSession:
        """
        Create a new voice pipeline session.

        Args:
            conversation_id: Conversation identifier
            on_message: Callback for pipeline messages
            config: Optional pipeline configuration
            user_id: User ID for tool authentication (required for calendar, etc.)

        Returns:
            VoicePipelineSession instance
        """
        session_id = str(uuid.uuid4())
        config = config or PipelineConfig()

        session = VoicePipelineSession(
            session_id=session_id,
            conversation_id=conversation_id,
            config=config,
            stt_service=self._stt_service,
            thinker_service=self._thinker_service,
            talker_service=self._talker_service,
            on_message=on_message,
            user_id=user_id,
        )

        self._sessions[session_id] = session

        logger.info(f"Created voice pipeline session: {session_id}")
        return session

    def get_session(self, session_id: str) -> Optional[VoicePipelineSession]:
        """Get an active session by ID."""
        return self._sessions.get(session_id)

    async def remove_session(self, session_id: str) -> None:
        """Remove a session."""
        session = self._sessions.pop(session_id, None)
        if session:
            await session.stop()
            logger.info(f"Removed voice pipeline session: {session_id}")

    def get_active_sessions(self) -> List[str]:
        """Get list of active session IDs."""
        return list(self._sessions.keys())


# Global service instance
voice_pipeline_service = VoicePipelineService()

---
title: Smart Conversational Voice Design
slug: voice/smart-conversational-voice-design
summary: >-
  Technical design for intelligent barge-in acknowledgments and natural
  conversational flow in voice mode, fully integrated with VoiceEventBus.
status: draft
stability: experimental
owner: backend
lastUpdated: "2025-12-04"
audience:
  - developers
  - backend
  - frontend
  - agent
  - ai-agents
tags:
  - voice
  - barge-in
  - conversational-ai
  - tts
  - design
  - voiceeventbus
category: voice
relatedPaths:
  - services/api-gateway/app/core/event_bus.py
  - services/api-gateway/app/services/voice_pipeline_service.py
  - services/api-gateway/app/services/backchannel_service.py
  - services/api-gateway/app/services/thinking_feedback_service.py
  - services/api-gateway/app/engines/conversation_engine/turn_taking.py
  - apps/web-app/src/hooks/useBargeInPromptAudio.ts
  - apps/web-app/src/components/voice/ThinkingFeedbackPanel.tsx
ai_summary: >-
  Design document for Phase 2 (Smart Acknowledgments) and Phase 3 (Natural
  Conversational Flow) of voice mode enhancements. Fully integrated with
  VoiceEventBus for cross-engine communication, extending existing
  BackchannelService and PredictiveTurnTakingEngine.
---

# Smart Conversational Voice Design

> **Status:** Design Document (Revised)
> **Version:** 2.0
> **Last Updated:** 2025-12-04
> **Authors:** AI Assistant, Development Team

## Executive Summary

This document outlines the technical design for making VoiceAssist voice mode feel natural and conversational. It covers two phases:

- **Phase 2: Smart Acknowledgments** - Context-aware barge-in responses via VoiceEventBus
- **Phase 3: Natural Conversational Flow** - Human-like turn-taking and prosody

**Key Design Principle:** All new functionality is implemented by **extending existing services** and using the **VoiceEventBus** for cross-engine coordination, not by creating duplicate services.

## Existing Infrastructure (MUST USE)

Before implementing any new features, understand what already exists:

### VoiceEventBus (`app/core/event_bus.py`)

Central pub/sub system for cross-engine communication:

```python
from app.core.event_bus import get_event_bus, VoiceEvent

event_bus = get_event_bus()

# Subscribe to events
event_bus.subscribe(
    "prosody.turn_signal",
    handler=my_handler,
    priority=10,
    engine="smart_acknowledgment"
)

# Publish events
await event_bus.publish_event(
    event_type="acknowledgment.triggered",
    data={"intent": "question", "phrase": "Yes?"},
    session_id=session_id,
    source_engine="smart_acknowledgment"
)
```

**Existing Event Types:**

- `emotion.updated` - Emotion detection result
- `emotion.deviation` - Significant deviation from baseline
- `prosody.turn_signal` - Turn-taking prediction from PredictiveTurnTakingEngine
- `repair.started` - Repair attempt started
- `query.classified` - Query type determined
- `clinical.alert` - Critical clinical finding

### BackchannelService (`app/services/backchannel_service.py`)

**Already implements:**

- `BackchannelType` enum (ACKNOWLEDGMENT, UNDERSTANDING, ENCOURAGEMENT, SURPRISE, EMPATHY)
- `BACKCHANNEL_PHRASES` - Multilingual phrase library
- `EMOTION_PHRASE_MAP` - Emotion-aware phrase selection
- `BackchannelCalibrationService` - User preference learning
- `BackchannelTimingEngine` - Timing decisions
- Event bus integration (subscribes to `emotion.updated`, `context.emotion_alert`)
- A/B testing support for emotion-aware backchannels
- Pre-cached audio per voice

### ThinkingFeedbackService (`app/services/thinking_feedback_service.py`)

**Already implements:**

- `ToneStyle` enum (SUBTLE, MODERN, CLASSIC, MINIMAL, AMBIENT, SILENT)
- `ToneType` enum (THINKING_START, THINKING_LOOP, THINKING_END, PROGRESS, ERROR, READY)
- Tone generation with harmonics and envelopes
- Session-based thinking loops
- Pre-generated tone caching

### PredictiveTurnTakingEngine (`app/engines/conversation_engine/turn_taking.py`)

**Already implements:**

- Prosody analysis for turn-taking prediction
- Publishes `prosody.turn_signal` events
- Signal types: YIELD, HOLD, CONTINUE
- Confidence scoring

### Voice Pipeline Service (`app/services/voice_pipeline_service.py`)

**Already implements:**

- `classify_query_type()` function (URGENT, SIMPLE, COMPLEX, CLARIFICATION)
- `RESPONSE_TIMING` config with filler phrases
- Integration with all services above

---

# Phase 2: Smart Acknowledgments (VoiceEventBus Integrated)

## Overview

Extend the existing `BackchannelService` with intent classification to provide context-aware acknowledgments. All coordination happens through VoiceEventBus.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Smart Acknowledgment Architecture                         │
│                    (VoiceEventBus Integrated)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────┐        VoiceEventBus                              │
│   │ PredictiveTurn      │ ─────────────────────────────────────────────┐    │
│   │ TakingEngine        │    publishes: prosody.turn_signal            │    │
│   └─────────────────────┘                                              │    │
│                                                                        │    │
│   ┌─────────────────────┐                                              ▼    │
│   │ EmotionDetection    │    publishes: emotion.updated        ┌───────────┐│
│   │ Service             │ ─────────────────────────────────────►│ SmartAck  ││
│   └─────────────────────┘                                      │ Engine    ││
│                                                                │ (NEW)     ││
│   ┌─────────────────────┐                                      │           ││
│   │ STT Service         │    publishes: transcript.partial     │ Subscribes││
│   │ (partial transcript)│ ─────────────────────────────────────►│ to all    ││
│   └─────────────────────┘                                      └─────┬─────┘│
│                                                                      │      │
│                                                                      │      │
│                          publishes: acknowledgment.triggered         │      │
│                                                                      ▼      │
│                                                              ┌───────────┐  │
│                                                              │ Backchan  │  │
│                                                              │ nelService│  │
│                                                              │ (extended)│  │
│                                                              └───────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## New Event Types (Add to VoiceEventBus)

Add these event types to `app/core/event_bus.py`:

```python
EVENTS = [
    # ... existing events ...

    # Smart Acknowledgment Engine (Phase 2)
    "transcript.partial",           # Partial STT transcript available
    "acknowledgment.intent",        # Intent classified from partial transcript
    "acknowledgment.triggered",     # Acknowledgment phrase selected and triggered
    "acknowledgment.played",        # Acknowledgment audio finished playing
    "acknowledgment.calibration",   # User calibration updated

    # Natural Flow Engine (Phase 3)
    "filler.triggered",             # Filler phrase about to play
    "filler.played",                # Filler phrase finished
    "thinking.started",             # Thinking feedback started
    "thinking.stopped",             # Thinking feedback stopped
    "turn.yielded",                 # AI yielding turn to user
    "turn.taken",                   # AI taking turn from user
]
```

## Implementation: SmartAcknowledgmentEngine

Create a new engine (NOT a service) that coordinates intent classification with BackchannelService:

### File: `app/engines/smart_acknowledgment_engine.py`

```python
"""
Smart Acknowledgment Engine - VoiceEventBus Integrated

Extends backchannel functionality with intent classification to provide
context-aware acknowledgments during user speech.

Subscribes to:
- prosody.turn_signal (from PredictiveTurnTakingEngine)
- emotion.updated (from EmotionDetectionService)
- transcript.partial (from STT service)

Publishes:
- acknowledgment.intent (intent classification result)
- acknowledgment.triggered (phrase selected and triggered)
"""

import asyncio
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from app.core.event_bus import VoiceEvent, VoiceEventBus, get_event_bus
from app.services.backchannel_service import (
    BackchannelPhrase,
    BackchannelService,
    BackchannelSession,
    BackchannelType,
    backchannel_service,
)

logger = logging.getLogger(__name__)


class BargeInIntent(str, Enum):
    """Classification of user's barge-in intent."""

    QUESTION = "question"           # User asking a question
    CORRECTION = "correction"       # User correcting AI
    AGREEMENT = "agreement"         # User agreeing
    DISAGREEMENT = "disagreement"   # User disagreeing
    CONTINUATION = "continuation"   # User wants AI to continue
    INTERRUPTION = "interruption"   # User wants AI to stop
    BACKCHANNEL = "backchannel"     # User just acknowledging (uh-huh)
    UNKNOWN = "unknown"


@dataclass
class IntentClassification:
    """Result of intent classification."""

    intent: BargeInIntent
    confidence: float
    keywords_matched: List[str]
    suggested_phrase: Optional[str] = None


# Intent classification patterns
INTENT_PATTERNS: Dict[BargeInIntent, Dict[str, Any]] = {
    BargeInIntent.QUESTION: {
        "keywords": ["what", "how", "why", "when", "where", "who", "which", "can you"],
        "endings": ["?"],
        "phrases": ["Yes?", "What is it?", "Go ahead"],
    },
    BargeInIntent.CORRECTION: {
        "keywords": ["no", "not", "wrong", "actually", "i said", "i meant", "that's not"],
        "phrases": ["I understand", "Let me correct that", "Go ahead"],
    },
    BargeInIntent.AGREEMENT: {
        "keywords": ["yes", "yeah", "right", "exactly", "correct", "true", "agree"],
        "phrases": ["Good", "Great", "Understood"],
    },
    BargeInIntent.DISAGREEMENT: {
        "keywords": ["no", "but", "however", "disagree", "don't think", "not sure"],
        "phrases": ["I see", "Tell me more", "What do you think?"],
    },
    BargeInIntent.CONTINUATION: {
        "keywords": ["continue", "go on", "keep going", "and then", "what else", "more"],
        "phrases": ["Of course", "Continuing", "Sure"],
    },
    BargeInIntent.INTERRUPTION: {
        "keywords": ["stop", "wait", "hold on", "pause", "enough", "okay okay"],
        "phrases": ["I'm listening", "Yes?", "Go ahead"],
    },
    BargeInIntent.BACKCHANNEL: {
        "keywords": ["uh huh", "mm hmm", "mhm", "okay", "ok", "right", "i see"],
        "phrases": [],  # Don't respond to backchannels
    },
}


class SmartAcknowledgmentEngine:
    """
    Engine for context-aware acknowledgments during barge-in.

    Uses VoiceEventBus for all cross-engine communication:
    - Subscribes to prosody and transcript events
    - Publishes acknowledgment events
    - Coordinates with BackchannelService for phrase selection and audio

    Initialization follows the engine pattern:
        engine = SmartAcknowledgmentEngine(event_bus=get_event_bus())
        await engine.initialize()
    """

    def __init__(
        self,
        event_bus: Optional[VoiceEventBus] = None,
        backchannel_svc: Optional[BackchannelService] = None,
    ):
        self.event_bus = event_bus or get_event_bus()
        self.backchannel_service = backchannel_svc or backchannel_service

        # Session state
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize engine and subscribe to events."""
        if self._initialized:
            return

        # Subscribe to relevant events
        self.event_bus.subscribe(
            "prosody.turn_signal",
            self._handle_turn_signal,
            priority=5,
            engine="smart_acknowledgment",
        )

        self.event_bus.subscribe(
            "emotion.updated",
            self._handle_emotion_update,
            priority=0,
            engine="smart_acknowledgment",
        )

        self.event_bus.subscribe(
            "transcript.partial",
            self._handle_partial_transcript,
            priority=10,
            engine="smart_acknowledgment",
        )

        self._initialized = True
        logger.info("SmartAcknowledgmentEngine initialized")

    async def _handle_turn_signal(self, event: VoiceEvent) -> None:
        """
        Handle turn-taking signals from PredictiveTurnTakingEngine.

        When we detect user wants to speak (YIELD signal), prepare for
        potential acknowledgment.
        """
        session_id = event.session_id
        signal_type = event.data.get("signal_type")
        confidence = event.data.get("confidence", 0.0)

        if session_id not in self._sessions:
            self._sessions[session_id] = {
                "current_emotion": "neutral",
                "last_intent": None,
                "pending_ack": False,
            }

        session = self._sessions[session_id]

        if signal_type == "yield" and confidence > 0.7:
            # User wants to speak - prepare for potential acknowledgment
            session["pending_ack"] = True
            logger.debug(f"Turn yield detected for {session_id}, ready for ack")

    async def _handle_emotion_update(self, event: VoiceEvent) -> None:
        """Update session emotion state from emotion detection."""
        session_id = event.session_id
        emotion_data = event.data.get("emotion", {})
        dominant_emotion = emotion_data.get("dominant_emotion", "neutral")

        if session_id in self._sessions:
            self._sessions[session_id]["current_emotion"] = dominant_emotion

    async def _handle_partial_transcript(self, event: VoiceEvent) -> None:
        """
        Handle partial STT transcripts to classify intent.

        This is the main entry point for smart acknowledgment:
        1. Classify intent from partial transcript
        2. Select appropriate phrase based on intent + emotion
        3. Trigger acknowledgment via BackchannelService
        4. Publish acknowledgment.triggered event
        """
        session_id = event.session_id
        transcript = event.data.get("text", "")
        is_final = event.data.get("is_final", False)

        if session_id not in self._sessions:
            return

        session = self._sessions[session_id]

        # Only process if we're expecting user input
        if not session.get("pending_ack"):
            return

        # Classify intent
        classification = self.classify_intent(transcript)

        # Publish intent classification
        await self.event_bus.publish_event(
            event_type="acknowledgment.intent",
            data={
                "intent": classification.intent.value,
                "confidence": classification.confidence,
                "keywords": classification.keywords_matched,
                "transcript": transcript,
            },
            session_id=session_id,
            source_engine="smart_acknowledgment",
        )

        # Skip if backchannel (user is just acknowledging us)
        if classification.intent == BargeInIntent.BACKCHANNEL:
            session["pending_ack"] = False
            return

        # Skip low confidence
        if classification.confidence < 0.5:
            return

        # Select phrase based on intent and emotion
        phrase = self._select_phrase(
            classification,
            session["current_emotion"],
        )

        if phrase:
            # Trigger acknowledgment
            await self._trigger_acknowledgment(session_id, phrase, classification)
            session["pending_ack"] = False
            session["last_intent"] = classification.intent

    def classify_intent(self, transcript: str) -> IntentClassification:
        """
        Classify user's intent from partial transcript.

        Uses keyword matching and pattern detection.
        Designed for <50ms latency.
        """
        text = transcript.lower().strip()
        words = set(text.split())

        best_intent = BargeInIntent.UNKNOWN
        best_confidence = 0.0
        matched_keywords: List[str] = []

        for intent, patterns in INTENT_PATTERNS.items():
            keywords = patterns.get("keywords", [])
            endings = patterns.get("endings", [])

            # Count keyword matches
            matches = [kw for kw in keywords if kw in text]

            # Check endings
            ending_match = any(text.endswith(e) for e in endings)

            # Calculate confidence
            if matches:
                confidence = len(matches) / len(keywords) * 0.8
                if ending_match:
                    confidence += 0.2
                confidence = min(confidence, 1.0)

                if confidence > best_confidence:
                    best_intent = intent
                    best_confidence = confidence
                    matched_keywords = matches

        # Get suggested phrase
        suggested = None
        if best_intent in INTENT_PATTERNS:
            phrases = INTENT_PATTERNS[best_intent].get("phrases", [])
            if phrases:
                suggested = phrases[0]

        return IntentClassification(
            intent=best_intent,
            confidence=best_confidence,
            keywords_matched=matched_keywords,
            suggested_phrase=suggested,
        )

    def _select_phrase(
        self,
        classification: IntentClassification,
        emotion: str,
    ) -> Optional[str]:
        """
        Select acknowledgment phrase based on intent and emotion.

        Combines intent-specific phrases with emotion context.
        """
        # Get intent-specific phrases
        intent_phrases = INTENT_PATTERNS.get(
            classification.intent, {}
        ).get("phrases", [])

        if not intent_phrases:
            return None

        # Emotion-based selection
        if emotion == "frustrated" or emotion == "anxious":
            # Use calmer, more empathetic phrases
            empathetic = ["I understand", "I hear you", "Go ahead"]
            matching = [p for p in intent_phrases if p in empathetic]
            if matching:
                return matching[0]

        # Use suggested phrase from classification
        if classification.suggested_phrase:
            return classification.suggested_phrase

        # Default to first phrase
        return intent_phrases[0] if intent_phrases else None

    async def _trigger_acknowledgment(
        self,
        session_id: str,
        phrase: str,
        classification: IntentClassification,
    ) -> None:
        """
        Trigger acknowledgment via BackchannelService and publish event.
        """
        # Get backchannel session
        bc_session = self.backchannel_service.get_session(session_id)

        if bc_session:
            # Create a BackchannelPhrase for the selected phrase
            bc_phrase = BackchannelPhrase(
                text=phrase,
                type=BackchannelType.ACKNOWLEDGMENT,
            )

            # Emit via backchannel session (handles audio generation/caching)
            await bc_session._emit_backchannel(bc_phrase)

        # Publish event
        await self.event_bus.publish_event(
            event_type="acknowledgment.triggered",
            data={
                "phrase": phrase,
                "intent": classification.intent.value,
                "confidence": classification.confidence,
            },
            session_id=session_id,
            source_engine="smart_acknowledgment",
        )

        logger.info(
            f"Smart acknowledgment: '{phrase}' "
            f"(intent={classification.intent.value}, "
            f"confidence={classification.confidence:.2f})"
        )

    async def cleanup_session(self, session_id: str) -> None:
        """Clean up session state."""
        self._sessions.pop(session_id, None)

    async def shutdown(self) -> None:
        """Shutdown engine."""
        self._sessions.clear()
        self._initialized = False


# Singleton instance
_smart_ack_engine: Optional[SmartAcknowledgmentEngine] = None


def get_smart_acknowledgment_engine() -> SmartAcknowledgmentEngine:
    """Get or create singleton SmartAcknowledgmentEngine."""
    global _smart_ack_engine
    if _smart_ack_engine is None:
        _smart_ack_engine = SmartAcknowledgmentEngine()
    return _smart_ack_engine
```

## Integration: Voice Pipeline Service

Update `voice_pipeline_service.py` to publish `transcript.partial` events:

```python
# In VoicePipelineSession._handle_stt_transcript()

async def _handle_stt_transcript(
    self,
    text: str,
    is_final: bool,
    confidence: float,
) -> None:
    """Handle STT transcript with event bus integration."""

    # Existing logic...

    # NEW: Publish partial transcript event for SmartAcknowledgmentEngine
    if self._event_bus:
        await self._event_bus.publish_event(
            event_type="transcript.partial",
            data={
                "text": text,
                "is_final": is_final,
                "confidence": confidence,
            },
            session_id=self.session_id,
            source_engine="voice_pipeline",
        )
```

## Integration: Session Initialization

Update session initialization to include SmartAcknowledgmentEngine:

```python
# In voice_pipeline_service.py or thinker_talker_ws.py

from app.engines.smart_acknowledgment_engine import get_smart_acknowledgment_engine

async def create_voice_session(...):
    # ... existing setup ...

    # Initialize smart acknowledgment engine (singleton, only once)
    smart_ack = get_smart_acknowledgment_engine()
    if not smart_ack._initialized:
        await smart_ack.initialize()

    # Backchannel session is created normally
    # SmartAcknowledgmentEngine will coordinate via events
```

---

# Phase 3: Natural Conversational Flow (VoiceEventBus Integrated)

## Overview

Enhance conversational naturalness through:

1. Human-like response timing (extend existing `classify_query_type`)
2. Thinking feedback coordination via event bus
3. Turn-taking improvements (extend `PredictiveTurnTakingEngine`)
4. Filler phrase integration

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Natural Flow Architecture                                 │
│                    (VoiceEventBus Integrated)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                              VoiceEventBus                                   │
│                                   │                                          │
│   ┌───────────────────────────────┼───────────────────────────────────┐     │
│   │                               │                                    │     │
│   ▼                               ▼                                    ▼     │
│  ┌─────────────┐          ┌─────────────┐                  ┌─────────────┐  │
│  │ Predictive  │          │ Natural     │                  │ Thinking    │  │
│  │ TurnTaking  │◄────────►│ Flow        │◄────────────────►│ Feedback    │  │
│  │ Engine      │          │ Engine(NEW) │                  │ Service     │  │
│  │ (extended)  │          │             │                  │ (existing)  │  │
│  └─────────────┘          └─────────────┘                  └─────────────┘  │
│        │                         │                                │          │
│        │                         │                                │          │
│        ▼                         ▼                                ▼          │
│   prosody.turn_signal      filler.triggered              thinking.started   │
│   turn.yielded             turn.taken                    thinking.stopped   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Implementation: NaturalFlowEngine

### File: `app/engines/natural_flow_engine.py`

```python
"""
Natural Flow Engine - Human-like Conversational Timing

Coordinates natural conversational flow through VoiceEventBus:
- Response timing based on query complexity
- Filler phrase injection for complex queries
- Thinking feedback coordination
- Turn-taking management

Subscribes to:
- query.classified (from voice pipeline)
- prosody.turn_signal (from PredictiveTurnTakingEngine)
- acknowledgment.triggered (from SmartAcknowledgmentEngine)

Publishes:
- filler.triggered (before playing filler phrase)
- filler.played (after filler completes)
- thinking.started (thinking tones activated)
- thinking.stopped (thinking tones stopped)
- turn.yielded (AI yielding turn)
- turn.taken (AI taking turn)
"""

import asyncio
import logging
import random
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from app.core.event_bus import VoiceEvent, VoiceEventBus, get_event_bus
from app.services.thinking_feedback_service import (
    ThinkingFeedbackService,
    ToneType,
    get_thinking_feedback_service,
)
from app.services.voice_pipeline_service import (
    QueryType,
    RESPONSE_TIMING,
    classify_query_type,
)

logger = logging.getLogger(__name__)


class FlowState(str, Enum):
    """State of conversational flow for a session."""

    IDLE = "idle"                 # No active conversation
    LISTENING = "listening"       # Listening to user
    PROCESSING = "processing"     # Processing user input
    FILLER = "filler"             # Playing filler phrase
    THINKING = "thinking"         # Playing thinking tones
    RESPONDING = "responding"     # AI is responding
    YIELDING = "yielding"         # AI yielding turn to user


@dataclass
class FlowTimingConfig:
    """Configuration for response timing."""

    # Delays (ms)
    min_response_delay_ms: int = 100     # Minimum delay before responding
    max_filler_delay_ms: int = 800       # Max delay before filler plays

    # Thresholds
    filler_probability: float = 0.7      # Probability of using filler for complex
    thinking_after_filler_ms: int = 500  # Delay before thinking tones after filler

    # Human-like variations
    timing_jitter_ms: int = 150          # Random jitter added to delays


# Extended filler phrases by query complexity and emotion
FILLER_PHRASES: Dict[QueryType, Dict[str, List[str]]] = {
    QueryType.COMPLEX: {
        "neutral": [
            "Hmm, let me think about that...",
            "That's a great question...",
            "Let me consider this carefully...",
            "Interesting question...",
        ],
        "frustrated": [
            "I understand, let me help with that...",
            "Let me address that for you...",
        ],
        "anxious": [
            "Don't worry, let me explain...",
            "Let me walk you through this...",
        ],
    },
    QueryType.CLARIFICATION: {
        "neutral": [
            "Ah, I see what you mean...",
            "Let me clarify...",
        ],
    },
}


class NaturalFlowEngine:
    """
    Engine for natural conversational flow timing.

    Coordinates:
    - Response delays based on query complexity
    - Filler phrases for complex queries
    - Thinking tones during processing
    - Turn-taking transitions
    """

    def __init__(
        self,
        event_bus: Optional[VoiceEventBus] = None,
        thinking_service: Optional[ThinkingFeedbackService] = None,
        config: Optional[FlowTimingConfig] = None,
    ):
        self.event_bus = event_bus or get_event_bus()
        self.thinking_service = thinking_service or get_thinking_feedback_service()
        self.config = config or FlowTimingConfig()

        # Session state
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._initialized = False

        # Audio callback (set during session creation)
        self._audio_callbacks: Dict[str, Callable] = {}

    async def initialize(self) -> None:
        """Initialize engine and subscribe to events."""
        if self._initialized:
            return

        # Initialize thinking service
        await self.thinking_service.initialize()

        # Subscribe to events
        self.event_bus.subscribe(
            "query.classified",
            self._handle_query_classified,
            priority=10,
            engine="natural_flow",
        )

        self.event_bus.subscribe(
            "prosody.turn_signal",
            self._handle_turn_signal,
            priority=5,
            engine="natural_flow",
        )

        self.event_bus.subscribe(
            "acknowledgment.triggered",
            self._handle_acknowledgment,
            priority=0,
            engine="natural_flow",
        )

        self._initialized = True
        logger.info("NaturalFlowEngine initialized")

    def register_audio_callback(
        self,
        session_id: str,
        callback: Callable[[bytes], Any],
    ) -> None:
        """Register audio callback for a session."""
        self._audio_callbacks[session_id] = callback

    async def start_session(
        self,
        session_id: str,
        language: str = "en",
    ) -> None:
        """Start flow management for a session."""
        self._sessions[session_id] = {
            "state": FlowState.IDLE,
            "language": language,
            "current_emotion": "neutral",
            "query_type": QueryType.UNKNOWN,
            "thinking_active": False,
        }
        logger.debug(f"NaturalFlowEngine session started: {session_id}")

    async def _handle_query_classified(self, event: VoiceEvent) -> None:
        """
        Handle query classification to determine response timing.

        For complex queries:
        1. Add appropriate delay
        2. Optionally play filler phrase
        3. Start thinking tones
        """
        session_id = event.session_id
        query_type_str = event.data.get("query_type", "unknown")
        transcript = event.data.get("transcript", "")

        try:
            query_type = QueryType(query_type_str)
        except ValueError:
            query_type = QueryType.UNKNOWN

        if session_id not in self._sessions:
            return

        session = self._sessions[session_id]
        session["query_type"] = query_type
        session["state"] = FlowState.PROCESSING

        # Get timing config for this query type
        timing = RESPONSE_TIMING.get(query_type, RESPONSE_TIMING[QueryType.UNKNOWN])

        # Apply response delay with jitter
        if timing.delay_ms > 0:
            jitter = random.randint(0, self.config.timing_jitter_ms)  # nosec B311
            await asyncio.sleep((timing.delay_ms + jitter) / 1000)

        # Decide on filler phrase
        if timing.use_filler and random.random() < self.config.filler_probability:  # nosec B311
            await self._play_filler(session_id, query_type)

        # Start thinking tones
        await self._start_thinking(session_id)

    async def _play_filler(
        self,
        session_id: str,
        query_type: QueryType,
    ) -> None:
        """Play a filler phrase before AI response."""
        session = self._sessions.get(session_id)
        if not session:
            return

        emotion = session.get("current_emotion", "neutral")

        # Get filler phrases for query type and emotion
        type_fillers = FILLER_PHRASES.get(query_type, {})
        phrases = type_fillers.get(emotion, type_fillers.get("neutral", []))

        if not phrases:
            # Fall back to RESPONSE_TIMING fillers
            timing = RESPONSE_TIMING.get(query_type)
            if timing and timing.filler_phrases:
                phrases = timing.filler_phrases

        if not phrases:
            return

        # Select phrase (random for variety)
        phrase = random.choice(phrases)  # nosec B311

        session["state"] = FlowState.FILLER

        # Publish filler event
        await self.event_bus.publish_event(
            event_type="filler.triggered",
            data={
                "phrase": phrase,
                "query_type": query_type.value,
            },
            session_id=session_id,
            source_engine="natural_flow",
        )

        # NOTE: Actual TTS synthesis and playback happens in voice pipeline
        # The pipeline subscribes to filler.triggered and handles audio

        logger.debug(f"Filler triggered for {session_id}: '{phrase}'")

    async def _start_thinking(self, session_id: str) -> None:
        """Start thinking feedback tones."""
        session = self._sessions.get(session_id)
        if not session:
            return

        if session.get("thinking_active"):
            return

        session["state"] = FlowState.THINKING
        session["thinking_active"] = True

        # Get audio callback
        callback = self._audio_callbacks.get(session_id)
        if not callback:
            logger.warning(f"No audio callback for {session_id}")
            return

        # Start thinking loop
        await self.thinking_service.start_thinking_loop(
            session_id=session_id,
            on_tone=callback,
        )

        # Publish event
        await self.event_bus.publish_event(
            event_type="thinking.started",
            data={"session_id": session_id},
            session_id=session_id,
            source_engine="natural_flow",
        )

        logger.debug(f"Thinking tones started for {session_id}")

    async def stop_thinking(self, session_id: str) -> None:
        """Stop thinking feedback tones."""
        session = self._sessions.get(session_id)
        if not session:
            return

        if not session.get("thinking_active"):
            return

        session["thinking_active"] = False

        # Get audio callback for end tone
        callback = self._audio_callbacks.get(session_id)

        # Stop thinking loop
        await self.thinking_service.stop_thinking_loop(
            session_id=session_id,
            play_end_tone=True,
            on_tone=callback,
        )

        # Publish event
        await self.event_bus.publish_event(
            event_type="thinking.stopped",
            data={"session_id": session_id},
            session_id=session_id,
            source_engine="natural_flow",
        )

        logger.debug(f"Thinking tones stopped for {session_id}")

    async def _handle_turn_signal(self, event: VoiceEvent) -> None:
        """Handle turn-taking signals."""
        session_id = event.session_id
        signal_type = event.data.get("signal_type")
        confidence = event.data.get("confidence", 0.0)

        session = self._sessions.get(session_id)
        if not session:
            return

        if signal_type == "yield" and confidence > 0.7:
            # User wants to speak - yield turn
            session["state"] = FlowState.YIELDING

            # Stop thinking tones if active
            await self.stop_thinking(session_id)

            # Publish turn yield event
            await self.event_bus.publish_event(
                event_type="turn.yielded",
                data={"confidence": confidence},
                session_id=session_id,
                source_engine="natural_flow",
            )

    async def _handle_acknowledgment(self, event: VoiceEvent) -> None:
        """Handle acknowledgment events from SmartAcknowledgmentEngine."""
        session_id = event.session_id

        session = self._sessions.get(session_id)
        if not session:
            return

        # If we acknowledged user, update state
        session["state"] = FlowState.LISTENING

    async def on_response_started(self, session_id: str) -> None:
        """Called when AI response starts."""
        session = self._sessions.get(session_id)
        if session:
            session["state"] = FlowState.RESPONDING
            await self.stop_thinking(session_id)

    async def on_response_complete(self, session_id: str) -> None:
        """Called when AI response completes."""
        session = self._sessions.get(session_id)
        if session:
            session["state"] = FlowState.IDLE

    async def cleanup_session(self, session_id: str) -> None:
        """Clean up session resources."""
        await self.stop_thinking(session_id)
        self._sessions.pop(session_id, None)
        self._audio_callbacks.pop(session_id, None)

    async def shutdown(self) -> None:
        """Shutdown engine."""
        for session_id in list(self._sessions.keys()):
            await self.cleanup_session(session_id)
        await self.thinking_service.cleanup()
        self._initialized = False


# Singleton instance
_natural_flow_engine: Optional[NaturalFlowEngine] = None


def get_natural_flow_engine() -> NaturalFlowEngine:
    """Get or create singleton NaturalFlowEngine."""
    global _natural_flow_engine
    if _natural_flow_engine is None:
        _natural_flow_engine = NaturalFlowEngine()
    return _natural_flow_engine
```

## Integration: Extend Voice Pipeline

Update `voice_pipeline_service.py` to integrate with NaturalFlowEngine:

```python
from app.engines.natural_flow_engine import get_natural_flow_engine

class VoicePipelineSession:

    async def _initialize_engines(self):
        """Initialize all engines for this session."""
        # ... existing initialization ...

        # Natural flow engine
        self._natural_flow = get_natural_flow_engine()
        if not self._natural_flow._initialized:
            await self._natural_flow.initialize()
        await self._natural_flow.start_session(self.session_id, self.config.stt_language)

        # Register audio callback
        self._natural_flow.register_audio_callback(
            self.session_id,
            self._send_audio_chunk,
        )

    async def _handle_stt_final_transcript(self, text: str) -> None:
        """Handle final STT transcript."""
        # Classify query type
        query_type = classify_query_type(text)

        # Publish query classification event
        if self._event_bus:
            await self._event_bus.publish_event(
                event_type="query.classified",
                data={
                    "query_type": query_type.value,
                    "transcript": text,
                },
                session_id=self.session_id,
                source_engine="voice_pipeline",
            )

        # Continue with LLM processing...

    async def _start_response(self) -> None:
        """Called when AI starts responding."""
        await self._natural_flow.on_response_started(self.session_id)
        # ... existing response logic ...

    async def _complete_response(self) -> None:
        """Called when AI response completes."""
        await self._natural_flow.on_response_complete(self.session_id)
        # ... existing completion logic ...

    async def _handle_filler_triggered(self, event: VoiceEvent) -> None:
        """Handle filler.triggered event - synthesize and play filler."""
        phrase = event.data.get("phrase")
        if phrase:
            # Synthesize filler with ElevenLabs and send
            await self._synthesize_and_send_phrase(phrase)

            # Publish completion
            await self._event_bus.publish_event(
                event_type="filler.played",
                data={"phrase": phrase},
                session_id=self.session_id,
                source_engine="voice_pipeline",
            )
```

## Integration: Extend PredictiveTurnTakingEngine

Add natural flow coordination to existing turn-taking:

```python
# In app/engines/conversation_engine/turn_taking.py

class PredictiveTurnTakingEngine:

    async def _on_yield_decision(
        self,
        session_id: str,
        confidence: float,
    ) -> None:
        """Enhanced yield handling with natural flow coordination."""

        # Publish turn signal (existing)
        await self.event_bus.publish_event(
            event_type="prosody.turn_signal",
            data={
                "signal_type": "yield",
                "confidence": confidence,
                "should_respond": False,
            },
            session_id=session_id,
            source_engine="conversation",
        )

        # Natural flow engine will handle:
        # - Stopping thinking tones
        # - Publishing turn.yielded
        # - Coordinating with SmartAcknowledgmentEngine
```

---

# Frontend Integration

## Updated ThinkingFeedbackPanel

The frontend `ThinkingFeedbackPanel` is already integrated. The backend now coordinates thinking tones via VoiceEventBus events, so the frontend receives properly timed audio chunks.

## WebSocket Event Handling

Add handlers for new event types in the frontend WebSocket connection:

```typescript
// In useThinkerTalkerSession.ts or similar

function handleWebSocketMessage(event: MessageEvent) {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "filler.triggered":
      // Visual indication that filler is playing
      setFillerPlaying(true);
      break;

    case "filler.played":
      setFillerPlaying(false);
      break;

    case "thinking.started":
      setThinkingActive(true);
      break;

    case "thinking.stopped":
      setThinkingActive(false);
      break;

    case "turn.yielded":
      // AI is yielding turn - update UI
      setPipelineState("listening");
      break;

    case "acknowledgment.triggered":
      // Show what acknowledgment was used (for debugging/feedback)
      console.log(`Acknowledgment: ${data.phrase} (intent: ${data.intent})`);
      break;
  }
}
```

---

# Testing Strategy

## Unit Tests

```python
# tests/test_smart_acknowledgment_engine.py

import pytest
from app.engines.smart_acknowledgment_engine import (
    SmartAcknowledgmentEngine,
    BargeInIntent,
)

class TestIntentClassification:

    def test_question_intent(self):
        engine = SmartAcknowledgmentEngine()
        result = engine.classify_intent("What is the meaning of this?")
        assert result.intent == BargeInIntent.QUESTION
        assert result.confidence > 0.5

    def test_correction_intent(self):
        engine = SmartAcknowledgmentEngine()
        result = engine.classify_intent("No, that's not what I said")
        assert result.intent == BargeInIntent.CORRECTION

    def test_backchannel_detection(self):
        engine = SmartAcknowledgmentEngine()
        result = engine.classify_intent("uh huh")
        assert result.intent == BargeInIntent.BACKCHANNEL
```

## Integration Tests

```python
# tests/test_natural_flow_integration.py

import pytest
from app.core.event_bus import get_event_bus, reset_event_bus
from app.engines.natural_flow_engine import get_natural_flow_engine

@pytest.fixture
def event_bus():
    reset_event_bus()
    return get_event_bus()

@pytest.fixture
async def natural_flow(event_bus):
    engine = get_natural_flow_engine()
    engine.event_bus = event_bus
    await engine.initialize()
    yield engine
    await engine.shutdown()

async def test_thinking_tones_coordination(natural_flow, event_bus):
    """Test that thinking tones start after query classification."""
    session_id = "test-session"

    events_received = []

    async def capture_event(event):
        events_received.append(event.event_type)

    event_bus.subscribe("thinking.started", capture_event)

    await natural_flow.start_session(session_id)
    natural_flow.register_audio_callback(session_id, lambda x: None)

    # Simulate query classification
    await event_bus.publish_event(
        event_type="query.classified",
        data={"query_type": "complex", "transcript": "Explain quantum physics"},
        session_id=session_id,
        source_engine="test",
    )

    # Wait for async processing
    await asyncio.sleep(1)

    assert "thinking.started" in events_received
```

---

# Migration Plan

## Phase 2 Implementation Order

1. **Week 1: Event Bus Updates**
   - Add new event types to `event_bus.py`
   - Update event bus tests

2. **Week 2: SmartAcknowledgmentEngine**
   - Create engine file
   - Implement intent classification
   - Add event subscriptions/publications

3. **Week 3: Integration**
   - Update voice pipeline to publish `transcript.partial`
   - Test end-to-end flow
   - A/B test configuration

## Phase 3 Implementation Order

1. **Week 4: NaturalFlowEngine**
   - Create engine file
   - Integrate with ThinkingFeedbackService
   - Implement filler phrase logic

2. **Week 5: Pipeline Integration**
   - Update voice pipeline service
   - Add filler handling
   - Test timing behavior

3. **Week 6: Frontend & Polish**
   - Update WebSocket handlers
   - Add visual feedback
   - User testing

---

# Monitoring & Metrics

## Key Metrics to Track

```python
# Via event bus analytics

metrics = {
    # Phase 2
    "acknowledgment_intent_distribution": {},  # Count by intent type
    "acknowledgment_confidence_avg": 0.0,
    "acknowledgment_phrases_used": {},

    # Phase 3
    "filler_usage_rate": 0.0,  # % of complex queries with fillers
    "thinking_tone_duration_avg_ms": 0,
    "response_timing_by_query_type": {},

    # User satisfaction proxies
    "barge_in_rate": 0.0,  # Lower = better flow
    "correction_rate": 0.0,  # Lower = better understanding
}
```

## Event Bus Analytics Subscription

```python
# Subscribe to all acknowledgment and flow events for analytics

async def analytics_handler(event: VoiceEvent):
    """Capture metrics from voice events."""
    await session_analytics_service.record_event(
        session_id=event.session_id,
        event_type=event.event_type,
        data=event.data,
        correlation_id=event.correlation_id,
    )

event_bus.subscribe("*", analytics_handler, priority=-100, engine="analytics")
```

---

# Summary

This revised design:

1. **Uses VoiceEventBus** for all cross-engine communication
2. **Extends existing services** rather than duplicating:
   - BackchannelService (unchanged, used via SmartAcknowledgmentEngine)
   - ThinkingFeedbackService (unchanged, coordinated via NaturalFlowEngine)
   - PredictiveTurnTakingEngine (events consumed by new engines)
3. **Follows engine pattern** with proper initialization and event_bus injection
4. **Minimizes new code** by leveraging existing infrastructure
5. **Enables A/B testing** through event-based coordination

The implementation is modular and can be rolled out incrementally with feature flags.

---
title: Smart Conversational Voice Design
slug: voice/smart-conversational-voice-design
summary: >-
  Technical design for intelligent voice mode enhancements, fully integrated
  with VoiceEventBus and existing services. Addresses dual system conflicts
  and missing integrations.
status: draft
stability: experimental
owner: backend
lastUpdated: "2025-12-05"
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
  - integration
category: voice
relatedPaths:
  - services/api-gateway/app/core/event_bus.py
  - services/api-gateway/app/services/voice_pipeline_service.py
  - services/api-gateway/app/services/backchannel_service.py
  - services/api-gateway/app/services/thinking_feedback_service.py
  - services/api-gateway/app/services/thinker_talker_websocket_handler.py
  - services/api-gateway/app/engines/conversation_engine/__init__.py
  - services/api-gateway/app/engines/conversation_engine/turn_taking.py
  - services/api-gateway/app/engines/voice_engine/unified_voice_service.py
  - apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts
  - apps/web-app/src/hooks/useThinkerTalkerSession.ts
  - apps/web-app/src/hooks/useThinkingTone.ts
  - apps/web-app/src/components/voice/ThinkingFeedbackPanel.tsx
ai_summary: >-
  Comprehensive design document for voice mode enhancements. Addresses critical
  issues: dual thinking tone systems, missing intent classification, frontend
  turn-taking integration gaps, and progressive response WebSocket wiring.
  All changes extend existing services via VoiceEventBus.
---

# Smart Conversational Voice Design

> **Status:** Design Document (Comprehensive Revision)
> **Version:** 3.0
> **Last Updated:** 2025-12-05
> **Authors:** AI Assistant, Development Team

## Executive Summary

This document provides a **comprehensive integration plan** for making VoiceAssist voice mode feel natural and conversational. It addresses four critical issues discovered during architecture analysis:

| Issue       | Problem                                                         | Solution                                                   |
| ----------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| **Issue 1** | Dual thinking tone systems (frontend + backend) not coordinated | Unify via VoiceEventBus, backend as source of truth        |
| **Issue 2** | BackchannelService lacks intent classification                  | Add `IntentClassifier` module, extend existing service     |
| **Issue 3** | Turn-taking events not reaching frontend                        | Wire `prosody.turn_signal` to WebSocket handler            |
| **Issue 4** | Progressive response not in WebSocket flow                      | Wire `ConversationEngine.get_filler_response()` to handler |

---

# Part 1: Architecture Analysis

## Existing Components Inventory

### Backend Services

| Service                         | Location                                       | Purpose                    | VoiceEventBus Integration |
| ------------------------------- | ---------------------------------------------- | -------------------------- | ------------------------- |
| `VoicePipelineService`          | `services/voice_pipeline_service.py`           | Main orchestrator          | ❌ Partial                |
| `ThinkingFeedbackService`       | `services/thinking_feedback_service.py`        | Server-side thinking tones | ❌ None                   |
| `BackchannelService`            | `services/backchannel_service.py`              | Emotion-aware phrases      | ✅ Yes                    |
| `TalkerService`                 | `services/talker_service.py`                   | ElevenLabs TTS             | ❌ None                   |
| `ThinkerTalkerWebSocketHandler` | `services/thinker_talker_websocket_handler.py` | WebSocket protocol         | ❌ None                   |

### Backend Engines

| Engine                       | Location                                        | Purpose                                    | VoiceEventBus Integration |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------ | ------------------------- |
| `ConversationEngine`         | `engines/conversation_engine/__init__.py`       | Query classification, turn-taking, repairs | ✅ Yes                    |
| `PredictiveTurnTakingEngine` | `engines/conversation_engine/turn_taking.py`    | Prosody-based turn prediction              | ✅ Yes                    |
| `UnifiedVoiceService`        | `engines/voice_engine/unified_voice_service.py` | Full pipeline orchestrator                 | ❌ Partial                |

### Frontend Hooks

| Hook                        | Location                             | Purpose                     | Backend Integration  |
| --------------------------- | ------------------------------------ | --------------------------- | -------------------- |
| `useThinkerTalkerVoiceMode` | `hooks/useThinkerTalkerVoiceMode.ts` | Main voice mode hook        | ✅ WebSocket         |
| `useThinkerTalkerSession`   | `hooks/useThinkerTalkerSession.ts`   | Session management          | ✅ WebSocket         |
| `useThinkingTone`           | `hooks/useThinkingTone.ts`           | Client-side tone generation | ❌ None (standalone) |
| `useBackchannelAudio`       | `hooks/useBackchannelAudio.ts`       | Backchannel playback        | ✅ WebSocket         |
| `useBargeInPromptAudio`     | `hooks/useBargeInPromptAudio.ts`     | Barge-in prompts            | ✅ REST API          |

### VoiceEventBus Events (Existing)

```python
# From app/core/event_bus.py
EVENTS = [
    "emotion.updated",           # Emotion detection result
    "emotion.deviation",         # Significant emotion change
    "prosody.turn_signal",       # Turn-taking prediction
    "repair.started",            # Repair attempt started
    "query.classified",          # Query type determined
    "clinical.alert",            # Critical clinical finding
    "context.emotion_alert",     # Emotion-triggered context
]
```

---

# Part 2: Issue Resolution

## Issue 1: Dual Thinking Tone Systems

### Problem

Two separate thinking tone implementations exist:

1. **Frontend (`useThinkingTone.ts`)**: Generates tones client-side via Web Audio API
2. **Backend (`ThinkingFeedbackService`)**: Generates PCM audio server-side

These are NOT coordinated. `ThinkerTalkerVoicePanel` uses frontend tones while `UnifiedVoiceService` uses backend tones. This causes:

- Potential double-tones if both activate
- Inconsistent user experience
- No event bus coordination

### Solution: Backend as Source of Truth

**Decision:** Use backend `ThinkingFeedbackService` as the single source of truth. Frontend becomes a passive receiver.

#### Step 1: Add VoiceEventBus Integration to ThinkingFeedbackService

```python
# services/api-gateway/app/services/thinking_feedback_service.py

class ThinkingFeedbackService:
    """
    REVISED: Now publishes events to VoiceEventBus for coordination.
    """

    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        # ... existing init ...

    async def start_thinking_loop(
        self,
        session_id: str,
        on_tone: Optional[Callable[[bytes], None]] = None,
    ) -> None:
        """Start thinking feedback with event bus notification."""
        # Publish event BEFORE starting
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="thinking.started",
                data={
                    "style": self._config.style.value,
                    "source": "backend",
                },
                session_id=session_id,
                source_engine="thinking_feedback",
            )

        # ... existing logic ...

    async def stop_thinking_loop(
        self,
        session_id: str,
        play_end_tone: bool = True,
        on_tone: Optional[Callable[[bytes], None]] = None,
    ) -> None:
        """Stop thinking feedback with event bus notification."""
        # ... existing logic ...

        # Publish event AFTER stopping
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="thinking.stopped",
                data={"played_end_tone": play_end_tone},
                session_id=session_id,
                source_engine="thinking_feedback",
            )
```

#### Step 2: Wire ThinkingFeedbackService to WebSocket Handler

```python
# services/api-gateway/app/services/thinker_talker_websocket_handler.py

class ThinkerTalkerWebSocketHandler:
    """
    REVISED: Integrates ThinkingFeedbackService via event bus.
    """

    def __init__(self, ...):
        # ... existing init ...
        self._thinking_feedback = get_thinking_feedback_service()
        self._event_bus = get_event_bus()

        # Subscribe to thinking events
        self._event_bus.subscribe(
            "thinking.started",
            self._handle_thinking_started,
            engine="websocket_handler",
        )
        self._event_bus.subscribe(
            "thinking.stopped",
            self._handle_thinking_stopped,
            engine="websocket_handler",
        )

    async def _handle_thinking_started(self, event: VoiceEvent) -> None:
        """Forward thinking.started to frontend."""
        if event.session_id == self.config.session_id:
            await self._send_message({
                "type": "thinking.started",
                "style": event.data.get("style"),
            })

    async def _handle_thinking_stopped(self, event: VoiceEvent) -> None:
        """Forward thinking.stopped to frontend."""
        if event.session_id == self.config.session_id:
            await self._send_message({
                "type": "thinking.stopped",
            })

    async def _start_thinking_feedback(self) -> None:
        """Start thinking tones when processing begins."""
        await self._thinking_feedback.start_thinking_loop(
            session_id=self.config.session_id,
            on_tone=self._send_audio_chunk,
        )

    async def _stop_thinking_feedback(self) -> None:
        """Stop thinking tones when response begins."""
        await self._thinking_feedback.stop_thinking_loop(
            session_id=self.config.session_id,
            play_end_tone=True,
            on_tone=self._send_audio_chunk,
        )
```

#### Step 3: Update Frontend to Receive Backend Thinking Events

```typescript
// apps/web-app/src/hooks/useThinkerTalkerSession.ts

// Add to message handling:
case "thinking.started":
  // Backend is handling thinking tones - disable frontend tones
  setThinkingState({
    isThinking: true,
    source: "backend",  // Frontend won't generate tones
  });
  onThinkingStarted?.();
  break;

case "thinking.stopped":
  setThinkingState({
    isThinking: false,
    source: null,
  });
  onThinkingStopped?.();
  break;
```

#### Step 4: Update ThinkingFeedbackPanel to Respect Backend

```typescript
// apps/web-app/src/components/voice/ThinkingFeedbackPanel.tsx

export function ThinkingFeedbackPanel({
  isThinking,
  thinkingSource = "frontend", // NEW: Track source
  // ...
}: ThinkingFeedbackPanelProps) {
  const settings = useVoiceSettingsStore();

  // Only play frontend tones if backend isn't handling it
  const shouldPlayFrontendAudio =
    settings.thinkingToneEnabled && !isTTSPlaying && isThinking && thinkingSource !== "backend"; // NEW: Skip if backend is handling

  useThinkingTone(shouldPlayFrontendAudio, {
    preset: settings.thinkingTonePreset,
    volume: settings.thinkingToneVolume / 100,
  });

  // Visual indicator always shows (regardless of audio source)
  // ...
}
```

### New Event Types for Issue 1

```python
# Add to app/core/event_bus.py EVENTS list:
"thinking.started",    # Backend started thinking feedback
"thinking.stopped",    # Backend stopped thinking feedback
```

---

## Issue 2: Missing Intent Classification

### Problem

`BackchannelService` has emotion-aware phrase selection but NO intent classification. When a user barges in, we don't know WHY they're interrupting:

- Question? → "Yes?"
- Correction? → "I understand, go ahead"
- Agreement? → "Good"
- Just listening? → (no response)

### Solution: Add IntentClassifier Module to BackchannelService

#### Step 1: Create IntentClassifier Module

```python
# services/api-gateway/app/services/intent_classifier.py

"""
Intent Classifier for Barge-In Analysis

Classifies user intent from partial transcripts during barge-in.
Designed for <50ms latency using keyword matching + simple ML.
"""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

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
class IntentResult:
    """Result of intent classification."""
    intent: BargeInIntent
    confidence: float
    keywords_matched: List[str]
    should_acknowledge: bool  # Should we play an acknowledgment?
    suggested_phrase: Optional[str] = None


# Intent patterns with phrases
INTENT_PATTERNS: Dict[BargeInIntent, Dict[str, Any]] = {
    BargeInIntent.QUESTION: {
        "keywords": ["what", "how", "why", "when", "where", "who", "which", "can you", "could you", "is it", "are you"],
        "endings": ["?"],
        "should_acknowledge": True,
        "phrases": {
            "neutral": ["Yes?", "What is it?", "Go ahead"],
            "frustrated": ["I'm listening", "Please, go ahead"],
        },
    },
    BargeInIntent.CORRECTION: {
        "keywords": ["no", "not", "wrong", "actually", "i said", "i meant", "that's not", "incorrect"],
        "should_acknowledge": True,
        "phrases": {
            "neutral": ["I understand", "Let me correct that", "Go ahead"],
            "frustrated": ["I hear you", "Please clarify"],
        },
    },
    BargeInIntent.AGREEMENT: {
        "keywords": ["yes", "yeah", "right", "exactly", "correct", "true", "agree", "that's right"],
        "should_acknowledge": False,  # Don't interrupt for agreement
        "phrases": {},
    },
    BargeInIntent.DISAGREEMENT: {
        "keywords": ["no", "but", "however", "disagree", "don't think", "not sure", "i don't"],
        "should_acknowledge": True,
        "phrases": {
            "neutral": ["I see", "Tell me more"],
            "frustrated": ["I understand your concern"],
        },
    },
    BargeInIntent.CONTINUATION: {
        "keywords": ["continue", "go on", "keep going", "and then", "what else", "more", "next"],
        "should_acknowledge": True,
        "phrases": {
            "neutral": ["Of course", "Continuing", "Sure"],
        },
    },
    BargeInIntent.INTERRUPTION: {
        "keywords": ["stop", "wait", "hold on", "pause", "enough", "okay okay", "hang on"],
        "should_acknowledge": True,
        "phrases": {
            "neutral": ["I'm listening", "Yes?", "Go ahead"],
            "frustrated": ["I'm here", "Take your time"],
        },
    },
    BargeInIntent.BACKCHANNEL: {
        "keywords": ["uh huh", "mm hmm", "mhm", "okay", "ok", "right", "i see", "hmm"],
        "should_acknowledge": False,  # Don't respond to backchannels
        "phrases": {},
    },
}


class IntentClassifier:
    """
    Fast intent classifier for barge-in analysis.

    Designed for <50ms latency using keyword matching.
    Can be extended with ML classifier for better accuracy.
    """

    def __init__(self):
        self._patterns = INTENT_PATTERNS

    def classify(
        self,
        transcript: str,
        emotion: str = "neutral",
    ) -> IntentResult:
        """
        Classify user intent from transcript.

        Args:
            transcript: User's speech (partial or full)
            emotion: Current detected emotion

        Returns:
            IntentResult with classification and suggested phrase
        """
        text = transcript.lower().strip()

        best_intent = BargeInIntent.UNKNOWN
        best_confidence = 0.0
        matched_keywords: List[str] = []

        for intent, patterns in self._patterns.items():
            keywords = patterns.get("keywords", [])
            endings = patterns.get("endings", [])

            # Count keyword matches
            matches = [kw for kw in keywords if kw in text]

            # Check endings
            ending_match = any(text.endswith(e) for e in endings)

            # Calculate confidence
            if matches:
                confidence = min(len(matches) / max(len(keywords) * 0.3, 1), 1.0)
                if ending_match:
                    confidence = min(confidence + 0.2, 1.0)

                if confidence > best_confidence:
                    best_intent = intent
                    best_confidence = confidence
                    matched_keywords = matches

        # Get pattern config
        pattern = self._patterns.get(best_intent, {})
        should_ack = pattern.get("should_acknowledge", False)

        # Get suggested phrase based on emotion
        phrases = pattern.get("phrases", {})
        phrase_list = phrases.get(emotion, phrases.get("neutral", []))
        suggested = phrase_list[0] if phrase_list else None

        return IntentResult(
            intent=best_intent,
            confidence=best_confidence,
            keywords_matched=matched_keywords,
            should_acknowledge=should_ack and best_confidence > 0.4,
            suggested_phrase=suggested,
        )


# Singleton
_intent_classifier: Optional[IntentClassifier] = None


def get_intent_classifier() -> IntentClassifier:
    """Get singleton IntentClassifier."""
    global _intent_classifier
    if _intent_classifier is None:
        _intent_classifier = IntentClassifier()
    return _intent_classifier
```

#### Step 2: Extend BackchannelService with Intent Classification

```python
# services/api-gateway/app/services/backchannel_service.py

# Add to imports:
from app.services.intent_classifier import (
    IntentClassifier,
    IntentResult,
    BargeInIntent,
    get_intent_classifier,
)

class BackchannelService:
    """
    REVISED: Now includes intent classification for smart acknowledgments.
    """

    def __init__(self, event_bus=None):
        # ... existing init ...
        self._intent_classifier = get_intent_classifier()

    async def get_smart_acknowledgment(
        self,
        session_id: str,
        transcript: str,
        emotion: str = "neutral",
        voice_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        NEW: Get context-aware acknowledgment based on user intent.

        Args:
            session_id: Session identifier
            transcript: User's partial/full transcript
            emotion: Current detected emotion
            voice_id: Voice ID for pre-cached audio

        Returns:
            Dict with phrase, audio_url, intent, or None if no ack needed
        """
        # Classify intent
        intent_result = self._intent_classifier.classify(transcript, emotion)

        # Publish intent classification event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="acknowledgment.intent",
                data={
                    "intent": intent_result.intent.value,
                    "confidence": intent_result.confidence,
                    "should_acknowledge": intent_result.should_acknowledge,
                },
                session_id=session_id,
                source_engine="backchannel",
            )

        # Check if we should acknowledge
        if not intent_result.should_acknowledge:
            return None

        # Get phrase (use suggested or fall back to emotion-based)
        phrase = intent_result.suggested_phrase
        if not phrase:
            # Fall back to existing emotion-based selection
            bc_session = self.get_session(session_id)
            if bc_session:
                phrase = bc_session._select_phrase_for_emotion(emotion)

        if not phrase:
            return None

        # Get pre-cached audio if available
        audio_url = None
        if voice_id:
            audio_url = await self._get_cached_phrase_audio(phrase, voice_id)

        # Publish acknowledgment event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="acknowledgment.triggered",
                data={
                    "phrase": phrase,
                    "intent": intent_result.intent.value,
                    "confidence": intent_result.confidence,
                },
                session_id=session_id,
                source_engine="backchannel",
            )

        return {
            "phrase": phrase,
            "audio_url": audio_url,
            "intent": intent_result.intent.value,
            "confidence": intent_result.confidence,
        }
```

#### Step 3: Wire to WebSocket Handler

```python
# services/api-gateway/app/services/thinker_talker_websocket_handler.py

class ThinkerTalkerWebSocketHandler:

    async def _handle_barge_in(self, transcript: str) -> None:
        """
        REVISED: Handle barge-in with smart acknowledgment.
        """
        # Stop current playback
        await self._stop_playback()

        # Get smart acknowledgment based on intent
        ack = await self._backchannel_service.get_smart_acknowledgment(
            session_id=self.config.session_id,
            transcript=transcript,
            emotion=self._current_emotion,
            voice_id=self.config.voice_id,
        )

        if ack:
            # Send acknowledgment to frontend
            await self._send_message({
                "type": "acknowledgment",
                "phrase": ack["phrase"],
                "intent": ack["intent"],
                "audio_url": ack.get("audio_url"),
            })

            # If we have pre-cached audio, send it
            if ack.get("audio_url"):
                await self._send_cached_audio(ack["audio_url"])
```

### New Event Types for Issue 2

```python
# Add to app/core/event_bus.py EVENTS list:
"acknowledgment.intent",      # Intent classified from transcript
"acknowledgment.triggered",   # Acknowledgment phrase selected
"acknowledgment.played",      # Acknowledgment audio finished
```

---

## Issue 3: Frontend Turn-Taking Integration Gap

### Problem

`PredictiveTurnTakingEngine` publishes `prosody.turn_signal` events, but:

1. WebSocket handler doesn't subscribe to these events
2. Frontend doesn't receive turn-taking signals
3. UI can't show "AI is yielding turn" or "AI is holding turn" states

### Solution: Wire Turn Signals Through WebSocket

#### Step 1: Subscribe WebSocket Handler to Turn Signals

```python
# services/api-gateway/app/services/thinker_talker_websocket_handler.py

class ThinkerTalkerWebSocketHandler:

    def __init__(self, ...):
        # ... existing init ...

        # Subscribe to turn-taking events
        self._event_bus.subscribe(
            "prosody.turn_signal",
            self._handle_turn_signal,
            engine="websocket_handler",
        )

    async def _handle_turn_signal(self, event: VoiceEvent) -> None:
        """Forward turn signals to frontend for UI updates."""
        if event.session_id != self.config.session_id:
            return

        signal_type = event.data.get("signal_type")
        confidence = event.data.get("confidence", 0.0)
        should_respond = event.data.get("should_respond", False)

        # Send to frontend
        await self._send_message({
            "type": "turn.signal",
            "signal_type": signal_type,  # "yield", "hold", "continue"
            "confidence": confidence,
            "should_respond": should_respond,
        })

        # If yielding with high confidence, prepare for user input
        if signal_type == "yield" and confidence > 0.7:
            await self._prepare_for_user_turn()
```

#### Step 2: Update Frontend Session Hook

```typescript
// apps/web-app/src/hooks/useThinkerTalkerSession.ts

// Add state:
const [turnSignal, setTurnSignal] = useState<{
  type: 'yield' | 'hold' | 'continue' | null;
  confidence: number;
  shouldRespond: boolean;
}>({ type: null, confidence: 0, shouldRespond: false });

// Add to message handling:
case "turn.signal":
  setTurnSignal({
    type: data.signal_type,
    confidence: data.confidence,
    shouldRespond: data.should_respond,
  });

  // Call callback if provided
  onTurnSignal?.({
    type: data.signal_type,
    confidence: data.confidence,
    shouldRespond: data.should_respond,
  });
  break;
```

#### Step 3: Expose Turn Signal in Voice Mode Hook

```typescript
// apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts

export interface TTVoiceModeReturn {
  // ... existing fields ...

  // Turn-taking (NEW)
  turnSignal: {
    type: 'yield' | 'hold' | 'continue' | null;
    confidence: number;
    shouldRespond: boolean;
  };
  isAIYieldingTurn: boolean;  // Convenience flag
}

// In return:
return useMemo(() => ({
  // ... existing fields ...

  // Turn-taking
  turnSignal: session.turnSignal,
  isAIYieldingTurn: session.turnSignal.type === 'yield' && session.turnSignal.confidence > 0.7,
}), [...]);
```

#### Step 4: Update UI Components

```typescript
// apps/web-app/src/components/voice/CompactVoiceBar.tsx

interface CompactVoiceBarProps {
  // ... existing props ...
  turnSignal?: {
    type: 'yield' | 'hold' | 'continue' | null;
    confidence: number;
  };
}

export function CompactVoiceBar({
  // ... existing props ...
  turnSignal,
}: CompactVoiceBarProps) {
  // Show subtle indicator when AI is yielding turn
  const showYieldIndicator = turnSignal?.type === 'yield' && turnSignal.confidence > 0.7;

  return (
    <div className="...">
      {/* ... existing content ... */}

      {/* Turn yield indicator */}
      {showYieldIndicator && (
        <span className="text-xs text-green-500 animate-pulse">
          Your turn...
        </span>
      )}
    </div>
  );
}
```

---

## Issue 4: Progressive Response Not Wired to WebSocket

### Problem

`ConversationEngine` has:

- `classify_query()` → Determines if query is simple/complex/urgent
- `get_filler_response()` → Returns appropriate filler ("Hmm, let me think...")

But these are NOT used in the WebSocket handler! The handler goes directly to LLM without:

1. Classifying the query
2. Adding appropriate delays for complex queries
3. Playing filler phrases

### Solution: Wire ConversationEngine to WebSocket Flow

#### Step 1: Update WebSocket Handler to Use ConversationEngine

```python
# services/api-gateway/app/services/thinker_talker_websocket_handler.py

from app.engines.conversation_engine import ConversationEngine, QueryClassification

class ThinkerTalkerWebSocketHandler:

    def __init__(self, ...):
        # ... existing init ...
        self._conversation_engine = ConversationEngine(
            event_bus=self._event_bus,
        )

    async def start(self) -> bool:
        """Start handler with ConversationEngine initialization."""
        # ... existing start logic ...

        # Initialize conversation engine
        await self._conversation_engine.initialize()

        # ... rest of start logic ...

    async def _process_user_utterance(self, transcript: str) -> None:
        """
        REVISED: Process user utterance with ConversationEngine integration.
        """
        # 1. Classify the query
        classification = await self._conversation_engine.classify_query(
            text=transcript,
            prosody_features=self._last_prosody_features,
            emotion_state={"dominant_emotion": self._current_emotion},
            session_id=self.config.session_id,
        )

        # 2. Send classification to frontend
        await self._send_message({
            "type": "query.classified",
            "query_type": classification.query_type,
            "estimated_response_length": classification.estimated_response_length,
            "use_filler": classification.use_filler,
        })

        # 3. Apply recommended delay (human-like timing)
        if classification.recommended_delay_ms > 0:
            await asyncio.sleep(classification.recommended_delay_ms / 1000)

        # 4. Play filler if recommended
        if classification.use_filler:
            filler = await self._conversation_engine.get_filler_response(
                query_classification=classification,
                emotion_state={"dominant_emotion": self._current_emotion},
            )
            if filler:
                await self._play_filler_phrase(filler)

        # 5. Start thinking feedback
        await self._start_thinking_feedback()

        # 6. Process with Thinker (existing logic)
        await self._process_with_thinker(transcript)

    async def _play_filler_phrase(self, filler: str) -> None:
        """Play a filler phrase before LLM response."""
        # Send filler event
        await self._send_message({
            "type": "filler.triggered",
            "phrase": filler,
        })

        # Synthesize and send audio
        audio_chunks = await self._talker_service.synthesize_text(
            text=filler,
            voice_config=VoiceConfig(voice_id=self.config.voice_id),
        )

        async for chunk in audio_chunks:
            await self._send_audio_chunk(chunk)

        # Send completion
        await self._send_message({
            "type": "filler.played",
            "phrase": filler,
        })
```

#### Step 2: Update Frontend to Handle Filler Events

```typescript
// apps/web-app/src/hooks/useThinkerTalkerSession.ts

// Add state:
const [fillerState, setFillerState] = useState<{
  isPlaying: boolean;
  phrase: string | null;
}>({ isPlaying: false, phrase: null });

// Add to message handling:
case "filler.triggered":
  setFillerState({ isPlaying: true, phrase: data.phrase });
  onFillerStarted?.(data.phrase);
  break;

case "filler.played":
  setFillerState({ isPlaying: false, phrase: null });
  onFillerEnded?.(data.phrase);
  break;

case "query.classified":
  onQueryClassified?.({
    queryType: data.query_type,
    estimatedResponseLength: data.estimated_response_length,
    useFiller: data.use_filler,
  });
  break;
```

#### Step 3: Update Voice Mode Hook to Expose Filler State

```typescript
// apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts

export interface TTVoiceModeReturn {
  // ... existing fields ...

  // Filler phrases (NEW)
  isFillerPlaying: boolean;
  currentFiller: string | null;

  // Query classification (NEW)
  queryClassification: {
    type: string | null;
    estimatedLength: string | null;
  };
}
```

### New Event Types for Issue 4

```python
# Add to app/core/event_bus.py EVENTS list:
"filler.triggered",   # Filler phrase about to play
"filler.played",      # Filler phrase finished
```

---

# Part 3: Complete Integration Architecture

## Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE EVENT FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  USER SPEAKS                                                                     │
│       │                                                                          │
│       ▼                                                                          │
│  ┌─────────────────┐     ┌─────────────────────────────────────────────────┐    │
│  │ STT Service     │────►│ VoiceEventBus                                    │    │
│  │ (transcript)    │     │                                                  │    │
│  └─────────────────┘     │  Events:                                         │    │
│                          │  - transcript.partial ─────────────────┐         │    │
│                          │  - transcript.final ───────────────────┤         │    │
│                          │                                        │         │    │
│  ┌─────────────────┐     │                                        ▼         │    │
│  │ PredictiveTurn  │────►│  - prosody.turn_signal ────────► WebSocket ──────┼───►│
│  │ TakingEngine    │     │                                   Handler        │    │
│  └─────────────────┘     │                                        │         │    │
│                          │                                        │         │    │
│  ┌─────────────────┐     │                                        │         │    │
│  │ ConversationEng │────►│  - query.classified ──────────────────►│         │    │
│  │ (classify_query)│     │                                        │         │    │
│  └─────────────────┘     │                                        │         │    │
│                          │                                        ▼         │    │
│  ┌─────────────────┐     │                              ┌─────────────────┐ │    │
│  │ BackchannelSvc  │────►│  - acknowledgment.intent ───►│ Frontend        │ │    │
│  │ (+IntentClass)  │     │  - acknowledgment.triggered  │ (React)         │ │    │
│  └─────────────────┘     │                              │                 │ │    │
│                          │                              │ Updates:        │ │    │
│  ┌─────────────────┐     │                              │ - turnSignal    │ │    │
│  │ ThinkingFeedback│────►│  - thinking.started ────────►│ - isThinking    │ │    │
│  │ Service         │     │  - thinking.stopped          │ - fillerState   │ │    │
│  └─────────────────┘     │                              │ - ackPhrase     │ │    │
│                          │                              └─────────────────┘ │    │
│  ┌─────────────────┐     │                                                  │    │
│  │ Progressive     │────►│  - filler.triggered ─────────────────────────────┘    │
│  │ Response        │     │  - filler.played                                      │
│  └─────────────────┘     │                                                       │
│                          └───────────────────────────────────────────────────────┘│
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

## Complete Event Types List

```python
# app/core/event_bus.py - COMPLETE EVENTS LIST

EVENTS = [
    # === Existing Events ===
    "emotion.updated",           # Emotion detection result
    "emotion.deviation",         # Significant emotion change
    "prosody.turn_signal",       # Turn-taking prediction (YIELD/HOLD/CONTINUE)
    "repair.started",            # Repair attempt started
    "query.classified",          # Query type (simple/complex/urgent/clarification)
    "clinical.alert",            # Critical clinical finding
    "context.emotion_alert",     # Emotion-triggered context

    # === Issue 1: Unified Thinking Tones ===
    "thinking.started",          # Backend started thinking feedback
    "thinking.stopped",          # Backend stopped thinking feedback

    # === Issue 2: Smart Acknowledgments ===
    "transcript.partial",        # Partial STT transcript (for intent analysis)
    "acknowledgment.intent",     # Intent classified from transcript
    "acknowledgment.triggered",  # Acknowledgment phrase selected
    "acknowledgment.played",     # Acknowledgment audio finished

    # === Issue 4: Progressive Response ===
    "filler.triggered",          # Filler phrase about to play
    "filler.played",             # Filler phrase finished

    # === Turn Management ===
    "turn.yielded",              # AI yielded turn to user
    "turn.taken",                # AI took turn from user
]
```

## WebSocket Message Types (Server → Client)

```typescript
// Complete list of WebSocket message types

type WebSocketMessageType =
  // Existing
  | "transcript.delta"
  | "transcript.complete"
  | "response.delta"
  | "response.complete"
  | "audio.output"
  | "tool.call"
  | "tool.result"
  | "voice.state"
  | "error"
  | "backchannel" // Existing backchannel

  // Issue 1: Thinking Tones
  | "thinking.started"
  | "thinking.stopped"

  // Issue 2: Smart Acknowledgments
  | "acknowledgment" // Smart acknowledgment with intent

  // Issue 3: Turn-Taking
  | "turn.signal" // Turn-taking signal from backend

  // Issue 4: Progressive Response
  | "query.classified" // Query classification result
  | "filler.triggered" // Filler phrase starting
  | "filler.played"; // Filler phrase finished
```

---

# Part 4: Implementation Plan

## Phase 1: Unified Thinking Tones (Issue 1)

**Goal:** Backend `ThinkingFeedbackService` becomes single source of truth.

| Task                                           | File                                  | Effort |
| ---------------------------------------------- | ------------------------------------- | ------ |
| Add event_bus to ThinkingFeedbackService       | `thinking_feedback_service.py`        | 1 hr   |
| Publish thinking.started/stopped events        | `thinking_feedback_service.py`        | 1 hr   |
| Subscribe WebSocket handler to events          | `thinker_talker_websocket_handler.py` | 1 hr   |
| Forward events to frontend                     | `thinker_talker_websocket_handler.py` | 30 min |
| Update session hook to receive events          | `useThinkerTalkerSession.ts`          | 1 hr   |
| Update ThinkingFeedbackPanel to respect source | `ThinkingFeedbackPanel.tsx`           | 1 hr   |
| Add tests                                      | `tests/`                              | 2 hr   |

**Total:** ~8 hours

## Phase 2: Smart Acknowledgments (Issue 2)

**Goal:** Add intent classification to BackchannelService.

| Task                                                 | File                                  | Effort |
| ---------------------------------------------------- | ------------------------------------- | ------ |
| Create IntentClassifier module                       | `intent_classifier.py` (NEW)          | 2 hr   |
| Add get_smart_acknowledgment() to BackchannelService | `backchannel_service.py`              | 2 hr   |
| Wire to WebSocket handler                            | `thinker_talker_websocket_handler.py` | 1 hr   |
| Update frontend to handle acknowledgment messages    | `useThinkerTalkerSession.ts`          | 1 hr   |
| Expose acknowledgment state in voice mode hook       | `useThinkerTalkerVoiceMode.ts`        | 30 min |
| Add tests                                            | `tests/`                              | 2 hr   |

**Total:** ~9 hours

## Phase 3: Frontend Turn-Taking (Issue 3)

**Goal:** Wire prosody.turn_signal events to frontend.

| Task                                               | File                                  | Effort |
| -------------------------------------------------- | ------------------------------------- | ------ |
| Subscribe WebSocket handler to prosody.turn_signal | `thinker_talker_websocket_handler.py` | 1 hr   |
| Forward turn signals to frontend                   | `thinker_talker_websocket_handler.py` | 30 min |
| Add turnSignal state to session hook               | `useThinkerTalkerSession.ts`          | 1 hr   |
| Expose in voice mode hook                          | `useThinkerTalkerVoiceMode.ts`        | 30 min |
| Update UI components                               | `CompactVoiceBar.tsx`, etc.           | 1 hr   |
| Add tests                                          | `tests/`                              | 1 hr   |

**Total:** ~5 hours

## Phase 4: Progressive Response (Issue 4)

**Goal:** Wire ConversationEngine query classification and fillers to WebSocket.

| Task                                     | File                                  | Effort |
| ---------------------------------------- | ------------------------------------- | ------ |
| Initialize ConversationEngine in handler | `thinker_talker_websocket_handler.py` | 1 hr   |
| Call classify_query() before processing  | `thinker_talker_websocket_handler.py` | 1 hr   |
| Apply recommended_delay_ms               | `thinker_talker_websocket_handler.py` | 30 min |
| Call get_filler_response() and play      | `thinker_talker_websocket_handler.py` | 1 hr   |
| Send classification/filler events        | `thinker_talker_websocket_handler.py` | 30 min |
| Handle events in frontend                | `useThinkerTalkerSession.ts`          | 1 hr   |
| Expose state in voice mode hook          | `useThinkerTalkerVoiceMode.ts`        | 30 min |
| Add tests                                | `tests/`                              | 2 hr   |

**Total:** ~8 hours

## Total Implementation Estimate

| Phase                           | Effort    |
| ------------------------------- | --------- |
| Phase 1: Unified Thinking Tones | 8 hr      |
| Phase 2: Smart Acknowledgments  | 9 hr      |
| Phase 3: Frontend Turn-Taking   | 5 hr      |
| Phase 4: Progressive Response   | 8 hr      |
| **Total**                       | **30 hr** |

---

# Part 5: Testing Strategy

## Unit Tests

```python
# tests/test_intent_classifier.py

import pytest
from app.services.intent_classifier import IntentClassifier, BargeInIntent

class TestIntentClassifier:

    def test_question_detection(self):
        classifier = IntentClassifier()
        result = classifier.classify("What is the dosage?")
        assert result.intent == BargeInIntent.QUESTION
        assert result.should_acknowledge is True

    def test_correction_detection(self):
        classifier = IntentClassifier()
        result = classifier.classify("No, that's not what I said")
        assert result.intent == BargeInIntent.CORRECTION

    def test_backchannel_no_acknowledge(self):
        classifier = IntentClassifier()
        result = classifier.classify("uh huh")
        assert result.intent == BargeInIntent.BACKCHANNEL
        assert result.should_acknowledge is False

    def test_emotion_affects_phrase(self):
        classifier = IntentClassifier()
        neutral = classifier.classify("Wait, stop", emotion="neutral")
        frustrated = classifier.classify("Wait, stop", emotion="frustrated")
        assert neutral.suggested_phrase != frustrated.suggested_phrase
```

## Integration Tests

```python
# tests/test_websocket_integration.py

import pytest
from app.services.thinker_talker_websocket_handler import ThinkerTalkerWebSocketHandler

@pytest.fixture
async def handler():
    # Create mock websocket and handler
    ...

async def test_thinking_events_forwarded(handler):
    """Test that thinking events are forwarded to frontend."""
    messages = []
    handler._send_message = lambda m: messages.append(m)

    # Trigger processing
    await handler._process_user_utterance("What is aspirin?")

    # Verify thinking.started was sent
    assert any(m["type"] == "thinking.started" for m in messages)

async def test_turn_signal_forwarded(handler, event_bus):
    """Test that turn signals are forwarded to frontend."""
    messages = []
    handler._send_message = lambda m: messages.append(m)

    # Publish turn signal event
    await event_bus.publish_event(
        event_type="prosody.turn_signal",
        data={"signal_type": "yield", "confidence": 0.85},
        session_id=handler.config.session_id,
        source_engine="test",
    )

    # Verify turn.signal was sent
    assert any(m["type"] == "turn.signal" for m in messages)
```

---

# Part 6: Rollout Strategy

## Feature Flags

```python
# All new features should be behind feature flags

FEATURE_FLAGS = {
    "unified_thinking_tones": True,     # Issue 1
    "smart_acknowledgments": True,      # Issue 2
    "frontend_turn_signals": True,      # Issue 3
    "progressive_response": True,       # Issue 4
}
```

## Gradual Rollout

1. **Week 1:** Deploy with all flags disabled, backend changes only
2. **Week 2:** Enable `unified_thinking_tones` for 10% of users
3. **Week 3:** Enable all flags for 10% of users
4. **Week 4:** Gradual increase to 100%

## Monitoring

Track these metrics:

- Thinking tone double-play rate (should go to 0)
- Acknowledgment accuracy (intent vs user feedback)
- Turn-taking interrupt rate (lower = better)
- Time-to-first-response by query type

---

# Summary

This comprehensive revision addresses all four identified issues:

| Issue                             | Solution                                              | Status          |
| --------------------------------- | ----------------------------------------------------- | --------------- |
| 1. Dual thinking tones            | Backend as source of truth, events via VoiceEventBus  | Design Complete |
| 2. Missing intent classification  | Add `IntentClassifier` to `BackchannelService`        | Design Complete |
| 3. Turn-taking not in frontend    | Wire `prosody.turn_signal` to WebSocket               | Design Complete |
| 4. Progressive response not wired | Integrate `ConversationEngine` into WebSocket handler | Design Complete |

All solutions:

- ✅ Use VoiceEventBus for coordination
- ✅ Extend existing services (no duplication)
- ✅ Wire through WebSocket handler to frontend
- ✅ Include frontend state management changes
- ✅ Include UI component updates
- ✅ Include testing strategy

**Estimated total effort:** 30 hours

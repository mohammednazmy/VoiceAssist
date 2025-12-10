# Voice Mode Barge-In & Latency Improvement Plan V3

**Status:** Master Plan - Comprehensive Enhancement
**Created:** 2025-12-09
**Version:** 3.0 (Final Unified Plan)

---

## Table of Contents

1. [Executive Summary](#part-1-executive-summary)
2. [Advanced Semantic VAD System](#part-2-advanced-semantic-vad-system)
3. [Latency Optimization Strategy](#part-3-latency-optimization-strategy)
4. [Duplex Audio Architecture](#part-4-duplex-audio-architecture)
5. [Turn Overlap Handling](#part-5-turn-overlap-handling)
6. [Comprehensive Playwright Test Suite](#part-6-comprehensive-playwright-test-suite)
7. [Implementation Roadmap](#part-7-implementation-roadmap)

---

## Part 1: Executive Summary

### 1.1 Current State Analysis

**VoiceAssist Current Pipeline:**

```
User Speech → Silero VAD (100ms) → Audio Buffer (500ms) → Deepgram STT (300ms) →
GPT-4o Thinker (800ms) → ElevenLabs TTS (500ms) → Audio Queue (300ms) → Playback
Total: ~2500ms end-to-end latency
```

**ChatGPT Advanced Voice Mode Pipeline:**

```
User Speech → Server VAD (10ms) → Native Speech Model (150ms) → Audio Stream (22ms)
Total: ~232-320ms end-to-end latency
```

### 1.2 Target Metrics

| Metric                         | Current | Target | Stretch Goal |
| ------------------------------ | ------- | ------ | ------------ |
| End-to-End Response Latency    | ~2500ms | <800ms | <500ms       |
| Barge-in Detection Latency     | ~1500ms | <150ms | <100ms       |
| Audio Mute Latency             | ~500ms  | <50ms  | <30ms        |
| STT Accuracy (during barge-in) | ~50%    | >90%   | >95%         |
| Turn Detection Accuracy        | ~70%    | >95%   | >98%         |
| False Barge-in Rate            | ~20%    | <5%    | <2%          |

### 1.3 Key Innovations

1. **Semantic VAD with LLM-Assisted Turn Detection** - Understands conversation context
2. **Speculative Execution Pipeline** - Start processing before user finishes
3. **Parallel TTS Pre-warming** - Generate likely responses in advance
4. **WebRTC-Style Duplex Audio** - True full-duplex communication
5. **Graceful Turn Overlap** - Intelligent truncation with context preservation

### 1.4 Alignment with Existing Implementation

To avoid duplicating systems, this plan maps innovations onto the current codebase instead of introducing parallel stacks:

- **Semantic VAD / Turn Detection** → extend and tune existing services:
  - `voice_activity_detector.py`, `streaming_stt_service.py`, `hybrid_vad_decider.py`
  - `continuation_detector.py` (semantic continuation), `prosody_analysis_service.py`
  - Frontend: `sileroVAD/`, `turnTaking/`, `useIntelligentBargeIn()`
- **Latency Optimizations** → build on:
  - `preemptive_stt_service.py`, `latency_aware_orchestrator.py`
  - `tts_cache_service.py`, `parallel_stt_service.py`, `unified_voice_service.py`
  - Frontend timing/metrics in `useThinkerTalkerVoiceMode.ts` and `voiceTelemetry.ts`
- **Duplex Audio / Overlap Handling** → reuse:
  - Frontend: `lib/echoCancellation/*`, `lib/fullDuplex/*`, `lib/overlapHandler.ts`
  - Backend: `voice_pipeline_service.py`, `voice_fallback_orchestrator.py`
- **Barge-In Classification** → refine:
  - Backend `barge_in_classifier.py`, `backchannel_service.py`
  - Frontend `useIntelligentBargeIn/`, `bargeInClassifier/`
- **Playwright & Metrics** → harden existing test infra:
  - `e2e/voice/utils/test-setup.ts`, `voice-test-metrics.ts`
  - Window debug surfaces: `window.__voiceModeDebug`, `window.__voiceDebug`, `window.__tt_audio_debug`, `window.__tt_ws_events`

Code samples in later sections for new services (e.g., "SemanticVADService", duplex pipeline hooks, transcript scorers) should be treated as design sketches that extend these existing modules, not as instructions to create entirely separate subsystems.

---

## Part 2: Advanced Semantic VAD System

### 2.1 Architecture Overview

The Semantic VAD system operates at three levels:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SEMANTIC VAD ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Level 1: Acoustic VAD (Silero + Deepgram)                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  • Real-time speech probability (10-30ms latency)           │   │
│  │  • Silence duration tracking                                 │   │
│  │  • Energy/RMS analysis                                       │   │
│  │  • Echo cancellation aware                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ▼                                      │
│  Level 2: Linguistic Analysis (Real-time)                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  • Partial transcript analysis                               │   │
│  │  • Sentence completion detection                             │   │
│  │  • Hesitation marker recognition (um, uh, so...)            │   │
│  │  • Question intonation detection                             │   │
│  │  • Continuation phrase detection                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ▼                                      │
│  Level 3: Contextual Understanding (LLM-Assisted)                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  • Conversation context awareness                            │   │
│  │  • Intent completeness scoring                               │   │
│  │  • Expected response type prediction                         │   │
│  │  • Multi-turn coherence checking                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Linguistic Turn Detection Engine

#### 2.2.1 Turn Completion Signals

```typescript
// File: packages/utils/src/semanticVAD/turnDetection.ts

export interface TurnCompletionSignals {
  // Strong completion indicators (high confidence turn is done)
  strongCompletion: {
    questionEndings: RegExp; // /[?]$/
    commandVerbs: string[]; // ['stop', 'go', 'start', 'show', 'tell']
    acknowledgments: string[]; // ['okay', 'thanks', 'got it', 'yes', 'no']
    farewells: string[]; // ['bye', 'goodbye', 'see you']
  };

  // Weak completion indicators (may be done, wait briefly)
  weakCompletion: {
    statementEndings: RegExp; // /[.!]$/
    trailingPunctuation: RegExp; // /[,;:]$/
    completeClause: RegExp; // Subject + Verb + Object pattern
  };

  // Continuation indicators (user NOT done, keep listening)
  continuationSignals: {
    hesitationMarkers: string[]; // ['um', 'uh', 'er', 'hmm', 'like']
    conjunctions: string[]; // ['and', 'but', 'or', 'so', 'because']
    incompletePatterns: RegExp[]; // ['I want to', 'Can you', 'What if']
    risingIntonation: boolean; // Prosody analysis
    midSentencePause: boolean; // Pause without completion
  };
}

export const DEFAULT_TURN_SIGNALS: TurnCompletionSignals = {
  strongCompletion: {
    questionEndings: /[?]\s*$/,
    commandVerbs: ["stop", "go", "start", "show", "tell", "help", "find", "search", "open", "close", "play", "pause"],
    acknowledgments: ["okay", "ok", "thanks", "thank you", "got it", "yes", "no", "sure", "right", "alright"],
    farewells: ["bye", "goodbye", "see you", "later", "good night", "take care"],
  },
  weakCompletion: {
    statementEndings: /[.!]\s*$/,
    trailingPunctuation: /[,;:]\s*$/,
    completeClause:
      /^.+\s+(is|are|was|were|has|have|had|do|does|did|will|would|can|could|should|may|might)\s+.+[.!?]?\s*$/i,
  },
  continuationSignals: {
    hesitationMarkers: ["um", "uh", "er", "hmm", "like", "you know", "i mean", "well"],
    conjunctions: ["and", "but", "or", "so", "because", "although", "however", "also", "then"],
    incompletePatterns: [
      /^(i want to|i need to|can you|could you|would you|will you|what if|how about|let me|let's)\s*$/i,
      /^(the|a|an|my|your|his|her|their|our|this|that|these|those)\s+\w+\s*$/i,
      /^.+\s+(and|but|or|so|because)\s*$/i,
    ],
    risingIntonation: false,
    midSentencePause: false,
  },
};
```

#### 2.2.2 Semantic Turn Analyzer

```typescript
// File: packages/utils/src/semanticVAD/semanticTurnAnalyzer.ts

export interface TurnAnalysisResult {
  /** Confidence that user has finished speaking (0-1) */
  completionConfidence: number;

  /** Recommended action */
  action: "respond" | "wait" | "prompt_continuation";

  /** Reason for the decision */
  reason: string;

  /** Detected signals */
  signals: {
    strongCompletion: string[];
    weakCompletion: string[];
    continuation: string[];
  };

  /** Recommended wait time before responding (ms) */
  recommendedWaitMs: number;

  /** Whether to use a filler phrase ("Let me think...") */
  useFillerPhrase: boolean;
}

export class SemanticTurnAnalyzer {
  private signals: TurnCompletionSignals;
  private conversationContext: string[] = [];
  private lastAnalysis: TurnAnalysisResult | null = null;

  constructor(signals: TurnCompletionSignals = DEFAULT_TURN_SIGNALS) {
    this.signals = signals;
  }

  /**
   * Analyze a transcript to determine if the user has finished their turn.
   * This is the core semantic VAD logic.
   */
  analyze(
    transcript: string,
    silenceDurationMs: number,
    options: {
      isPartial: boolean;
      prosodyHints?: { risingIntonation: boolean; energyDecline: boolean };
      previousContext?: string[];
    } = { isPartial: false },
  ): TurnAnalysisResult {
    const text = transcript.trim().toLowerCase();
    const detectedSignals = {
      strongCompletion: [] as string[],
      weakCompletion: [] as string[],
      continuation: [] as string[],
    };

    // =========================================
    // PHASE 1: Check for continuation signals (user NOT done)
    // =========================================

    // Check hesitation markers at end of utterance
    for (const marker of this.signals.continuationSignals.hesitationMarkers) {
      if (text.endsWith(marker) || text.endsWith(marker + " ")) {
        detectedSignals.continuation.push(`hesitation:${marker}`);
      }
    }

    // Check trailing conjunctions
    for (const conj of this.signals.continuationSignals.conjunctions) {
      if (text.endsWith(conj) || text.endsWith(conj + " ") || text.endsWith(conj + ",")) {
        detectedSignals.continuation.push(`conjunction:${conj}`);
      }
    }

    // Check incomplete patterns
    for (const pattern of this.signals.continuationSignals.incompletePatterns) {
      if (pattern.test(text)) {
        detectedSignals.continuation.push(`incomplete:${pattern.source}`);
      }
    }

    // Check prosody hints
    if (options.prosodyHints?.risingIntonation) {
      detectedSignals.continuation.push("prosody:rising_intonation");
    }

    // =========================================
    // PHASE 2: Check for strong completion signals
    // =========================================

    // Question endings
    if (this.signals.strongCompletion.questionEndings.test(transcript)) {
      detectedSignals.strongCompletion.push("question_ending");
    }

    // Command verbs (single word commands)
    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1]?.replace(/[.!?,;:]/g, "");
    if (this.signals.strongCompletion.commandVerbs.includes(lastWord) && words.length <= 5) {
      detectedSignals.strongCompletion.push(`command:${lastWord}`);
    }

    // Acknowledgments
    for (const ack of this.signals.strongCompletion.acknowledgments) {
      if (text === ack || text.endsWith(ack) || text.endsWith(ack + ".")) {
        detectedSignals.strongCompletion.push(`acknowledgment:${ack}`);
      }
    }

    // =========================================
    // PHASE 3: Check for weak completion signals
    // =========================================

    if (this.signals.weakCompletion.statementEndings.test(transcript)) {
      detectedSignals.weakCompletion.push("statement_ending");
    }

    if (this.signals.weakCompletion.completeClause.test(transcript)) {
      detectedSignals.weakCompletion.push("complete_clause");
    }

    // =========================================
    // PHASE 4: Calculate completion confidence
    // =========================================

    let completionConfidence = 0.5; // Base confidence

    // Strong signals increase confidence significantly
    completionConfidence += detectedSignals.strongCompletion.length * 0.25;

    // Weak signals increase confidence moderately
    completionConfidence += detectedSignals.weakCompletion.length * 0.15;

    // Continuation signals decrease confidence significantly
    completionConfidence -= detectedSignals.continuation.length * 0.3;

    // Silence duration affects confidence
    if (silenceDurationMs > 2000) {
      completionConfidence += 0.3; // Long silence = probably done
    } else if (silenceDurationMs > 1000) {
      completionConfidence += 0.15;
    } else if (silenceDurationMs < 300) {
      completionConfidence -= 0.1; // Very short pause = probably continuing
    }

    // Partial transcripts are less certain
    if (options.isPartial) {
      completionConfidence -= 0.2;
    }

    // Clamp to [0, 1]
    completionConfidence = Math.max(0, Math.min(1, completionConfidence));

    // =========================================
    // PHASE 5: Determine action
    // =========================================

    let action: TurnAnalysisResult["action"];
    let recommendedWaitMs: number;
    let useFillerPhrase = false;
    let reason: string;

    if (completionConfidence >= 0.85) {
      action = "respond";
      recommendedWaitMs = 200; // Brief pause for natural rhythm
      reason = "High confidence turn completion";
    } else if (completionConfidence >= 0.65) {
      action = "respond";
      recommendedWaitMs = 500; // Wait a bit longer to be sure
      reason = "Moderate confidence turn completion";

      // Use filler for complex-looking queries
      if (transcript.split(" ").length > 10) {
        useFillerPhrase = true;
      }
    } else if (completionConfidence >= 0.4) {
      action = "wait";
      recommendedWaitMs = 1500; // Extended wait for continuation
      reason = "Uncertain completion - waiting for more input";
    } else {
      action = "wait";
      recommendedWaitMs = 3000; // User is clearly continuing
      reason = "Strong continuation signals detected";
    }

    // Override: If we detect strong continuation, always wait
    if (detectedSignals.continuation.length >= 2) {
      action = "wait";
      recommendedWaitMs = Math.max(recommendedWaitMs, 2000);
      reason = "Multiple continuation signals detected";
    }

    const result: TurnAnalysisResult = {
      completionConfidence,
      action,
      reason,
      signals: detectedSignals,
      recommendedWaitMs,
      useFillerPhrase,
    };

    this.lastAnalysis = result;
    return result;
  }

  /**
   * Update conversation context for better turn prediction.
   */
  addContext(utterance: string): void {
    this.conversationContext.push(utterance);
    // Keep last 10 utterances for context
    if (this.conversationContext.length > 10) {
      this.conversationContext.shift();
    }
  }
}
```

### 2.3 Backend Integration

#### 2.3.1 Enhanced Continuation Detector

```python
# File: services/api-gateway/app/services/semantic_vad_service.py

from dataclasses import dataclass
from enum import Enum
from typing import List, Optional, Tuple
import re
import time

from app.core.logging import get_logger

logger = get_logger(__name__)


class TurnCompletionConfidence(str, Enum):
    """Confidence level for turn completion."""
    HIGH = "high"           # >85% - Respond immediately
    MODERATE = "moderate"   # 65-85% - Respond with brief wait
    LOW = "low"             # 40-65% - Wait for more input
    VERY_LOW = "very_low"   # <40% - User is clearly continuing


@dataclass
class SemanticVADResult:
    """Result of semantic VAD analysis."""
    completion_confidence: float
    confidence_level: TurnCompletionConfidence
    action: str  # 'respond', 'wait', 'prompt_continuation'
    recommended_wait_ms: int
    use_filler_phrase: bool
    reason: str
    detected_signals: dict


class SemanticVADService:
    """
    Advanced Semantic VAD that understands conversation meaning.

    Unlike traditional VAD that only detects silence, this service
    analyzes linguistic patterns to determine when a user has
    finished their thought, even during natural pauses.
    """

    # Strong completion indicators
    QUESTION_ENDINGS = re.compile(r'[?]\s*$')
    COMMAND_VERBS = {'stop', 'go', 'start', 'show', 'tell', 'help', 'find',
                     'search', 'open', 'close', 'play', 'pause', 'cancel'}
    ACKNOWLEDGMENTS = {'okay', 'ok', 'thanks', 'thank you', 'got it', 'yes',
                       'no', 'sure', 'right', 'alright', 'yep', 'nope'}

    # Continuation indicators
    HESITATION_MARKERS = {'um', 'uh', 'er', 'hmm', 'like', 'you know',
                          'i mean', 'well', 'so', 'anyway'}
    TRAILING_CONJUNCTIONS = {'and', 'but', 'or', 'so', 'because', 'although',
                             'however', 'also', 'then', 'yet'}
    INCOMPLETE_PATTERNS = [
        re.compile(r'^(i want to|i need to|can you|could you|would you)\s*$', re.I),
        re.compile(r'^(what if|how about|let me|let\'s)\s*$', re.I),
        re.compile(r'^.+\s+(and|but|or|so|because)\s*$', re.I),
        re.compile(r'^(the|a|an|my|your)\s+\w+\s*$', re.I),
    ]

    def __init__(self):
        self._conversation_context: List[str] = []
        self._last_analysis_time: float = 0

    def analyze(
        self,
        transcript: str,
        silence_duration_ms: int,
        is_partial: bool = False,
        prosody_hints: Optional[dict] = None,
    ) -> SemanticVADResult:
        """
        Analyze transcript to determine if user turn is complete.

        Args:
            transcript: Current transcript text
            silence_duration_ms: Duration of silence after last speech
            is_partial: Whether this is a partial (streaming) transcript
            prosody_hints: Optional prosody analysis results

        Returns:
            SemanticVADResult with completion confidence and recommended action
        """
        text = transcript.strip().lower()
        words = text.split()

        signals = {
            'strong_completion': [],
            'weak_completion': [],
            'continuation': [],
        }

        # ========================================
        # PHASE 1: Detect continuation signals
        # ========================================

        # Hesitation markers
        for marker in self.HESITATION_MARKERS:
            if text.endswith(marker) or text.endswith(f"{marker} "):
                signals['continuation'].append(f"hesitation:{marker}")

        # Trailing conjunctions
        last_word = words[-1].rstrip('.,!?;:') if words else ''
        if last_word in self.TRAILING_CONJUNCTIONS:
            signals['continuation'].append(f"conjunction:{last_word}")

        # Incomplete patterns
        for pattern in self.INCOMPLETE_PATTERNS:
            if pattern.search(text):
                signals['continuation'].append(f"incomplete_pattern")
                break

        # Prosody-based continuation
        if prosody_hints:
            if prosody_hints.get('rising_intonation'):
                signals['continuation'].append("rising_intonation")
            if prosody_hints.get('mid_word_cutoff'):
                signals['continuation'].append("mid_word_cutoff")

        # ========================================
        # PHASE 2: Detect completion signals
        # ========================================

        # Question endings (strong)
        if self.QUESTION_ENDINGS.search(transcript):
            signals['strong_completion'].append("question")

        # Command verbs (strong for short utterances)
        if len(words) <= 5 and last_word in self.COMMAND_VERBS:
            signals['strong_completion'].append(f"command:{last_word}")

        # Acknowledgments (strong)
        if text in self.ACKNOWLEDGMENTS or last_word in self.ACKNOWLEDGMENTS:
            signals['strong_completion'].append(f"acknowledgment:{last_word}")

        # Statement endings (weak)
        if transcript.rstrip().endswith('.') or transcript.rstrip().endswith('!'):
            signals['weak_completion'].append("statement_ending")

        # ========================================
        # PHASE 3: Calculate confidence
        # ========================================

        confidence = 0.5  # Base confidence

        # Strong completion signals
        confidence += len(signals['strong_completion']) * 0.25

        # Weak completion signals
        confidence += len(signals['weak_completion']) * 0.15

        # Continuation signals (decrease confidence)
        confidence -= len(signals['continuation']) * 0.3

        # Silence duration factor
        if silence_duration_ms >= 2000:
            confidence += 0.3
        elif silence_duration_ms >= 1000:
            confidence += 0.15
        elif silence_duration_ms < 300:
            confidence -= 0.1

        # Partial transcripts are less certain
        if is_partial:
            confidence -= 0.2

        # Clamp to [0, 1]
        confidence = max(0.0, min(1.0, confidence))

        # ========================================
        # PHASE 4: Determine action
        # ========================================

        if confidence >= 0.85:
            level = TurnCompletionConfidence.HIGH
            action = "respond"
            wait_ms = 200
            use_filler = False
            reason = "High confidence turn completion"
        elif confidence >= 0.65:
            level = TurnCompletionConfidence.MODERATE
            action = "respond"
            wait_ms = 500
            use_filler = len(words) > 10  # Filler for complex queries
            reason = "Moderate confidence turn completion"
        elif confidence >= 0.40:
            level = TurnCompletionConfidence.LOW
            action = "wait"
            wait_ms = 1500
            use_filler = False
            reason = "Low confidence - waiting for more input"
        else:
            level = TurnCompletionConfidence.VERY_LOW
            action = "wait"
            wait_ms = 3000
            use_filler = False
            reason = "Continuation signals detected"

        # Override for multiple continuation signals
        if len(signals['continuation']) >= 2:
            action = "wait"
            wait_ms = max(wait_ms, 2000)
            reason = "Multiple continuation signals detected"

        return SemanticVADResult(
            completion_confidence=confidence,
            confidence_level=level,
            action=action,
            recommended_wait_ms=wait_ms,
            use_filler_phrase=use_filler,
            reason=reason,
            detected_signals=signals,
        )

    def should_respond(
        self,
        transcript: str,
        silence_duration_ms: int,
        is_partial: bool = False,
    ) -> Tuple[bool, int]:
        """
        Quick check if we should respond to the user.

        Returns:
            Tuple of (should_respond: bool, wait_ms: int)
        """
        result = self.analyze(transcript, silence_duration_ms, is_partial)
        return (result.action == "respond", result.recommended_wait_ms)


# Singleton instance
semantic_vad_service = SemanticVADService()
```

### 2.4 Feature Flags

```python
# Add to services/api-gateway/app/core/flag_definitions.py

SEMANTIC_VAD_FLAGS = {
    "backend.voice_semantic_vad_enabled": {
        "name": "backend.voice_semantic_vad_enabled",
        "description": "Enable semantic VAD for intelligent turn detection",
        "default_value": True,
        "flag_type": "boolean",
        "category": "voice",
    },
    "backend.voice_semantic_vad_hesitation_tolerance_ms": {
        "name": "backend.voice_semantic_vad_hesitation_tolerance_ms",
        "description": "How long to wait during hesitations (um, uh) before responding",
        "default_value": 2000,
        "flag_type": "number",
        "category": "voice",
    },
    "backend.voice_semantic_vad_completion_threshold": {
        "name": "backend.voice_semantic_vad_completion_threshold",
        "description": "Confidence threshold for turn completion (0-1)",
        "default_value": 0.65,
        "flag_type": "number",
        "category": "voice",
    },
    "backend.voice_semantic_vad_use_llm_assist": {
        "name": "backend.voice_semantic_vad_use_llm_assist",
        "description": "Use LLM to assist with turn completion detection for complex cases",
        "default_value": False,
        "flag_type": "boolean",
        "category": "voice",
    },
}
```

---

## Part 3: Latency Optimization Strategy

### 3.1 Current Latency Breakdown

```
┌──────────────────────────────────────────────────────────────────────┐
│                    CURRENT LATENCY BREAKDOWN                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User speaks "What's the weather?"                                   │
│  ├─ [0-100ms]    Silero VAD detects speech end                      │
│  ├─ [100-600ms]  Audio buffer accumulates (500ms safety buffer)     │
│  ├─ [600-900ms]  Deepgram STT processes audio                       │
│  ├─ [900-1700ms] GPT-4o generates response                          │
│  ├─ [1700-2200ms] ElevenLabs generates first audio chunk            │
│  ├─ [2200-2500ms] Audio queued and playback starts                  │
│  └─ [2500ms+]    User hears first word                              │
│                                                                      │
│  TOTAL: ~2500ms from user finishes speaking to AI starts speaking   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Optimized Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    OPTIMIZED LATENCY PIPELINE                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User speaks "What's the weather?"                                   │
│                                                                      │
│  PARALLEL EXECUTION:                                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Stream 1: STT (starts immediately)                          │    │
│  │ [0ms] Audio → Deepgram (streaming, no buffer)               │    │
│  │ [150ms] Partial transcript: "What's the"                    │    │
│  │ [250ms] Partial transcript: "What's the weather"            │    │
│  │ [350ms] Final transcript + VAD speech_end                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Stream 2: Speculative LLM (starts on partial)               │    │
│  │ [200ms] Start GPT-4o with partial "What's the weather"      │    │
│  │ [400ms] First token generated                               │    │
│  │ [450ms] Streaming response begins                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Stream 3: Early TTS (starts on first LLM token)             │    │
│  │ [420ms] TTS pre-warm with likely first word                 │    │
│  │ [500ms] First audio chunk ready                             │    │
│  │ [550ms] Playback begins                                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  TOTAL: ~550ms from user finishes to AI starts speaking             │
│  IMPROVEMENT: 2500ms → 550ms (78% reduction)                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.3 Speculative Execution Engine

```python
# File: services/api-gateway/app/services/speculative_execution_service.py

import asyncio
from dataclasses import dataclass, field
from typing import AsyncGenerator, Callable, Optional, List
from enum import Enum
import time

from app.core.logging import get_logger
from app.services.thinker_service import ThinkerService, thinker_service

logger = get_logger(__name__)


class SpeculationState(str, Enum):
    """State of speculative execution."""
    IDLE = "idle"
    SPECULATING = "speculating"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


@dataclass
class SpeculativeResult:
    """Result of speculative execution."""
    state: SpeculationState
    partial_response: str
    tokens_generated: int
    latency_saved_ms: float
    was_useful: bool  # True if speculation matched final input


@dataclass
class SpeculationConfig:
    """Configuration for speculative execution."""
    # Minimum transcript length to start speculation
    min_transcript_length: int = 15

    # Confidence threshold for starting speculation
    confidence_threshold: float = 0.7

    # Maximum tokens to generate speculatively
    max_speculative_tokens: int = 50

    # Cancel speculation if input diverges by this much
    divergence_threshold: float = 0.3

    # How often to check for input updates (ms)
    check_interval_ms: int = 50


class SpeculativeExecutionService:
    """
    Speculative execution for LLM responses.

    Starts generating responses before the user finishes speaking,
    based on partial transcripts. If the final transcript matches,
    we've saved significant latency. If it diverges, we cancel and restart.
    """

    def __init__(self, thinker: ThinkerService, config: SpeculationConfig = None):
        self.thinker = thinker
        self.config = config or SpeculationConfig()
        self._current_speculation: Optional[asyncio.Task] = None
        self._speculation_transcript: str = ""
        self._speculative_tokens: List[str] = []
        self._state = SpeculationState.IDLE
        self._start_time: float = 0

    async def start_speculation(
        self,
        partial_transcript: str,
        conversation_id: str,
        system_prompt: str,
        on_token: Optional[Callable[[str], None]] = None,
    ) -> None:
        """
        Start speculative response generation.

        Args:
            partial_transcript: Current partial transcript
            conversation_id: Conversation context ID
            system_prompt: System prompt for the LLM
            on_token: Callback for each generated token
        """
        # Don't start if transcript is too short
        if len(partial_transcript) < self.config.min_transcript_length:
            return

        # Cancel any existing speculation
        if self._current_speculation and not self._current_speculation.done():
            self._current_speculation.cancel()

        self._speculation_transcript = partial_transcript
        self._speculative_tokens = []
        self._state = SpeculationState.SPECULATING
        self._start_time = time.time()

        logger.info(f"[Speculative] Starting speculation on: '{partial_transcript[:50]}...'")

        # Start speculative generation
        self._current_speculation = asyncio.create_task(
            self._run_speculation(
                partial_transcript,
                conversation_id,
                system_prompt,
                on_token,
            )
        )

    async def _run_speculation(
        self,
        transcript: str,
        conversation_id: str,
        system_prompt: str,
        on_token: Optional[Callable[[str], None]],
    ) -> None:
        """Run the speculative generation."""
        try:
            token_count = 0
            async for token in self.thinker.stream_response(
                message=transcript,
                conversation_id=conversation_id,
                system_prompt=system_prompt,
            ):
                if self._state == SpeculationState.CANCELLED:
                    logger.info("[Speculative] Cancelled - stopping generation")
                    return

                self._speculative_tokens.append(token)
                token_count += 1

                if on_token:
                    on_token(token)

                # Stop if we've generated enough speculative tokens
                if token_count >= self.config.max_speculative_tokens:
                    logger.info(f"[Speculative] Reached max tokens ({token_count})")
                    break

        except asyncio.CancelledError:
            logger.info("[Speculative] Task cancelled")
            self._state = SpeculationState.CANCELLED
        except Exception as e:
            logger.error(f"[Speculative] Error during speculation: {e}")
            self._state = SpeculationState.CANCELLED

    def check_divergence(self, new_transcript: str) -> float:
        """
        Check how much the new transcript diverges from speculation.

        Returns divergence score (0 = identical, 1 = completely different)
        """
        if not self._speculation_transcript:
            return 1.0

        # Simple character-level comparison
        old = self._speculation_transcript.lower()
        new = new_transcript.lower()

        # Check if new transcript starts with old
        if new.startswith(old):
            return 0.0

        # Check overlap
        min_len = min(len(old), len(new))
        if min_len == 0:
            return 1.0

        matches = sum(1 for i in range(min_len) if old[i] == new[i])
        return 1.0 - (matches / min_len)

    def update_transcript(self, new_transcript: str) -> bool:
        """
        Update with new transcript and check if speculation is still valid.

        Returns True if speculation should continue, False if it should cancel.
        """
        divergence = self.check_divergence(new_transcript)

        if divergence > self.config.divergence_threshold:
            logger.info(f"[Speculative] Divergence too high ({divergence:.2f}), cancelling")
            self.cancel()
            return False

        # Update transcript for continued speculation
        self._speculation_transcript = new_transcript
        return True

    def confirm(self, final_transcript: str) -> SpeculativeResult:
        """
        Confirm speculation with final transcript.

        Returns result indicating if speculation was useful.
        """
        divergence = self.check_divergence(final_transcript)
        was_useful = divergence <= self.config.divergence_threshold

        latency_saved = (time.time() - self._start_time) * 1000 if was_useful else 0

        self._state = SpeculationState.CONFIRMED if was_useful else SpeculationState.CANCELLED

        result = SpeculativeResult(
            state=self._state,
            partial_response="".join(self._speculative_tokens),
            tokens_generated=len(self._speculative_tokens),
            latency_saved_ms=latency_saved,
            was_useful=was_useful,
        )

        logger.info(
            f"[Speculative] Confirmed: useful={was_useful}, "
            f"tokens={result.tokens_generated}, saved={latency_saved:.0f}ms"
        )

        return result

    def cancel(self) -> None:
        """Cancel current speculation."""
        self._state = SpeculationState.CANCELLED
        if self._current_speculation and not self._current_speculation.done():
            self._current_speculation.cancel()
        self._speculative_tokens = []

    def get_speculative_response(self) -> str:
        """Get the current speculative response."""
        return "".join(self._speculative_tokens)

    @property
    def is_speculating(self) -> bool:
        return self._state == SpeculationState.SPECULATING
```

### 3.4 TTS Pre-warming Service

```python
# File: services/api-gateway/app/services/tts_prewarm_service.py

import asyncio
from dataclasses import dataclass
from typing import Dict, List, Optional
import time

from app.core.logging import get_logger
from app.services.talker_service import TalkerService, VoiceConfig, talker_service

logger = get_logger(__name__)


@dataclass
class PrewarmConfig:
    """Configuration for TTS pre-warming."""
    # Common response starters to pre-warm
    common_starters: List[str] = None

    # Cache duration in seconds
    cache_duration_s: int = 300

    # Maximum cached items
    max_cache_size: int = 50

    def __post_init__(self):
        if self.common_starters is None:
            self.common_starters = [
                "Sure,",
                "Of course,",
                "Let me",
                "I can",
                "Here's",
                "The",
                "Yes,",
                "No,",
                "Hmm,",
                "That's",
                "Great",
                "Absolutely",
            ]


@dataclass
class CachedAudio:
    """Cached pre-warmed audio."""
    text: str
    audio_base64: str
    created_at: float
    voice_id: str


class TTSPrewarmService:
    """
    Pre-warms TTS for common response patterns.

    By caching the first word/phrase of likely responses,
    we can start playback almost instantly when the LLM
    generates a matching start.
    """

    def __init__(self, talker: TalkerService, config: PrewarmConfig = None):
        self.talker = talker
        self.config = config or PrewarmConfig()
        self._cache: Dict[str, CachedAudio] = {}
        self._prewarm_task: Optional[asyncio.Task] = None

    async def prewarm_common_starters(self, voice_config: VoiceConfig) -> None:
        """Pre-warm audio for common response starters."""
        logger.info(f"[TTSPrewarm] Pre-warming {len(self.config.common_starters)} starters")

        for starter in self.config.common_starters:
            try:
                cache_key = f"{voice_config.voice_id}:{starter.lower()}"

                # Skip if already cached and not expired
                if cache_key in self._cache:
                    cached = self._cache[cache_key]
                    if time.time() - cached.created_at < self.config.cache_duration_s:
                        continue

                # Generate audio
                audio_chunks = []
                async for chunk in self.talker.stream_audio(
                    text=starter,
                    voice_config=voice_config,
                ):
                    audio_chunks.append(chunk.audio_base64)

                # Cache the combined audio
                self._cache[cache_key] = CachedAudio(
                    text=starter,
                    audio_base64="".join(audio_chunks),
                    created_at=time.time(),
                    voice_id=voice_config.voice_id,
                )

                logger.debug(f"[TTSPrewarm] Cached: '{starter}'")

            except Exception as e:
                logger.error(f"[TTSPrewarm] Failed to prewarm '{starter}': {e}")

        # Enforce cache size limit
        self._evict_old_entries()

        logger.info(f"[TTSPrewarm] Pre-warm complete, cache size: {len(self._cache)}")

    def get_cached_audio(self, text: str, voice_id: str) -> Optional[str]:
        """
        Get cached audio for text if available.

        Args:
            text: Text to look up
            voice_id: Voice ID to match

        Returns:
            Base64 audio if cached, None otherwise
        """
        # Check for exact match
        cache_key = f"{voice_id}:{text.lower()}"
        if cache_key in self._cache:
            cached = self._cache[cache_key]
            if time.time() - cached.created_at < self.config.cache_duration_s:
                logger.debug(f"[TTSPrewarm] Cache hit: '{text}'")
                return cached.audio_base64

        # Check for prefix match (e.g., "Sure," matches "Sure, I can help")
        text_lower = text.lower()
        for key, cached in self._cache.items():
            if key.startswith(f"{voice_id}:") and text_lower.startswith(cached.text.lower()):
                if time.time() - cached.created_at < self.config.cache_duration_s:
                    logger.debug(f"[TTSPrewarm] Prefix cache hit: '{cached.text}' for '{text}'")
                    return cached.audio_base64

        return None

    def _evict_old_entries(self) -> None:
        """Evict old cache entries to stay under size limit."""
        if len(self._cache) <= self.config.max_cache_size:
            return

        # Sort by creation time and remove oldest
        sorted_entries = sorted(
            self._cache.items(),
            key=lambda x: x[1].created_at,
        )

        entries_to_remove = len(self._cache) - self.config.max_cache_size
        for key, _ in sorted_entries[:entries_to_remove]:
            del self._cache[key]

        logger.debug(f"[TTSPrewarm] Evicted {entries_to_remove} old entries")

    async def start_background_prewarm(self, voice_config: VoiceConfig) -> None:
        """Start pre-warming in the background."""
        if self._prewarm_task and not self._prewarm_task.done():
            return

        self._prewarm_task = asyncio.create_task(
            self.prewarm_common_starters(voice_config)
        )


# Singleton
tts_prewarm_service = TTSPrewarmService(talker_service)


---

## Part 4: Duplex Audio Architecture

### 4.1 Current Half-Duplex Limitations

```

CURRENT ARCHITECTURE (Half-Duplex):
┌─────────────────────────────────────────────────────────────────┐
│ │
│ User Speaking → System Listening (Mic ON, Speaker OFF)│
│ System Speaking → System Talking (Mic OFF, Speaker ON)│
│ │
│ Problem: When AI speaks, we stop listening OR get echo │
│ │
└─────────────────────────────────────────────────────────────────┘

```

### 4.2 Full-Duplex Target Architecture

```

TARGET ARCHITECTURE (Full-Duplex):
┌─────────────────────────────────────────────────────────────────┐
│ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SIMULTANEOUS AUDIO STREAMS │ │
│ │ │ │
│ │ Microphone ──► Echo Cancellation ──► VAD ──► STT │ │
│ │ ▲ │ │ │
│ │ │ │ (Reference signal) │ │
│ │ │ ▼ │ │
│ │ Speaker ◄── Audio Mixer ◄── TTS Output │ │
│ │ │ │
│ └─────────────────────────────────────────────────────────┘ │
│ │
│ Key: Both streams active simultaneously │
│ - User can interrupt AI at any time │
│ - AI hears user even while speaking │
│ - Echo cancellation removes AI's voice from mic input │
│ │
└─────────────────────────────────────────────────────────────────┘

````

### 4.3 Echo Cancellation Pipeline

```typescript
// File: apps/web-app/src/lib/audio/duplexAudioPipeline.ts

export interface DuplexAudioConfig {
  // Echo cancellation settings
  aecEnabled: boolean;
  aecTailLengthMs: number;  // Default: 128ms

  // Noise suppression
  nsEnabled: boolean;
  nsLevel: 'low' | 'moderate' | 'high' | 'very_high';

  // Automatic gain control
  agcEnabled: boolean;
  agcTargetLevel: number;  // dBFS, default: -3

  // VAD settings during duplex
  vadThresholdDuringPlayback: number;  // Higher threshold when AI speaking
  vadMinSpeechDuringPlayback: number;  // Longer min speech when AI speaking
}

export const DEFAULT_DUPLEX_CONFIG: DuplexAudioConfig = {
  aecEnabled: true,
  aecTailLengthMs: 128,
  nsEnabled: true,
  nsLevel: 'moderate',
  agcEnabled: true,
  agcTargetLevel: -3,
  vadThresholdDuringPlayback: 0.7,  // Higher than normal 0.5
  vadMinSpeechDuringPlayback: 200,  // Longer than normal 150ms
};

export class DuplexAudioPipeline {
  private audioContext: AudioContext;
  private micStream: MediaStream | null = null;
  private playbackNode: AudioBufferSourceNode | null = null;

  // Echo cancellation
  private aecProcessor: AudioWorkletNode | null = null;
  private playbackAnalyser: AnalyserNode | null = null;

  // State
  private isPlaybackActive = false;
  private lastPlaybackSample: Float32Array | null = null;

  constructor(private config: DuplexAudioConfig = DEFAULT_DUPLEX_CONFIG) {
    this.audioContext = new AudioContext({ sampleRate: 16000 });
  }

  async initialize(): Promise<void> {
    // Load AEC AudioWorklet
    await this.audioContext.audioWorklet.addModule('/audio-worklets/aec-processor.js');

    // Create AEC processor
    this.aecProcessor = new AudioWorkletNode(this.audioContext, 'aec-processor', {
      processorOptions: {
        tailLengthMs: this.config.aecTailLengthMs,
      },
    });

    // Create analyser for playback reference signal
    this.playbackAnalyser = this.audioContext.createAnalyser();
    this.playbackAnalyser.fftSize = 256;
  }

  async startMicrophone(): Promise<MediaStream> {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: this.config.aecEnabled,
        noiseSuppression: this.config.nsEnabled,
        autoGainControl: this.config.agcEnabled,
        // Request specific constraints for better AEC
        channelCount: 1,
        sampleRate: 16000,
      },
    });

    // Connect mic through AEC processor
    const micSource = this.audioContext.createMediaStreamSource(this.micStream);
    micSource.connect(this.aecProcessor!);

    return this.micStream;
  }

  /**
   * Feed playback audio as reference for echo cancellation.
   * This is called whenever we play AI audio.
   */
  feedPlaybackReference(audioData: Float32Array): void {
    if (!this.aecProcessor) return;

    // Send reference signal to AEC processor
    this.aecProcessor.port.postMessage({
      type: 'reference',
      data: audioData,
    });

    this.lastPlaybackSample = audioData;
    this.isPlaybackActive = true;
  }

  /**
   * Signal that playback has stopped.
   */
  stopPlaybackReference(): void {
    this.isPlaybackActive = false;

    // Give AEC time to converge before lowering VAD threshold
    setTimeout(() => {
      if (!this.isPlaybackActive) {
        this.aecProcessor?.port.postMessage({
          type: 'playback_ended',
        });
      }
    }, 100);
  }

  /**
   * Get the processed microphone stream (echo-cancelled).
   */
  getProcessedMicStream(): MediaStream {
    if (!this.aecProcessor) {
      throw new Error('Pipeline not initialized');
    }

    const destination = this.audioContext.createMediaStreamDestination();
    this.aecProcessor.connect(destination);

    return destination.stream;
  }

  /**
   * Get current VAD threshold based on playback state.
   */
  getCurrentVADThreshold(): number {
    return this.isPlaybackActive
      ? this.config.vadThresholdDuringPlayback
      : 0.5;  // Normal threshold
  }

  /**
   * Analyze if current mic input is likely echo.
   */
  isLikelyEcho(micData: Float32Array): boolean {
    if (!this.lastPlaybackSample || !this.isPlaybackActive) {
      return false;
    }

    // Simple correlation check between mic and playback
    // If highly correlated, it's likely echo
    const correlation = this.calculateCorrelation(micData, this.lastPlaybackSample);
    return correlation > 0.7;
  }

  private calculateCorrelation(a: Float32Array, b: Float32Array): number {
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;

    let sum = 0;
    let sumA = 0;
    let sumB = 0;
    let sumA2 = 0;
    let sumB2 = 0;

    for (let i = 0; i < len; i++) {
      sum += a[i] * b[i];
      sumA += a[i];
      sumB += b[i];
      sumA2 += a[i] * a[i];
      sumB2 += b[i] * b[i];
    }

    const num = len * sum - sumA * sumB;
    const den = Math.sqrt((len * sumA2 - sumA * sumA) * (len * sumB2 - sumB * sumB));

    return den === 0 ? 0 : num / den;
  }

  destroy(): void {
    this.micStream?.getTracks().forEach(t => t.stop());
    this.aecProcessor?.disconnect();
    this.audioContext.close();
  }
}
````

### 4.4 Backend Duplex Handler

````python
# File: services/api-gateway/app/services/duplex_voice_handler.py

import asyncio
from dataclasses import dataclass
from typing import AsyncGenerator, Callable, Optional
from enum import Enum
import time

from app.core.logging import get_logger

logger = get_logger(__name__)


class DuplexState(str, Enum):
    """State of the duplex voice session."""
    IDLE = "idle"
    LISTENING = "listening"
    SPEAKING = "speaking"
    DUPLEX = "duplex"  # Both listening and speaking simultaneously


@dataclass
class DuplexConfig:
    """Configuration for duplex voice handling."""
    # Barge-in settings
    barge_in_enabled: bool = True
    barge_in_fade_ms: int = 50  # Fade duration when interrupted

    # Echo handling
    echo_suppression_window_ms: int = 200  # Ignore VAD for this long after playback

    # Response interruption
    allow_mid_sentence_interrupt: bool = True
    graceful_truncation: bool = True


class DuplexVoiceHandler:
    """
    Handles full-duplex voice communication.

    Unlike half-duplex where we switch between listening and speaking,
    this handler allows simultaneous bidirectional audio:
    - AI can speak while listening for interruptions
    - User can interrupt at any moment
    - Echo cancellation prevents feedback loops
    """

    def __init__(self, config: DuplexConfig = None):
        self.config = config or DuplexConfig()
        self._state = DuplexState.IDLE
        self._is_tts_active = False
        self._last_playback_end_time: float = 0
        self._pending_barge_in = False
        self._current_response_text: str = ""
        self._spoken_text: str = ""

    @property
    def state(self) -> DuplexState:
        return self._state

    def start_speaking(self) -> None:
        """Signal that TTS playback is starting."""
        self._is_tts_active = True
        if self._state == DuplexState.LISTENING:
            self._state = DuplexState.DUPLEX
        else:
            self._state = DuplexState.SPEAKING

        logger.debug(f"[Duplex] Started speaking, state: {self._state}")

    def stop_speaking(self, was_interrupted: bool = False) -> None:
        """Signal that TTS playback has stopped."""
        self._is_tts_active = False
        self._last_playback_end_time = time.time()

        if was_interrupted:
            logger.info(f"[Duplex] Speech interrupted after: '{self._spoken_text[:50]}...'")
        else:
            logger.debug("[Duplex] Speech completed naturally")

        self._state = DuplexState.LISTENING

    def start_listening(self) -> None:
        """Signal that we're actively listening for user speech."""
        if self._is_tts_active:
            self._state = DuplexState.DUPLEX
        else:
            self._state = DuplexState.LISTENING

    def should_suppress_vad(self) -> bool:
        """
        Check if VAD should be suppressed due to recent playback.

        This prevents echo from triggering false barge-ins immediately
        after TTS stops.
        """
        if self._is_tts_active:
            return False  # During playback, VAD should work (with elevated threshold)

        # Suppress for a short window after playback ends
        time_since_playback = (time.time() - self._last_playback_end_time) * 1000
        return time_since_playback < self.config.echo_suppression_window_ms

    def handle_user_speech_detected(
        self,
        confidence: float,
        duration_ms: int,
    ) -> dict:
        """
        Handle user speech detection during duplex mode.

        Returns action dict with:
        - trigger_barge_in: bool
        - fade_duration_ms: int
        - preserve_context: bool
        """
        # Check if we should suppress
        if self.should_suppress_vad():
            logger.debug("[Duplex] VAD suppressed (echo window)")
            return {"trigger_barge_in": False, "reason": "echo_suppression"}

        # During TTS playback - potential barge-in
        if self._is_tts_active and self.config.barge_in_enabled:
            # Require higher confidence during playback
            if confidence >= 0.7 and duration_ms >= 150:
                logger.info(f"[Duplex] Barge-in triggered: conf={confidence:.2f}, dur={duration_ms}ms")
                return {
                    "trigger_barge_in": True,
                    "fade_duration_ms": self.config.barge_in_fade_ms,
                    "preserve_context": self.config.graceful_truncation,
                    "reason": "user_speech_during_playback",
                }

        return {"trigger_barge_in": False, "reason": "no_action_needed"}

    def get_truncation_point(self, full_response: str, spoken_portion: str) -> dict:
        """
        Calculate where to truncate response for graceful barge-in.

        Returns:
        - truncated_text: What was spoken before interruption
        - remaining_text: What wasn't spoken yet
        - truncation_type: 'sentence' | 'phrase' | 'word' | 'mid_word'
        """
        if not spoken_portion:
            return {
                "truncated_text": "",
                "remaining_text": full_response,
                "truncation_type": "beginning",
            }

        # Find the best truncation point
        spoken_len = len(spoken_portion)

        # Try to truncate at sentence boundary
        sentence_ends = ['.', '!', '?']
        for i in range(spoken_len - 1, max(0, spoken_len - 50), -1):
            if i < len(full_response) and full_response[i] in sentence_ends:
                return {
                    "truncated_text": full_response[:i + 1],
                    "remaining_text": full_response[i + 1:],
                    "truncation_type": "sentence",
                }

        # Try phrase boundary (comma)
        for i in range(spoken_len - 1, max(0, spoken_len - 30), -1):
            if i < len(full_response) and full_response[i] == ',':
                return {
                    "truncated_text": full_response[:i + 1],
                    "remaining_text": full_response[i + 1:],
                    "truncation_type": "phrase",
                }

        # Try word boundary
        for i in range(spoken_len - 1, max(0, spoken_len - 15), -1):
            if i < len(full_response) and full_response[i] == ' ':
                return {
                    "truncated_text": full_response[:i],
                    "remaining_text": full_response[i:],
                    "truncation_type": "word",
                }

        # Last resort: mid-word truncation
        return {
            "truncated_text": full_response[:spoken_len],
            "remaining_text": full_response[spoken_len:],
            "truncation_type": "mid_word",
        }


---

## Part 5: Turn Overlap Handling

### 5.1 Overview

Turn overlap occurs when user speech begins while AI is still speaking.
We need to handle this gracefully to:

1. **Stop AI speech quickly** - Minimize overlap duration
2. **Preserve context** - Remember what AI was saying
3. **Capture user intent** - Get accurate transcript despite overlap
4. **Maintain coherence** - AI's next response should acknowledge interruption

### 5.2 Graceful Truncation System

```python
# File: services/api-gateway/app/services/graceful_truncation_service.py

from dataclasses import dataclass
from typing import Optional, List, Tuple
from enum import Enum
import re

from app.core.logging import get_logger

logger = get_logger(__name__)


class TruncationType(str, Enum):
    """Type of truncation applied."""
    NONE = "none"                    # No truncation (completed naturally)
    SENTENCE_BOUNDARY = "sentence"   # Clean sentence break
    PHRASE_BOUNDARY = "phrase"       # Comma or clause break
    WORD_BOUNDARY = "word"           # Space between words
    MID_WORD = "mid_word"            # Had to cut mid-word
    IMMEDIATE = "immediate"          # Cut immediately (hard barge-in)


@dataclass
class TruncationResult:
    """Result of truncation analysis."""
    truncation_type: TruncationType
    spoken_text: str
    unspoken_text: str
    truncation_position: int
    was_graceful: bool
    context_for_next_response: str


@dataclass
class TruncationConfig:
    """Configuration for graceful truncation."""
    # Look back from truncation point to find clean break
    max_lookback_chars: int = 100

    # Prefer sentence boundary if within this many chars
    sentence_lookback_preference: int = 50

    # Minimum spoken text to preserve
    min_spoken_length: int = 10

    # Whether to generate context for next response
    generate_context: bool = True


class GracefulTruncationService:
    """
    Handles graceful truncation of AI responses during barge-in.

    Instead of cutting audio mid-word, this service finds the best
    truncation point and generates context for the next response.
    """

    def __init__(self, config: TruncationConfig = None):
        self.config = config or TruncationConfig()

    def find_truncation_point(
        self,
        full_response: str,
        characters_spoken: int,
        audio_duration_ms: int,
    ) -> TruncationResult:
        """
        Find the best truncation point for a barge-in.

        Args:
            full_response: The complete AI response text
            characters_spoken: Approximate characters spoken before barge-in
            audio_duration_ms: Duration of audio played

        Returns:
            TruncationResult with truncation details
        """
        if characters_spoken <= 0:
            return TruncationResult(
                truncation_type=TruncationType.IMMEDIATE,
                spoken_text="",
                unspoken_text=full_response,
                truncation_position=0,
                was_graceful=False,
                context_for_next_response="",
            )

        # Clamp to actual text length
        characters_spoken = min(characters_spoken, len(full_response))

        # Look for sentence boundary
        sentence_point = self._find_sentence_boundary(
            full_response,
            characters_spoken,
            self.config.sentence_lookback_preference,
        )

        if sentence_point is not None:
            return self._create_result(
                full_response,
                sentence_point,
                TruncationType.SENTENCE_BOUNDARY,
            )

        # Look for phrase boundary (comma, semicolon)
        phrase_point = self._find_phrase_boundary(
            full_response,
            characters_spoken,
            self.config.max_lookback_chars,
        )

        if phrase_point is not None:
            return self._create_result(
                full_response,
                phrase_point,
                TruncationType.PHRASE_BOUNDARY,
            )

        # Look for word boundary
        word_point = self._find_word_boundary(
            full_response,
            characters_spoken,
            min(30, self.config.max_lookback_chars),
        )

        if word_point is not None:
            return self._create_result(
                full_response,
                word_point,
                TruncationType.WORD_BOUNDARY,
            )

        # Last resort: mid-word truncation
        return self._create_result(
            full_response,
            characters_spoken,
            TruncationType.MID_WORD,
        )

    def _find_sentence_boundary(
        self,
        text: str,
        position: int,
        lookback: int,
    ) -> Optional[int]:
        """Find nearest sentence boundary before position."""
        search_start = max(0, position - lookback)
        search_text = text[search_start:position]

        # Look for sentence endings
        for i in range(len(search_text) - 1, -1, -1):
            char = search_text[i]
            if char in '.!?':
                # Make sure it's not an abbreviation
                actual_pos = search_start + i + 1
                if actual_pos >= self.config.min_spoken_length:
                    return actual_pos

        return None

    def _find_phrase_boundary(
        self,
        text: str,
        position: int,
        lookback: int,
    ) -> Optional[int]:
        """Find nearest phrase boundary before position."""
        search_start = max(0, position - lookback)
        search_text = text[search_start:position]

        for i in range(len(search_text) - 1, -1, -1):
            char = search_text[i]
            if char in ',;:':
                actual_pos = search_start + i + 1
                if actual_pos >= self.config.min_spoken_length:
                    return actual_pos

        return None

    def _find_word_boundary(
        self,
        text: str,
        position: int,
        lookback: int,
    ) -> Optional[int]:
        """Find nearest word boundary before position."""
        search_start = max(0, position - lookback)
        search_text = text[search_start:position]

        for i in range(len(search_text) - 1, -1, -1):
            if search_text[i] == ' ':
                actual_pos = search_start + i
                if actual_pos >= self.config.min_spoken_length:
                    return actual_pos

        return None

    def _create_result(
        self,
        full_response: str,
        truncation_position: int,
        truncation_type: TruncationType,
    ) -> TruncationResult:
        """Create a TruncationResult from the truncation position."""
        spoken_text = full_response[:truncation_position].strip()
        unspoken_text = full_response[truncation_position:].strip()

        # Generate context for next response
        context = ""
        if self.config.generate_context and unspoken_text:
            context = self._generate_context(spoken_text, unspoken_text, truncation_type)

        was_graceful = truncation_type in [
            TruncationType.SENTENCE_BOUNDARY,
            TruncationType.PHRASE_BOUNDARY,
        ]

        return TruncationResult(
            truncation_type=truncation_type,
            spoken_text=spoken_text,
            unspoken_text=unspoken_text,
            truncation_position=truncation_position,
            was_graceful=was_graceful,
            context_for_next_response=context,
        )

    def _generate_context(
        self,
        spoken: str,
        unspoken: str,
        truncation_type: TruncationType,
    ) -> str:
        """Generate context message for the next AI response."""
        if truncation_type == TruncationType.SENTENCE_BOUNDARY:
            return f"[Previous response was interrupted after: \"{spoken[-100:]}\" - The unspoken portion was: \"{unspoken[:100]}...\"]"

        elif truncation_type == TruncationType.PHRASE_BOUNDARY:
            return f"[Interrupted mid-thought. Said: \"{spoken[-50:]}\" - Was going to say: \"{unspoken[:50]}...\"]"

        else:
            return f"[Interrupted. Partial: \"{spoken[-30:]}...\"]"

    def generate_acknowledgment_prefix(
        self,
        truncation_result: TruncationResult,
        user_utterance: str,
    ) -> str:
        """
        Generate a natural acknowledgment for the interruption.

        Returns a phrase like "Sure, " or "Of course - " that acknowledges
        the user interrupted and transitions naturally.
        """
        user_lower = user_utterance.lower()

        # User asked us to stop
        if any(word in user_lower for word in ['stop', 'wait', 'hold on', 'pause']):
            return "Okay, I'll stop. "

        # User asked a new question
        if '?' in user_utterance:
            return "Sure, "

        # User wants to add something
        if user_lower.startswith(('actually', 'also', 'and', 'but')):
            return "Right, "

        # Generic acknowledgment
        if truncation_result.was_graceful:
            return ""  # Clean break, no acknowledgment needed
        else:
            return "Got it. "


# Singleton
graceful_truncation_service = GracefulTruncationService()
````

### 5.3 Frontend Integration

```typescript
// File: apps/web-app/src/hooks/useGracefulTruncation.ts

import { useCallback, useRef } from "react";

export interface TruncationInfo {
  truncationType: "sentence" | "phrase" | "word" | "mid_word" | "immediate";
  spokenText: string;
  unspokenText: string;
  wasGraceful: boolean;
  audioFadeMs: number;
}

export interface GracefulTruncationOptions {
  /** Duration of audio fade-out in ms */
  fadeOutDurationMs?: number;
  /** Whether to track what text was spoken */
  trackSpokenText?: boolean;
  /** Callback when truncation occurs */
  onTruncation?: (info: TruncationInfo) => void;
}

export function useGracefulTruncation(options: GracefulTruncationOptions = {}) {
  const { fadeOutDurationMs = 50, trackSpokenText = true, onTruncation } = options;

  // Track what we've spoken so far
  const spokenTextRef = useRef<string>("");
  const fullResponseRef = useRef<string>("");
  const audioStartTimeRef = useRef<number>(0);

  /**
   * Start tracking a new AI response.
   */
  const startTracking = useCallback((fullResponse: string) => {
    fullResponseRef.current = fullResponse;
    spokenTextRef.current = "";
    audioStartTimeRef.current = Date.now();
  }, []);

  /**
   * Update spoken text progress (call as audio plays).
   */
  const updateProgress = useCallback(
    (spokenText: string) => {
      if (trackSpokenText) {
        spokenTextRef.current = spokenText;
      }
    },
    [trackSpokenText],
  );

  /**
   * Estimate spoken characters based on audio duration.
   * Assumes ~15 characters per second for average speech rate.
   */
  const estimateSpokenChars = useCallback((audioDurationMs: number): number => {
    const charsPerSecond = 15;
    return Math.floor((audioDurationMs / 1000) * charsPerSecond);
  }, []);

  /**
   * Calculate truncation when barge-in occurs.
   */
  const calculateTruncation = useCallback((): TruncationInfo => {
    const fullResponse = fullResponseRef.current;
    const audioDuration = Date.now() - audioStartTimeRef.current;
    const estimatedChars = estimateSpokenChars(audioDuration);

    // Use tracked text if available, otherwise estimate
    const spokenChars = spokenTextRef.current ? spokenTextRef.current.length : estimatedChars;

    // Find best truncation point
    const truncationPoint = findBestTruncationPoint(fullResponse, spokenChars);

    const info: TruncationInfo = {
      truncationType: truncationPoint.type,
      spokenText: fullResponse.substring(0, truncationPoint.position),
      unspokenText: fullResponse.substring(truncationPoint.position),
      wasGraceful: ["sentence", "phrase"].includes(truncationPoint.type),
      audioFadeMs: fadeOutDurationMs,
    };

    onTruncation?.(info);
    return info;
  }, [estimateSpokenChars, fadeOutDurationMs, onTruncation]);

  /**
   * Reset tracking state.
   */
  const reset = useCallback(() => {
    spokenTextRef.current = "";
    fullResponseRef.current = "";
    audioStartTimeRef.current = 0;
  }, []);

  return {
    startTracking,
    updateProgress,
    calculateTruncation,
    reset,
    getCurrentSpokenText: () => spokenTextRef.current,
  };
}

/**
 * Find the best truncation point in text.
 */
function findBestTruncationPoint(
  text: string,
  approximatePosition: number,
): { position: number; type: TruncationInfo["truncationType"] } {
  const pos = Math.min(approximatePosition, text.length);

  // Look for sentence boundary (within 50 chars back)
  for (let i = pos; i > Math.max(0, pos - 50); i--) {
    if (".!?".includes(text[i])) {
      return { position: i + 1, type: "sentence" };
    }
  }

  // Look for phrase boundary (within 30 chars back)
  for (let i = pos; i > Math.max(0, pos - 30); i--) {
    if (",;:".includes(text[i])) {
      return { position: i + 1, type: "phrase" };
    }
  }

  // Look for word boundary (within 15 chars back)
  for (let i = pos; i > Math.max(0, pos - 15); i--) {
    if (text[i] === " ") {
      return { position: i, type: "word" };
    }
  }

  // Mid-word truncation
  return { position: pos, type: "mid_word" };
}
```

### 5.4 WebSocket Protocol Extensions

```typescript
// Add to existing WebSocket message types

// Server → Client: Truncation notification
interface TruncationMessage {
  type: "response.truncated";
  message_id: string;
  truncation: {
    type: "sentence" | "phrase" | "word" | "mid_word" | "immediate";
    spoken_text: string;
    unspoken_text: string;
    position: number;
    was_graceful: boolean;
  };
  // Context for next response (if user asks "continue")
  continuation_context?: string;
}

// Client → Server: Request to continue from truncation
interface ContinueMessage {
  type: "response.continue";
  message_id: string; // Original message that was truncated
}

// Server → Client: Acknowledgment of barge-in
interface BargeInAckMessage {
  type: "barge_in.acknowledged";
  fade_duration_ms: number;
  truncation_type: string;
  // What AI will prepend to next response (e.g., "Sure, ")
  acknowledgment_prefix?: string;
}
```

---

## Part 6: Comprehensive Playwright Test Suite

### 6.1 Test Architecture Overview

```
e2e/voice/
├── __config__/
│   ├── voice-test.config.ts           # Voice-specific Playwright config
│   └── audio-fixtures.config.ts       # Audio fixture management
│
├── utils/
│   ├── test-setup.ts                  # EXISTING - Enhanced
│   ├── voice-test-metrics.ts          # EXISTING - Enhanced
│   ├── transcript-scorer.ts           # NEW - Accuracy scoring
│   ├── latency-histogram.ts           # NEW - Statistical analysis
│   ├── audio-analysis.ts              # NEW - Echo/SNR detection
│   └── test-audio-injector.ts         # NEW - Audio injection helpers
│
├── fixtures/audio/
│   ├── basic/                         # Simple test audio
│   ├── scenarios/                     # Complex conversation scenarios
│   ├── edge-cases/                    # Noise, accents, whispers
│   └── validate-fixtures.sh           # Fixture validation script
│
├── core/                              # Core functionality tests
│   ├── voice-connection.spec.ts       # Connection lifecycle
│   ├── voice-basic-flow.spec.ts       # Basic conversation flow
│   └── voice-state-machine.spec.ts    # Pipeline state transitions
│
├── barge-in/                          # Barge-in specific tests
│   ├── voice-barge-in.spec.ts         # EXISTING - Enhanced
│   ├── voice-barge-in-realistic.spec.ts # EXISTING - Enhanced
│   ├── voice-barge-in-latency.spec.ts # NEW - Latency benchmarks
│   └── voice-barge-in-graceful.spec.ts # NEW - Graceful truncation
│
├── semantic-vad/                      # Semantic VAD tests
│   ├── voice-turn-detection.spec.ts   # Turn completion detection
│   ├── voice-hesitation.spec.ts       # Hesitation handling
│   └── voice-continuation.spec.ts     # Continuation signal handling
│
├── latency/                           # Latency benchmark tests
│   ├── voice-latency-benchmarks.spec.ts # Comprehensive latency suite
│   ├── voice-ttfa.spec.ts             # Time to first audio
│   └── voice-e2e-latency.spec.ts      # End-to-end latency
│
├── accuracy/                          # Transcript accuracy tests
│   ├── voice-stt-accuracy.spec.ts     # STT accuracy scoring
│   ├── voice-echo-contamination.spec.ts # Echo detection
│   └── voice-transcript-sync.spec.ts  # Transcript synchronization
│
├── edge-cases/                        # Edge case tests
│   ├── voice-background-noise.spec.ts # Noise handling
│   ├── voice-whisper.spec.ts          # Quiet speech
│   ├── voice-rapid-speech.spec.ts     # Fast talkers
│   ├── voice-accents.spec.ts          # Non-native speakers
│   └── voice-network-issues.spec.ts   # Network degradation
│
├── multi-turn/                        # Multi-turn conversation tests
│   ├── voice-multi-turn-8.spec.ts     # 8-turn conversations
│   ├── voice-context-preservation.spec.ts # Context after barge-in
│   └── voice-conversation-flow.spec.ts # Natural flow patterns
│
└── competitive/                       # Competitive parity tests
    ├── voice-chatgpt-parity.spec.ts   # Feature parity checks
    └── voice-benchmark-comparison.spec.ts # Performance comparison
```

> **Reality Check – Current Repo Alignment**
>
> The VoiceAssist repo already contains many of these tests and utilities (often under `e2e/voice/`, `e2e/ai/`, and `e2e/voice/utils/`). When implementing or extending tests from this plan:
>
> - **Do NOT create parallel directories** – extend existing specs in `e2e/voice`, `e2e/ai`, and helpers in `e2e/voice/utils/`.
> - Use the **unified Chat-with-Voice UI** as the only entrypoint:
>   - Home tile: `data-testid="chat-with-voice-card"` → `/chat?mode=voice`
>   - Unified chat container: `data-testid="unified-chat-container"`
> - Use the **Thinker/Talker voice UI** as the canonical voice surface:
>   - Toggle button: `data-testid="voice-mode-toggle"`
>   - Panel container: `data-testid="voice-mode-panel"` / `data-testid="thinker-talker-voice-panel"`
>   - Compact bar + mic: `data-testid="compact-voice-bar"`, `data-testid="compact-mic-button"`
> - Reuse shared helpers instead of ad‑hoc selectors:
>   - `e2e/voice/utils/test-setup.ts` (`waitForVoiceModeReady`, `openVoiceMode`, `enableAllVoiceFeatures`)
>   - `e2e/fixtures/voice.ts` (`VOICE_SELECTORS.*`) for panel, toggle, start/stop, settings, transcript, and error states.
> - All new barge‑in / latency tests should assume the **Thinker/Talker pipeline** over `/api/voice/pipeline-ws` (documented in `VOICE_MODE_PIPELINE.md` and `THINKER_TALKER_PIPELINE.md`) and rely on its debug surfaces (`window.__tt_ws_events`, `window.__tt_audio_debug`, `window.__voiceModeDebug`) rather than legacy OpenAI Realtime endpoints.
>
> **IMPORTANT: Robust Navigation & Login Handling**
>
> The React app uses client-side auth routing, which means the login form can appear at any URL (including `/chat`) when auth tokens are invalid or expired. **Never use raw `page.goto("/chat")`** in tests. Instead, always use the robust navigation helpers from `e2e/fixtures/voice.ts`:
>
> ```typescript
> import { navigateToVoiceChat, ensureLoggedIn, VOICE_SELECTORS } from "../fixtures/voice";
>
> test("my voice test", async ({ page }) => {
>   // Use navigateToVoiceChat instead of page.goto
>   await navigateToVoiceChat(page);
>
>   // Voice button is now guaranteed to be visible
>   await page.locator(VOICE_SELECTORS.toggleButton).click();
>   // ... rest of test
> });
> ```
>
> The `navigateToVoiceChat(page)` function:
> - Goes to homepage and clicks `chat-with-voice-card`
> - Handles login if needed (detects login form by element presence, not URL)
> - Retries navigation up to 3 times to handle race conditions
> - Waits for voice toggle button to be visible before returning
>
> For tests that need login in other contexts, use `ensureLoggedIn(page)` directly.

### 6.2 Enhanced Statistical Testing Framework

```typescript
// File: e2e/voice/utils/latency-histogram.ts

export interface HistogramBucket {
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number; // P50
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  stdDev: number;
  histogram: HistogramBucket[];
}

export class LatencyHistogram {
  private samples: number[] = [];
  private name: string;
  private bucketSize: number;

  constructor(name: string, bucketSize: number = 50) {
    this.name = name;
    this.bucketSize = bucketSize;
  }

  addSample(latencyMs: number): void {
    this.samples.push(latencyMs);
  }

  addSamples(latencies: number[]): void {
    this.samples.push(...latencies);
  }

  getStats(): LatencyStats {
    if (this.samples.length === 0) {
      return this.emptyStats();
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean: this.mean(sorted),
      median: this.percentile(sorted, 50),
      p75: this.percentile(sorted, 75),
      p90: this.percentile(sorted, 90),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
      stdDev: this.stdDev(sorted),
      histogram: this.buildHistogram(sorted),
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private mean(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private stdDev(values: number[]): number {
    const avg = this.mean(values);
    const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  private buildHistogram(sorted: number[]): HistogramBucket[] {
    const buckets: Map<number, number> = new Map();
    const total = sorted.length;

    for (const sample of sorted) {
      const bucketKey = Math.floor(sample / this.bucketSize) * this.bucketSize;
      buckets.set(bucketKey, (buckets.get(bucketKey) || 0) + 1);
    }

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([min, count]) => ({
        min,
        max: min + this.bucketSize,
        count,
        percentage: (count / total) * 100,
      }));
  }

  private emptyStats(): LatencyStats {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      stdDev: 0,
      histogram: [],
    };
  }

  /**
   * Format stats as ASCII histogram for test output
   */
  formatHistogram(maxWidth: number = 40): string {
    const stats = this.getStats();
    const lines: string[] = [
      `=== ${this.name} Latency Histogram ===`,
      `Samples: ${stats.count}`,
      `Range: ${stats.min}ms - ${stats.max}ms`,
      `Mean: ${stats.mean.toFixed(1)}ms, StdDev: ${stats.stdDev.toFixed(1)}ms`,
      `P50: ${stats.median}ms, P90: ${stats.p90}ms, P99: ${stats.p99}ms`,
      "",
    ];

    const maxCount = Math.max(...stats.histogram.map((b) => b.count));

    for (const bucket of stats.histogram) {
      const barLength = Math.round((bucket.count / maxCount) * maxWidth);
      const bar = "█".repeat(barLength);
      const label = `${bucket.min}-${bucket.max}ms`.padStart(12);
      const count = `(${bucket.count})`.padStart(6);
      const pct = `${bucket.percentage.toFixed(1)}%`.padStart(6);
      lines.push(`${label} ${bar} ${count} ${pct}`);
    }

    return lines.join("\n");
  }

  /**
   * Assert latency targets are met
   */
  assertTargets(targets: { p50?: number; p90?: number; p99?: number; max?: number }): {
    pass: boolean;
    failures: string[];
  } {
    const stats = this.getStats();
    const failures: string[] = [];

    if (targets.p50 !== undefined && stats.median > targets.p50) {
      failures.push(`P50 ${stats.median}ms > target ${targets.p50}ms`);
    }
    if (targets.p90 !== undefined && stats.p90 > targets.p90) {
      failures.push(`P90 ${stats.p90}ms > target ${targets.p90}ms`);
    }
    if (targets.p99 !== undefined && stats.p99 > targets.p99) {
      failures.push(`P99 ${stats.p99}ms > target ${targets.p99}ms`);
    }
    if (targets.max !== undefined && stats.max > targets.max) {
      failures.push(`Max ${stats.max}ms > target ${targets.max}ms`);
    }

    return { pass: failures.length === 0, failures };
  }

  toJSON(): object {
    return {
      name: this.name,
      ...this.getStats(),
    };
  }
}
```

### 6.3 Transcript Accuracy Scoring

```typescript
// File: e2e/voice/utils/transcript-scorer.ts

export interface AccuracyScore {
  characterAccuracy: number; // Levenshtein-based (0-1)
  wordAccuracy: number; // Word-level matching (0-1)
  semanticSimilarity: number; // Meaning preservation (0-1)
  overallScore: number; // Weighted combination
  details: {
    expectedLength: number;
    actualLength: number;
    editDistance: number;
    matchedWords: number;
    totalWords: number;
    insertions: number;
    deletions: number;
    substitutions: number;
  };
}

export interface EchoContaminationResult {
  detected: boolean;
  confidence: number;
  contaminatedWords: string[];
  cleanTranscript: string;
}

export class TranscriptScorer {
  /**
   * Calculate comprehensive accuracy score
   */
  score(expected: string, actual: string): AccuracyScore {
    const charAccuracy = this.levenshteinAccuracy(expected, actual);
    const wordAccuracy = this.wordLevelAccuracy(expected, actual);
    const semanticSim = this.semanticSimilarity(expected, actual);
    const editDetails = this.editDistanceDetails(expected, actual);

    // Weighted combination
    const overallScore = charAccuracy * 0.3 + wordAccuracy * 0.4 + semanticSim * 0.3;

    return {
      characterAccuracy: charAccuracy,
      wordAccuracy: wordAccuracy,
      semanticSimilarity: semanticSim,
      overallScore,
      details: {
        expectedLength: expected.length,
        actualLength: actual.length,
        editDistance: editDetails.distance,
        matchedWords: editDetails.matchedWords,
        totalWords: editDetails.totalWords,
        insertions: editDetails.insertions,
        deletions: editDetails.deletions,
        substitutions: editDetails.substitutions,
      },
    };
  }

  /**
   * Detect if AI speech has leaked into user transcript
   */
  detectEchoContamination(
    userTranscript: string,
    aiKeywords: string[],
    aiFullResponse?: string,
  ): EchoContaminationResult {
    const userWords = userTranscript.toLowerCase().split(/\s+/);
    const contaminatedWords: string[] = [];

    // Check for AI keywords in user transcript
    for (const keyword of aiKeywords) {
      const keywordLower = keyword.toLowerCase();
      for (const userWord of userWords) {
        // Fuzzy match (might be slightly garbled)
        if (this.fuzzyMatch(userWord, keywordLower, 0.8)) {
          contaminatedWords.push(keyword);
        }
      }
    }

    // Check for phrases from AI response
    if (aiFullResponse) {
      const aiPhrases = this.extractPhrases(aiFullResponse, 3); // 3-word phrases
      for (const phrase of aiPhrases) {
        if (userTranscript.toLowerCase().includes(phrase.toLowerCase())) {
          contaminatedWords.push(`[phrase: ${phrase}]`);
        }
      }
    }

    const confidence =
      contaminatedWords.length > 0
        ? Math.min(1, contaminatedWords.length / 3) // Cap at 1.0
        : 0;

    // Generate clean transcript by removing contaminated words
    let cleanTranscript = userTranscript;
    for (const word of contaminatedWords) {
      if (!word.startsWith("[phrase:")) {
        cleanTranscript = cleanTranscript.replace(new RegExp(word, "gi"), "").trim();
      }
    }

    return {
      detected: contaminatedWords.length > 0,
      confidence,
      contaminatedWords,
      cleanTranscript: cleanTranscript.replace(/\s+/g, " ").trim(),
    };
  }

  private levenshteinAccuracy(expected: string, actual: string): number {
    const e = expected.toLowerCase().trim();
    const a = actual.toLowerCase().trim();

    if (e.length === 0 && a.length === 0) return 1;
    if (e.length === 0 || a.length === 0) return 0;

    const distance = this.levenshteinDistance(e, a);
    return 1 - distance / Math.max(e.length, a.length);
  }

  private wordLevelAccuracy(expected: string, actual: string): number {
    const expectedWords = new Set(
      expected
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
    const actualWords = new Set(
      actual
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );

    if (expectedWords.size === 0) return actualWords.size === 0 ? 1 : 0;

    let matches = 0;
    for (const word of expectedWords) {
      if (actualWords.has(word)) matches++;
    }

    return matches / expectedWords.size;
  }

  private semanticSimilarity(expected: string, actual: string): number {
    // Simplified semantic similarity using key concept matching
    const expectedConcepts = this.extractKeyConcepts(expected);
    const actualConcepts = this.extractKeyConcepts(actual);

    if (expectedConcepts.length === 0) return actualConcepts.length === 0 ? 1 : 0;

    let matches = 0;
    for (const concept of expectedConcepts) {
      if (actualConcepts.some((c) => this.fuzzyMatch(c, concept, 0.8))) {
        matches++;
      }
    }

    return matches / expectedConcepts.length;
  }

  private extractKeyConcepts(text: string): string[] {
    // Extract nouns, verbs, and important words
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "can",
      "to",
      "of",
      "in",
      "for",
      "on",
      "with",
      "at",
      "by",
      "from",
      "as",
      "or",
      "and",
      "but",
      "if",
      "then",
      "so",
      "what",
      "which",
      "who",
      "when",
      "where",
      "why",
      "how",
      "this",
      "that",
      "these",
      "those",
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they",
      "me",
      "him",
      "her",
      "us",
      "them",
      "my",
      "your",
      "his",
      "its",
      "our",
      "their",
    ]);

    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .slice(0, 10); // Top 10 concepts
  }

  private extractPhrases(text: string, wordCount: number): string[] {
    const words = text.split(/\s+/);
    const phrases: string[] = [];

    for (let i = 0; i <= words.length - wordCount; i++) {
      phrases.push(words.slice(i, i + wordCount).join(" "));
    }

    return phrases;
  }

  private fuzzyMatch(a: string, b: string, threshold: number): boolean {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 3) return false;

    const distance = this.levenshteinDistance(a, b);
    const similarity = 1 - distance / Math.max(a.length, b.length);
    return similarity >= threshold;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  private editDistanceDetails(
    s1: string,
    s2: string,
  ): {
    distance: number;
    matchedWords: number;
    totalWords: number;
    insertions: number;
    deletions: number;
    substitutions: number;
  } {
    const words1 = s1.toLowerCase().split(/\s+/);
    const words2 = s2.toLowerCase().split(/\s+/);

    // Simple word-level comparison
    const set1 = new Set(words1);
    const set2 = new Set(words2);

    let matchedWords = 0;
    for (const w of set1) {
      if (set2.has(w)) matchedWords++;
    }

    return {
      distance: this.levenshteinDistance(s1.toLowerCase(), s2.toLowerCase()),
      matchedWords,
      totalWords: set1.size,
      insertions: Array.from(set2).filter((w) => !set1.has(w)).length,
      deletions: Array.from(set1).filter((w) => !set2.has(w)).length,
      substitutions: 0, // Complex to calculate accurately
    };
  }
}

// Singleton for tests
export const transcriptScorer = new TranscriptScorer();
```

### 6.4 Comprehensive Latency Benchmark Test

```typescript
// File: e2e/voice/latency/voice-latency-benchmarks.spec.ts

import { test, expect } from "@playwright/test";
import { navigateToVoiceChat, VOICE_SELECTORS } from "../../fixtures/voice";
import { LatencyHistogram } from "../utils/latency-histogram";
import { createMetricsCollector } from "../utils/voice-test-metrics";

// Latency targets (in milliseconds)
const LATENCY_TARGETS = {
  bargeIn: {
    p50: 150,
    p90: 250,
    p99: 400,
    description: "Time from VAD speech detection to audio mute",
  },
  ttfa: {
    p50: 800,
    p90: 1500,
    p99: 2500,
    description: "Time To First Audio after user finishes speaking",
  },
  e2e: {
    p50: 1200,
    p90: 2000,
    p99: 3500,
    description: "End-to-end from user speech end to AI first word",
  },
};

const SAMPLE_COUNT = 15;
const WARMUP_COUNT = 3;

test.describe("Voice Mode Latency Benchmarks", () => {
  const bargeInHistogram = new LatencyHistogram("Barge-in", 25);
  const ttfaHistogram = new LatencyHistogram("TTFA", 100);
  const e2eHistogram = new LatencyHistogram("End-to-End", 100);

  test.beforeAll(async () => {
    console.log("=== Starting Latency Benchmark Suite ===");
    console.log(`Samples per test: ${SAMPLE_COUNT} (+ ${WARMUP_COUNT} warmup)`);
    console.log("Targets:");
    for (const [name, target] of Object.entries(LATENCY_TARGETS)) {
      console.log(`  ${name}: P50<${target.p50}ms, P90<${target.p90}ms, P99<${target.p99}ms`);
    }
  });

  test("measure barge-in latency distribution", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("voiceassist-force-silero-vad", "true");
      localStorage.setItem("voiceassist-force-instant-barge-in", "true");
    });

    // Use navigateToVoiceChat for robust login handling
    await navigateToVoiceChat(page);

    const metrics = createMetricsCollector(page);

    // Warmup runs
    for (let i = 0; i < WARMUP_COUNT; i++) {
      await measureBargeInLatency(page, metrics, `warmup-${i}`);
      await page.waitForTimeout(1000);
    }

    // Actual measurements
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const latency = await measureBargeInLatency(page, metrics, `sample-${i}`);
      if (latency > 0) {
        bargeInHistogram.addSample(latency);
      }
      await page.waitForTimeout(500);
    }

    // Output results
    console.log("\n" + bargeInHistogram.formatHistogram());

    // Assert targets
    const result = bargeInHistogram.assertTargets(LATENCY_TARGETS.bargeIn);
    if (!result.pass) {
      console.error("Barge-in latency targets FAILED:", result.failures);
    }
    expect(result.pass).toBe(true);
  });

  test("measure TTFA (Time to First Audio) distribution", async ({ page }) => {
    // Use navigateToVoiceChat for robust login handling
    await navigateToVoiceChat(page);

    const metrics = createMetricsCollector(page);

    // Warmup
    for (let i = 0; i < WARMUP_COUNT; i++) {
      await measureTTFA(page, metrics, `warmup-${i}`);
      await page.waitForTimeout(1000);
    }

    // Measurements
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const latency = await measureTTFA(page, metrics, `sample-${i}`);
      if (latency > 0) {
        ttfaHistogram.addSample(latency);
      }
      await page.waitForTimeout(500);
    }

    console.log("\n" + ttfaHistogram.formatHistogram());

    const result = ttfaHistogram.assertTargets(LATENCY_TARGETS.ttfa);
    if (!result.pass) {
      console.error("TTFA targets FAILED:", result.failures);
    }
    expect(result.pass).toBe(true);
  });

  test("measure end-to-end latency distribution", async ({ page }) => {
    // Use navigateToVoiceChat for robust login handling
    await navigateToVoiceChat(page);

    const metrics = createMetricsCollector(page);

    // Warmup
    for (let i = 0; i < WARMUP_COUNT; i++) {
      await measureE2ELatency(page, metrics, `warmup-${i}`);
      await page.waitForTimeout(1500);
    }

    // Measurements
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const latency = await measureE2ELatency(page, metrics, `sample-${i}`);
      if (latency > 0) {
        e2eHistogram.addSample(latency);
      }
      await page.waitForTimeout(1000);
    }

    console.log("\n" + e2eHistogram.formatHistogram());

    const result = e2eHistogram.assertTargets(LATENCY_TARGETS.e2e);
    if (!result.pass) {
      console.error("E2E latency targets FAILED:", result.failures);
    }
    expect(result.pass).toBe(true);
  });

  test.afterAll(() => {
    console.log("\n=== LATENCY BENCHMARK SUMMARY ===");
    console.log(
      JSON.stringify(
        {
          bargeIn: bargeInHistogram.toJSON(),
          ttfa: ttfaHistogram.toJSON(),
          e2e: e2eHistogram.toJSON(),
        },
        null,
        2,
      ),
    );
  });
});

async function measureBargeInLatency(page, metrics, label: string): Promise<number> {
  // Implementation: Trigger AI response, wait for playback, inject barge-in audio,
  // measure time from VAD detection to audio mute
  // Returns latency in ms, or -1 if measurement failed
  return -1; // Placeholder
}

async function measureTTFA(page, metrics, label: string): Promise<number> {
  // Implementation: Inject user audio, measure time from speech end to first audio chunk
  return -1; // Placeholder
}

async function measureE2ELatency(page, metrics, label: string): Promise<number> {
  // Implementation: Inject user audio, measure time to AI first spoken word audible
  return -1; // Placeholder
}
```

### 6.5 Semantic VAD Turn Detection Tests

```typescript
// File: e2e/voice/semantic-vad/voice-turn-detection.spec.ts

import { test, expect } from "../utils/test-setup";

interface TurnDetectionTestCase {
  name: string;
  audioFile: string;
  transcriptContent: string;
  expectedBehavior: "respond_quickly" | "wait_for_more" | "prompt_continuation";
  minWaitMs: number;
  maxWaitMs: number;
  turnSignals: string[]; // Expected signals to be detected
}

const TURN_DETECTION_CASES: TurnDetectionTestCase[] = [
  // === SHOULD RESPOND QUICKLY ===
  {
    name: "Direct question with question mark",
    audioFile: "fixtures/audio/scenarios/direct-question.wav",
    transcriptContent: "What is the weather today?",
    expectedBehavior: "respond_quickly",
    minWaitMs: 200,
    maxWaitMs: 800,
    turnSignals: ["question_ending"],
  },
  {
    name: "Short command",
    audioFile: "fixtures/audio/scenarios/short-command.wav",
    transcriptContent: "Stop",
    expectedBehavior: "respond_quickly",
    minWaitMs: 100,
    maxWaitMs: 500,
    turnSignals: ["command:stop"],
  },
  {
    name: "Acknowledgment",
    audioFile: "fixtures/audio/scenarios/acknowledgment.wav",
    transcriptContent: "Thanks",
    expectedBehavior: "respond_quickly",
    minWaitMs: 200,
    maxWaitMs: 800,
    turnSignals: ["acknowledgment:thanks"],
  },

  // === SHOULD WAIT FOR MORE ===
  {
    name: 'Hesitation with "um"',
    audioFile: "fixtures/audio/scenarios/hesitation-um.wav",
    transcriptContent: "I want to know about, um",
    expectedBehavior: "wait_for_more",
    minWaitMs: 2000,
    maxWaitMs: 5000,
    turnSignals: ["hesitation:um"],
  },
  {
    name: 'Trailing conjunction "and"',
    audioFile: "fixtures/audio/scenarios/trailing-and.wav",
    transcriptContent: "Tell me about the weather and",
    expectedBehavior: "wait_for_more",
    minWaitMs: 1500,
    maxWaitMs: 4000,
    turnSignals: ["conjunction:and"],
  },
  {
    name: "Incomplete sentence pattern",
    audioFile: "fixtures/audio/scenarios/incomplete-sentence.wav",
    transcriptContent: "Can you",
    expectedBehavior: "wait_for_more",
    minWaitMs: 1500,
    maxWaitMs: 4000,
    turnSignals: ["incomplete_pattern"],
  },
  {
    name: "Mid-thought pause",
    audioFile: "fixtures/audio/scenarios/mid-thought-pause.wav",
    transcriptContent: "The thing I really want to ask about is,",
    expectedBehavior: "wait_for_more",
    minWaitMs: 1500,
    maxWaitMs: 4000,
    turnSignals: ["trailing_punctuation"],
  },

  // === COMPLEX CASES ===
  {
    name: "Question followed by hesitation",
    audioFile: "fixtures/audio/scenarios/question-then-hesitation.wav",
    transcriptContent: "What is the capital of, um, you know",
    expectedBehavior: "wait_for_more",
    minWaitMs: 2000,
    maxWaitMs: 5000,
    turnSignals: ["hesitation:um", "continuation:you know"],
  },
  {
    name: "Complete statement with period",
    audioFile: "fixtures/audio/scenarios/complete-statement.wav",
    transcriptContent: "I need help with my calendar.",
    expectedBehavior: "respond_quickly",
    minWaitMs: 300,
    maxWaitMs: 1000,
    turnSignals: ["statement_ending"],
  },
];

test.describe("Semantic VAD Turn Detection", () => {
  for (const testCase of TURN_DETECTION_CASES) {
    test(testCase.name, async ({ page }) => {
      // Use navigateToVoiceChat for robust login handling
      await navigateToVoiceChat(page);

      // Enable semantic VAD
      await page.evaluate(() => {
        localStorage.setItem("voiceassist-semantic-vad-enabled", "true");
      });

      // Connect voice mode
      await connectVoiceMode(page);

      // Inject test audio
      const speechEndTime = await injectAudioAndWaitForTranscript(page, testCase.audioFile, testCase.transcriptContent);

      // Wait and observe AI behavior
      const aiResponseTime = await waitForAIResponse(page, testCase.maxWaitMs + 2000);
      const waitDuration = aiResponseTime - speechEndTime;

      console.log(`[${testCase.name}] Wait duration: ${waitDuration}ms`);
      console.log(`  Expected: ${testCase.minWaitMs}-${testCase.maxWaitMs}ms`);
      console.log(`  Behavior: ${testCase.expectedBehavior}`);

      // Verify behavior matches expectation
      if (testCase.expectedBehavior === "respond_quickly") {
        expect(waitDuration).toBeLessThanOrEqual(testCase.maxWaitMs);
        expect(waitDuration).toBeGreaterThanOrEqual(testCase.minWaitMs);
      } else if (testCase.expectedBehavior === "wait_for_more") {
        expect(waitDuration).toBeGreaterThanOrEqual(testCase.minWaitMs);
      }

      // Verify detected signals (if we have debug access)
      const detectedSignals = await page.evaluate(() => {
        return (window as any).__semanticVADSignals || [];
      });

      for (const expectedSignal of testCase.turnSignals) {
        const found = detectedSignals.some((s: string) => s.toLowerCase().includes(expectedSignal.toLowerCase()));
        if (!found) {
          console.warn(`Expected signal not detected: ${expectedSignal}`);
        }
      }
    });
  }
});

// Helper functions (to be implemented)
async function connectVoiceMode(page): Promise<void> {}
async function injectAudioAndWaitForTranscript(page, audioFile: string, expectedText: string): Promise<number> {
  return Date.now();
}
async function waitForAIResponse(page, timeoutMs: number): Promise<number> {
  return Date.now();
}
```

### 6.6 Edge Case Tests

```typescript
// File: e2e/voice/edge-cases/voice-edge-cases.spec.ts

import { test, expect } from "../utils/test-setup";
import { transcriptScorer } from "../utils/transcript-scorer";

test.describe("Voice Mode Edge Cases", () => {
  test.describe("Background Noise Handling", () => {
    test("cafe noise at 20dB SNR - should transcribe accurately", async ({ page }) => {
      const expected = "What is the weather forecast for tomorrow?";
      const actual = await runTranscriptionTest(page, "fixtures/audio/edge-cases/cafe-noise-20db.wav");

      const score = transcriptScorer.score(expected, actual);
      console.log(`[Cafe Noise] Accuracy: ${(score.overallScore * 100).toFixed(1)}%`);

      expect(score.wordAccuracy).toBeGreaterThan(0.8);
    });

    test("traffic noise at 15dB SNR - should transcribe with >70% accuracy", async ({ page }) => {
      const expected = "Can you help me find a restaurant nearby?";
      const actual = await runTranscriptionTest(page, "fixtures/audio/edge-cases/traffic-noise-15db.wav");

      const score = transcriptScorer.score(expected, actual);
      expect(score.wordAccuracy).toBeGreaterThan(0.7);
    });

    test("white noise at 10dB SNR - graceful degradation", async ({ page }) => {
      const expected = "Hello";
      const actual = await runTranscriptionTest(page, "fixtures/audio/edge-cases/white-noise-10db.wav");

      const score = transcriptScorer.score(expected, actual);
      // At very low SNR, just check we got something
      expect(actual.length).toBeGreaterThan(0);
    });
  });

  test.describe("Speech Rate Variations", () => {
    test("rapid speech (180 WPM) - should capture main content", async ({ page }) => {
      const expected = "Please schedule a meeting for tomorrow at three pm with the engineering team";
      const actual = await runTranscriptionTest(page, "fixtures/audio/edge-cases/rapid-speech-180wpm.wav");

      const score = transcriptScorer.score(expected, actual);
      console.log(`[Rapid Speech] Accuracy: ${(score.overallScore * 100).toFixed(1)}%`);

      expect(score.wordAccuracy).toBeGreaterThan(0.75);
    });

    test("slow speech (80 WPM) - should not timeout", async ({ page }) => {
      const expected = "I would like to know more about your services";
      const actual = await runTranscriptionTest(page, "fixtures/audio/edge-cases/slow-speech-80wpm.wav", {
        timeout: 30000,
      });

      const score = transcriptScorer.score(expected, actual);
      expect(score.wordAccuracy).toBeGreaterThan(0.9);
    });
  });

  test.describe("Whispered and Quiet Speech", () => {
    test('whispered command "stop" - should trigger barge-in', async ({ page }) => {
      await setupVoiceModeWithPlayback(page);

      // Inject whispered "stop"
      await injectAudio(page, "fixtures/audio/edge-cases/whispered-stop.wav");

      // Verify barge-in occurred
      const bargeInOccurred = await waitForBargeIn(page, 3000);
      expect(bargeInOccurred).toBe(true);
    });

    test("quiet speech at -20dB - should still transcribe", async ({ page }) => {
      const expected = "Help me please";
      const actual = await runTranscriptionTest(page, "fixtures/audio/edge-cases/quiet-speech-minus20db.wav");

      expect(actual.length).toBeGreaterThan(0);
      // Lower accuracy threshold for quiet speech
      const score = transcriptScorer.score(expected, actual);
      expect(score.wordAccuracy).toBeGreaterThan(0.5);
    });
  });

  test.describe("Accent Variations", () => {
    const ACCENT_TEST_CASES = [
      {
        accent: "british",
        file: "british-accent.wav",
        expected: "Could you please help me find the nearest tube station?",
      },
      { accent: "indian", file: "indian-accent.wav", expected: "What is the current status of my order?" },
      { accent: "spanish", file: "spanish-accent.wav", expected: "How do I change my account settings?" },
      { accent: "chinese", file: "chinese-accent.wav", expected: "Can you translate this document for me?" },
    ];

    for (const { accent, file, expected } of ACCENT_TEST_CASES) {
      test(`${accent} accent - should achieve >70% accuracy`, async ({ page }) => {
        const actual = await runTranscriptionTest(page, `fixtures/audio/edge-cases/${file}`);

        const score = transcriptScorer.score(expected, actual);
        console.log(`[${accent} accent] Accuracy: ${(score.overallScore * 100).toFixed(1)}%`);

        expect(score.wordAccuracy).toBeGreaterThan(0.7);
      });
    }
  });

  test.describe("Long Input Handling", () => {
    test("60-second continuous speech - should capture complete transcript", async ({ page }) => {
      const actual = await runTranscriptionTest(page, "fixtures/audio/edge-cases/long-speech-60s.wav", {
        timeout: 90000,
      });

      // Verify we got substantial content
      const wordCount = actual.split(/\s+/).length;
      console.log(`[Long Speech] Captured ${wordCount} words`);

      expect(wordCount).toBeGreaterThan(100); // ~100 words per minute
    });
  });

  test.describe("Network Resilience", () => {
    test("network latency spike (500ms) - should recover gracefully", async ({ page, context }) => {
      // Use navigateToVoiceChat for robust login handling
      await navigateToVoiceChat(page);

      // Add network latency
      await context.route("**/*", async (route) => {
        await new Promise((r) => setTimeout(r, 500));
        await route.continue();
      });

      // Voice mode should still work
      const connected = await connectVoiceMode(page, { timeout: 15000 });
      expect(connected).toBe(true);
    });

    test("packet loss (10%) - should maintain conversation", async ({ page }) => {
      // Simulate packet loss by dropping some WebSocket messages
      // (Implementation depends on test infrastructure)
    });
  });

  test.describe("Browser Tab Behavior", () => {
    test("tab hidden during playback - audio should pause or continue gracefully", async ({ page }) => {
      await setupVoiceModeWithPlayback(page);

      // Hide tab
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { value: true, writable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Wait a moment
      await page.waitForTimeout(2000);

      // Verify no errors occurred
      const errors = await page.evaluate(() => (window as any).__voiceErrors || []);
      expect(errors.length).toBe(0);
    });
  });
});

// Helper functions (to be implemented)
async function runTranscriptionTest(page, audioFile: string, options?: { timeout?: number }): Promise<string> {
  return "";
}
async function setupVoiceModeWithPlayback(page): Promise<void> {}
async function injectAudio(page, audioFile: string): Promise<void> {}
async function waitForBargeIn(page, timeoutMs: number): Promise<boolean> {
  return false;
}
async function connectVoiceMode(page, options?: { timeout?: number }): Promise<boolean> {
  return false;
}
```

### 6.7 Multi-Turn Conversation Tests

```typescript
// File: e2e/voice/multi-turn/voice-multi-turn-8.spec.ts

import { test, expect } from "../utils/test-setup";

interface ConversationTurn {
  role: "user" | "ai";
  content: string;
  action: "speak" | "wait" | "barge_in";
  expectedKeywords?: string[];
  verifyContext?: boolean;
}

const EIGHT_TURN_CONVERSATION: ConversationTurn[] = [
  // Turn 1: User greeting
  { role: "user", content: "Hello, can you help me plan a trip?", action: "speak" },
  // Turn 2: AI responds (wait for full response)
  { role: "ai", content: "", action: "wait", expectedKeywords: ["help", "trip", "travel"] },
  // Turn 3: User specifies destination
  { role: "user", content: "I want to visit Paris in the spring", action: "speak" },
  // Turn 4: AI provides info (user will barge in)
  { role: "ai", content: "", action: "barge_in", expectedKeywords: ["Paris", "spring"] },
  // Turn 5: User interrupts to change topic
  { role: "user", content: "Actually wait, what about Tokyo instead?", action: "speak" },
  // Turn 6: AI pivots to Tokyo (verify context preservation)
  { role: "ai", content: "", action: "wait", expectedKeywords: ["Tokyo"], verifyContext: true },
  // Turn 7: User asks specific question
  { role: "user", content: "What are the best neighborhoods to stay in?", action: "speak" },
  // Turn 8: AI provides detailed answer
  { role: "ai", content: "", action: "wait", expectedKeywords: ["neighborhood", "stay", "area"] },
];

test.describe("Multi-Turn Conversation Tests", () => {
  test("8-turn conversation with context preservation after barge-in", async ({ page }) => {
    // Use navigateToVoiceChat for robust login handling
    await navigateToVoiceChat(page);
    await connectVoiceMode(page);

    const conversationLog: Array<{
      turn: number;
      role: string;
      content: string;
      latencyMs: number;
      bargedIn?: boolean;
    }> = [];

    for (let i = 0; i < EIGHT_TURN_CONVERSATION.length; i++) {
      const turn = EIGHT_TURN_CONVERSATION[i];
      const turnStart = Date.now();

      console.log(`\n[Turn ${i + 1}] ${turn.role}: ${turn.action}`);

      if (turn.role === "user") {
        // Inject user audio
        const transcript = await speakAndGetTranscript(page, turn.content);
        conversationLog.push({
          turn: i + 1,
          role: "user",
          content: transcript,
          latencyMs: Date.now() - turnStart,
        });
      } else {
        // Wait for AI response
        let aiResponse: string;
        let bargedIn = false;

        if (turn.action === "barge_in") {
          // Wait for AI to start, then barge in
          await waitForAISpeaking(page);
          await page.waitForTimeout(2000); // Let AI speak for 2 seconds
          await triggerBargeIn(page);
          bargedIn = true;
          aiResponse = await getPartialAIResponse(page);
        } else {
          aiResponse = await waitForAIResponseComplete(page);
        }

        conversationLog.push({
          turn: i + 1,
          role: "ai",
          content: aiResponse,
          latencyMs: Date.now() - turnStart,
          bargedIn,
        });

        // Verify expected keywords
        if (turn.expectedKeywords) {
          for (const keyword of turn.expectedKeywords) {
            const found = aiResponse.toLowerCase().includes(keyword.toLowerCase());
            console.log(`  Keyword "${keyword}": ${found ? "FOUND" : "MISSING"}`);
          }
        }

        // Verify context preservation
        if (turn.verifyContext) {
          // AI should acknowledge the topic change
          const contextPreserved =
            aiResponse.toLowerCase().includes("tokyo") ||
            aiResponse.toLowerCase().includes("instead") ||
            aiResponse.toLowerCase().includes("change");

          console.log(`  Context preserved: ${contextPreserved}`);
          expect(contextPreserved).toBe(true);
        }
      }
    }

    // Summary
    console.log("\n=== CONVERSATION SUMMARY ===");
    console.log(`Total turns: ${conversationLog.length}`);

    const userTurns = conversationLog.filter((t) => t.role === "user");
    const aiTurns = conversationLog.filter((t) => t.role === "ai");
    const bargeIns = conversationLog.filter((t) => t.bargedIn).length;

    console.log(`User turns: ${userTurns.length}`);
    console.log(`AI turns: ${aiTurns.length}`);
    console.log(`Barge-ins: ${bargeIns}`);
    console.log(
      `Avg user latency: ${(userTurns.reduce((s, t) => s + t.latencyMs, 0) / userTurns.length).toFixed(0)}ms`,
    );
    console.log(`Avg AI latency: ${(aiTurns.reduce((s, t) => s + t.latencyMs, 0) / aiTurns.length).toFixed(0)}ms`);

    // Verify conversation completed
    expect(conversationLog.length).toBe(EIGHT_TURN_CONVERSATION.length);
  });

  test("rapid conversation - user responds within 500ms of AI finishing", async ({ page }) => {
    // Test natural conversation flow where user responds quickly
  });

  test("conversation with multiple barge-ins - context maintained", async ({ page }) => {
    // Test that context is preserved across multiple interruptions
  });
});

// Helper functions (to be implemented)
async function connectVoiceMode(page): Promise<void> {}
async function speakAndGetTranscript(page, text: string): Promise<string> {
  return text;
}
async function waitForAISpeaking(page): Promise<void> {}
async function triggerBargeIn(page): Promise<void> {}
async function getPartialAIResponse(page): Promise<string> {
  return "";
}
async function waitForAIResponseComplete(page): Promise<string> {
  return "";
}
```

---

## Part 7: Implementation Roadmap

### 7.1 Phase 1: Foundation (Week 1-2)

**Goal:** Establish latency baselines and basic Semantic VAD

| Task                                 | Priority | Effort | Dependencies |
| ------------------------------------ | -------- | ------ | ------------ |
| Create latency benchmark test suite  | HIGH     | 2 days | None         |
| Implement LatencyHistogram utility   | HIGH     | 1 day  | None         |
| Implement TranscriptScorer utility   | HIGH     | 1 day  | None         |
| Create audio fixtures for edge cases | MEDIUM   | 2 days | None         |
| Implement basic SemanticTurnAnalyzer | HIGH     | 3 days | None         |
| Add semantic VAD feature flags       | HIGH     | 1 day  | None         |

**Deliverables:**

- [ ] Latency baseline documented (P50/P90/P99 for barge-in, TTFA, E2E)
- [ ] Test utilities committed
- [ ] Basic semantic VAD detecting hesitations

### 7.2 Phase 2: Semantic VAD Enhancement (Week 3-4)

**Goal:** Advanced turn detection matching ChatGPT quality

| Task                                    | Priority | Effort | Dependencies |
| --------------------------------------- | -------- | ------ | ------------ |
| Implement continuation signal detection | HIGH     | 2 days | Phase 1      |
| Add prosody hints integration           | MEDIUM   | 2 days | Phase 1      |
| Implement LLM-assisted turn detection   | LOW      | 3 days | Phase 1      |
| Create semantic VAD test suite          | HIGH     | 2 days | Phase 1      |
| Tune hesitation tolerance parameters    | HIGH     | 1 day  | Phase 1      |

**Deliverables:**

- [ ] Turn detection accuracy >90%
- [ ] Hesitation handling prevents premature responses
- [ ] All semantic VAD tests passing

### 7.3 Phase 3: Latency Optimization (Week 5-6)

**Goal:** Reduce E2E latency by 50%

| Task                                    | Priority | Effort | Dependencies |
| --------------------------------------- | -------- | ------ | ------------ |
| Implement speculative execution service | HIGH     | 3 days | Phase 2      |
| Implement TTS pre-warming               | HIGH     | 2 days | None         |
| Remove audio buffering delays           | HIGH     | 1 day  | None         |
| Implement parallel pipeline stages      | HIGH     | 3 days | Phase 2      |
| Optimize WebSocket message handling     | MEDIUM   | 2 days | None         |

**Deliverables:**

- [ ] E2E latency <1200ms P50
- [ ] TTFA <800ms P50
- [ ] Speculative execution saving 200-400ms

### 7.4 Phase 4: Duplex Audio (Week 7-8)

**Goal:** Enable full-duplex communication

| Task                                 | Priority | Effort | Dependencies |
| ------------------------------------ | -------- | ------ | ------------ |
| Implement DuplexAudioPipeline        | HIGH     | 3 days | Phase 3      |
| Add playback reference signal        | HIGH     | 2 days | Phase 3      |
| Implement echo correlation detection | MEDIUM   | 2 days | Phase 3      |
| Create duplex voice handler          | HIGH     | 2 days | Phase 3      |
| Duplex integration tests             | HIGH     | 2 days | All above    |

**Deliverables:**

- [ ] Simultaneous listen/speak capability
- [ ] Echo contamination <5%
- [ ] Barge-in latency <150ms P50

### 7.5 Phase 5: Graceful Truncation (Week 9-10)

**Goal:** Natural interruption handling

| Task                                 | Priority | Effort | Dependencies |
| ------------------------------------ | -------- | ------ | ------------ |
| Implement GracefulTruncationService  | HIGH     | 2 days | Phase 4      |
| Add truncation position tracking     | HIGH     | 2 days | Phase 4      |
| Implement context preservation       | HIGH     | 2 days | Phase 4      |
| Add acknowledgment prefix generation | MEDIUM   | 1 day  | Phase 4      |
| WebSocket protocol extensions        | HIGH     | 2 days | Phase 4      |
| Frontend truncation integration      | HIGH     | 2 days | All above    |

**Deliverables:**

- [ ] Truncation at sentence/phrase boundaries
- [ ] Context preserved for "continue" requests
- [ ] Natural acknowledgment phrases

### 7.6 Phase 6: Edge Case Hardening (Week 11-12)

**Goal:** Production-ready robustness

| Task                              | Priority | Effort | Dependencies |
| --------------------------------- | -------- | ------ | ------------ |
| Implement noise robustness tests  | HIGH     | 2 days | Phase 5      |
| Add accent variation tests        | HIGH     | 2 days | Phase 5      |
| Create whisper/quiet speech tests | MEDIUM   | 1 day  | Phase 5      |
| Network resilience testing        | HIGH     | 2 days | Phase 5      |
| Long conversation tests           | MEDIUM   | 1 day  | Phase 5      |
| Full regression test suite        | HIGH     | 3 days | All above    |

**Deliverables:**

- [ ] All edge case tests passing
- [ ] STT accuracy >80% with 15dB SNR noise
- [ ] Network latency tolerance up to 500ms

### 7.7 Success Criteria Summary

#### Quantitative Targets

| Metric                  | Baseline | Phase 3 Target | Final Target |
| ----------------------- | -------- | -------------- | ------------ |
| E2E Latency (P50)       | ~2500ms  | <1200ms        | <800ms       |
| Barge-in Latency (P50)  | ~1500ms  | <300ms         | <150ms       |
| TTFA (P50)              | ~2000ms  | <1000ms        | <800ms       |
| Turn Detection Accuracy | ~70%     | >85%           | >95%         |
| STT Accuracy (barge-in) | ~50%     | >80%           | >90%         |
| Echo Contamination      | ~30%     | <10%           | <5%          |

#### Qualitative Goals

1. **Natural conversation feel** - Comparable to ChatGPT Voice Mode
2. **Reliable interruption** - User can always stop AI instantly
3. **Context preservation** - AI remembers interrupted responses
4. **Hesitation tolerance** - No interruption during "um...", thinking pauses
5. **Graceful degradation** - Works well even in noisy environments

---

## Appendix A: Audio Fixture Specifications

### Required Fixtures

```bash
# Basic fixtures (already exist)
fixtures/audio/basic/
├── hello.wav                    # "Hello"
├── goodbye.wav                  # "Goodbye"
├── barge-in.wav                 # Interruption phrase
└── conversation-start.wav       # "Hello, what can you do?"

# Scenario fixtures (to create)
fixtures/audio/scenarios/
├── direct-question.wav          # "What is the weather today?"
├── short-command.wav            # "Stop"
├── acknowledgment.wav           # "Thanks"
├── hesitation-um.wav            # "I want to know about, um"
├── trailing-and.wav             # "Tell me about the weather and"
├── incomplete-sentence.wav      # "Can you"
├── mid-thought-pause.wav        # "The thing I really want to ask about is,"
├── question-then-hesitation.wav # "What is the capital of, um, you know"
├── complete-statement.wav       # "I need help with my calendar."
├── multi-turn-user-1.wav        # "Hello, can you help me plan a trip?"
├── multi-turn-user-2.wav        # "I want to visit Paris in the spring"
├── multi-turn-user-3.wav        # "Actually wait, what about Tokyo instead?"
└── multi-turn-user-4.wav        # "What are the best neighborhoods to stay in?"

# Edge case fixtures (to create)
fixtures/audio/edge-cases/
├── cafe-noise-20db.wav          # Speech with cafe ambient at 20dB SNR
├── traffic-noise-15db.wav       # Speech with traffic noise at 15dB SNR
├── white-noise-10db.wav         # Speech with white noise at 10dB SNR
├── rapid-speech-180wpm.wav      # Speech at 180 words per minute
├── slow-speech-80wpm.wav        # Speech at 80 words per minute
├── whispered-stop.wav           # Whispered "stop" command
├── quiet-speech-minus20db.wav   # Very quiet speech at -20dB
├── british-accent.wav           # British English speaker
├── indian-accent.wav            # Indian English speaker
├── spanish-accent.wav           # Spanish-accented English
├── chinese-accent.wav           # Chinese-accented English
└── long-speech-60s.wav          # 60-second continuous speech
```

### Fixture Generation Script

```bash
#!/bin/bash
# File: e2e/fixtures/audio/generate-fixtures.sh

# Generate synthetic fixtures using text-to-speech
# Requires: espeak or similar TTS tool

generate_fixture() {
    local text="$1"
    local output="$2"
    local rate="${3:-175}"  # Words per minute

    echo "Generating: $output"
    espeak -w "$output" -s "$rate" "$text"
}

# Scenario fixtures
generate_fixture "What is the weather today?" "scenarios/direct-question.wav"
generate_fixture "Stop" "scenarios/short-command.wav"
generate_fixture "Thanks" "scenarios/acknowledgment.wav"
generate_fixture "I want to know about, um" "scenarios/hesitation-um.wav" 150

# Add noise to fixtures using sox
add_noise() {
    local input="$1"
    local output="$2"
    local snr="$3"  # Signal-to-noise ratio in dB

    sox "$input" "$output" synth whitenoise mix "$snr"
}

echo "Fixture generation complete"
```

---

## Appendix B: Feature Flag Reference

| Flag Name                                            | Type    | Default | Description                         |
| ---------------------------------------------------- | ------- | ------- | ----------------------------------- |
| `backend.voice_semantic_vad_enabled`                 | boolean | true    | Enable semantic turn detection      |
| `backend.voice_semantic_vad_hesitation_tolerance_ms` | number  | 2000    | Wait time during hesitations        |
| `backend.voice_semantic_vad_completion_threshold`    | number  | 0.65    | Confidence threshold for turn end   |
| `backend.voice_speculative_execution_enabled`        | boolean | false   | Enable speculative LLM execution    |
| `backend.voice_tts_prewarm_enabled`                  | boolean | true    | Enable TTS pre-warming              |
| `backend.voice_duplex_mode_enabled`                  | boolean | false   | Enable full-duplex audio            |
| `backend.voice_graceful_truncation_enabled`          | boolean | true    | Enable graceful barge-in truncation |
| `backend.voice_echo_suppression_window_ms`           | number  | 200     | Echo suppression after playback     |
| `backend.voice_barge_in_fade_ms`                     | number  | 50      | Audio fade duration on barge-in     |

---

## Appendix C: WebSocket Message Reference

### New Message Types

```typescript
// Client → Server
interface SemanticVADStateMessage {
  type: "semantic_vad.state";
  completion_confidence: number;
  detected_signals: string[];
  recommended_action: "respond" | "wait";
}

// Server → Client
interface TurnDetectionHintMessage {
  type: "turn_detection.hint";
  hint: "user_likely_done" | "user_continuing" | "uncertain";
  confidence: number;
}

// Server → Client
interface TruncationNotificationMessage {
  type: "response.truncated";
  message_id: string;
  truncation: {
    type: "sentence" | "phrase" | "word" | "mid_word";
    spoken_text: string;
    unspoken_text: string;
    context_for_continuation: string;
  };
}

// Server → Client
interface LatencyMetricsMessage {
  type: "metrics.latency";
  ttfa_ms: number;
  stt_latency_ms: number;
  llm_first_token_ms: number;
  tts_first_chunk_ms: number;
}
```

---

**End of Plan Document**

_This plan should be reviewed and approved before implementation begins._
_Feature flags allow gradual rollout and rollback if issues arise._

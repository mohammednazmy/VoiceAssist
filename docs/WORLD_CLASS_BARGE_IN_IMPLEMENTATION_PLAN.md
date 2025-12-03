# World-Class Voice Barge-In Implementation Plan

> **Goal:** Transform VoiceAssist's voice mode from basic interruption handling to a human-like conversational experience with <30ms speech detection, intelligent context-aware interruption handling, natural turn-taking, multilingual support, and adaptive personalization.

**Created:** 2025-12-02
**Revised:** 2025-12-03
**Status:** ✅ Implementation Complete (Phases 1-10)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Intelligent Barge-In State Machine](#intelligent-barge-in-state-machine)
4. [Phase 1: Neural VAD Integration](#phase-1-neural-vad-integration)
5. [Phase 2: Instant Response & Feedback](#phase-2-instant-response--feedback)
6. [Phase 3: Context-Aware Interruption Intelligence](#phase-3-context-aware-interruption-intelligence)
7. [Phase 4: Advanced Audio Processing](#phase-4-advanced-audio-processing)
8. [Phase 5: Natural Turn-Taking](#phase-5-natural-turn-taking)
9. [Phase 6: Full Duplex Experience](#phase-6-full-duplex-experience)
10. [Phase 7: Multilingual & Accent Support](#phase-7-multilingual--accent-support)
11. [Phase 8: Adaptive Personalization](#phase-8-adaptive-personalization)
12. [Phase 9: Offline & Low-Latency Fallback](#phase-9-offline--low-latency-fallback)
13. [Phase 10: Advanced Conversation Management](#phase-10-advanced-conversation-management)
14. [Privacy & Security](#privacy--security)
15. [Continuous Learning Pipeline](#continuous-learning-pipeline)
16. [Testing Strategy](#testing-strategy)
17. [Success Metrics](#success-metrics)
18. [File Summary](#file-summary)
19. [Implementation Timeline](#implementation-timeline)

---

## Executive Summary

This plan transforms VoiceAssist's voice mode into a **world-class conversational experience** that feels like talking to a human. Key innovations include:

| Innovation                     | Description                            | Impact                  |
| ------------------------------ | -------------------------------------- | ----------------------- |
| **Neural VAD**                 | ML-based speech detection (Silero)     | <30ms detection latency |
| **Intelligent Classification** | Backchannel vs soft vs hard barge-in   | >90% accuracy           |
| **Instant Feedback**           | Visual, haptic, audio confirmation     | <50ms user feedback     |
| **Advanced AEC**               | NLMS adaptive filter echo cancellation | >95% echo removal       |
| **Natural Turn-Taking**        | Prosodic analysis, adaptive silence    | Human-like flow         |
| **Full Duplex**                | Simultaneous speaking capability       | True conversation       |
| **Multilingual Support**       | Language-specific VAD & phrase lists   | 10+ languages           |
| **Adaptive Personalization**   | Per-user calibration & learning        | Personalized experience |
| **Offline Fallback**           | On-device VAD & TTS caching            | Network-resilient       |
| **Conversation Manager**       | Sentiment & discourse analysis         | Context-aware AI        |
| **Tool-Call Safety**           | Safe interruption of external actions  | Data integrity          |
| **Privacy by Design**          | Encrypted audio, anonymized logs       | GDPR compliant          |

### Key Targets

| Metric                              | Current    | Target                          |
| ----------------------------------- | ---------- | ------------------------------- |
| Speech Detection Latency            | ~50-100ms  | <30ms                           |
| Barge-In to Audio Stop              | ~100-200ms | <50ms                           |
| False Positive Rate                 | ~10%       | <2%                             |
| Backchannel Accuracy (English)      | N/A        | >90%                            |
| Backchannel Accuracy (Multilingual) | N/A        | >85%                            |
| Personalization Improvement         | N/A        | +25% accuracy after calibration |
| User Satisfaction                   | Baseline   | +40%                            |
| Offline Detection Latency           | N/A        | <50ms                           |

---

## Current State Analysis

### What Exists Today

- **Basic barge-in** via `response.cancel` signal
- **Energy-based VAD** (simple RMS threshold)
- **300-500ms** end-to-end latency
- **AudioWorklet** with 10.7ms chunks
- **Manual barge-in button** + auto-detection

### Key Gaps for Human-Like Conversation

1. **Detection latency**: ~50-100ms delay before speech is recognized
2. **No immediate feedback**: User doesn't know they were "heard" instantly
3. **Abrupt cutoff**: AI audio stops abruptly (unnatural)
4. **No context awareness**: System doesn't understand _why_ user interrupted
5. **Echo confusion**: Sometimes confuses AI audio for user speech
6. **Single mode**: No distinction between "I want to interject" vs "background noise"
7. **English-only**: No multilingual backchannel or phrase detection
8. **No personalization**: One-size-fits-all thresholds
9. **Network-dependent**: No offline fallback for barge-in detection
10. **Tool-call blindness**: No safe interruption during external API calls

### Current Architecture

```
User Microphone (16kHz PCM)
       ↓
Deepgram Streaming STT (with Whisper fallback)
       ↓
GPT-4o Thinker (with tool calling support)
       ↓
ElevenLabs Streaming TTS (24kHz PCM)
       ↓
Web Audio API Playback
```

---

## Intelligent Barge-In State Machine

### State Machine Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    INTELLIGENT BARGE-IN STATE MACHINE                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────┐                                                                    │
│  │  IDLE   │◄──────────────────────────────────────────────────────────────┐   │
│  └────┬────┘                                                               │   │
│       │ connect()                                                          │   │
│       ▼                                                                    │   │
│  ┌──────────────┐                                                          │   │
│  │ CALIBRATING  │──── calibration_complete ────────────────────────┐       │   │
│  │ (noise floor)│                                                  │       │   │
│  └──────┬───────┘                                                  │       │   │
│         │ skip_calibration                                         │       │   │
│         ▼                                                          │       │   │
│  ┌──────────────┐                                                  │       │   │
│  │ CONNECTING   │──────── error ──────────────────────────────────┐│       │   │
│  └──────┬───────┘                                                 ││       │   │
│         │ session.ready                                           ││       │   │
│         ▼                                                         ▼│       │   │
│  ┌──────────────┐                                                  │       │   │
│  │  LISTENING   │◄─────────────────────────────────────────────┐   │       │   │
│  │  (ready)     │                                              │   │       │   │
│  └──────┬───────┘                                              │   │       │   │
│         │ vad.speech_onset (confidence > adaptive_threshold)   │   │       │   │
│         ▼                                                      │   │       │   │
│  ┌──────────────────┐                                          │   │       │   │
│  │ SPEECH_DETECTED  │ ◄── 20-30ms window                       │   │       │   │
│  │ (pre-confirm)    │     for onset detection                  │   │       │   │
│  └──────┬───────────┘                                          │   │       │   │
│         │                                                      │   │       │   │
│         ├─── speech < 100ms + low confidence ───► LISTENING    │   │       │   │
│         │    (false positive / noise)              (cancel)    │   │       │   │
│         │                                                      │   │       │   │
│         │ speech >= 100ms OR high confidence (>0.85)           │   │       │   │
│         ▼                                                      │   │       │   │
│  ┌──────────────────┐                                          │   │       │   │
│  │ USER_SPEAKING    │                                          │   │       │   │
│  │ (confirmed)      │                                          │   │       │   │
│  └──────┬───────────┘                                          │   │       │   │
│         │ silence > adaptive_threshold (200-800ms)             │   │       │   │
│         ▼                                                      │   │       │   │
│  ┌──────────────────┐                                          │   │       │   │
│  │ PROCESSING_STT   │                                          │   │       │   │
│  │ (finalizing)     │                                          │   │       │   │
│  └──────┬───────────┘                                          │   │       │   │
│         │ transcript.complete                                  │   │       │   │
│         ▼                                                      │   │       │   │
│  ┌──────────────────┐                                          │   │       │   │
│  │ PROCESSING_LLM   │─────────────────────────────────────────────────────────┐│
│  │ (thinking/tools) │  ◄── tool_call_in_progress               │   │       │ ││
│  └──────┬───────────┘                                          │   │       │ ││
│         │ response.delta (first token)                         │   │       │ ││
│         ▼                                                      │   │       │ ││
│  ┌──────────────────┐      vad.speech_onset                    │   │       │ ││
│  │ AI_RESPONDING    │◄────────────────────────────┐            │   │       │ ││
│  │ (streaming text) │                             │            │   │       │ ││
│  └──────┬───────────┘                             │            │   │       │ ││
│         │ audio.output (first chunk)              │            │   │       │ ││
│         ▼                                         │            │   │       │ ││
│  ┌──────────────────┐                             │            │   │       │ ││
│  │  AI_SPEAKING     │─────────────────────────────┤            │   │       │ ││
│  │  (playing TTS)   │     (BARGE-IN ZONE)         │            │   │       │ ││
│  └──────┬───────────┘                             │            │   │       │ ││
│         │                                         │            │   │       │ ││
│         │ vad.speech_onset ────────────────────►  │            │   │       │ ││
│         │                                         │            │   │       │ ││
│         │         ┌───────────────────────────────┴──────┐     │   │       │ ││
│         │         │      BARGE-IN CLASSIFICATION         │     │   │       │ ││
│         │         │      (language-aware)                │     │   │       │ ││
│         │         │                                      │     │   │       │ ││
│         │         │  ┌─────────────┐  ┌──────────────┐   │     │   │       │ ││
│         │         │  │BACKCHANNEL  │  │ SOFT_BARGE   │   │     │   │       │ ││
│         │         │  │"uh huh"     │  │ "wait"       │   │     │   │       │ ││
│         │         │  │"yeah" (EN)  │  │ "hold on"    │   │     │   │       │ ││
│         │         │  │"نعم" (AR)   │  │ "actually"   │   │     │   │       │ ││
│         │         │  │"oui" (FR)   │  │ short phrase │   │     │   │       │ ││
│         │         │  └──────┬──────┘  └──────┬───────┘   │     │   │       │ ││
│         │         │         │                │           │     │   │       │ ││
│         │         │         ▼                ▼           │     │   │       │ ││
│         │         │  ┌─────────────┐  ┌──────────────┐   │     │   │       │ ││
│         │         │  │ Continue    │  │ Fade to 20%  │   │     │   │       │ ││
│         │         │  │ AI audio    │  │ Pause LLM    │   │     │   │       │ ││
│         │         │  │ (no action) │  │ Wait 2s      │   │     │   │       │ ││
│         │         │  └─────────────┘  └──────────────┘   │     │   │       │ ││
│         │         │                                      │     │   │       │ ││
│         │         │  ┌──────────────────────────────┐    │     │   │       │ ││
│         │         │  │      HARD_BARGE_IN           │    │     │   │       │ ││
│         │         │  │  Full sentence / question    │    │     │   │       │ ││
│         │         │  │  High confidence speech      │    │     │   │       │ ││
│         │         │  │  Duration > 300ms            │    │     │   │       │ ││
│         │         │  └──────────────┬───────────────┘    │     │   │       │ ││
│         │         │                 │                    │     │   │       │ ││
│         │         │                 ▼                    │     │   │       │ ││
│         │         │  ┌──────────────────────────────┐    │     │   │       │ ││
│         │         │  │ 1. Immediate audio fade (30ms)│   │     │   │       │ ││
│         │         │  │ 2. Check tool-call state     │────┼─────┼───┼───────┼─┘│
│         │         │  │ 3. Safe interrupt/rollback   │    │     │   │       │  │
│         │         │  │ 4. Store interrupted context │    │     │   │       │  │
│         │         │  │ 5. Generate context summary  │    │     │   │       │  │
│         │         │  │ 6. Show visual confirmation  │    │     │   │       │  │
│         │         │  └──────────────────────────────┘    │     │   │       │  │
│         │         └──────────────────────────────────────┘     │   │       │  │
│         │                                                      │   │       │  │
│         │ audio.complete (natural end)                         │   │       │  │
│         └──────────────────────────────────────────────────────┘   │       │  │
│                                                                     │       │  │
│  ┌─────────┐                                                        │       │  │
│  │  ERROR  │◄───────────────────────────────────────────────────────┘       │  │
│  └────┬────┘                                                                 │  │
│       │ retry() or disconnect()                                              │  │
│       └──────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    TOOL-CALL INTERRUPT HANDLER                          │    │
│  │  If barge-in during PROCESSING_LLM with active tool call:               │    │
│  │  1. Check tool interruptibility (safe_to_interrupt flag)                │    │
│  │  2. If interruptible: cancel & rollback                                 │    │
│  │  3. If not interruptible: queue barge-in, notify user                   │    │
│  │  4. Log interruption for telemetry                                      │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### State Definitions

```typescript
// New file: apps/web-app/src/hooks/useIntelligentBargeIn/types.ts

export type BargeInState =
  | "idle" // Voice mode inactive
  | "calibrating" // Measuring ambient noise for thresholds
  | "connecting" // Establishing WebSocket
  | "listening" // Ready, waiting for user speech
  | "speech_detected" // VAD triggered, confirming (20-30ms)
  | "user_speaking" // Confirmed user speech
  | "processing_stt" // Finalizing transcript
  | "processing_llm" // LLM generating response (may include tool calls)
  | "ai_responding" // LLM streaming tokens (no audio yet)
  | "ai_speaking" // TTS audio playing
  | "barge_in_detected" // User spoke during AI, classifying
  | "soft_barge" // Soft interruption (AI paused)
  | "awaiting_continuation" // After soft barge, waiting for user
  | "tool_call_pending" // Barge-in queued during non-interruptible tool call
  | "error"; // Error state

export type BargeInClassification =
  | "backchannel" // "uh huh", "yeah" - continue AI
  | "soft_barge" // "wait", "hold on" - pause AI
  | "hard_barge" // Full interruption - stop AI
  | "unclear"; // Need more audio to classify

export type SpeechConfidence = "low" | "medium" | "high" | "very_high";

export type SupportedLanguage = "en" | "ar" | "es" | "fr" | "de" | "zh" | "ja" | "ko" | "pt" | "ru" | "hi" | "tr";

export interface BargeInEvent {
  id: string;
  type: BargeInClassification;
  timestamp: number;
  interruptedContent: string;
  interruptedAtWord: number;
  totalWords: number;
  completionPercentage: number;
  userTranscript?: string;
  resumable: boolean;
  contextSummary?: string; // Summary of truncated content for resumption
  activeToolCall?: ToolCallState; // Tool call that was interrupted
  language: SupportedLanguage;
}

export interface ToolCallState {
  id: string;
  name: string;
  status: "pending" | "executing" | "completed" | "cancelled" | "rolled_back";
  safeToInterrupt: boolean;
  rollbackAction?: () => Promise<void>;
  startedAt: number;
}

export interface VADResult {
  isSpeech: boolean;
  confidence: number;
  onsetTimestamp: number;
  duration: number;
  energy: number;
  language?: SupportedLanguage;
  spectralFeatures?: {
    centroid: number;
    bandwidth: number;
    rolloff: number;
  };
}

export interface CalibrationResult {
  ambientNoiseLevel: number;
  recommendedVadThreshold: number;
  recommendedSilenceThreshold: number;
  environmentType: "quiet" | "moderate" | "noisy";
  calibratedAt: number;
}

export interface BargeInConfig {
  // Language settings
  language: SupportedLanguage;
  autoDetectLanguage: boolean;
  accentProfile?: string; // e.g., "en-US", "en-GB", "en-IN"

  // Detection thresholds (adaptive)
  speechOnsetConfidence: number; // Default: 0.7, adjusted per user
  speechConfirmMs: number; // Default: 100ms
  hardBargeMinDuration: number; // Default: 300ms

  // Audio behavior
  fadeOutDuration: number; // Default: 30ms
  softBargeFadeLevel: number; // Default: 0.2 (20%)
  softBargeWaitMs: number; // Default: 2000ms

  // Backchannel detection (language-aware)
  backchannelMaxDuration: number; // Default: 500ms
  backchannelPhrases: Map<SupportedLanguage, string[]>;

  // Echo cancellation
  echoSuppressionEnabled: boolean;
  echoCorrelationThreshold: number; // Default: 0.55

  // Adaptive settings
  adaptiveSilenceEnabled: boolean;
  minSilenceMs: number; // Default: 200ms
  maxSilenceMs: number; // Default: 800ms

  // Calibration
  calibrationEnabled: boolean;
  calibrationDurationMs: number; // Default: 3000ms

  // Personalization
  userId?: string;
  persistUserPreferences: boolean;

  // Offline fallback
  useOfflineVAD: boolean;
  offlineVADModel: "silero-lite" | "webrtc-vad";
  offlineTTSCacheEnabled: boolean;
  offlineTTSCacheSizeMB: number; // Default: 50MB

  // Privacy
  encryptAudioInTransit: boolean;
  anonymizeTelemetry: boolean;
  audioRetentionPolicy: "none" | "session" | "24h" | "7d";

  // Tool-call integration
  allowInterruptDuringToolCalls: boolean;
  toolCallInterruptBehavior: "queue" | "cancel" | "smart";
}

// User-specific persisted preferences
export interface UserBargeInPreferences {
  userId: string;
  vadSensitivity: number; // 0.0 - 1.0, adjusted from calibration
  silenceThreshold: number;
  preferredLanguage: SupportedLanguage;
  accentProfile?: string;
  backchannelFrequency: "low" | "normal" | "high";
  feedbackPreferences: FeedbackPreferences;
  calibrationHistory: CalibrationResult[];
  lastUpdated: number;
}

export interface FeedbackPreferences {
  visualFeedbackEnabled: boolean;
  visualFeedbackStyle: "pulse" | "border" | "icon" | "minimal";
  hapticFeedbackEnabled: boolean;
  hapticIntensity: "light" | "medium" | "strong";
  audioFeedbackEnabled: boolean;
  audioFeedbackType: "tone" | "voice" | "none";
  voicePromptAfterHardBarge: boolean;
  voicePromptText?: string; // e.g., "I'm listening"
}
```

---

## Phase 1: Neural VAD Integration

**Goal:** Replace energy-based VAD with ML-based detection for <30ms speech onset detection

### New Files to Create

| File                                  | Purpose                             | Size Est.  |
| ------------------------------------- | ----------------------------------- | ---------- |
| `src/lib/sileroVAD/index.ts`          | Silero VAD wrapper & initialization | ~250 lines |
| `src/lib/sileroVAD/vadWorker.ts`      | Web Worker for VAD inference        | ~150 lines |
| `src/lib/sileroVAD/types.ts`          | TypeScript interfaces               | ~80 lines  |
| `src/lib/sileroVAD/languageModels.ts` | Language-specific VAD configs       | ~100 lines |
| `public/silero_vad.onnx`              | Silero VAD ONNX model file          | ~2MB       |
| `public/silero_vad_lite.onnx`         | Lightweight offline model           | ~500KB     |
| `public/vad-processor.js`             | Compiled Web Worker                 | ~50KB      |
| `src/hooks/useNeuralVAD.ts`           | React hook for neural VAD           | ~300 lines |
| `src/hooks/useOfflineVAD.ts`          | Offline fallback VAD hook           | ~200 lines |
| `src/utils/vadClassifier.ts`          | Speech classification utilities     | ~150 lines |

### Implementation: Silero VAD Wrapper with Language Support

```typescript
// src/lib/sileroVAD/index.ts

/**
 * Silero VAD Integration with Multilingual Support
 *
 * Silero VAD is a neural network-based Voice Activity Detector that runs
 * in WebAssembly via ONNX Runtime Web. It provides:
 * - 95%+ accuracy on speech detection
 * - ~30ms latency for onset detection
 * - Robustness to background noise
 * - Language-agnostic core with language-specific tuning
 *
 * Model: silero_vad.onnx (~2MB) or silero_vad_lite.onnx (~500KB for offline)
 * Input: 512 samples at 16kHz (32ms chunks)
 * Output: Probability of speech (0-1)
 */

import * as ort from "onnxruntime-web";
import { SupportedLanguage } from "../types";
import { LANGUAGE_VAD_CONFIGS } from "./languageModels";

export interface SileroVADConfig {
  modelPath: string;
  sampleRate: number;
  windowSize: number;
  speechThreshold: number;
  silenceThreshold: number;
  minSpeechDuration: number;
  minSilenceDuration: number;
  language: SupportedLanguage;
  adaptiveThreshold: boolean;
  onSpeechStart?: (confidence: number, language?: SupportedLanguage) => void;
  onSpeechEnd?: (duration: number) => void;
  onVADResult?: (result: VADResult) => void;
  onCalibrationComplete?: (result: CalibrationResult) => void;
}

export interface VADResult {
  probability: number;
  isSpeech: boolean;
  timestamp: number;
  processingTime: number;
  detectedLanguage?: SupportedLanguage;
}

export interface CalibrationResult {
  ambientNoiseLevel: number;
  recommendedVadThreshold: number;
  recommendedSilenceThreshold: number;
  environmentType: "quiet" | "moderate" | "noisy";
  calibratedAt: number;
}

export class SileroVAD {
  private session: ort.InferenceSession | null = null;
  private config: SileroVADConfig;
  private state: Float32Array;
  private sr: BigInt64Array;
  private isLoaded = false;

  private speechStartTime: number | null = null;
  private consecutiveSpeechWindows = 0;
  private consecutiveSilenceWindows = 0;
  private isSpeaking = false;

  // Calibration state
  private isCalibrating = false;
  private calibrationSamples: number[] = [];
  private adaptedThreshold: number;

  constructor(config: Partial<SileroVADConfig> = {}) {
    const languageConfig = LANGUAGE_VAD_CONFIGS[config.language || "en"] || {};

    this.config = {
      modelPath: "/silero_vad.onnx",
      sampleRate: 16000,
      windowSize: 512,
      speechThreshold: 0.5,
      silenceThreshold: 0.35,
      minSpeechDuration: 64,
      minSilenceDuration: 100,
      language: "en",
      adaptiveThreshold: true,
      ...languageConfig,
      ...config,
    };

    this.adaptedThreshold = this.config.speechThreshold;
    this.state = new Float32Array(2 * 1 * 64);
    this.sr = new BigInt64Array([BigInt(this.config.sampleRate)]);
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) return;

    try {
      ort.env.wasm.wasmPaths = "/";

      this.session = await ort.InferenceSession.create(this.config.modelPath, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });

      this.isLoaded = true;
      console.log("[SileroVAD] Model loaded successfully");
    } catch (error) {
      console.error("[SileroVAD] Failed to load model:", error);
      throw error;
    }
  }

  /**
   * Start calibration phase to measure ambient noise
   * Call this at session start for ~3 seconds of silence
   */
  startCalibration(durationMs: number = 3000): void {
    this.isCalibrating = true;
    this.calibrationSamples = [];

    setTimeout(() => {
      this.finishCalibration();
    }, durationMs);
  }

  private finishCalibration(): void {
    this.isCalibrating = false;

    if (this.calibrationSamples.length === 0) {
      return;
    }

    const avgEnergy = this.calibrationSamples.reduce((a, b) => a + b, 0) / this.calibrationSamples.length;
    const maxEnergy = Math.max(...this.calibrationSamples);

    let environmentType: "quiet" | "moderate" | "noisy";
    let recommendedThreshold: number;

    if (avgEnergy < 0.01) {
      environmentType = "quiet";
      recommendedThreshold = 0.4;
    } else if (avgEnergy < 0.05) {
      environmentType = "moderate";
      recommendedThreshold = 0.55;
    } else {
      environmentType = "noisy";
      recommendedThreshold = 0.7;
    }

    this.adaptedThreshold = recommendedThreshold;

    const result: CalibrationResult = {
      ambientNoiseLevel: avgEnergy,
      recommendedVadThreshold: recommendedThreshold,
      recommendedSilenceThreshold: recommendedThreshold - 0.15,
      environmentType,
      calibratedAt: Date.now(),
    };

    this.config.onCalibrationComplete?.(result);
  }

  async process(audioData: Float32Array): Promise<VADResult> {
    if (!this.session) {
      throw new Error("VAD not initialized. Call initialize() first.");
    }

    const startTime = performance.now();

    // During calibration, collect energy samples
    if (this.isCalibrating) {
      const energy = this.computeEnergy(audioData);
      this.calibrationSamples.push(energy);
    }

    const inputTensor = new ort.Tensor("float32", audioData, [1, audioData.length]);
    const stateTensor = new ort.Tensor("float32", this.state, [2, 1, 64]);
    const srTensor = new ort.Tensor("int64", this.sr, [1]);

    const results = await this.session.run({
      input: inputTensor,
      state: stateTensor,
      sr: srTensor,
    });

    const probability = (results.output.data as Float32Array)[0];
    const newState = results.stateN.data as Float32Array;

    this.state.set(newState);

    const processingTime = performance.now() - startTime;
    const threshold = this.config.adaptiveThreshold ? this.adaptedThreshold : this.config.speechThreshold;
    const isSpeech = probability >= threshold;

    this.trackSpeechState(probability, isSpeech);

    const result: VADResult = {
      probability,
      isSpeech,
      timestamp: performance.now(),
      processingTime,
    };

    this.config.onVADResult?.(result);

    return result;
  }

  private computeEnergy(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  private trackSpeechState(probability: number, isSpeech: boolean): void {
    const windowDuration = (this.config.windowSize / this.config.sampleRate) * 1000;

    if (isSpeech) {
      this.consecutiveSpeechWindows++;
      this.consecutiveSilenceWindows = 0;

      const speechDuration = this.consecutiveSpeechWindows * windowDuration;

      if (!this.isSpeaking && speechDuration >= this.config.minSpeechDuration) {
        this.isSpeaking = true;
        this.speechStartTime = performance.now() - speechDuration;
        this.config.onSpeechStart?.(probability, this.config.language);
      }
    } else {
      this.consecutiveSilenceWindows++;

      const silenceDuration = this.consecutiveSilenceWindows * windowDuration;

      if (this.isSpeaking && silenceDuration >= this.config.minSilenceDuration) {
        const totalDuration = performance.now() - (this.speechStartTime || 0);
        this.isSpeaking = false;
        this.speechStartTime = null;
        this.consecutiveSpeechWindows = 0;
        this.config.onSpeechEnd?.(totalDuration);
      }
    }
  }

  setLanguage(language: SupportedLanguage): void {
    this.config.language = language;
    const languageConfig = LANGUAGE_VAD_CONFIGS[language];
    if (languageConfig) {
      this.config.speechThreshold = languageConfig.speechThreshold ?? this.config.speechThreshold;
      this.config.minSpeechDuration = languageConfig.minSpeechDuration ?? this.config.minSpeechDuration;
    }
  }

  updateThreshold(threshold: number): void {
    this.adaptedThreshold = Math.max(0.3, Math.min(0.9, threshold));
  }

  reset(): void {
    this.state.fill(0);
    this.isSpeaking = false;
    this.speechStartTime = null;
    this.consecutiveSpeechWindows = 0;
    this.consecutiveSilenceWindows = 0;
  }

  destroy(): void {
    this.session?.release();
    this.session = null;
    this.isLoaded = false;
  }
}
```

### Language-Specific VAD Configurations

```typescript
// src/lib/sileroVAD/languageModels.ts

import { SupportedLanguage } from "../types";

interface LanguageVADConfig {
  speechThreshold?: number;
  silenceThreshold?: number;
  minSpeechDuration?: number;
  minSilenceDuration?: number;
  // Some languages have longer pauses between words
  pauseTolerance?: number;
}

export const LANGUAGE_VAD_CONFIGS: Record<SupportedLanguage, LanguageVADConfig> = {
  en: {
    speechThreshold: 0.5,
    minSpeechDuration: 64,
    minSilenceDuration: 100,
  },
  ar: {
    // Arabic has emphatic consonants that may need higher threshold
    speechThreshold: 0.55,
    minSpeechDuration: 80,
    minSilenceDuration: 120,
    pauseTolerance: 150,
  },
  es: {
    speechThreshold: 0.48,
    minSpeechDuration: 60,
    minSilenceDuration: 90,
  },
  fr: {
    speechThreshold: 0.5,
    minSpeechDuration: 64,
    minSilenceDuration: 100,
  },
  de: {
    // German has longer compound words
    speechThreshold: 0.52,
    minSpeechDuration: 70,
    minSilenceDuration: 110,
  },
  zh: {
    // Mandarin tones require careful threshold
    speechThreshold: 0.55,
    minSpeechDuration: 80,
    minSilenceDuration: 120,
  },
  ja: {
    speechThreshold: 0.5,
    minSpeechDuration: 64,
    minSilenceDuration: 100,
  },
  ko: {
    speechThreshold: 0.52,
    minSpeechDuration: 70,
    minSilenceDuration: 110,
  },
  pt: {
    speechThreshold: 0.48,
    minSpeechDuration: 60,
    minSilenceDuration: 90,
  },
  ru: {
    speechThreshold: 0.52,
    minSpeechDuration: 70,
    minSilenceDuration: 110,
  },
  hi: {
    speechThreshold: 0.55,
    minSpeechDuration: 80,
    minSilenceDuration: 120,
  },
  tr: {
    speechThreshold: 0.5,
    minSpeechDuration: 64,
    minSilenceDuration: 100,
  },
};
```

### Implementation: useNeuralVAD Hook

```typescript
// src/hooks/useNeuralVAD.ts

import { useCallback, useEffect, useRef, useState } from "react";
import { SileroVAD, VADResult, SileroVADConfig, CalibrationResult } from "../lib/sileroVAD";
import { SupportedLanguage, UserBargeInPreferences } from "../lib/types";

export interface UseNeuralVADOptions {
  enabled?: boolean;
  language?: SupportedLanguage;
  autoCalibrate?: boolean;
  userPreferences?: UserBargeInPreferences;
  onSpeechStart?: (confidence: number, language?: SupportedLanguage) => void;
  onSpeechEnd?: (duration: number) => void;
  onVADResult?: (result: VADResult) => void;
  onCalibrationComplete?: (result: CalibrationResult) => void;
  config?: Partial<SileroVADConfig>;
}

export interface UseNeuralVADReturn {
  isLoaded: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isCalibrating: boolean;
  currentConfidence: number;
  calibrationResult: CalibrationResult | null;
  startListening: (stream: MediaStream) => Promise<void>;
  stopListening: () => void;
  startCalibration: (durationMs?: number) => void;
  setLanguage: (language: SupportedLanguage) => void;
  updateThreshold: (threshold: number) => void;
  processAudioChunk: (data: Float32Array) => Promise<VADResult | null>;
}

export function useNeuralVAD(options: UseNeuralVADOptions = {}): UseNeuralVADReturn {
  const {
    enabled = true,
    language = "en",
    autoCalibrate = true,
    userPreferences,
    onSpeechStart,
    onSpeechEnd,
    onVADResult,
    onCalibrationComplete,
    config = {},
  } = options;

  const [isLoaded, setIsLoaded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [currentConfidence, setCurrentConfidence] = useState(0);
  const [calibrationResult, setCalibrationResult] = useState<CalibrationResult | null>(null);

  const vadRef = useRef<SileroVAD | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Apply user preferences if available
  const effectiveConfig = {
    ...config,
    language,
    speechThreshold: userPreferences?.vadSensitivity ?? config.speechThreshold,
  };

  useEffect(() => {
    if (!enabled) return;

    const vad = new SileroVAD({
      ...effectiveConfig,
      onSpeechStart: (confidence, detectedLang) => {
        setIsSpeaking(true);
        onSpeechStart?.(confidence, detectedLang);
      },
      onSpeechEnd: (duration) => {
        setIsSpeaking(false);
        onSpeechEnd?.(duration);
      },
      onVADResult: (result) => {
        setCurrentConfidence(result.probability);
        onVADResult?.(result);
      },
      onCalibrationComplete: (result) => {
        setIsCalibrating(false);
        setCalibrationResult(result);
        onCalibrationComplete?.(result);
      },
    });

    vadRef.current = vad;

    vad
      .initialize()
      .then(() => setIsLoaded(true))
      .catch((error) => console.error("[useNeuralVAD] Failed to initialize:", error));

    return () => {
      vad.destroy();
      vadRef.current = null;
    };
  }, [enabled, language]);

  const startCalibration = useCallback((durationMs: number = 3000) => {
    if (!vadRef.current) return;
    setIsCalibrating(true);
    vadRef.current.startCalibration(durationMs);
  }, []);

  const startListening = useCallback(
    async (stream: MediaStream) => {
      if (!vadRef.current || !isLoaded) {
        throw new Error("VAD not ready");
      }

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      streamRef.current = stream;

      await audioContext.audioWorklet.addModule("/vad-processor.js");

      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, "vad-processor", {
        processorOptions: { windowSize: 512 },
      });

      workletNode.port.onmessage = async (event) => {
        if (event.data.type === "audio") {
          const audioData = new Float32Array(event.data.samples);
          await vadRef.current?.process(audioData);
        }
      };

      source.connect(workletNode);
      workletNodeRef.current = workletNode;
      setIsListening(true);

      // Auto-calibrate on first listen if enabled
      if (autoCalibrate && !calibrationResult) {
        startCalibration();
      }
    },
    [isLoaded, autoCalibrate, calibrationResult, startCalibration],
  );

  const stopListening = useCallback(() => {
    workletNodeRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    vadRef.current?.reset();
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    vadRef.current?.setLanguage(lang);
  }, []);

  const updateThreshold = useCallback((threshold: number) => {
    vadRef.current?.updateThreshold(threshold);
  }, []);

  const processAudioChunk = useCallback(
    async (data: Float32Array) => {
      if (!vadRef.current || !isLoaded) return null;
      return vadRef.current.process(data);
    },
    [isLoaded],
  );

  return {
    isLoaded,
    isListening,
    isSpeaking,
    isCalibrating,
    currentConfidence,
    calibrationResult,
    startListening,
    stopListening,
    startCalibration,
    setLanguage,
    updateThreshold,
    processAudioChunk,
  };
}
```

### Files to Modify

**File: `apps/web-app/package.json`**

```json
{
  "dependencies": {
    "onnxruntime-web": "^1.17.0"
  }
}
```

**File: `apps/web-app/src/hooks/useThinkerTalkerSession.ts`**

- Import and integrate `useNeuralVAD`
- Add `handleBargeInDetected` function
- Modify audio processing to use neural VAD
- Integrate offline fallback logic

---

## Phase 2: Instant Response & Feedback

**Goal:** User knows their interruption was heard within 50ms with configurable feedback

### New Files to Create

| File                                       | Purpose                                    | Size Est.  |
| ------------------------------------------ | ------------------------------------------ | ---------- |
| `src/components/voice/BargeInFeedback.tsx` | Configurable visual feedback component     | ~250 lines |
| `src/hooks/useHapticFeedback.ts`           | Mobile haptic feedback with intensity      | ~120 lines |
| `src/lib/audioFeedback.ts`                 | Audio acknowledgment tones & voice prompts | ~180 lines |
| `src/stores/feedbackPreferencesStore.ts`   | User feedback preferences persistence      | ~100 lines |

### Implementation: Enhanced BargeInFeedback Component

```typescript
// src/components/voice/BargeInFeedback.tsx

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FeedbackPreferences } from '../../lib/types';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { playAudioFeedback, speakPrompt } from '../../lib/audioFeedback';

interface BargeInFeedbackProps {
  isActive: boolean;
  type: 'detected' | 'confirmed' | 'backchannel' | 'soft' | 'hard';
  confidence?: number;
  preferences: FeedbackPreferences;
  onAnimationComplete?: () => void;
}

export function BargeInFeedback({
  isActive,
  type,
  confidence = 0,
  preferences,
  onAnimationComplete,
}: BargeInFeedbackProps) {
  const [showPulse, setShowPulse] = useState(false);
  const { triggerHaptic } = useHapticFeedback();

  const pulseColors = useMemo(() => ({
    detected: 'rgba(59, 130, 246, 0.5)',
    confirmed: 'rgba(34, 197, 94, 0.5)',
    backchannel: 'rgba(168, 162, 158, 0.3)',
    soft: 'rgba(251, 191, 36, 0.5)',
    hard: 'rgba(239, 68, 68, 0.5)',
  }), []);

  const hapticMap = useMemo(() => ({
    detected: 'bargeInDetected',
    confirmed: 'bargeInConfirmed',
    backchannel: 'backchannel',
    soft: 'softBarge',
    hard: 'hardBarge',
  } as const), []);

  useEffect(() => {
    if (isActive) {
      // Visual feedback
      if (preferences.visualFeedbackEnabled) {
        setShowPulse(true);
        const timer = setTimeout(() => {
          setShowPulse(false);
          onAnimationComplete?.();
        }, 300);
        return () => clearTimeout(timer);
      }

      // Haptic feedback
      if (preferences.hapticFeedbackEnabled) {
        triggerHaptic(hapticMap[type], preferences.hapticIntensity);
      }

      // Audio feedback
      if (preferences.audioFeedbackEnabled) {
        if (preferences.audioFeedbackType === 'tone') {
          playAudioFeedback(type);
        } else if (preferences.audioFeedbackType === 'voice' && type === 'hard') {
          if (preferences.voicePromptAfterHardBarge) {
            speakPrompt(preferences.voicePromptText || "I'm listening");
          }
        }
      }
    }
  }, [isActive, type, preferences, triggerHaptic, hapticMap, onAnimationComplete]);

  if (!preferences.visualFeedbackEnabled) {
    return null;
  }

  const renderFeedback = () => {
    switch (preferences.visualFeedbackStyle) {
      case 'pulse':
        return (
          <motion.div
            className="fixed inset-0 pointer-events-none z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.05 }}
          >
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                backgroundColor: pulseColors[type],
                boxShadow: `0 0 60px 30px ${pulseColors[type]}`,
              }}
              initial={{ width: 20, height: 20, opacity: 0.8 }}
              animate={{ width: 200, height: 200, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </motion.div>
        );

      case 'border':
        return (
          <motion.div
            className="fixed inset-0 pointer-events-none z-50 border-4 rounded-lg"
            style={{ borderColor: pulseColors[type] }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          />
        );

      case 'icon':
        return (
          <motion.div
            className="fixed top-4 right-4 pointer-events-none z-50"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: pulseColors[type] }}
            >
              {type === 'hard' && '✋'}
              {type === 'soft' && '⏸'}
              {type === 'backchannel' && '👂'}
              {type === 'detected' && '🎤'}
              {type === 'confirmed' && '✓'}
            </div>
          </motion.div>
        );

      case 'minimal':
        return (
          <motion.div
            className="fixed bottom-20 left-1/2 -translate-x-1/2 pointer-events-none z-50"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: pulseColors[type] }}
            />
          </motion.div>
        );
    }
  };

  return (
    <AnimatePresence>
      {showPulse && renderFeedback()}
    </AnimatePresence>
  );
}
```

### Implementation: Enhanced Haptic Feedback Hook

```typescript
// src/hooks/useHapticFeedback.ts

import { useCallback, useEffect, useRef } from "react";

type HapticIntensity = "light" | "medium" | "strong";
type HapticType =
  | "bargeInDetected"
  | "bargeInConfirmed"
  | "backchannel"
  | "softBarge"
  | "hardBarge"
  | "speechStart"
  | "error"
  | "calibrationComplete";

const HAPTIC_PATTERNS: Record<HapticType, Record<HapticIntensity, number[]>> = {
  bargeInDetected: {
    light: [10, 20, 10],
    medium: [15, 30, 15],
    strong: [25, 40, 25],
  },
  bargeInConfirmed: {
    light: [25],
    medium: [40],
    strong: [60],
  },
  backchannel: {
    light: [3],
    medium: [5],
    strong: [10],
  },
  softBarge: {
    light: [15, 30, 15],
    medium: [25, 50, 25],
    strong: [40, 70, 40],
  },
  hardBarge: {
    light: [30, 20, 30],
    medium: [50, 30, 50],
    strong: [80, 40, 80],
  },
  speechStart: {
    light: [5],
    medium: [10],
    strong: [15],
  },
  error: {
    light: [50, 30, 50, 30, 50],
    medium: [100, 50, 100, 50, 100],
    strong: [150, 70, 150, 70, 150],
  },
  calibrationComplete: {
    light: [20, 100, 20],
    medium: [30, 100, 30],
    strong: [50, 100, 50],
  },
};

export function useHapticFeedback() {
  const isSupported = useRef(false);

  useEffect(() => {
    isSupported.current = "vibrate" in navigator;
  }, []);

  const vibrate = useCallback((pattern: number | number[]) => {
    if (!isSupported.current) return false;
    try {
      navigator.vibrate(pattern);
      return true;
    } catch {
      return false;
    }
  }, []);

  const triggerHaptic = useCallback(
    (type: HapticType, intensity: HapticIntensity = "medium") => {
      const pattern = HAPTIC_PATTERNS[type]?.[intensity];
      if (pattern) vibrate(pattern);
    },
    [vibrate],
  );

  const stopHaptic = useCallback(() => {
    if (isSupported.current) {
      navigator.vibrate(0);
    }
  }, []);

  return {
    isSupported: isSupported.current,
    triggerHaptic,
    stopHaptic,
  };
}
```

### Implementation: Audio Feedback with Voice Prompts

```typescript
// src/lib/audioFeedback.ts

type FeedbackType = "detected" | "confirmed" | "backchannel" | "soft" | "hard";

const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

const TONE_FREQUENCIES: Record<FeedbackType, number> = {
  detected: 440, // A4
  confirmed: 523.25, // C5
  backchannel: 329.63, // E4
  soft: 392, // G4
  hard: 587.33, // D5
};

const TONE_DURATIONS: Record<FeedbackType, number> = {
  detected: 50,
  confirmed: 80,
  backchannel: 30,
  soft: 60,
  hard: 100,
};

export function playAudioFeedback(type: FeedbackType, volume: number = 0.3): void {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = TONE_FREQUENCIES[type];
  oscillator.type = "sine";

  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + TONE_DURATIONS[type] / 1000);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + TONE_DURATIONS[type] / 1000);
}

let speechSynthesis: SpeechSynthesis | null = null;

export function speakPrompt(text: string, language: string = "en-US"): void {
  if (!speechSynthesis) {
    speechSynthesis = window.speechSynthesis;
  }

  // Cancel any ongoing speech
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = 1.1;
  utterance.pitch = 1.0;
  utterance.volume = 0.8;

  speechSynthesis.speak(utterance);
}

// Pre-load common voice prompts for faster playback
const VOICE_PROMPT_CACHE = new Map<string, AudioBuffer>();

export async function preloadVoicePrompt(text: string, language: string = "en-US"): Promise<void> {
  // Use Web Speech API to pre-synthesize
  // In production, use pre-recorded audio files or TTS API
  const cacheKey = `${language}:${text}`;
  if (VOICE_PROMPT_CACHE.has(cacheKey)) return;

  // Placeholder for pre-recorded audio loading
  // const response = await fetch(`/audio/prompts/${language}/${encodeURIComponent(text)}.mp3`);
  // const arrayBuffer = await response.arrayBuffer();
  // const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  // VOICE_PROMPT_CACHE.set(cacheKey, audioBuffer);
}

export function playVoicePromptFromCache(text: string, language: string = "en-US"): boolean {
  const cacheKey = `${language}:${text}`;
  const buffer = VOICE_PROMPT_CACHE.get(cacheKey);

  if (!buffer) return false;

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start(0);

  return true;
}
```

---

## Phase 3: Context-Aware Interruption Intelligence

**Goal:** Understand the _intent_ behind interruptions with multilingual support

### New Files to Create

| File                                                       | Purpose                            | Size Est.  |
| ---------------------------------------------------------- | ---------------------------------- | ---------- |
| `src/lib/bargeInClassifier/index.ts`                       | Main classifier module             | ~350 lines |
| `src/lib/bargeInClassifier/backchannelDetector.ts`         | Multilingual backchannel detection | ~250 lines |
| `src/lib/bargeInClassifier/intentClassifier.ts`            | Intent classification logic        | ~250 lines |
| `src/lib/bargeInClassifier/phraseLibrary.ts`               | Language-specific phrase lists     | ~300 lines |
| `src/lib/bargeInClassifier/types.ts`                       | Type definitions                   | ~100 lines |
| `services/api-gateway/app/services/barge_in_classifier.py` | Server-side classification         | ~300 lines |

### Multilingual Backchannel Patterns

```typescript
// src/lib/bargeInClassifier/phraseLibrary.ts

import { SupportedLanguage } from "../types";

export interface BackchannelPattern {
  phrases: string[];
  maxDuration: number;
  confidence?: number;
}

export interface SoftBargePattern {
  phrases: string[];
  requiresFollowUp: boolean;
}

export const BACKCHANNEL_PATTERNS: Record<SupportedLanguage, BackchannelPattern[]> = {
  en: [
    { phrases: ["uh huh", "uh-huh", "uhuh", "mm hmm", "mmhmm", "mhm"], maxDuration: 600 },
    { phrases: ["yeah", "yep", "yes", "yea", "ya"], maxDuration: 400 },
    { phrases: ["okay", "ok", "k", "kay"], maxDuration: 400 },
    { phrases: ["right", "right right"], maxDuration: 500 },
    { phrases: ["sure", "got it", "gotcha"], maxDuration: 500 },
    { phrases: ["I see", "interesting", "cool"], maxDuration: 600 },
  ],
  ar: [
    { phrases: ["نعم", "اه", "اها", "ايوه", "ايه"], maxDuration: 500 },
    { phrases: ["صح", "صحيح", "تمام", "ماشي"], maxDuration: 500 },
    { phrases: ["طيب", "حسنا", "اوكي"], maxDuration: 400 },
    { phrases: ["فاهم", "مفهوم"], maxDuration: 600 },
  ],
  es: [
    { phrases: ["sí", "si", "ajá", "aha"], maxDuration: 400 },
    { phrases: ["vale", "ok", "bueno"], maxDuration: 400 },
    { phrases: ["claro", "entiendo", "ya"], maxDuration: 500 },
    { phrases: ["mmm", "mhm"], maxDuration: 400 },
  ],
  fr: [
    { phrases: ["oui", "ouais", "mouais"], maxDuration: 400 },
    { phrases: ["d'accord", "ok", "entendu"], maxDuration: 500 },
    { phrases: ["je vois", "ah bon", "mmm"], maxDuration: 600 },
    { phrases: ["bien", "super", "parfait"], maxDuration: 500 },
  ],
  de: [
    { phrases: ["ja", "jap", "jo"], maxDuration: 400 },
    { phrases: ["okay", "ok", "gut"], maxDuration: 400 },
    { phrases: ["genau", "richtig", "stimmt"], maxDuration: 500 },
    { phrases: ["verstehe", "aha", "mmm"], maxDuration: 600 },
  ],
  zh: [
    { phrases: ["嗯", "哦", "啊"], maxDuration: 400 },
    { phrases: ["是", "对", "好"], maxDuration: 400 },
    { phrases: ["明白", "了解", "知道"], maxDuration: 600 },
    { phrases: ["没问题", "可以"], maxDuration: 600 },
  ],
  ja: [
    { phrases: ["はい", "うん", "ええ"], maxDuration: 400 },
    { phrases: ["そうですね", "なるほど"], maxDuration: 700 },
    { phrases: ["分かりました", "了解"], maxDuration: 800 },
  ],
  ko: [
    { phrases: ["네", "응", "예"], maxDuration: 400 },
    { phrases: ["그래요", "맞아요", "알겠어요"], maxDuration: 600 },
    { phrases: ["좋아요", "오케이"], maxDuration: 500 },
  ],
  pt: [
    { phrases: ["sim", "é", "ahã"], maxDuration: 400 },
    { phrases: ["ok", "tá", "certo"], maxDuration: 400 },
    { phrases: ["entendi", "compreendo", "sei"], maxDuration: 600 },
  ],
  ru: [
    { phrases: ["да", "ага", "угу"], maxDuration: 400 },
    { phrases: ["понятно", "ясно", "хорошо"], maxDuration: 600 },
    { phrases: ["ладно", "окей", "ок"], maxDuration: 400 },
  ],
  hi: [
    { phrases: ["हाँ", "जी", "अच्छा"], maxDuration: 400 },
    { phrases: ["ठीक है", "समझ गया", "सही"], maxDuration: 600 },
    { phrases: ["हम्म", "ओके"], maxDuration: 400 },
  ],
  tr: [
    { phrases: ["evet", "hı hı", "tamam"], maxDuration: 400 },
    { phrases: ["anladım", "peki", "oldu"], maxDuration: 600 },
    { phrases: ["doğru", "iyi", "güzel"], maxDuration: 500 },
  ],
};

export const SOFT_BARGE_PATTERNS: Record<SupportedLanguage, SoftBargePattern[]> = {
  en: [
    { phrases: ["wait", "hold on", "hang on", "one moment"], requiresFollowUp: true },
    { phrases: ["actually", "but", "well", "um"], requiresFollowUp: true },
    { phrases: ["let me", "can I", "I want to"], requiresFollowUp: true },
  ],
  ar: [
    { phrases: ["انتظر", "لحظة", "ثانية"], requiresFollowUp: true },
    { phrases: ["بس", "لكن", "في الحقيقة"], requiresFollowUp: true },
  ],
  es: [
    { phrases: ["espera", "un momento", "para"], requiresFollowUp: true },
    { phrases: ["pero", "en realidad", "bueno"], requiresFollowUp: true },
  ],
  fr: [
    { phrases: ["attends", "un moment", "une seconde"], requiresFollowUp: true },
    { phrases: ["mais", "en fait", "euh"], requiresFollowUp: true },
  ],
  de: [
    { phrases: ["warte", "moment", "einen Augenblick"], requiresFollowUp: true },
    { phrases: ["aber", "eigentlich", "also"], requiresFollowUp: true },
  ],
  zh: [
    { phrases: ["等一下", "等等", "稍等"], requiresFollowUp: true },
    { phrases: ["但是", "其实", "不过"], requiresFollowUp: true },
  ],
  ja: [
    { phrases: ["ちょっと待って", "待って", "少々"], requiresFollowUp: true },
    { phrases: ["でも", "実は", "あの"], requiresFollowUp: true },
  ],
  ko: [
    { phrases: ["잠깐만", "잠시만요", "기다려"], requiresFollowUp: true },
    { phrases: ["그런데", "사실은", "근데"], requiresFollowUp: true },
  ],
  pt: [
    { phrases: ["espera", "um momento", "peraí"], requiresFollowUp: true },
    { phrases: ["mas", "na verdade", "bom"], requiresFollowUp: true },
  ],
  ru: [
    { phrases: ["подожди", "секунду", "минутку"], requiresFollowUp: true },
    { phrases: ["но", "на самом деле", "вообще-то"], requiresFollowUp: true },
  ],
  hi: [
    { phrases: ["रुको", "एक मिनट", "ज़रा"], requiresFollowUp: true },
    { phrases: ["लेकिन", "असल में", "वैसे"], requiresFollowUp: true },
  ],
  tr: [
    { phrases: ["bekle", "bir dakika", "dur"], requiresFollowUp: true },
    { phrases: ["ama", "aslında", "şey"], requiresFollowUp: true },
  ],
};
```

### Implementation: Multilingual BackchannelDetector

```typescript
// src/lib/bargeInClassifier/backchannelDetector.ts

import { SupportedLanguage } from "../types";
import { BACKCHANNEL_PATTERNS, SOFT_BARGE_PATTERNS, BackchannelPattern } from "./phraseLibrary";

export interface BackchannelResult {
  isBackchannel: boolean;
  matchedPattern?: string;
  score: number;
  language: SupportedLanguage;
  shouldEscalate: boolean; // True if repeated backchannels suggest user wants to speak
}

export interface SoftBargeResult {
  isSoftBarge: boolean;
  matchedPattern?: string;
  requiresFollowUp: boolean;
  language: SupportedLanguage;
}

export class BackchannelDetector {
  private language: SupportedLanguage;
  private patterns: BackchannelPattern[];
  private recentDetections: Map<string, number[]> = new Map();
  private readonly ESCALATION_THRESHOLD = 3;
  private readonly ESCALATION_WINDOW_MS = 5000;

  constructor(language: SupportedLanguage = "en") {
    this.language = language;
    this.patterns = BACKCHANNEL_PATTERNS[language] || BACKCHANNEL_PATTERNS.en;
  }

  setLanguage(language: SupportedLanguage): void {
    this.language = language;
    this.patterns = BACKCHANNEL_PATTERNS[language] || BACKCHANNEL_PATTERNS.en;
  }

  detect(transcript: string, duration: number, confidence: number): BackchannelResult {
    const normalized = transcript.toLowerCase().trim();

    // Too long to be a backchannel
    if (duration > 800) {
      return {
        isBackchannel: false,
        score: 0,
        language: this.language,
        shouldEscalate: false,
      };
    }

    for (const pattern of this.patterns) {
      if (duration > pattern.maxDuration) continue;

      for (const phrase of pattern.phrases) {
        if (normalized === phrase || normalized.startsWith(phrase + " ")) {
          const score = confidence * (1 - duration / 1000);
          const shouldEscalate = this.trackAndCheckEscalation(phrase);

          return {
            isBackchannel: score > 0.6 && !shouldEscalate,
            matchedPattern: phrase,
            score,
            language: this.language,
            shouldEscalate,
          };
        }
      }
    }

    return {
      isBackchannel: false,
      score: 0,
      language: this.language,
      shouldEscalate: false,
    };
  }

  detectSoftBarge(transcript: string): SoftBargeResult {
    const normalized = transcript.toLowerCase().trim();
    const softPatterns = SOFT_BARGE_PATTERNS[this.language] || SOFT_BARGE_PATTERNS.en;

    for (const pattern of softPatterns) {
      for (const phrase of pattern.phrases) {
        if (normalized.startsWith(phrase)) {
          return {
            isSoftBarge: true,
            matchedPattern: phrase,
            requiresFollowUp: pattern.requiresFollowUp,
            language: this.language,
          };
        }
      }
    }

    return {
      isSoftBarge: false,
      requiresFollowUp: false,
      language: this.language,
    };
  }

  private trackAndCheckEscalation(pattern: string): boolean {
    const now = Date.now();
    const timestamps = this.recentDetections.get(pattern) || [];

    // Clean old entries
    const recentTimestamps = timestamps.filter((t) => now - t < this.ESCALATION_WINDOW_MS);
    recentTimestamps.push(now);

    this.recentDetections.set(pattern, recentTimestamps);

    // 3+ backchannels in 5 seconds = user probably wants to speak
    return recentTimestamps.length >= this.ESCALATION_THRESHOLD;
  }

  reset(): void {
    this.recentDetections.clear();
  }
}
```

---

## Phase 4: Advanced Audio Processing

**Goal:** Perfect separation of user voice from AI playback with advanced echo cancellation

### New Files to Create

| File                                           | Purpose                          | Size Est.  |
| ---------------------------------------------- | -------------------------------- | ---------- |
| `src/lib/echoCancellation/index.ts`            | Advanced AEC module              | ~450 lines |
| `src/lib/echoCancellation/adaptiveFilter.ts`   | NLMS adaptive filter             | ~250 lines |
| `src/lib/echoCancellation/speakerReference.ts` | Speaker audio reference tracking | ~200 lines |
| `public/aec-processor.js`                      | AudioWorklet for AEC             | ~300 lines |
| `src/lib/echoCancellation/privacyFilter.ts`    | Audio encryption/anonymization   | ~150 lines |

### Implementation: NLMS Adaptive Filter

```typescript
// src/lib/echoCancellation/adaptiveFilter.ts

export class AdaptiveFilter {
  private coefficients: Float32Array;
  private filterLength: number;
  private stepSize: number;
  private inputBuffer: Float32Array;
  private bufferIndex: number = 0;
  private readonly epsilon = 1e-8;

  constructor(filterLength: number, stepSize: number = 0.5) {
    this.filterLength = filterLength;
    this.stepSize = stepSize;
    this.coefficients = new Float32Array(filterLength);
    this.inputBuffer = new Float32Array(filterLength);
  }

  filter(input: Float32Array): Float32Array {
    const output = new Float32Array(input.length);

    for (let i = 0; i < input.length; i++) {
      this.inputBuffer[this.bufferIndex] = input[i];

      let y = 0;
      for (let j = 0; j < this.filterLength; j++) {
        const bufIdx = (this.bufferIndex - j + this.filterLength) % this.filterLength;
        y += this.coefficients[j] * this.inputBuffer[bufIdx];
      }
      output[i] = y;

      this.bufferIndex = (this.bufferIndex + 1) % this.filterLength;
    }

    return output;
  }

  update(desired: Float32Array, reference: Float32Array, error: Float32Array): void {
    let inputPower = 0;
    for (let i = 0; i < this.filterLength; i++) {
      inputPower += this.inputBuffer[i] * this.inputBuffer[i];
    }

    const normalizedStep = this.stepSize / (inputPower + this.epsilon);

    for (let i = 0; i < error.length; i++) {
      const e = error[i];
      for (let j = 0; j < this.filterLength; j++) {
        const bufIdx = (this.bufferIndex - i - j + this.filterLength * 2) % this.filterLength;
        this.coefficients[j] += normalizedStep * e * this.inputBuffer[bufIdx];
      }
    }
  }

  reset(): void {
    this.coefficients.fill(0);
    this.inputBuffer.fill(0);
    this.bufferIndex = 0;
  }
}
```

### Implementation: Privacy-Aware Audio Processing

```typescript
// src/lib/echoCancellation/privacyFilter.ts

/**
 * Privacy-aware audio processing
 * - Encrypts audio chunks in transit
 * - Strips metadata before logging
 * - Implements audio hashing for anonymized telemetry
 */

export interface PrivacyConfig {
  encryptInTransit: boolean;
  encryptionKey?: CryptoKey;
  anonymizeTelemetry: boolean;
  stripMetadata: boolean;
}

export class PrivacyFilter {
  private config: PrivacyConfig;
  private encryptionKey: CryptoKey | null = null;

  constructor(config: PrivacyConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.config.encryptInTransit && !this.config.encryptionKey) {
      this.encryptionKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]);
    } else {
      this.encryptionKey = this.config.encryptionKey || null;
    }
  }

  async encryptAudioChunk(chunk: Float32Array): Promise<ArrayBuffer> {
    if (!this.config.encryptInTransit || !this.encryptionKey) {
      return chunk.buffer;
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.encryptionKey, chunk.buffer);

    // Prepend IV to encrypted data
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);

    return result.buffer;
  }

  async decryptAudioChunk(encrypted: ArrayBuffer): Promise<Float32Array> {
    if (!this.config.encryptInTransit || !this.encryptionKey) {
      return new Float32Array(encrypted);
    }

    const data = new Uint8Array(encrypted);
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);

    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.encryptionKey, ciphertext);

    return new Float32Array(decrypted);
  }

  /**
   * Create anonymized hash of audio for telemetry
   * (can identify patterns without storing actual audio)
   */
  async hashAudioForTelemetry(chunk: Float32Array): Promise<string> {
    if (!this.config.anonymizeTelemetry) {
      return "disabled";
    }

    // Create a simple spectral fingerprint
    const fingerprint = this.createSpectralFingerprint(chunk);
    const hashBuffer = await crypto.subtle.digest("SHA-256", fingerprint);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }

  private createSpectralFingerprint(chunk: Float32Array): Float32Array {
    // Simplified spectral analysis for fingerprinting
    const bins = 16;
    const fingerprint = new Float32Array(bins);
    const binSize = Math.floor(chunk.length / bins);

    for (let i = 0; i < bins; i++) {
      let sum = 0;
      for (let j = 0; j < binSize; j++) {
        sum += Math.abs(chunk[i * binSize + j]);
      }
      fingerprint[i] = sum / binSize;
    }

    return fingerprint;
  }
}
```

---

## Phase 5: Natural Turn-Taking

**Goal:** Conversation flows like talking to a friend with natural pauses and transitions

### New Files to Create

| File                                     | Purpose                                   | Size Est.  |
| ---------------------------------------- | ----------------------------------------- | ---------- |
| `src/lib/turnTaking/index.ts`            | Turn-taking orchestration                 | ~350 lines |
| `src/lib/turnTaking/prosodicAnalyzer.ts` | Pitch/intonation analysis                 | ~300 lines |
| `src/lib/turnTaking/silencePredictor.ts` | Adaptive silence detection                | ~250 lines |
| `src/lib/turnTaking/contextResumer.ts`   | Context-aware resumption after interrupts | ~200 lines |
| `src/lib/turnTaking/types.ts`            | Type definitions                          | ~100 lines |

### Turn States

```typescript
export type TurnState =
  | "ai_turn" // AI is speaking
  | "user_turn" // User is speaking
  | "transition" // Switching turns
  | "overlap" // Both speaking (brief)
  | "pause" // Silence, waiting
  | "ai_yielding" // AI finished, expecting user
  | "ai_resuming"; // AI resuming after interrupt with summary
```

### Implementation: Context-Aware Resumption

```typescript
// src/lib/turnTaking/contextResumer.ts

import { SupportedLanguage } from "../types";

export interface ResumptionContext {
  interruptedContent: string;
  interruptedAtWord: number;
  totalWords: number;
  completionPercentage: number;
  keyPoints: string[];
  summary: string;
}

export interface ResumptionConfig {
  language: SupportedLanguage;
  maxSummaryLength: number;
  includeSummaryInResumption: boolean;
  resumptionStyle: "brief" | "detailed" | "ask-user";
}

const RESUMPTION_PHRASES: Record<
  SupportedLanguage,
  {
    brief: string[];
    detailed: string[];
    askUser: string[];
  }
> = {
  en: {
    brief: ["As I was saying,", "Continuing from where I was,", "To continue,"],
    detailed: [
      "Before we were interrupted, I was explaining that",
      "To summarize what I said: {summary}. Now,",
      "Let me recap: {summary}. Continuing,",
    ],
    askUser: [
      "Would you like me to continue from where I left off, or start fresh?",
      "Should I continue, or would you prefer to ask something else?",
    ],
  },
  ar: {
    brief: ["كما كنت أقول،", "استمرارًا لما كنت أقوله،"],
    detailed: ["قبل أن نتوقف، كنت أشرح أن", "للتلخيص: {summary}. والآن،"],
    askUser: ["هل تريد أن أكمل من حيث توقفت، أم تفضل البدء من جديد؟"],
  },
  // ... other languages
};

export class ContextResumer {
  private config: ResumptionConfig;
  private lastContext: ResumptionContext | null = null;

  constructor(config: Partial<ResumptionConfig> = {}) {
    this.config = {
      language: "en",
      maxSummaryLength: 100,
      includeSummaryInResumption: true,
      resumptionStyle: "brief",
      ...config,
    };
  }

  /**
   * Called by ThinkerService when a hard barge-in occurs
   * Stores the interrupted context for later resumption
   */
  captureInterruptedContext(fullResponse: string, interruptedAtIndex: number): ResumptionContext {
    const words = fullResponse.split(/\s+/);
    const interruptedAtWord = fullResponse.substring(0, interruptedAtIndex).split(/\s+/).length;
    const completionPercentage = (interruptedAtWord / words.length) * 100;

    // Extract key points from the response (simplified)
    const keyPoints = this.extractKeyPoints(fullResponse);

    // Generate a brief summary of what was said
    const spokenContent = fullResponse.substring(0, interruptedAtIndex);
    const summary = this.generateSummary(spokenContent);

    const context: ResumptionContext = {
      interruptedContent: fullResponse,
      interruptedAtWord,
      totalWords: words.length,
      completionPercentage,
      keyPoints,
      summary,
    };

    this.lastContext = context;
    return context;
  }

  /**
   * Generate the prefix for resuming a response after interruption
   */
  generateResumptionPrefix(): string {
    if (!this.lastContext) {
      return "";
    }

    const phrases = RESUMPTION_PHRASES[this.config.language] || RESUMPTION_PHRASES.en;
    const styleKey = this.config.resumptionStyle;
    const templates = phrases[styleKey];

    if (!templates || templates.length === 0) {
      return "";
    }

    const template = templates[Math.floor(Math.random() * templates.length)];

    if (this.config.includeSummaryInResumption && template.includes("{summary}")) {
      return template.replace("{summary}", this.lastContext.summary);
    }

    return template;
  }

  /**
   * Get the remaining content to be delivered after resumption
   */
  getRemainingContent(): string {
    if (!this.lastContext) {
      return "";
    }

    const words = this.lastContext.interruptedContent.split(/\s+/);
    const remaining = words.slice(this.lastContext.interruptedAtWord).join(" ");

    return remaining;
  }

  /**
   * Simple key point extraction (in production, use NLP/LLM)
   */
  private extractKeyPoints(content: string): string[] {
    // Simple heuristic: sentences with "important", "key", "main", etc.
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const keywords = ["important", "key", "main", "first", "second", "finally", "remember"];

    return sentences.filter((sentence) => keywords.some((kw) => sentence.toLowerCase().includes(kw))).slice(0, 3);
  }

  /**
   * Simple summarization (in production, use LLM)
   */
  private generateSummary(content: string): string {
    // Take first sentence or first N characters
    const firstSentence = content.split(/[.!?]/)[0];
    if (firstSentence.length <= this.config.maxSummaryLength) {
      return firstSentence.trim();
    }
    return firstSentence.substring(0, this.config.maxSummaryLength - 3).trim() + "...";
  }

  clear(): void {
    this.lastContext = null;
  }
}
```

---

## Phase 6: Full Duplex Experience

**Goal:** True simultaneous speaking capability for natural overlapping conversation

### New Files to Create

| File                                       | Purpose                          | Size Est.  |
| ------------------------------------------ | -------------------------------- | ---------- |
| `src/lib/fullDuplex/index.ts`              | Full duplex orchestrator         | ~300 lines |
| `src/lib/fullDuplex/audioMixer.ts`         | Mix user/AI audio for monitoring | ~200 lines |
| `src/lib/fullDuplex/overlapHandler.ts`     | Handle simultaneous speech       | ~250 lines |
| `src/components/voice/DuplexIndicator.tsx` | Visual for both-speaking state   | ~120 lines |

### Duplex State

```typescript
export interface DuplexState {
  userSpeaking: boolean;
  aiSpeaking: boolean;
  isOverlap: boolean;
  overlapDuration: number;
  activeStream: "user" | "ai" | "both" | "none";
  toolCallInProgress: boolean;
}

export interface FullDuplexConfig {
  overlapMode: "user_priority" | "ai_priority" | "intelligent";
  maxOverlapDuration: number; // Default: 500ms
  blendOverlapAudio: boolean;
  enableSidetone: boolean;
  sidetoneVolume: number; // Default: 0.1
  interruptThreshold: number; // VAD confidence to interrupt AI
  acknowledgmentThreshold: number; // Below this, treat as backchannel
  respectToolCallBoundaries: boolean; // Don't interrupt during tool execution
}
```

---

## Phase 7: Multilingual & Accent Support

**Goal:** Support 10+ languages with accent-aware processing

### New Files to Create

| File                                       | Purpose                         | Size Est.  |
| ------------------------------------------ | ------------------------------- | ---------- |
| `src/lib/multilingual/index.ts`            | Language detection & management | ~250 lines |
| `src/lib/multilingual/languageDetector.ts` | Auto-detect spoken language     | ~200 lines |
| `src/lib/multilingual/accentProfiles.ts`   | Accent-specific tuning          | ~300 lines |
| `src/stores/languagePreferencesStore.ts`   | Persist language settings       | ~100 lines |

### Implementation: Language Detector

```typescript
// src/lib/multilingual/languageDetector.ts

import { SupportedLanguage } from "../types";

export interface LanguageDetectionResult {
  detectedLanguage: SupportedLanguage;
  confidence: number;
  alternativeLanguages: Array<{ language: SupportedLanguage; confidence: number }>;
}

export class LanguageDetector {
  private lastDetections: SupportedLanguage[] = [];
  private readonly CONSISTENCY_WINDOW = 5;

  /**
   * Detect language from transcript
   * In production, use a dedicated language ID model or API
   */
  detectFromTranscript(transcript: string): LanguageDetectionResult {
    // Character-based heuristics for quick detection
    const arabicPattern = /[\u0600-\u06FF]/;
    const chinesePattern = /[\u4E00-\u9FFF]/;
    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF]/;
    const koreanPattern = /[\uAC00-\uD7AF]/;
    const cyrillicPattern = /[\u0400-\u04FF]/;
    const hindiPattern = /[\u0900-\u097F]/;

    let detectedLanguage: SupportedLanguage = "en";
    let confidence = 0.5;

    if (arabicPattern.test(transcript)) {
      detectedLanguage = "ar";
      confidence = 0.9;
    } else if (chinesePattern.test(transcript)) {
      detectedLanguage = "zh";
      confidence = 0.9;
    } else if (japanesePattern.test(transcript)) {
      detectedLanguage = "ja";
      confidence = 0.9;
    } else if (koreanPattern.test(transcript)) {
      detectedLanguage = "ko";
      confidence = 0.9;
    } else if (cyrillicPattern.test(transcript)) {
      detectedLanguage = "ru";
      confidence = 0.85;
    } else if (hindiPattern.test(transcript)) {
      detectedLanguage = "hi";
      confidence = 0.9;
    } else {
      // Latin script - need more analysis
      const result = this.detectLatinLanguage(transcript);
      detectedLanguage = result.language;
      confidence = result.confidence;
    }

    // Track for consistency
    this.lastDetections.push(detectedLanguage);
    if (this.lastDetections.length > this.CONSISTENCY_WINDOW) {
      this.lastDetections.shift();
    }

    // Boost confidence if consistent
    const consistentCount = this.lastDetections.filter((l) => l === detectedLanguage).length;
    if (consistentCount >= 3) {
      confidence = Math.min(0.95, confidence + 0.1);
    }

    return {
      detectedLanguage,
      confidence,
      alternativeLanguages: [],
    };
  }

  private detectLatinLanguage(transcript: string): { language: SupportedLanguage; confidence: number } {
    // Simple keyword-based detection for Latin-script languages
    const normalizedText = transcript.toLowerCase();

    const languageMarkers: Record<SupportedLanguage, string[]> = {
      es: ["que", "de", "el", "la", "es", "en", "los", "del", "por", "con", "una", "para", "como", "pero"],
      fr: ["le", "la", "les", "de", "et", "en", "un", "une", "que", "qui", "pour", "dans", "avec", "sur"],
      de: ["der", "die", "das", "und", "ist", "von", "mit", "den", "auch", "sich", "nicht", "auf", "ein"],
      pt: ["de", "que", "em", "um", "uma", "para", "com", "por", "mais", "como", "foi", "seu"],
      tr: ["ve", "bir", "bu", "için", "ile", "da", "de", "ben", "sen", "ne", "var", "daha"],
      en: ["the", "and", "is", "it", "to", "of", "in", "that", "for", "you", "with", "have"],
      ar: [],
      zh: [],
      ja: [],
      ko: [],
      ru: [],
      hi: [], // Non-Latin handled above
    };

    let bestMatch: SupportedLanguage = "en";
    let bestScore = 0;

    for (const [lang, markers] of Object.entries(languageMarkers)) {
      if (markers.length === 0) continue;

      const words = normalizedText.split(/\s+/);
      const matchCount = words.filter((w) => markers.includes(w)).length;
      const score = matchCount / words.length;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = lang as SupportedLanguage;
      }
    }

    return {
      language: bestMatch,
      confidence: Math.min(0.85, 0.5 + bestScore),
    };
  }

  reset(): void {
    this.lastDetections = [];
  }
}
```

### Accent Profiles

```typescript
// src/lib/multilingual/accentProfiles.ts

export interface AccentProfile {
  id: string;
  language: SupportedLanguage;
  region: string;
  vadAdjustments: {
    speechThresholdDelta: number;
    minSpeechDurationDelta: number;
  };
  backchannelAdditions?: string[];
  notes?: string;
}

export const ACCENT_PROFILES: AccentProfile[] = [
  // English accents
  {
    id: "en-US",
    language: "en",
    region: "United States",
    vadAdjustments: { speechThresholdDelta: 0, minSpeechDurationDelta: 0 },
  },
  {
    id: "en-GB",
    language: "en",
    region: "United Kingdom",
    vadAdjustments: { speechThresholdDelta: 0.02, minSpeechDurationDelta: 10 },
    backchannelAdditions: ["quite", "indeed", "cheers"],
  },
  {
    id: "en-IN",
    language: "en",
    region: "India",
    vadAdjustments: { speechThresholdDelta: 0.05, minSpeechDurationDelta: 15 },
    backchannelAdditions: ["achha", "haan", "theek hai"],
    notes: "May include Hindi fillers",
  },
  {
    id: "en-AU",
    language: "en",
    region: "Australia",
    vadAdjustments: { speechThresholdDelta: 0.02, minSpeechDurationDelta: 5 },
    backchannelAdditions: ["no worries", "reckon"],
  },
  // Arabic accents
  {
    id: "ar-EG",
    language: "ar",
    region: "Egypt",
    vadAdjustments: { speechThresholdDelta: 0.03, minSpeechDurationDelta: 10 },
    backchannelAdditions: ["ايوا", "طب", "معلش"],
  },
  {
    id: "ar-SA",
    language: "ar",
    region: "Saudi Arabia",
    vadAdjustments: { speechThresholdDelta: 0.05, minSpeechDurationDelta: 15 },
  },
  // Spanish accents
  {
    id: "es-MX",
    language: "es",
    region: "Mexico",
    vadAdjustments: { speechThresholdDelta: 0, minSpeechDurationDelta: 0 },
    backchannelAdditions: ["órale", "sale"],
  },
  {
    id: "es-ES",
    language: "es",
    region: "Spain",
    vadAdjustments: { speechThresholdDelta: 0.02, minSpeechDurationDelta: 5 },
    backchannelAdditions: ["venga", "tío"],
  },
  // Add more accent profiles as needed
];

export function getAccentProfile(accentId: string): AccentProfile | undefined {
  return ACCENT_PROFILES.find((p) => p.id === accentId);
}

export function getAccentsForLanguage(language: SupportedLanguage): AccentProfile[] {
  return ACCENT_PROFILES.filter((p) => p.language === language);
}
```

---

## Phase 8: Adaptive Personalization

**Goal:** Learn from user behavior to improve accuracy over time

### New Files to Create

| File                                            | Purpose                  | Size Est.  |
| ----------------------------------------------- | ------------------------ | ---------- |
| `src/lib/personalization/index.ts`              | Personalization manager  | ~300 lines |
| `src/lib/personalization/calibrationManager.ts` | Session calibration      | ~200 lines |
| `src/lib/personalization/preferenceStore.ts`    | Persist user preferences | ~150 lines |
| `src/lib/personalization/behaviorTracker.ts`    | Track user patterns      | ~200 lines |

### Implementation: Personalization Manager

```typescript
// src/lib/personalization/index.ts

import { UserBargeInPreferences, CalibrationResult, SupportedLanguage } from "../types";

export interface PersonalizationState {
  calibrated: boolean;
  calibrationResult: CalibrationResult | null;
  preferences: UserBargeInPreferences | null;
  behaviorStats: BehaviorStats;
}

export interface BehaviorStats {
  totalBargeIns: number;
  backchannelCount: number;
  softBargeCount: number;
  hardBargeCount: number;
  falsePositiveRate: number;
  averageBargeInDuration: number;
  preferredBackchannelPhrases: Map<string, number>;
  sessionCount: number;
}

export class PersonalizationManager {
  private userId: string | null = null;
  private state: PersonalizationState;
  private storageKey = "voiceassist_user_preferences";

  constructor() {
    this.state = {
      calibrated: false,
      calibrationResult: null,
      preferences: null,
      behaviorStats: this.createEmptyStats(),
    };
  }

  async initialize(userId?: string): Promise<void> {
    this.userId = userId || null;
    await this.loadPreferences();
  }

  private createEmptyStats(): BehaviorStats {
    return {
      totalBargeIns: 0,
      backchannelCount: 0,
      softBargeCount: 0,
      hardBargeCount: 0,
      falsePositiveRate: 0,
      averageBargeInDuration: 0,
      preferredBackchannelPhrases: new Map(),
      sessionCount: 0,
    };
  }

  applyCalibration(result: CalibrationResult): void {
    this.state.calibrated = true;
    this.state.calibrationResult = result;

    if (this.state.preferences) {
      // Adjust preferences based on calibration
      this.state.preferences.vadSensitivity = result.recommendedVadThreshold;
      this.state.preferences.silenceThreshold = result.recommendedSilenceThreshold;
      this.state.preferences.calibrationHistory.push(result);
      this.savePreferences();
    }
  }

  recordBargeIn(
    type: "backchannel" | "soft_barge" | "hard_barge",
    duration: number,
    phrase?: string,
    wasCorrect?: boolean,
  ): void {
    const stats = this.state.behaviorStats;
    stats.totalBargeIns++;

    switch (type) {
      case "backchannel":
        stats.backchannelCount++;
        if (phrase) {
          const count = stats.preferredBackchannelPhrases.get(phrase) || 0;
          stats.preferredBackchannelPhrases.set(phrase, count + 1);
        }
        break;
      case "soft_barge":
        stats.softBargeCount++;
        break;
      case "hard_barge":
        stats.hardBargeCount++;
        break;
    }

    // Update average duration
    const prevTotal = stats.averageBargeInDuration * (stats.totalBargeIns - 1);
    stats.averageBargeInDuration = (prevTotal + duration) / stats.totalBargeIns;

    // Track false positives
    if (wasCorrect === false) {
      const falsePositives = stats.falsePositiveRate * (stats.totalBargeIns - 1);
      stats.falsePositiveRate = (falsePositives + 1) / stats.totalBargeIns;
    }

    this.adaptThresholds();
  }

  private adaptThresholds(): void {
    if (!this.state.preferences) return;
    const stats = this.state.behaviorStats;

    // If false positive rate is high, increase threshold
    if (stats.falsePositiveRate > 0.1 && stats.totalBargeIns > 10) {
      this.state.preferences.vadSensitivity = Math.min(0.9, this.state.preferences.vadSensitivity + 0.02);
    }

    // If user uses many backchannels, be more tolerant
    const backchannelRatio = stats.backchannelCount / Math.max(1, stats.totalBargeIns);
    if (backchannelRatio > 0.5) {
      this.state.preferences.backchannelFrequency = "high";
    } else if (backchannelRatio < 0.2) {
      this.state.preferences.backchannelFrequency = "low";
    }

    this.savePreferences();
  }

  getRecommendedVADThreshold(): number {
    if (this.state.calibrationResult) {
      return this.state.calibrationResult.recommendedVadThreshold;
    }
    return this.state.preferences?.vadSensitivity ?? 0.5;
  }

  getUserPreferredBackchannels(): string[] {
    const phrases = this.state.behaviorStats.preferredBackchannelPhrases;
    return Array.from(phrases.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phrase]) => phrase);
  }

  async loadPreferences(): Promise<void> {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (!this.userId || data.userId === this.userId) {
          this.state.preferences = data;
        }
      }
    } catch (error) {
      console.warn("[Personalization] Failed to load preferences:", error);
    }

    if (!this.state.preferences) {
      this.state.preferences = this.createDefaultPreferences();
    }
  }

  private async savePreferences(): Promise<void> {
    if (!this.state.preferences) return;

    try {
      this.state.preferences.lastUpdated = Date.now();
      localStorage.setItem(this.storageKey, JSON.stringify(this.state.preferences));
    } catch (error) {
      console.warn("[Personalization] Failed to save preferences:", error);
    }
  }

  private createDefaultPreferences(): UserBargeInPreferences {
    return {
      userId: this.userId || "anonymous",
      vadSensitivity: 0.5,
      silenceThreshold: 0.35,
      preferredLanguage: "en",
      backchannelFrequency: "normal",
      feedbackPreferences: {
        visualFeedbackEnabled: true,
        visualFeedbackStyle: "pulse",
        hapticFeedbackEnabled: true,
        hapticIntensity: "medium",
        audioFeedbackEnabled: false,
        audioFeedbackType: "none",
        voicePromptAfterHardBarge: false,
      },
      calibrationHistory: [],
      lastUpdated: Date.now(),
    };
  }

  getState(): PersonalizationState {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      calibrated: false,
      calibrationResult: null,
      preferences: this.createDefaultPreferences(),
      behaviorStats: this.createEmptyStats(),
    };
    localStorage.removeItem(this.storageKey);
  }
}
```

---

## Phase 9: Offline & Low-Latency Fallback

**Goal:** Maintain barge-in functionality without network dependency

### New Files to Create

| File                                 | Purpose                   | Size Est.  |
| ------------------------------------ | ------------------------- | ---------- |
| `src/hooks/useOfflineVAD.ts`         | Lightweight on-device VAD | ~200 lines |
| `src/lib/offline/webrtcVAD.ts`       | WebRTC VAD wrapper        | ~150 lines |
| `src/lib/offline/ttsCacheManager.ts` | TTS response caching      | ~250 lines |
| `src/lib/offline/offlineFallback.ts` | Fallback orchestration    | ~200 lines |

### Implementation: Offline VAD Hook

```typescript
// src/hooks/useOfflineVAD.ts

import { useCallback, useEffect, useRef, useState } from "react";

interface WebRTCVADResult {
  isSpeech: boolean;
  energy: number;
  timestamp: number;
}

export interface UseOfflineVADOptions {
  enabled?: boolean;
  mode?: 0 | 1 | 2 | 3; // 0=quality, 3=aggressive
  frameDuration?: 10 | 20 | 30; // ms
  onSpeechStart?: () => void;
  onSpeechEnd?: (duration: number) => void;
}

export function useOfflineVAD(options: UseOfflineVADOptions = {}) {
  const { enabled = true, mode = 2, frameDuration = 20, onSpeechStart, onSpeechEnd } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const speechStartTimeRef = useRef<number | null>(null);

  // Simple energy-based VAD (WebRTC-like)
  const processAudioFrame = useCallback(
    (audioData: Float32Array): WebRTCVADResult => {
      // Calculate RMS energy
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        sum += audioData[i] * audioData[i];
      }
      const rms = Math.sqrt(sum / audioData.length);

      // Zero-crossing rate
      let zeroCrossings = 0;
      for (let i = 1; i < audioData.length; i++) {
        if (audioData[i] >= 0 !== audioData[i - 1] >= 0) {
          zeroCrossings++;
        }
      }
      const zcr = zeroCrossings / audioData.length;

      // Combine features for speech detection
      // Speech typically has: moderate energy + moderate ZCR
      // Noise typically has: low energy + high ZCR
      const energyThreshold = 0.015 + mode * 0.005; // Adjust by mode
      const zcrThreshold = 0.3;

      const isSpeech = rms > energyThreshold && zcr < zcrThreshold;

      return {
        isSpeech,
        energy: rms,
        timestamp: performance.now(),
      };
    },
    [mode],
  );

  const startListening = useCallback(
    async (stream: MediaStream) => {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const frameSize = (frameDuration / 1000) * 16000;
      const processor = audioContext.createScriptProcessor(frameSize, 1, 1);

      let consecutiveSpeech = 0;
      let consecutiveSilence = 0;
      const SPEECH_THRESHOLD = 3; // frames
      const SILENCE_THRESHOLD = 10; // frames

      processor.onaudioprocess = (event) => {
        const audioData = event.inputBuffer.getChannelData(0);
        const result = processAudioFrame(audioData);

        if (result.isSpeech) {
          consecutiveSpeech++;
          consecutiveSilence = 0;

          if (!isSpeaking && consecutiveSpeech >= SPEECH_THRESHOLD) {
            setIsSpeaking(true);
            speechStartTimeRef.current = performance.now();
            onSpeechStart?.();
          }
        } else {
          consecutiveSilence++;

          if (isSpeaking && consecutiveSilence >= SILENCE_THRESHOLD) {
            const duration = speechStartTimeRef.current ? performance.now() - speechStartTimeRef.current : 0;
            setIsSpeaking(false);
            speechStartTimeRef.current = null;
            consecutiveSpeech = 0;
            onSpeechEnd?.(duration);
          }
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      processorRef.current = processor;

      setIsListening(true);
    },
    [frameDuration, isSpeaking, onSpeechEnd, onSpeechStart, processAudioFrame],
  );

  const stopListening = useCallback(() => {
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    isSpeaking,
    startListening,
    stopListening,
  };
}
```

### Implementation: TTS Cache Manager

```typescript
// src/lib/offline/ttsCacheManager.ts

interface CacheEntry {
  audioBuffer: ArrayBuffer;
  text: string;
  voice: string;
  createdAt: number;
  accessCount: number;
}

export interface TTSCacheConfig {
  maxSizeMB: number;
  maxAge: number; // ms
  cacheCommonPhrases: boolean;
}

const COMMON_PHRASES = [
  "I'm listening",
  "Go ahead",
  "Please continue",
  "I understand",
  "Let me think about that",
  "One moment please",
  // Add more as needed
];

export class TTSCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private config: TTSCacheConfig;
  private currentSizeBytes = 0;
  private dbName = "voiceassist_tts_cache";

  constructor(config: Partial<TTSCacheConfig> = {}) {
    this.config = {
      maxSizeMB: 50,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      cacheCommonPhrases: true,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    await this.loadFromIndexedDB();
  }

  private getCacheKey(text: string, voice: string): string {
    return `${voice}:${text.toLowerCase().trim()}`;
  }

  async get(text: string, voice: string): Promise<ArrayBuffer | null> {
    const key = this.getCacheKey(text, voice);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.createdAt > this.config.maxAge) {
      await this.delete(key);
      return null;
    }

    // Update access count
    entry.accessCount++;
    return entry.audioBuffer;
  }

  async set(text: string, voice: string, audioBuffer: ArrayBuffer): Promise<void> {
    const key = this.getCacheKey(text, voice);
    const size = audioBuffer.byteLength;

    // Evict if necessary
    while (this.currentSizeBytes + size > this.config.maxSizeMB * 1024 * 1024) {
      this.evictLeastUsed();
    }

    const entry: CacheEntry = {
      audioBuffer,
      text,
      voice,
      createdAt: Date.now(),
      accessCount: 0,
    };

    this.cache.set(key, entry);
    this.currentSizeBytes += size;

    await this.saveToIndexedDB(key, entry);
  }

  private async delete(key: string): Promise<void> {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSizeBytes -= entry.audioBuffer.byteLength;
      this.cache.delete(key);
      await this.deleteFromIndexedDB(key);
    }
  }

  private evictLeastUsed(): void {
    let leastUsedKey: string | null = null;
    let leastAccessCount = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < leastAccessCount) {
        leastAccessCount = entry.accessCount;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.delete(leastUsedKey);
    }
  }

  async preloadCommonPhrases(voice: string, ttsFunction: (text: string) => Promise<ArrayBuffer>): Promise<void> {
    if (!this.config.cacheCommonPhrases) return;

    for (const phrase of COMMON_PHRASES) {
      const existing = await this.get(phrase, voice);
      if (!existing) {
        try {
          const audio = await ttsFunction(phrase);
          await this.set(phrase, voice, audio);
        } catch (error) {
          console.warn(`[TTSCache] Failed to preload: ${phrase}`, error);
        }
      }
    }
  }

  private async loadFromIndexedDB(): Promise<void> {
    // Implementation using IndexedDB for persistence
    const request = indexedDB.open(this.dbName, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
    };

    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        const db = request.result;
        const tx = db.transaction("cache", "readonly");
        const store = tx.objectStore("cache");
        const allRequest = store.getAll();

        allRequest.onsuccess = () => {
          for (const item of allRequest.result) {
            this.cache.set(item.key, item.entry);
            this.currentSizeBytes += item.entry.audioBuffer.byteLength;
          }
          resolve();
        };

        allRequest.onerror = () => reject(allRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async saveToIndexedDB(key: string, entry: CacheEntry): Promise<void> {
    const request = indexedDB.open(this.dbName, 1);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("cache", "readwrite");
        const store = tx.objectStore("cache");
        store.put({ key, entry });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }

  private async deleteFromIndexedDB(key: string): Promise<void> {
    const request = indexedDB.open(this.dbName, 1);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("cache", "readwrite");
        const store = tx.objectStore("cache");
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.currentSizeBytes = 0;

    const request = indexedDB.open(this.dbName, 1);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("cache", "readwrite");
        const store = tx.objectStore("cache");
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }

  getStats(): { entryCount: number; sizeMB: number } {
    return {
      entryCount: this.cache.size,
      sizeMB: this.currentSizeBytes / (1024 * 1024),
    };
  }
}
```

### Integration: Offline Fallback in useThinkerTalkerSession

```typescript
// Pseudocode for integrating offline fallback

// In useThinkerTalkerSession.ts
export function useThinkerTalkerSession(options: SessionOptions) {
  const { useOfflineVAD: enableOfflineFallback = true } = options;

  const neuralVAD = useNeuralVAD({ enabled: !enableOfflineFallback || isOnline });
  const offlineVAD = useOfflineVAD({ enabled: enableOfflineFallback && !isOnline });

  // Use the active VAD based on network status
  const activeVAD = isOnline ? neuralVAD : offlineVAD;

  // Automatically switch on network change
  useEffect(() => {
    const handleOnline = () => {
      if (neuralVAD.isLoaded) {
        // Switch to neural VAD
        offlineVAD.stopListening();
        neuralVAD.startListening(currentStream);
      }
    };

    const handleOffline = () => {
      // Switch to offline VAD
      neuralVAD.stopListening();
      offlineVAD.startListening(currentStream);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [neuralVAD, offlineVAD, currentStream]);

  // ... rest of hook
}
```

---

## Phase 10: Advanced Conversation Management

**Goal:** Sentiment and discourse analysis for context-aware AI behavior

### New Files to Create

| File                                                   | Purpose                    | Size Est.  |
| ------------------------------------------------------ | -------------------------- | ---------- |
| `src/lib/conversationManager/index.ts`                 | Conversation orchestrator  | ~350 lines |
| `src/lib/conversationManager/sentimentAnalyzer.ts`     | Detect user sentiment      | ~200 lines |
| `src/lib/conversationManager/discourseTracker.ts`      | Track conversation flow    | ~250 lines |
| `src/lib/conversationManager/turnTakingIntegration.ts` | Integrate with turn-taking | ~200 lines |
| `src/lib/conversationManager/toolCallHandler.ts`       | Safe tool interruption     | ~250 lines |

### Implementation: Conversation Manager

```typescript
// src/lib/conversationManager/index.ts

import { SentimentAnalyzer, SentimentResult } from "./sentimentAnalyzer";
import { DiscourseTracker, DiscourseState } from "./discourseTracker";
import { ToolCallHandler, ToolCallState } from "./toolCallHandler";
import { BargeInEvent, SupportedLanguage } from "../types";

export interface ConversationState {
  sentiment: SentimentResult;
  discourse: DiscourseState;
  activeToolCalls: ToolCallState[];
  turnCount: number;
  bargeInHistory: BargeInEvent[];
  lastUserIntent: string | null;
  suggestedFollowUps: string[];
}

export interface ConversationManagerConfig {
  language: SupportedLanguage;
  enableSentimentTracking: boolean;
  enableDiscourseAnalysis: boolean;
  maxBargeInHistory: number;
  followUpSuggestionEnabled: boolean;
}

export class ConversationManager {
  private config: ConversationManagerConfig;
  private sentimentAnalyzer: SentimentAnalyzer;
  private discourseTracker: DiscourseTracker;
  private toolCallHandler: ToolCallHandler;
  private state: ConversationState;

  constructor(config: Partial<ConversationManagerConfig> = {}) {
    this.config = {
      language: "en",
      enableSentimentTracking: true,
      enableDiscourseAnalysis: true,
      maxBargeInHistory: 20,
      followUpSuggestionEnabled: true,
      ...config,
    };

    this.sentimentAnalyzer = new SentimentAnalyzer(this.config.language);
    this.discourseTracker = new DiscourseTracker();
    this.toolCallHandler = new ToolCallHandler();

    this.state = this.createInitialState();
  }

  private createInitialState(): ConversationState {
    return {
      sentiment: { sentiment: "neutral", confidence: 0, valence: 0, arousal: 0 },
      discourse: { topic: null, phase: "opening", coherence: 1.0 },
      activeToolCalls: [],
      turnCount: 0,
      bargeInHistory: [],
      lastUserIntent: null,
      suggestedFollowUps: [],
    };
  }

  /**
   * Process a user utterance and update conversation state
   */
  processUserUtterance(transcript: string, duration: number): void {
    this.state.turnCount++;

    if (this.config.enableSentimentTracking) {
      this.state.sentiment = this.sentimentAnalyzer.analyze(transcript);
    }

    if (this.config.enableDiscourseAnalysis) {
      this.state.discourse = this.discourseTracker.update(transcript, "user");
    }

    // Adjust AI behavior based on sentiment
    if (this.state.sentiment.sentiment === "frustrated") {
      this.state.suggestedFollowUps = ["Would you like me to slow down?", "Let me try explaining that differently."];
    }
  }

  /**
   * Handle a barge-in event
   */
  handleBargeIn(event: BargeInEvent): {
    shouldInterrupt: boolean;
    shouldSummarize: boolean;
    message?: string;
  } {
    // Add to history
    this.state.bargeInHistory.push(event);
    if (this.state.bargeInHistory.length > this.config.maxBargeInHistory) {
      this.state.bargeInHistory.shift();
    }

    // Check if there's an active tool call
    const activeToolCall = this.state.activeToolCalls.find((tc) => tc.status === "executing");

    if (activeToolCall && event.type === "hard_barge") {
      const result = this.toolCallHandler.handleInterruption(activeToolCall, event);

      if (!result.canInterrupt) {
        return {
          shouldInterrupt: false,
          shouldSummarize: false,
          message: result.userMessage,
        };
      }
    }

    // Analyze barge-in patterns
    const recentHardBarges = this.state.bargeInHistory
      .filter((b) => b.type === "hard_barge")
      .filter((b) => Date.now() - b.timestamp < 60000);

    // If user frequently interrupts, they might be frustrated
    if (recentHardBarges.length >= 3) {
      this.state.sentiment = {
        ...this.state.sentiment,
        sentiment: "frustrated",
        confidence: Math.min(1, this.state.sentiment.confidence + 0.2),
      };
    }

    return {
      shouldInterrupt: true,
      shouldSummarize: event.completionPercentage > 30,
    };
  }

  /**
   * Register a tool call for interrupt handling
   */
  registerToolCall(id: string, name: string, safeToInterrupt: boolean, rollbackAction?: () => Promise<void>): void {
    this.state.activeToolCalls.push({
      id,
      name,
      status: "pending",
      safeToInterrupt,
      rollbackAction,
      startedAt: Date.now(),
    });
  }

  updateToolCallStatus(id: string, status: ToolCallState["status"]): void {
    const toolCall = this.state.activeToolCalls.find((tc) => tc.id === id);
    if (toolCall) {
      toolCall.status = status;
    }
  }

  /**
   * Get recommendations for AI response behavior
   */
  getResponseRecommendations(): {
    speakSlower: boolean;
    useSimpleLanguage: boolean;
    offerClarification: boolean;
    pauseForQuestions: boolean;
  } {
    const { sentiment, discourse, bargeInHistory } = this.state;

    const recentBargeIns = bargeInHistory.filter((b) => Date.now() - b.timestamp < 120000);

    return {
      speakSlower: sentiment.sentiment === "frustrated" || sentiment.sentiment === "confused",
      useSimpleLanguage: recentBargeIns.length > 2,
      offerClarification: sentiment.sentiment === "confused",
      pauseForQuestions: discourse.phase === "explanation" && recentBargeIns.some((b) => b.type === "soft_barge"),
    };
  }

  getState(): ConversationState {
    return { ...this.state };
  }

  reset(): void {
    this.state = this.createInitialState();
    this.discourseTracker.reset();
    this.toolCallHandler.reset();
  }
}
```

### Implementation: Tool Call Handler

```typescript
// src/lib/conversationManager/toolCallHandler.ts

import { BargeInEvent } from "../types";

export interface ToolCallState {
  id: string;
  name: string;
  status: "pending" | "executing" | "completed" | "cancelled" | "rolled_back";
  safeToInterrupt: boolean;
  rollbackAction?: () => Promise<void>;
  startedAt: number;
}

export interface InterruptionResult {
  canInterrupt: boolean;
  action: "cancel" | "rollback" | "queue" | "wait";
  userMessage?: string;
  rollbackPerformed?: boolean;
}

// Tools that should NOT be interrupted
const CRITICAL_TOOLS = ["save_document", "send_email", "make_payment", "submit_form", "database_write"];

// Tools that can be safely cancelled
const SAFE_TO_CANCEL_TOOLS = ["search", "read_document", "fetch_data", "calculate", "lookup"];

export class ToolCallHandler {
  private pendingInterruptions: Array<{
    bargeIn: BargeInEvent;
    toolCallId: string;
  }> = [];

  handleInterruption(toolCall: ToolCallState, bargeIn: BargeInEvent): InterruptionResult {
    // Check if tool is in critical list
    const isCritical = CRITICAL_TOOLS.some((t) => toolCall.name.toLowerCase().includes(t));

    // Check if tool is marked as safe to interrupt
    if (toolCall.safeToInterrupt || SAFE_TO_CANCEL_TOOLS.some((t) => toolCall.name.toLowerCase().includes(t))) {
      return {
        canInterrupt: true,
        action: "cancel",
      };
    }

    if (isCritical) {
      // Queue the interruption for after tool completes
      this.pendingInterruptions.push({
        bargeIn,
        toolCallId: toolCall.id,
      });

      return {
        canInterrupt: false,
        action: "queue",
        userMessage: `Please hold on, I'm completing an important action (${toolCall.name}). I'll be right with you.`,
      };
    }

    // For other tools, check if rollback is possible
    if (toolCall.rollbackAction) {
      return {
        canInterrupt: true,
        action: "rollback",
      };
    }

    // Default: allow interruption but log it
    return {
      canInterrupt: true,
      action: "cancel",
    };
  }

  async executeRollback(toolCall: ToolCallState): Promise<boolean> {
    if (!toolCall.rollbackAction) {
      return false;
    }

    try {
      await toolCall.rollbackAction();
      toolCall.status = "rolled_back";
      return true;
    } catch (error) {
      console.error(`[ToolCallHandler] Rollback failed for ${toolCall.id}:`, error);
      return false;
    }
  }

  getPendingInterruptions(): Array<{ bargeIn: BargeInEvent; toolCallId: string }> {
    return [...this.pendingInterruptions];
  }

  clearPendingInterruption(toolCallId: string): BargeInEvent | null {
    const index = this.pendingInterruptions.findIndex((p) => p.toolCallId === toolCallId);

    if (index >= 0) {
      const [removed] = this.pendingInterruptions.splice(index, 1);
      return removed.bargeIn;
    }

    return null;
  }

  reset(): void {
    this.pendingInterruptions = [];
  }
}
```

---

## Privacy & Security

### Data Protection Principles

```typescript
// src/lib/privacy/config.ts

export interface PrivacyPolicy {
  // Audio handling
  audioEncryptionEnabled: boolean;
  audioRetentionPolicy: "none" | "session" | "24h" | "7d";
  audioStorageLocation: "memory" | "local" | "server";

  // Telemetry
  telemetryEnabled: boolean;
  telemetryAnonymized: boolean;
  telemetryFields: string[]; // Whitelist of fields to collect

  // User data
  storeUserPreferences: boolean;
  userDataRetention: number; // days

  // Model verification
  verifyOnDeviceModels: boolean;
  modelChecksums: Record<string, string>;
}

export const DEFAULT_PRIVACY_POLICY: PrivacyPolicy = {
  audioEncryptionEnabled: true,
  audioRetentionPolicy: "none",
  audioStorageLocation: "memory",
  telemetryEnabled: true,
  telemetryAnonymized: true,
  telemetryFields: [
    "bargeInType",
    "detectionLatencyMs",
    "classificationConfidence",
    "sessionDurationMs",
    "language",
    // Excludes: transcript, userId, audioData
  ],
  storeUserPreferences: true,
  userDataRetention: 365,
  verifyOnDeviceModels: true,
  modelChecksums: {
    "silero_vad.onnx": "sha256:abc123...", // Actual checksum
    "silero_vad_lite.onnx": "sha256:def456...",
  },
};
```

### Implementation: Privacy-Compliant Telemetry

```typescript
// src/lib/privacy/telemetryCollector.ts

import { PrivacyPolicy } from "./config";

export interface BargeInTelemetryEvent {
  // Always collected (anonymized)
  eventId: string;
  timestamp: number;
  bargeInType: "backchannel" | "soft_barge" | "hard_barge";
  detectionLatencyMs: number;
  classificationConfidence: number;
  language: string;

  // Collected only if not anonymized
  userId?: string;
  sessionId?: string;

  // Never collected in anonymized mode
  // transcript: string;
  // audioHash: string;
}

export class TelemetryCollector {
  private policy: PrivacyPolicy;
  private buffer: BargeInTelemetryEvent[] = [];
  private readonly BUFFER_SIZE = 50;
  private readonly FLUSH_INTERVAL = 60000; // 1 minute

  constructor(policy: PrivacyPolicy) {
    this.policy = policy;

    if (this.policy.telemetryEnabled) {
      setInterval(() => this.flush(), this.FLUSH_INTERVAL);
    }
  }

  record(event: Partial<BargeInTelemetryEvent>): void {
    if (!this.policy.telemetryEnabled) return;

    const sanitizedEvent = this.sanitize(event);
    this.buffer.push(sanitizedEvent);

    if (this.buffer.length >= this.BUFFER_SIZE) {
      this.flush();
    }
  }

  private sanitize(event: Partial<BargeInTelemetryEvent>): BargeInTelemetryEvent {
    const sanitized: BargeInTelemetryEvent = {
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      bargeInType: event.bargeInType || "hard_barge",
      detectionLatencyMs: event.detectionLatencyMs || 0,
      classificationConfidence: event.classificationConfidence || 0,
      language: event.language || "en",
    };

    // Only include non-anonymized fields if policy allows
    if (!this.policy.telemetryAnonymized) {
      sanitized.userId = event.userId;
      sanitized.sessionId = event.sessionId;
    }

    // Filter to only allowed fields
    const filtered: any = {};
    for (const field of this.policy.telemetryFields) {
      if (field in sanitized) {
        filtered[field] = (sanitized as any)[field];
      }
    }

    return { ...sanitized, ...filtered };
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      // Send to analytics endpoint (in production)
      // await fetch('/api/telemetry', {
      //   method: 'POST',
      //   body: JSON.stringify({ events }),
      // });

      console.debug(`[Telemetry] Flushed ${events.length} events`);
    } catch (error) {
      // Re-add to buffer on failure
      this.buffer = [...events, ...this.buffer].slice(0, this.BUFFER_SIZE);
      console.warn("[Telemetry] Flush failed:", error);
    }
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}
```

### Model Verification

```typescript
// src/lib/privacy/modelVerifier.ts

export class ModelVerifier {
  private checksums: Record<string, string>;

  constructor(checksums: Record<string, string>) {
    this.checksums = checksums;
  }

  async verifyModel(modelPath: string, modelData: ArrayBuffer): Promise<boolean> {
    const expectedChecksum = this.checksums[modelPath];
    if (!expectedChecksum) {
      console.warn(`[ModelVerifier] No checksum found for ${modelPath}`);
      return false;
    }

    const actualChecksum = await this.computeChecksum(modelData);
    const isValid = actualChecksum === expectedChecksum;

    if (!isValid) {
      console.error(`[ModelVerifier] Checksum mismatch for ${modelPath}`);
      console.error(`  Expected: ${expectedChecksum}`);
      console.error(`  Actual: ${actualChecksum}`);
    }

    return isValid;
  }

  private async computeChecksum(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return `sha256:${hashHex}`;
  }
}
```

---

## Continuous Learning Pipeline

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CONTINUOUS LEARNING PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │   Client    │───►│  Telemetry  │───►│   Data      │───►│   Model     │   │
│  │   Events    │    │   Service   │    │   Pipeline  │    │   Training  │   │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘   │
│        │                   │                  │                  │          │
│        │                   ▼                  ▼                  ▼          │
│        │           ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│        │           │  Anonymize  │    │  Aggregate  │    │  Validate   │   │
│        │           │  & Filter   │    │  & Label    │    │  & Deploy   │   │
│        │           └─────────────┘    └─────────────┘    └─────────────┘   │
│        │                                                         │          │
│        │                                                         ▼          │
│        │                                                  ┌─────────────┐   │
│        └─────────────────────────────────────────────────│  Updated    │   │
│                           Model Update                    │  Models     │   │
│                                                          └─────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation: Learning Data Collector

```typescript
// src/lib/learning/dataCollector.ts

export interface ClassificationSample {
  // Features (anonymized)
  duration: number;
  energy: number;
  vadConfidence: number;
  spectralFeatures: number[];

  // Classification
  predictedClass: "backchannel" | "soft_barge" | "hard_barge";
  actualClass?: "backchannel" | "soft_barge" | "hard_barge" | "false_positive";

  // Metadata
  language: string;
  timestamp: number;
  modelVersion: string;
}

export class LearningDataCollector {
  private samples: ClassificationSample[] = [];
  private readonly MAX_SAMPLES = 1000;

  recordSample(sample: ClassificationSample): void {
    this.samples.push(sample);

    if (this.samples.length > this.MAX_SAMPLES) {
      this.samples.shift();
    }
  }

  recordUserCorrection(sampleId: string, actualClass: ClassificationSample["actualClass"]): void {
    // Find and update the sample
    const sample = this.samples.find((s) => `${s.timestamp}` === sampleId);

    if (sample) {
      sample.actualClass = actualClass;
    }
  }

  getLabeledSamples(): ClassificationSample[] {
    return this.samples.filter((s) => s.actualClass !== undefined);
  }

  getAccuracyMetrics(): {
    overall: number;
    byClass: Record<string, number>;
  } {
    const labeled = this.getLabeledSamples();
    if (labeled.length === 0) {
      return { overall: 0, byClass: {} };
    }

    const correct = labeled.filter((s) => s.predictedClass === s.actualClass).length;
    const overall = correct / labeled.length;

    const byClass: Record<string, number> = {};
    const classes = ["backchannel", "soft_barge", "hard_barge"];

    for (const cls of classes) {
      const classLabeled = labeled.filter((s) => s.actualClass === cls);
      const classCorrect = classLabeled.filter((s) => s.predictedClass === cls).length;
      byClass[cls] = classLabeled.length > 0 ? classCorrect / classLabeled.length : 0;
    }

    return { overall, byClass };
  }

  exportForTraining(): string {
    // Export labeled samples as JSON for model training
    const labeled = this.getLabeledSamples();
    return JSON.stringify(labeled, null, 2);
  }

  clear(): void {
    this.samples = [];
  }
}
```

### Model Update Cycle

```typescript
// src/lib/learning/modelUpdater.ts

export interface ModelUpdateConfig {
  checkIntervalMs: number;
  updateEndpoint: string;
  currentVersion: string;
  autoUpdate: boolean;
}

export class ModelUpdater {
  private config: ModelUpdateConfig;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: ModelUpdateConfig) {
    this.config = config;
  }

  startUpdateCheck(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => this.checkForUpdates(), this.config.checkIntervalMs);
  }

  stopUpdateCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async checkForUpdates(): Promise<{ hasUpdate: boolean; newVersion?: string }> {
    try {
      const response = await fetch(`${this.config.updateEndpoint}/version`);
      const data = await response.json();

      if (data.version !== this.config.currentVersion) {
        if (this.config.autoUpdate) {
          await this.downloadAndApplyUpdate(data.version);
        }
        return { hasUpdate: true, newVersion: data.version };
      }

      return { hasUpdate: false };
    } catch (error) {
      console.warn("[ModelUpdater] Update check failed:", error);
      return { hasUpdate: false };
    }
  }

  private async downloadAndApplyUpdate(version: string): Promise<void> {
    try {
      const response = await fetch(`${this.config.updateEndpoint}/models/silero_vad_${version}.onnx`);
      const modelData = await response.arrayBuffer();

      // Store in cache for next session
      const cache = await caches.open("vad-models");
      await cache.put(
        `/silero_vad.onnx`,
        new Response(modelData, {
          headers: { "X-Model-Version": version },
        }),
      );

      console.log(`[ModelUpdater] Downloaded model version ${version}`);
      // Notify user that update will be applied on next session
    } catch (error) {
      console.error("[ModelUpdater] Failed to download update:", error);
    }
  }
}
```

---

## Testing Strategy

### Unit Tests

| Test File                                                         | Purpose                           |
| ----------------------------------------------------------------- | --------------------------------- |
| `src/lib/sileroVAD/__tests__/sileroVAD.test.ts`                   | Neural VAD unit tests             |
| `src/lib/sileroVAD/__tests__/languageModels.test.ts`              | Language config tests             |
| `src/lib/bargeInClassifier/__tests__/classifier.test.ts`          | Barge-in classification tests     |
| `src/lib/bargeInClassifier/__tests__/backchannelDetector.test.ts` | Multilingual backchannel tests    |
| `src/lib/bargeInClassifier/__tests__/phraseLibrary.test.ts`       | Phrase library tests              |
| `src/lib/echoCancellation/__tests__/aec.test.ts`                  | Echo cancellation tests           |
| `src/lib/turnTaking/__tests__/turnTaking.test.ts`                 | Turn-taking logic tests           |
| `src/lib/turnTaking/__tests__/contextResumer.test.ts`             | Context resumption tests          |
| `src/lib/conversationManager/__tests__/toolCallHandler.test.ts`   | Tool interrupt tests              |
| `src/lib/personalization/__tests__/personalization.test.ts`       | Personalization tests             |
| `src/lib/offline/__tests__/offlineVAD.test.ts`                    | Offline VAD tests                 |
| `src/lib/privacy/__tests__/telemetry.test.ts`                     | Privacy-compliant telemetry tests |
| `src/hooks/__tests__/useNeuralVAD.test.ts`                        | Neural VAD hook tests             |
| `src/hooks/__tests__/useIntelligentBargeIn.test.ts`               | Barge-in state machine tests      |

### Integration Tests

```typescript
// e2e/voice/barge-in-integration.spec.ts

describe("Barge-In Integration", () => {
  test("should detect speech within 30ms", async () => {
    await voice.startVoiceMode();
    await voice.waitForAISpeaking();

    const startTime = Date.now();
    await voice.simulateUserSpeech(500);

    const detectionTime = await voice.getBargeInDetectionTime();
    expect(detectionTime).toBeLessThan(30);
  });

  test('should classify "uh huh" as backchannel (English)', async () => {
    await voice.setLanguage("en");
    await voice.startVoiceMode();
    await voice.waitForAISpeaking();

    await voice.simulateSpeechWithTranscript("uh huh", 400);

    const classification = await voice.getLastBargeInClassification();
    expect(classification).toBe("backchannel");
    expect(await voice.isAISpeaking()).toBe(true);
  });

  test('should classify "نعم" as backchannel (Arabic)', async () => {
    await voice.setLanguage("ar");
    await voice.startVoiceMode();
    await voice.waitForAISpeaking();

    await voice.simulateSpeechWithTranscript("نعم", 300);

    const classification = await voice.getLastBargeInClassification();
    expect(classification).toBe("backchannel");
  });

  test("should not interrupt during critical tool call", async () => {
    await voice.startVoiceMode();
    await voice.triggerToolCall("save_document", { safeToInterrupt: false });

    await voice.simulateSpeechWithTranscript("wait stop", 500);

    expect(await voice.isToolCallActive()).toBe(true);
    expect(await voice.getQueuedInterruption()).not.toBeNull();
  });

  test("should resume with context summary after hard barge", async () => {
    await voice.startVoiceMode();
    await voice.waitForAIResponse("The history of...");

    await voice.simulateHardBargeIn("What about today?");

    const resumption = await voice.getContextResumption();
    expect(resumption.hasSummary).toBe(true);
    expect(resumption.summary).toContain("history");
  });

  test("should adapt thresholds after calibration", async () => {
    await voice.startVoiceMode();
    await voice.runCalibration({ noiseLevel: "high" });

    const threshold = await voice.getActiveVADThreshold();
    expect(threshold).toBeGreaterThan(0.6);
  });

  test("should fall back to offline VAD when network lost", async () => {
    await voice.startVoiceMode();
    await network.goOffline();

    await voice.waitForVADSwitch();

    await voice.simulateUserSpeech(500);
    expect(await voice.isSpeechDetected()).toBe(true);
  });
});
```

### Performance Benchmarks

```typescript
// benchmarks/barge-in-latency.bench.ts

bench("Neural VAD inference", async () => {
  const vad = new SileroVAD();
  await vad.initialize();

  const audioFrame = new Float32Array(512).fill(0.5);
  await vad.process(audioFrame);
});

bench("Offline VAD inference", async () => {
  // WebRTC-style energy VAD
});

bench("Backchannel detection (10 languages)", async () => {
  const detector = new BackchannelDetector("en");
  const languages = ["en", "ar", "es", "fr", "de", "zh", "ja", "ko", "pt", "ru"];

  for (const lang of languages) {
    detector.setLanguage(lang);
    detector.detect("test phrase", 300, 0.8);
  }
});

bench("Full barge-in pipeline", async () => {
  // VAD + Classification + Feedback combined
});

bench("Context resumption generation", async () => {
  const resumer = new ContextResumer();
  resumer.captureInterruptedContext("A very long AI response that was interrupted mid-sentence...", 150);
  resumer.generateResumptionPrefix();
});
```

---

## Success Metrics

| Metric                                  | Current    | Target                          | Measurement Method                |
| --------------------------------------- | ---------- | ------------------------------- | --------------------------------- |
| **Speech Detection Latency**            | ~50-100ms  | <30ms                           | E2E test with timing              |
| **Barge-In to Audio Stop**              | ~100-200ms | <50ms                           | E2E test with timing              |
| **False Positive Rate**                 | ~10%       | <2%                             | Automated test suite              |
| **Backchannel Accuracy (English)**      | N/A (new)  | >90%                            | Labeled test dataset              |
| **Backchannel Accuracy (Multilingual)** | N/A (new)  | >85% avg                        | Labeled test dataset per language |
| **Echo Cancellation Effectiveness**     | Basic      | >95% echo removal               | Audio analysis                    |
| **Turn-Taking Naturalness**             | N/A        | User survey >4/5                | User study                        |
| **Personalization Improvement**         | N/A        | +25% accuracy after calibration | A/B test                          |
| **Offline Detection Latency**           | N/A        | <50ms                           | E2E test offline mode             |
| **Tool Call Interrupt Safety**          | N/A        | 100% safe (no data loss)        | Integration tests                 |
| **User Satisfaction**                   | Baseline   | +40%                            | A/B test                          |
| **Language Support**                    | 1          | 10+                             | Feature coverage                  |
| **Privacy Compliance**                  | Basic      | GDPR/CCPA compliant             | Audit                             |

### Extended Telemetry Metrics

```typescript
export interface ExtendedBargeInMetrics {
  // Core latency metrics
  speechOnsetToDetectionMs: number;
  detectionToFadeMs: number;
  totalBargeInLatencyMs: number;

  // Classification metrics
  classificationType: "backchannel" | "soft_barge" | "hard_barge" | "unclear";
  classificationConfidence: number;
  wasCorrectClassification: boolean | null;

  // Audio metrics
  speechDurationMs: number;
  vadConfidence: number;
  echoLevel: number;

  // Multilingual metrics
  detectedLanguage: SupportedLanguage;
  configuredLanguage: SupportedLanguage;
  accentProfile?: string;

  // Personalization metrics
  calibrationApplied: boolean;
  userSpecificThreshold: number;
  adaptationCount: number;

  // Context metrics
  aiResponseInterrupted: boolean;
  interruptedAtPercentage: number;
  contextSummaryGenerated: boolean;
  resumptionRequested: boolean;

  // Tool call metrics
  toolCallInterrupted: boolean;
  toolCallName?: string;
  toolCallRolledBack: boolean;

  // Session metrics
  sessionDurationMs: number;
  bargeInCountInSession: number;
  backchannelCountInSession: number;

  // Offline/fallback metrics
  usedOfflineVAD: boolean;
  networkStatus: "online" | "offline" | "degraded";

  // User satisfaction (if collected)
  userFeedbackRating?: 1 | 2 | 3 | 4 | 5;
}
```

---

## File Summary

### New Files to Create (65+ files)

#### Phase 1: Neural VAD (10 files)

- `src/lib/sileroVAD/index.ts`
- `src/lib/sileroVAD/vadWorker.ts`
- `src/lib/sileroVAD/types.ts`
- `src/lib/sileroVAD/languageModels.ts`
- `public/silero_vad.onnx`
- `public/silero_vad_lite.onnx`
- `public/vad-processor.js`
- `src/hooks/useNeuralVAD.ts`
- `src/hooks/useOfflineVAD.ts`
- `src/utils/vadClassifier.ts`

#### Phase 2: Instant Response (4 files)

- `src/components/voice/BargeInFeedback.tsx`
- `src/hooks/useHapticFeedback.ts`
- `src/lib/audioFeedback.ts`
- `src/stores/feedbackPreferencesStore.ts`

#### Phase 3: Context-Aware Intelligence (6 files)

- `src/lib/bargeInClassifier/index.ts`
- `src/lib/bargeInClassifier/backchannelDetector.ts`
- `src/lib/bargeInClassifier/intentClassifier.ts`
- `src/lib/bargeInClassifier/phraseLibrary.ts`
- `src/lib/bargeInClassifier/types.ts`
- `services/api-gateway/app/services/barge_in_classifier.py`

#### Phase 4: Advanced Audio (5 files)

- `src/lib/echoCancellation/index.ts`
- `src/lib/echoCancellation/adaptiveFilter.ts`
- `src/lib/echoCancellation/speakerReference.ts`
- `src/lib/echoCancellation/privacyFilter.ts`
- `public/aec-processor.js`

#### Phase 5: Natural Turn-Taking (6 files)

- `src/lib/turnTaking/index.ts`
- `src/lib/turnTaking/prosodicAnalyzer.ts`
- `src/lib/turnTaking/silencePredictor.ts`
- `src/lib/turnTaking/contextResumer.ts`
- `src/lib/turnTaking/types.ts`
- `services/api-gateway/app/services/turn_taking_service.py`

#### Phase 6: Full Duplex (4 files)

- `src/lib/fullDuplex/index.ts`
- `src/lib/fullDuplex/audioMixer.ts`
- `src/lib/fullDuplex/overlapHandler.ts`
- `src/components/voice/DuplexIndicator.tsx`

#### Phase 7: Multilingual Support (4 files)

- `src/lib/multilingual/index.ts`
- `src/lib/multilingual/languageDetector.ts`
- `src/lib/multilingual/accentProfiles.ts`
- `src/stores/languagePreferencesStore.ts`

#### Phase 8: Personalization (4 files)

- `src/lib/personalization/index.ts`
- `src/lib/personalization/calibrationManager.ts`
- `src/lib/personalization/preferenceStore.ts`
- `src/lib/personalization/behaviorTracker.ts`

#### Phase 9: Offline Fallback (4 files)

- `src/lib/offline/webrtcVAD.ts`
- `src/lib/offline/ttsCacheManager.ts`
- `src/lib/offline/offlineFallback.ts`
- `src/hooks/useBargeInTrigger.ts` (multimodal triggers)

#### Phase 10: Conversation Management (5 files)

- `src/lib/conversationManager/index.ts`
- `src/lib/conversationManager/sentimentAnalyzer.ts`
- `src/lib/conversationManager/discourseTracker.ts`
- `src/lib/conversationManager/turnTakingIntegration.ts`
- `src/lib/conversationManager/toolCallHandler.ts`

#### Privacy & Learning (5 files)

- `src/lib/privacy/config.ts`
- `src/lib/privacy/telemetryCollector.ts`
- `src/lib/privacy/modelVerifier.ts`
- `src/lib/learning/dataCollector.ts`
- `src/lib/learning/modelUpdater.ts`

#### Tests (15+ files)

- `src/lib/sileroVAD/__tests__/sileroVAD.test.ts`
- `src/lib/sileroVAD/__tests__/languageModels.test.ts`
- `src/lib/bargeInClassifier/__tests__/classifier.test.ts`
- `src/lib/bargeInClassifier/__tests__/backchannelDetector.test.ts`
- `src/lib/bargeInClassifier/__tests__/phraseLibrary.test.ts`
- `src/lib/echoCancellation/__tests__/aec.test.ts`
- `src/lib/turnTaking/__tests__/turnTaking.test.ts`
- `src/lib/turnTaking/__tests__/contextResumer.test.ts`
- `src/lib/conversationManager/__tests__/toolCallHandler.test.ts`
- `src/lib/personalization/__tests__/personalization.test.ts`
- `src/lib/offline/__tests__/offlineVAD.test.ts`
- `src/lib/privacy/__tests__/telemetry.test.ts`
- `src/hooks/__tests__/useNeuralVAD.test.ts`
- `src/hooks/__tests__/useIntelligentBargeIn.test.ts`
- `e2e/voice/barge-in-integration.spec.ts`
- `benchmarks/barge-in-latency.bench.ts`

### Files to Modify (15 files)

| File                                  | Changes                                                    |
| ------------------------------------- | ---------------------------------------------------------- |
| `package.json`                        | Add onnxruntime-web, new dependencies                      |
| `useThinkerTalkerSession.ts`          | Integrate Neural VAD, AEC, barge-in, offline fallback      |
| `useTTAudioPlayback.ts`               | Add fade-out, AEC reference, TTS caching                   |
| `audio-capture-processor.js`          | Integrate with AEC processor                               |
| `CompactVoiceBar.tsx`                 | Add barge-in feedback, state indicators, language selector |
| `VoiceBargeInIndicator.tsx`           | Enhanced with classification type, confidence              |
| `useVoiceModeStateMachine.ts`         | Upgrade to intelligent barge-in state machine              |
| `vad.ts`                              | Replace with Neural VAD wrapper                            |
| `voiceSettingsStore.ts`               | Add barge-in config, language, personalization             |
| `thinker_talker_websocket_handler.py` | Enhanced barge-in handling, tool call management           |
| `voiceTelemetry.ts`                   | Extended metrics, privacy compliance                       |
| `VoiceSettingsEnhanced.tsx`           | Barge-in sensitivity, language, feedback preferences       |
| `ThinkerService.ts`                   | Context resumption, tool call integration                  |
| `types.ts`                            | Extended type definitions                                  |
| `localization/`                       | Add multilingual strings                                   |

---

## Implementation Timeline

```
Phase 1: Neural VAD (Foundation)
├── Silero VAD integration & Web Worker setup
├── useNeuralVAD hook & language support
├── Calibration phase implementation
└── Deliverable: <30ms speech detection, calibration

Phase 2: Instant Response
├── BargeInFeedback component with configurable styles
├── Haptic & audio feedback with preferences
├── Voice prompt capability
└── Deliverable: <50ms user feedback, customizable

Phase 3: Context-Aware Intelligence
├── Multilingual backchannel detector
├── Phrase library for 10+ languages
├── Intent classifier & state machine
└── Deliverable: >85% multilingual backchannel accuracy

Phase 4: Advanced Audio
├── Echo cancellation system with privacy filter
├── AEC AudioWorklet integration
├── Audio encryption in transit
└── Deliverable: >95% echo removal, encrypted audio

Phase 5: Natural Turn-Taking
├── Prosodic analyzer
├── Adaptive silence predictor
├── Context resumption after hard barge
└── Deliverable: Natural flow with resumption

Phase 6: Full Duplex
├── Full duplex manager
├── Overlap handling with tool-call awareness
├── Duplex UI indicators
└── Deliverable: Simultaneous speaking capability

Phase 7: Multilingual Support
├── Language auto-detection
├── Accent profiles integration
├── Language preference persistence
└── Deliverable: 10+ language support

Phase 8: Personalization
├── Personalization manager
├── Behavior tracking & adaptation
├── Preference persistence
└── Deliverable: +25% personalized accuracy

Phase 9: Offline Fallback
├── Lightweight on-device VAD
├── TTS caching system
├── Automatic fallback logic
└── Deliverable: Network-resilient barge-in

Phase 10: Conversation Management
├── Sentiment & discourse analysis
├── Tool call interrupt handling
├── Follow-up suggestion engine
└── Deliverable: Context-aware AI behavior

Privacy & Learning
├── Privacy-compliant telemetry
├── Model verification
├── Continuous learning pipeline
└── Deliverable: GDPR-compliant, self-improving

Testing & Polish
├── Comprehensive unit & integration tests
├── Performance optimization
├── User acceptance testing
└── Deliverable: Production-ready system
```

---

## Getting Started

To begin implementation:

1. **Install dependencies:**

   ```bash
   cd apps/web-app
   npm install onnxruntime-web
   ```

2. **Download Silero VAD models:**

   ```bash
   # Download from https://github.com/snakers4/silero-vad
   # Place silero_vad.onnx (~2MB) in public/
   # Place silero_vad_lite.onnx (~500KB) in public/ for offline
   ```

3. **Start with Phase 1:**
   - Create `src/lib/sileroVAD/` directory
   - Implement SileroVAD class with language support
   - Create useNeuralVAD hook with calibration
   - Integrate with useThinkerTalkerSession

4. **Run tests:**

   ```bash
   npm run test -- --grep "Neural VAD"
   ```

5. **Configure privacy settings:**
   - Review `src/lib/privacy/config.ts`
   - Set appropriate retention policies
   - Enable/disable telemetry as needed

---

## References

- [Silero VAD GitHub](https://github.com/snakers4/silero-vad)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript.html)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [NLMS Algorithm](<https://en.wikipedia.org/wiki/Least_mean_squares_filter#Normalized_least_mean_squares_filter_(NLMS)>)
- [WebRTC VAD](https://webrtc.org/)
- [GDPR Compliance](https://gdpr.eu/)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)

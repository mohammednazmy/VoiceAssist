# World-Class Voice Barge-In Implementation Plan

> **Goal:** Transform VoiceAssist's voice mode from basic interruption handling to a human-like conversational experience with <30ms speech detection, intelligent context-aware interruption handling, and natural turn-taking.

**Created:** 2025-12-03
**Status:** Planning Complete - Ready for Implementation

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
10. [Testing Strategy](#testing-strategy)
11. [Success Metrics](#success-metrics)
12. [File Summary](#file-summary)
13. [Implementation Timeline](#implementation-timeline)

---

## Executive Summary

This plan transforms VoiceAssist's voice mode into a **world-class conversational experience** that feels like talking to a human. Key innovations include:

| Innovation | Description | Impact |
|------------|-------------|--------|
| **Neural VAD** | ML-based speech detection (Silero) | <30ms detection latency |
| **Intelligent Classification** | Backchannel vs soft vs hard barge-in | >90% accuracy |
| **Instant Feedback** | Visual, haptic, audio confirmation | <50ms user feedback |
| **Advanced AEC** | NLMS adaptive filter echo cancellation | >95% echo removal |
| **Natural Turn-Taking** | Prosodic analysis, adaptive silence | Human-like flow |
| **Full Duplex** | Simultaneous speaking capability | True conversation |

### Key Targets

| Metric | Current | Target |
|--------|---------|--------|
| Speech Detection Latency | ~50-100ms | <30ms |
| Barge-In to Audio Stop | ~100-200ms | <50ms |
| False Positive Rate | ~10% | <2% |
| Backchannel Accuracy | N/A | >90% |
| User Satisfaction | Baseline | +40% |

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
4. **No context awareness**: System doesn't understand *why* user interrupted
5. **Echo confusion**: Sometimes confuses AI audio for user speech
6. **Single mode**: No distinction between "I want to interject" vs "background noise"

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
│  │ CONNECTING   │──────── error ──────────────────────────────────────┐    │   │
│  └──────┬───────┘                                                     │    │   │
│         │ session.ready                                               │    │   │
│         ▼                                                             │    │   │
│  ┌──────────────┐                                                     │    │   │
│  │  LISTENING   │◄─────────────────────────────────────────────┐      │    │   │
│  │  (ready)     │                                              │      │    │   │
│  └──────┬───────┘                                              │      │    │   │
│         │ vad.speech_onset (confidence > 0.7)                  │      │    │   │
│         ▼                                                      │      │    │   │
│  ┌──────────────────┐                                          │      │    │   │
│  │ SPEECH_DETECTED  │ ◄── 20-30ms window                       │      │    │   │
│  │ (pre-confirm)    │     for onset detection                  │      │    │   │
│  └──────┬───────────┘                                          │      │    │   │
│         │                                                      │      │    │   │
│         ├─── speech < 100ms + low confidence ───► LISTENING    │      │    │   │
│         │    (false positive / noise)              (cancel)    │      │    │   │
│         │                                                      │      │    │   │
│         │ speech >= 100ms OR high confidence (>0.85)           │      │    │   │
│         ▼                                                      │      │    │   │
│  ┌──────────────────┐                                          │      │    │   │
│  │ USER_SPEAKING    │                                          │      │    │   │
│  │ (confirmed)      │                                          │      │    │   │
│  └──────┬───────────┘                                          │      │    │   │
│         │ silence > adaptive_threshold (200-800ms)             │      │    │   │
│         ▼                                                      │      │    │   │
│  ┌──────────────────┐                                          │      │    │   │
│  │ PROCESSING_STT   │                                          │      │    │   │
│  │ (finalizing)     │                                          │      │    │   │
│  └──────┬───────────┘                                          │      │    │   │
│         │ transcript.complete                                  │      │    │   │
│         ▼                                                      │      │    │   │
│  ┌──────────────────┐                                          │      │    │   │
│  │ PROCESSING_LLM   │                                          │      │    │   │
│  │ (thinking)       │                                          │      │    │   │
│  └──────┬───────────┘                                          │      │    │   │
│         │ response.delta (first token)                         │      │    │   │
│         ▼                                                      │      │    │   │
│  ┌──────────────────┐      vad.speech_onset                    │      │    │   │
│  │ AI_RESPONDING    │◄────────────────────────────┐            │      │    │   │
│  │ (streaming text) │                             │            │      │    │   │
│  └──────┬───────────┘                             │            │      │    │   │
│         │ audio.output (first chunk)              │            │      │    │   │
│         ▼                                         │            │      │    │   │
│  ┌──────────────────┐                             │            │      │    │   │
│  │  AI_SPEAKING     │─────────────────────────────┤            │      │    │   │
│  │  (playing TTS)   │     (BARGE-IN ZONE)         │            │      │    │   │
│  └──────┬───────────┘                             │            │      │    │   │
│         │                                         │            │      │    │   │
│         │ vad.speech_onset ────────────────────►  │            │      │    │   │
│         │                                         │            │      │    │   │
│         │         ┌───────────────────────────────┴──────┐     │      │    │   │
│         │         │      BARGE-IN CLASSIFICATION         │     │      │    │   │
│         │         │                                      │     │      │    │   │
│         │         │  ┌─────────────┐  ┌──────────────┐   │     │      │    │   │
│         │         │  │BACKCHANNEL  │  │ SOFT_BARGE   │   │     │      │    │   │
│         │         │  │"uh huh"     │  │ "wait"       │   │     │      │    │   │
│         │         │  │"yeah"       │  │ "hold on"    │   │     │      │    │   │
│         │         │  │"okay"       │  │ "actually"   │   │     │      │    │   │
│         │         │  │"right"      │  │ short phrase │   │     │      │    │   │
│         │         │  └──────┬──────┘  └──────┬───────┘   │     │      │    │   │
│         │         │         │                │           │     │      │    │   │
│         │         │         ▼                ▼           │     │      │    │   │
│         │         │  ┌─────────────┐  ┌──────────────┐   │     │      │    │   │
│         │         │  │ Continue    │  │ Fade to 20%  │   │     │      │    │   │
│         │         │  │ AI audio    │  │ Pause LLM    │   │     │      │    │   │
│         │         │  │ (no action) │  │ Wait 2s      │   │     │      │    │   │
│         │         │  └─────────────┘  └──────────────┘   │     │      │    │   │
│         │         │                                      │     │      │    │   │
│         │         │  ┌──────────────────────────────┐    │     │      │    │   │
│         │         │  │      HARD_BARGE_IN           │    │     │      │    │   │
│         │         │  │  Full sentence / question    │    │     │      │    │   │
│         │         │  │  High confidence speech      │    │     │      │    │   │
│         │         │  │  Duration > 300ms            │    │     │      │    │   │
│         │         │  └──────────────┬───────────────┘    │     │      │    │   │
│         │         │                 │                    │     │      │    │   │
│         │         │                 ▼                    │     │      │    │   │
│         │         │  ┌──────────────────────────────┐    │     │      │    │   │
│         │         │  │ 1. Immediate audio fade (30ms)│   │     │      │    │   │
│         │         │  │ 2. Send barge_in to server   │    │     │      │    │   │
│         │         │  │ 3. Cancel LLM generation     │    │     │      │    │   │
│         │         │  │ 4. Store interrupted context │    │     │      │    │   │
│         │         │  │ 5. Show visual confirmation  │    │     │      │    │   │
│         │         │  └──────────────────────────────┘    │     │      │    │   │
│         │         └──────────────────────────────────────┘     │      │    │   │
│         │                                                      │      │    │   │
│         │ audio.complete (natural end)                         │      │    │   │
│         └──────────────────────────────────────────────────────┘      │    │   │
│                                                                       │    │   │
│  ┌─────────┐                                                          │    │   │
│  │  ERROR  │◄─────────────────────────────────────────────────────────┘    │   │
│  └────┬────┘                                                               │   │
│       │ retry() or disconnect()                                            │   │
│       └────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### State Definitions

```typescript
// New file: apps/web-app/src/hooks/useIntelligentBargeIn/types.ts

export type BargeInState =
  | "idle"                    // Voice mode inactive
  | "connecting"              // Establishing WebSocket
  | "listening"               // Ready, waiting for user speech
  | "speech_detected"         // VAD triggered, confirming (20-30ms)
  | "user_speaking"           // Confirmed user speech
  | "processing_stt"          // Finalizing transcript
  | "processing_llm"          // LLM generating response
  | "ai_responding"           // LLM streaming tokens (no audio yet)
  | "ai_speaking"             // TTS audio playing
  | "barge_in_detected"       // User spoke during AI, classifying
  | "soft_barge"              // Soft interruption (AI paused)
  | "awaiting_continuation"   // After soft barge, waiting for user
  | "error";                  // Error state

export type BargeInClassification =
  | "backchannel"             // "uh huh", "yeah" - continue AI
  | "soft_barge"              // "wait", "hold on" - pause AI
  | "hard_barge"              // Full interruption - stop AI
  | "unclear";                // Need more audio to classify

export type SpeechConfidence = "low" | "medium" | "high" | "very_high";

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
}

export interface VADResult {
  isSpeech: boolean;
  confidence: number;
  onsetTimestamp: number;
  duration: number;
  energy: number;
  spectralFeatures?: {
    centroid: number;
    bandwidth: number;
    rolloff: number;
  };
}

export interface BargeInConfig {
  // Detection thresholds
  speechOnsetConfidence: number;    // Default: 0.7
  speechConfirmMs: number;          // Default: 100ms
  hardBargeMinDuration: number;     // Default: 300ms

  // Audio behavior
  fadeOutDuration: number;          // Default: 30ms
  softBargeFadeLevel: number;       // Default: 0.2 (20%)
  softBargeWaitMs: number;          // Default: 2000ms

  // Backchannel detection
  backchannelMaxDuration: number;   // Default: 500ms
  backchannelPhrases: string[];     // ["uh huh", "yeah", "okay", ...]

  // Echo cancellation
  echoSuppressionEnabled: boolean;
  echoCorrelationThreshold: number; // Default: 0.55

  // Adaptive settings
  adaptiveSilenceEnabled: boolean;
  minSilenceMs: number;             // Default: 200ms
  maxSilenceMs: number;             // Default: 800ms
}
```

---

## Phase 1: Neural VAD Integration

**Goal:** Replace energy-based VAD with ML-based detection for <30ms speech onset detection

### New Files to Create

| File | Purpose | Size Est. |
|------|---------|-----------|
| `src/lib/sileroVAD/index.ts` | Silero VAD wrapper & initialization | ~200 lines |
| `src/lib/sileroVAD/vadWorker.ts` | Web Worker for VAD inference | ~150 lines |
| `src/lib/sileroVAD/types.ts` | TypeScript interfaces | ~50 lines |
| `public/silero_vad.onnx` | Silero VAD ONNX model file | ~2MB |
| `public/vad-processor.js` | Compiled Web Worker | ~50KB |
| `src/hooks/useNeuralVAD.ts` | React hook for neural VAD | ~250 lines |
| `src/utils/vadClassifier.ts` | Speech classification utilities | ~150 lines |

### Implementation: Silero VAD Wrapper

```typescript
// src/lib/sileroVAD/index.ts

/**
 * Silero VAD Integration
 *
 * Silero VAD is a neural network-based Voice Activity Detector that runs
 * in WebAssembly via ONNX Runtime Web. It provides:
 * - 95%+ accuracy on speech detection
 * - ~30ms latency for onset detection
 * - Robustness to background noise
 *
 * Model: silero_vad.onnx (~2MB)
 * Input: 512 samples at 16kHz (32ms chunks)
 * Output: Probability of speech (0-1)
 */

import * as ort from 'onnxruntime-web';

export interface SileroVADConfig {
  modelPath: string;
  sampleRate: number;
  windowSize: number;
  speechThreshold: number;
  silenceThreshold: number;
  minSpeechDuration: number;
  minSilenceDuration: number;
  onSpeechStart?: (confidence: number) => void;
  onSpeechEnd?: (duration: number) => void;
  onVADResult?: (result: VADResult) => void;
}

export interface VADResult {
  probability: number;
  isSpeech: boolean;
  timestamp: number;
  processingTime: number;
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

  constructor(config: Partial<SileroVADConfig> = {}) {
    this.config = {
      modelPath: '/silero_vad.onnx',
      sampleRate: 16000,
      windowSize: 512,
      speechThreshold: 0.5,
      silenceThreshold: 0.35,
      minSpeechDuration: 64,
      minSilenceDuration: 100,
      ...config
    };

    this.state = new Float32Array(2 * 1 * 64);
    this.sr = new BigInt64Array([BigInt(this.config.sampleRate)]);
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) return;

    try {
      ort.env.wasm.wasmPaths = '/';

      this.session = await ort.InferenceSession.create(
        this.config.modelPath,
        {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        }
      );

      this.isLoaded = true;
      console.log('[SileroVAD] Model loaded successfully');
    } catch (error) {
      console.error('[SileroVAD] Failed to load model:', error);
      throw error;
    }
  }

  async process(audioData: Float32Array): Promise<VADResult> {
    if (!this.session) {
      throw new Error('VAD not initialized. Call initialize() first.');
    }

    const startTime = performance.now();

    const inputTensor = new ort.Tensor('float32', audioData, [1, audioData.length]);
    const stateTensor = new ort.Tensor('float32', this.state, [2, 1, 64]);
    const srTensor = new ort.Tensor('int64', this.sr, [1]);

    const results = await this.session.run({
      input: inputTensor,
      state: stateTensor,
      sr: srTensor,
    });

    const probability = (results.output.data as Float32Array)[0];
    const newState = results.stateN.data as Float32Array;

    this.state.set(newState);

    const processingTime = performance.now() - startTime;
    const isSpeech = probability >= this.config.speechThreshold;

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

  private trackSpeechState(probability: number, isSpeech: boolean): void {
    const windowDuration = (this.config.windowSize / this.config.sampleRate) * 1000;

    if (isSpeech) {
      this.consecutiveSpeechWindows++;
      this.consecutiveSilenceWindows = 0;

      const speechDuration = this.consecutiveSpeechWindows * windowDuration;

      if (!this.isSpeaking && speechDuration >= this.config.minSpeechDuration) {
        this.isSpeaking = true;
        this.speechStartTime = performance.now() - speechDuration;
        this.config.onSpeechStart?.(probability);
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

### Implementation: useNeuralVAD Hook

```typescript
// src/hooks/useNeuralVAD.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { SileroVAD, VADResult, SileroVADConfig } from '../lib/sileroVAD';

export interface UseNeuralVADOptions {
  enabled?: boolean;
  onSpeechStart?: (confidence: number) => void;
  onSpeechEnd?: (duration: number) => void;
  onVADResult?: (result: VADResult) => void;
  config?: Partial<SileroVADConfig>;
}

export interface UseNeuralVADReturn {
  isLoaded: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  currentConfidence: number;
  startListening: (stream: MediaStream) => Promise<void>;
  stopListening: () => void;
  processAudioChunk: (data: Float32Array) => Promise<VADResult | null>;
}

export function useNeuralVAD(options: UseNeuralVADOptions = {}): UseNeuralVADReturn {
  const { enabled = true, onSpeechStart, onSpeechEnd, onVADResult, config = {} } = options;

  const [isLoaded, setIsLoaded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentConfidence, setCurrentConfidence] = useState(0);

  const vadRef = useRef<SileroVAD | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const vad = new SileroVAD({
      ...config,
      onSpeechStart: (confidence) => {
        setIsSpeaking(true);
        onSpeechStart?.(confidence);
      },
      onSpeechEnd: (duration) => {
        setIsSpeaking(false);
        onSpeechEnd?.(duration);
      },
      onVADResult: (result) => {
        setCurrentConfidence(result.probability);
        onVADResult?.(result);
      },
    });

    vadRef.current = vad;

    vad.initialize()
      .then(() => setIsLoaded(true))
      .catch((error) => console.error('[useNeuralVAD] Failed to initialize:', error));

    return () => {
      vad.destroy();
      vadRef.current = null;
    };
  }, [enabled]);

  const startListening = useCallback(async (stream: MediaStream) => {
    if (!vadRef.current || !isLoaded) {
      throw new Error('VAD not ready');
    }

    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;
    streamRef.current = stream;

    await audioContext.audioWorklet.addModule('/vad-processor.js');

    const source = audioContext.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioContext, 'vad-processor', {
      processorOptions: { windowSize: 512 },
    });

    workletNode.port.onmessage = async (event) => {
      if (event.data.type === 'audio') {
        const audioData = new Float32Array(event.data.samples);
        await vadRef.current?.process(audioData);
      }
    };

    source.connect(workletNode);
    workletNodeRef.current = workletNode;
    setIsListening(true);
  }, [isLoaded]);

  const stopListening = useCallback(() => {
    workletNodeRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach(track => track.stop());

    vadRef.current?.reset();
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  const processAudioChunk = useCallback(async (data: Float32Array) => {
    if (!vadRef.current || !isLoaded) return null;
    return vadRef.current.process(data);
  }, [isLoaded]);

  return {
    isLoaded,
    isListening,
    isSpeaking,
    currentConfidence,
    startListening,
    stopListening,
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

---

## Phase 2: Instant Response & Feedback

**Goal:** User knows their interruption was heard within 50ms

### New Files to Create

| File | Purpose | Size Est. |
|------|---------|-----------|
| `src/components/voice/BargeInFeedback.tsx` | Visual pulse/feedback component | ~150 lines |
| `src/hooks/useHapticFeedback.ts` | Mobile haptic feedback | ~80 lines |
| `src/lib/audioFeedback.ts` | Audio acknowledgment tones | ~100 lines |

### Implementation: BargeInFeedback Component

```typescript
// src/components/voice/BargeInFeedback.tsx

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BargeInFeedbackProps {
  isActive: boolean;
  type: 'detected' | 'confirmed' | 'backchannel' | 'soft' | 'hard';
  confidence?: number;
  onAnimationComplete?: () => void;
}

export function BargeInFeedback({
  isActive,
  type,
  confidence = 0,
  onAnimationComplete,
}: BargeInFeedbackProps) {
  const [showPulse, setShowPulse] = useState(false);

  useEffect(() => {
    if (isActive) {
      setShowPulse(true);
      const timer = setTimeout(() => {
        setShowPulse(false);
        onAnimationComplete?.();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isActive, onAnimationComplete]);

  const pulseColors = {
    detected: 'rgba(59, 130, 246, 0.5)',
    confirmed: 'rgba(34, 197, 94, 0.5)',
    backchannel: 'rgba(168, 162, 158, 0.3)',
    soft: 'rgba(251, 191, 36, 0.5)',
    hard: 'rgba(239, 68, 68, 0.5)',
  };

  return (
    <AnimatePresence>
      {showPulse && (
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
      )}
    </AnimatePresence>
  );
}
```

### Implementation: Haptic Feedback Hook

```typescript
// src/hooks/useHapticFeedback.ts

import { useCallback, useEffect, useRef } from 'react';

const HAPTIC_PATTERNS = {
  bargeInDetected: [15, 30, 15],
  bargeInConfirmed: [40],
  backchannel: [5],
  softBarge: [25, 50, 25],
  hardBarge: [50, 30, 50],
  speechStart: [10],
  error: [100, 50, 100, 50, 100],
};

export function useHapticFeedback() {
  const isSupported = useRef(false);

  useEffect(() => {
    isSupported.current = 'vibrate' in navigator;
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

  const triggerHaptic = useCallback((type: keyof typeof HAPTIC_PATTERNS) => {
    const pattern = HAPTIC_PATTERNS[type];
    if (pattern) vibrate(pattern);
  }, [vibrate]);

  return { isSupported: isSupported.current, triggerHaptic };
}
```

---

## Phase 3: Context-Aware Interruption Intelligence

**Goal:** Understand the *intent* behind interruptions - backchannel vs soft vs hard barge-in

### New Files to Create

| File | Purpose | Size Est. |
|------|---------|-----------|
| `src/lib/bargeInClassifier/index.ts` | Main classifier module | ~300 lines |
| `src/lib/bargeInClassifier/backchannelDetector.ts` | Backchannel phrase detection | ~150 lines |
| `src/lib/bargeInClassifier/intentClassifier.ts` | Intent classification logic | ~200 lines |
| `src/lib/bargeInClassifier/types.ts` | Type definitions | ~80 lines |
| `services/api-gateway/app/services/barge_in_classifier.py` | Server-side classification | ~250 lines |

### Backchannel Patterns

```typescript
export const BACKCHANNEL_PATTERNS = [
  { phrases: ['uh huh', 'uh-huh', 'uhuh', 'mm hmm', 'mmhmm'], maxDuration: 600 },
  { phrases: ['yeah', 'yep', 'yes', 'yea'], maxDuration: 400 },
  { phrases: ['okay', 'ok', 'k'], maxDuration: 400 },
  { phrases: ['right', 'right right'], maxDuration: 500 },
  { phrases: ['sure', 'got it', 'gotcha'], maxDuration: 500 },
  { phrases: ['I see', 'interesting'], maxDuration: 600 },
];

export const SOFT_BARGE_PATTERNS = [
  'wait', 'hold on', 'hang on', 'actually', 'but',
  'um', 'well', 'so', 'let me',
];
```

### Implementation: BackchannelDetector

```typescript
// src/lib/bargeInClassifier/backchannelDetector.ts

export class BackchannelDetector {
  private patterns: BackchannelPattern[];
  private recentDetections: Map<string, number> = new Map();

  detect(transcript: string, duration: number, confidence: number) {
    const normalized = transcript.toLowerCase().trim();

    if (duration > 800) {
      return { isBackchannel: false, score: 0 };
    }

    for (const pattern of this.patterns) {
      if (duration > pattern.maxDuration) continue;

      for (const phrase of pattern.phrases) {
        if (normalized === phrase || normalized.startsWith(phrase + ' ')) {
          const score = confidence * (1 - duration / 1000);
          return {
            isBackchannel: score > 0.6,
            matchedPattern: phrase,
            score,
          };
        }
      }
    }

    return { isBackchannel: false, score: 0 };
  }

  trackBackchannel(pattern: string): boolean {
    // 3+ backchannels in 5 seconds = user wants to speak
    const count = this.recentDetections.get(pattern) || 0;
    this.recentDetections.set(pattern, Date.now());
    return count >= 2;
  }
}
```

---

## Phase 4: Advanced Audio Processing

**Goal:** Perfect separation of user voice from AI playback with advanced echo cancellation

### New Files to Create

| File | Purpose | Size Est. |
|------|---------|-----------|
| `src/lib/echoCancellation/index.ts` | Advanced AEC module | ~400 lines |
| `src/lib/echoCancellation/adaptiveFilter.ts` | NLMS adaptive filter | ~200 lines |
| `src/lib/echoCancellation/speakerReference.ts` | Speaker audio reference tracking | ~150 lines |
| `public/aec-processor.js` | AudioWorklet for AEC | ~250 lines |

### Implementation: NLMS Adaptive Filter

```typescript
// src/lib/echoCancellation/adaptiveFilter.ts

export class AdaptiveFilter {
  private coefficients: Float32Array;
  private filterLength: number;
  private stepSize: number;
  private inputBuffer: Float32Array;
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
}
```

---

## Phase 5: Natural Turn-Taking

**Goal:** Conversation flows like talking to a friend with natural pauses and transitions

### New Files to Create

| File | Purpose | Size Est. |
|------|---------|-----------|
| `src/lib/turnTaking/index.ts` | Turn-taking orchestration | ~300 lines |
| `src/lib/turnTaking/prosodicAnalyzer.ts` | Pitch/intonation analysis | ~250 lines |
| `src/lib/turnTaking/silencePredictor.ts` | Adaptive silence detection | ~200 lines |
| `src/lib/turnTaking/types.ts` | Type definitions | ~80 lines |

### Turn States

```typescript
export type TurnState =
  | 'ai_turn'           // AI is speaking
  | 'user_turn'         // User is speaking
  | 'transition'        // Switching turns
  | 'overlap'           // Both speaking (brief)
  | 'pause'             // Silence, waiting
  | 'ai_yielding';      // AI finished, expecting user
```

### Prosodic Features for Turn Detection

```typescript
export interface ProsodicFeatures {
  pitch: number;              // Fundamental frequency (Hz)
  pitchSlope: number;         // Rising/falling trend
  energy: number;             // Volume level
  speechRate: number;         // Syllables per second
  isFinalIntonation: boolean; // Sentence-ending pattern (falling pitch)
  isQuestionIntonation: boolean; // Question pattern (rising pitch)
}
```

---

## Phase 6: Full Duplex Experience

**Goal:** True simultaneous speaking capability for natural overlapping conversation

### New Files to Create

| File | Purpose | Size Est. |
|------|---------|-----------|
| `src/lib/fullDuplex/index.ts` | Full duplex orchestrator | ~250 lines |
| `src/lib/fullDuplex/audioMixer.ts` | Mix user/AI audio for monitoring | ~150 lines |
| `src/lib/fullDuplex/overlapHandler.ts` | Handle simultaneous speech | ~200 lines |
| `src/components/voice/DuplexIndicator.tsx` | Visual for both-speaking state | ~100 lines |

### Duplex State

```typescript
export interface DuplexState {
  userSpeaking: boolean;
  aiSpeaking: boolean;
  isOverlap: boolean;
  overlapDuration: number;
  activeStream: 'user' | 'ai' | 'both' | 'none';
}

export interface FullDuplexConfig {
  overlapMode: 'user_priority' | 'ai_priority' | 'intelligent';
  maxOverlapDuration: number;         // Default: 500ms
  blendOverlapAudio: boolean;
  enableSidetone: boolean;
  sidetoneVolume: number;             // Default: 0.1
  interruptThreshold: number;         // VAD confidence to interrupt AI
  acknowledgmentThreshold: number;    // Below this, treat as backchannel
}
```

---

## Testing Strategy

### Unit Tests

| Test File | Purpose |
|-----------|---------|
| `src/lib/sileroVAD/__tests__/sileroVAD.test.ts` | Neural VAD unit tests |
| `src/lib/bargeInClassifier/__tests__/classifier.test.ts` | Barge-in classification tests |
| `src/lib/bargeInClassifier/__tests__/backchannelDetector.test.ts` | Backchannel detection tests |
| `src/lib/echoCancellation/__tests__/aec.test.ts` | Echo cancellation tests |
| `src/lib/turnTaking/__tests__/turnTaking.test.ts` | Turn-taking logic tests |
| `src/hooks/__tests__/useNeuralVAD.test.ts` | Neural VAD hook tests |
| `src/hooks/__tests__/useIntelligentBargeIn.test.ts` | Barge-in state machine tests |

### Integration Tests

```typescript
// e2e/voice/barge-in-integration.spec.ts

test('should detect speech within 30ms', async () => {
  await voice.startVoiceMode();
  await voice.waitForAISpeaking();

  const startTime = Date.now();
  await voice.simulateUserSpeech(500);

  const detectionTime = await voice.getBargeInDetectionTime();
  expect(detectionTime).toBeLessThan(30);
});

test('should classify "uh huh" as backchannel', async () => {
  await voice.startVoiceMode();
  await voice.waitForAISpeaking();

  await voice.simulateSpeechWithTranscript('uh huh', 400);

  const classification = await voice.getLastBargeInClassification();
  expect(classification).toBe('backchannel');
  expect(await voice.isAISpeaking()).toBe(true); // AI continues
});
```

### Performance Benchmarks

```typescript
// benchmarks/barge-in-latency.bench.ts

bench('Neural VAD inference', async () => {
  const vad = new SileroVAD();
  await vad.initialize();

  const audioFrame = new Float32Array(512).fill(0.5);
  await vad.process(audioFrame);
});

bench('Full barge-in pipeline', async () => {
  // VAD + Classification combined
});
```

---

## Success Metrics

| Metric | Current | Target | Measurement Method |
|--------|---------|--------|-------------------|
| **Speech Detection Latency** | ~50-100ms | <30ms | E2E test with timing |
| **Barge-In to Audio Stop** | ~100-200ms | <50ms | E2E test with timing |
| **False Positive Rate** | ~10% | <2% | Automated test suite |
| **Backchannel Accuracy** | N/A (new) | >90% | Labeled test dataset |
| **Echo Cancellation Effectiveness** | Basic correlation | >95% echo removal | Audio analysis |
| **Turn-Taking Naturalness** | N/A | User survey >4/5 | User study |
| **User Satisfaction** | Baseline | +40% | A/B test |

### Telemetry Metrics

```typescript
export interface BargeInMetrics {
  speechOnsetToDetectionMs: number;
  detectionToFadeMs: number;
  totalBargeInLatencyMs: number;
  classificationType: 'backchannel' | 'soft_barge' | 'hard_barge' | 'unclear';
  classificationConfidence: number;
  speechDurationMs: number;
  wasCorrectClassification: boolean | null;
  aiResponseInterrupted: boolean;
  interruptedAtPercentage: number;
  vadConfidence: number;
  echoLevel: number;
  sessionDurationMs: number;
  bargeInCountInSession: number;
  backchannelCountInSession: number;
}
```

---

## File Summary

### New Files to Create (41 files)

#### Phase 1: Neural VAD (7 files)
- `src/lib/sileroVAD/index.ts`
- `src/lib/sileroVAD/vadWorker.ts`
- `src/lib/sileroVAD/types.ts`
- `public/silero_vad.onnx`
- `public/vad-processor.js`
- `src/hooks/useNeuralVAD.ts`
- `src/utils/vadClassifier.ts`

#### Phase 2: Instant Response (3 files)
- `src/components/voice/BargeInFeedback.tsx`
- `src/hooks/useHapticFeedback.ts`
- `src/lib/audioFeedback.ts`

#### Phase 3: Context-Aware Intelligence (6 files)
- `src/lib/bargeInClassifier/index.ts`
- `src/lib/bargeInClassifier/backchannelDetector.ts`
- `src/lib/bargeInClassifier/intentClassifier.ts`
- `src/lib/bargeInClassifier/types.ts`
- `src/hooks/useIntelligentBargeIn/types.ts`
- `services/api-gateway/app/services/barge_in_classifier.py`

#### Phase 4: Advanced Audio (5 files)
- `src/lib/echoCancellation/index.ts`
- `src/lib/echoCancellation/adaptiveFilter.ts`
- `src/lib/echoCancellation/speakerReference.ts`
- `public/aec-processor.js`
- `src/lib/noiseReduction/rnnoise.ts`

#### Phase 5: Natural Turn-Taking (5 files)
- `src/lib/turnTaking/index.ts`
- `src/lib/turnTaking/prosodicAnalyzer.ts`
- `src/lib/turnTaking/silencePredictor.ts`
- `src/lib/turnTaking/types.ts`
- `services/api-gateway/app/services/turn_taking_service.py`

#### Phase 6: Full Duplex (4 files)
- `src/lib/fullDuplex/index.ts`
- `src/lib/fullDuplex/audioMixer.ts`
- `src/lib/fullDuplex/overlapHandler.ts`
- `src/components/voice/DuplexIndicator.tsx`

#### Tests (11 files)
- `src/lib/sileroVAD/__tests__/sileroVAD.test.ts`
- `src/lib/bargeInClassifier/__tests__/classifier.test.ts`
- `src/lib/bargeInClassifier/__tests__/backchannelDetector.test.ts`
- `src/lib/echoCancellation/__tests__/aec.test.ts`
- `src/lib/turnTaking/__tests__/turnTaking.test.ts`
- `src/lib/fullDuplex/__tests__/fullDuplex.test.ts`
- `src/hooks/__tests__/useNeuralVAD.test.ts`
- `src/hooks/__tests__/useIntelligentBargeIn.test.ts`
- `e2e/voice/barge-in-integration.spec.ts`
- `benchmarks/barge-in-latency.bench.ts`
- `services/api-gateway/tests/services/barge_in_classifier_test.py`

### Files to Modify (12 files)

| File | Changes |
|------|---------|
| `package.json` | Add onnxruntime-web dependency |
| `useThinkerTalkerSession.ts` | Integrate Neural VAD, AEC, barge-in handling |
| `useTTAudioPlayback.ts` | Add fade-out capability, AEC reference feeding |
| `audio-capture-processor.js` | Integrate with AEC processor |
| `CompactVoiceBar.tsx` | Add barge-in feedback, state indicators |
| `VoiceBargeInIndicator.tsx` | Enhance with classification type display |
| `useVoiceModeStateMachine.ts` | Upgrade to intelligent barge-in state machine |
| `vad.ts` | Replace with Neural VAD wrapper |
| `voiceSettingsStore.ts` | Add barge-in configuration options |
| `thinker_talker_websocket_handler.py` | Enhanced barge-in message handling |
| `voiceTelemetry.ts` | Add barge-in metrics tracking |
| `VoiceSettingsEnhanced.tsx` | Add barge-in sensitivity controls |

---

## Implementation Timeline

```
Phase 1: Neural VAD (Foundation)
├── Week 1: Silero VAD integration & Web Worker setup
├── Week 2: useNeuralVAD hook & integration with T/T session
└── Deliverable: <30ms speech detection

Phase 2: Instant Response
├── Week 2-3: BargeInFeedback component
├── Week 3: Haptic & audio feedback systems
└── Deliverable: <50ms user feedback

Phase 3: Context-Aware Intelligence
├── Week 3-4: Backchannel detector
├── Week 4: Intent classifier & state machine
└── Deliverable: >90% backchannel accuracy

Phase 4: Advanced Audio
├── Week 4-5: Echo cancellation system
├── Week 5: AEC AudioWorklet integration
└── Deliverable: >95% echo removal

Phase 5: Natural Turn-Taking
├── Week 5-6: Prosodic analyzer
├── Week 6: Adaptive silence predictor
└── Deliverable: Natural conversation flow

Phase 6: Full Duplex
├── Week 6-7: Full duplex manager
├── Week 7: Overlap handling & UI
└── Deliverable: Simultaneous speaking capability

Testing & Polish
├── Week 7-8: Comprehensive testing
├── Week 8: Performance optimization
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

2. **Download Silero VAD model:**
   ```bash
   # Download from https://github.com/snakers4/silero-vad
   # Place silero_vad.onnx in public/
   ```

3. **Start with Phase 1:**
   - Create `src/lib/sileroVAD/` directory
   - Implement SileroVAD class
   - Create useNeuralVAD hook
   - Integrate with useThinkerTalkerSession

4. **Run tests:**
   ```bash
   npm run test -- --grep "Neural VAD"
   ```

---

## References

- [Silero VAD GitHub](https://github.com/snakers4/silero-vad)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript.html)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [NLMS Algorithm](https://en.wikipedia.org/wiki/Least_mean_squares_filter#Normalized_least_mean_squares_filter_(NLMS))

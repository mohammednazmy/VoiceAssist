---
title: Smart Conversational Voice Design
slug: voice/smart-conversational-voice-design
summary: >-
  Technical design for intelligent barge-in acknowledgments and natural
  conversational flow in voice mode.
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
category: voice
relatedPaths:
  - services/api-gateway/app/services/voice_pipeline_service.py
  - services/api-gateway/app/services/barge_in_classifier.py
  - apps/web-app/src/hooks/useBargeInPromptAudio.ts
  - apps/web-app/src/hooks/useBackchannelAudio.ts
  - apps/web-app/src/components/voice/ThinkingFeedbackPanel.tsx
ai_summary: >-
  Design document for Phase 2 (Smart Acknowledgments) and Phase 3 (Natural
  Conversational Flow) of voice mode enhancements. Covers contextual barge-in
  responses, intelligent timing, and human-like conversational patterns.
---

# Smart Conversational Voice Design

> **Status:** Design Document
> **Version:** 1.0
> **Last Updated:** 2025-12-04
> **Authors:** AI Assistant, Development Team

## Executive Summary

This document outlines the technical design for making VoiceAssist voice mode feel natural and conversational. It covers two phases:

- **Phase 2: Smart Acknowledgments** - Context-aware barge-in responses
- **Phase 3: Natural Conversational Flow** - Human-like turn-taking and prosody

## Current State Analysis

### What Works

1. **Thinking Tones** (Just Implemented)
   - `ThinkingFeedbackPanel` now integrated into `ThinkerTalkerVoicePanel.tsx`
   - Plays configurable audio tones during "processing" state
   - Settings in `voiceSettingsStore.ts` (enabled by default)

2. **Barge-in Detection**
   - Fast VAD detection (<30ms latency)
   - Pattern classification (backchannel, soft barge, hard barge)
   - ElevenLabs TTS for consistent voice

### What Needs Improvement

1. **Static Acknowledgments**
   - Current: Always plays "I'm listening" regardless of context
   - Problem: Unnatural, doesn't match what user is saying

2. **Poor Timing**
   - Current: Fixed thresholds for pause detection
   - Problem: Doesn't adapt to user's natural speech rhythm

3. **No Conversational Intelligence**
   - Current: Pattern matching only
   - Problem: Can't understand user intent or generate appropriate responses

---

# Phase 2: Smart Acknowledgments

## Overview

Replace static barge-in phrases with context-aware acknowledgments that reflect what the user is saying and why they're interrupting.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Smart Acknowledgment Pipeline                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   User Speech ──► STT ──► Partial Transcript                            │
│                              │                                           │
│                              ▼                                           │
│                    ┌──────────────────────┐                             │
│                    │ Intent Classifier    │                             │
│                    │ (Fast, <50ms)        │                             │
│                    └──────────┬───────────┘                             │
│                               │                                          │
│           ┌───────────────────┼───────────────────┐                     │
│           ▼                   ▼                   ▼                     │
│    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │
│    │  Question   │    │ Correction  │    │ Interruption│               │
│    │  Intent     │    │  Intent     │    │   Intent    │               │
│    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘               │
│           │                  │                  │                       │
│           ▼                  ▼                  ▼                       │
│    ┌─────────────────────────────────────────────────────┐             │
│    │           Contextual Phrase Selector                 │             │
│    │  - Matches intent to phrase library                 │             │
│    │  - Considers conversation history                   │             │
│    │  - Respects user's language preference              │             │
│    └────────────────────────┬────────────────────────────┘             │
│                             │                                           │
│                             ▼                                           │
│                    ┌──────────────────────┐                             │
│                    │ Cached TTS Lookup    │                             │
│                    │ (Pre-synthesized)    │                             │
│                    └──────────┬───────────┘                             │
│                               │                                          │
│                               ▼                                          │
│                         Audio Playback                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Intent Classifier Service

**Location:** `services/api-gateway/app/services/acknowledgment_intent_classifier.py`

```python
"""
Acknowledgment Intent Classifier

Fast intent classification for barge-in acknowledgments.
Must complete in <50ms to maintain conversational flow.
"""

from enum import Enum
from dataclasses import dataclass
from typing import Optional, List
import re


class AcknowledgmentIntent(str, Enum):
    """Detected intent for acknowledgment selection."""

    QUESTION = "question"           # User asking a question
    CORRECTION = "correction"       # User correcting AI
    CLARIFICATION = "clarification" # User needs more info
    AGREEMENT = "agreement"         # User agrees/confirms
    DISAGREEMENT = "disagreement"   # User disagrees
    HESITATION = "hesitation"       # User is thinking/unsure
    INTERRUPTION = "interruption"   # User wants to change topic
    COMMAND = "command"             # User giving instruction
    CONTINUATION = "continuation"   # User wants AI to continue
    UNKNOWN = "unknown"             # Cannot determine


@dataclass
class IntentResult:
    """Result of intent classification."""

    intent: AcknowledgmentIntent
    confidence: float  # 0.0 - 1.0
    keywords: List[str]  # Matched keywords
    suggested_phrases: List[str]  # Pre-selected phrases


class AcknowledgmentIntentClassifier:
    """
    Fast intent classifier for barge-in acknowledgments.

    Uses keyword matching and pattern analysis for speed.
    No ML inference - must be <50ms.
    """

    # Intent detection patterns (compiled for speed)
    PATTERNS = {
        AcknowledgmentIntent.QUESTION: [
            r'\b(what|where|when|why|how|who|which|can you|could you|is it|are you|do you)\b',
            r'\?$',
            r'\b(tell me|explain|describe)\b',
        ],
        AcknowledgmentIntent.CORRECTION: [
            r'\b(no|not|wrong|incorrect|actually|but|wait)\b',
            r'\b(i (meant|said|wanted)|that\'s not)\b',
        ],
        AcknowledgmentIntent.CLARIFICATION: [
            r'\b(what do you mean|i don\'t understand|clarify|repeat|again)\b',
            r'\b(sorry|pardon|huh)\b',
        ],
        AcknowledgmentIntent.AGREEMENT: [
            r'\b(yes|yeah|yep|correct|right|exactly|sure|ok|okay)\b',
            r'\b(that\'s right|i agree|makes sense)\b',
        ],
        AcknowledgmentIntent.DISAGREEMENT: [
            r'\b(no|nope|wrong|i disagree|that\'s not|but)\b',
            r'\b(i don\'t think|not quite|actually)\b',
        ],
        AcknowledgmentIntent.HESITATION: [
            r'\b(um+|uh+|hmm+|well|let me think|i\'m not sure)\b',
            r'\.\.\.$',
        ],
        AcknowledgmentIntent.INTERRUPTION: [
            r'\b(stop|wait|hold on|one moment|let me|can i)\b',
            r'\b(before you|hang on|pause)\b',
        ],
        AcknowledgmentIntent.COMMAND: [
            r'\b(go to|open|show|play|start|stop|read|skip)\b',
            r'\b(louder|quieter|slower|faster|repeat)\b',
        ],
        AcknowledgmentIntent.CONTINUATION: [
            r'\b(continue|go on|keep going|and then|more)\b',
            r'\b(what else|tell me more|go ahead)\b',
        ],
    }

    def __init__(self):
        # Pre-compile patterns for speed
        self._compiled_patterns = {
            intent: [re.compile(p, re.IGNORECASE) for p in patterns]
            for intent, patterns in self.PATTERNS.items()
        }

    def classify(
        self,
        transcript: str,
        duration_ms: int,
        during_ai_speech: bool,
        conversation_context: Optional[str] = None,
    ) -> IntentResult:
        """
        Classify user intent for acknowledgment selection.

        Args:
            transcript: The partial or final transcript
            duration_ms: How long the user has been speaking
            during_ai_speech: Whether AI was speaking when user started
            conversation_context: Recent conversation for context

        Returns:
            IntentResult with classified intent and suggestions
        """
        transcript_lower = transcript.lower().strip()

        # Score each intent
        scores = {}
        matched_keywords = {}

        for intent, patterns in self._compiled_patterns.items():
            score = 0.0
            keywords = []

            for pattern in patterns:
                matches = pattern.findall(transcript_lower)
                if matches:
                    score += 0.3 * len(matches)
                    keywords.extend(matches)

            scores[intent] = min(score, 1.0)
            matched_keywords[intent] = keywords

        # Apply contextual adjustments
        if during_ai_speech:
            # More likely to be interruption if AI was speaking
            scores[AcknowledgmentIntent.INTERRUPTION] *= 1.5
            scores[AcknowledgmentIntent.CORRECTION] *= 1.3

        if duration_ms < 500:
            # Short utterances more likely to be backchannels
            scores[AcknowledgmentIntent.AGREEMENT] *= 1.3
            scores[AcknowledgmentIntent.HESITATION] *= 1.2

        # Find best match
        best_intent = max(scores, key=scores.get)
        best_score = scores[best_intent]

        # Fall back to unknown if confidence too low
        if best_score < 0.2:
            best_intent = AcknowledgmentIntent.UNKNOWN
            best_score = 0.0

        return IntentResult(
            intent=best_intent,
            confidence=best_score,
            keywords=matched_keywords.get(best_intent, []),
            suggested_phrases=self._get_phrases(best_intent),
        )

    def _get_phrases(self, intent: AcknowledgmentIntent) -> List[str]:
        """Get suggested acknowledgment phrases for an intent."""
        # These will be selected from the phrase library
        # See SmartPhraseLibrary below
        from .smart_phrase_library import get_phrases_for_intent
        return get_phrases_for_intent(intent)
```

### 2. Smart Phrase Library

**Location:** `services/api-gateway/app/services/smart_phrase_library.py`

```python
"""
Smart Phrase Library

Contextual acknowledgment phrases organized by intent.
Supports multiple languages and formality levels.
"""

from typing import List, Dict
from enum import Enum


class FormalityLevel(str, Enum):
    CASUAL = "casual"
    NEUTRAL = "neutral"
    FORMAL = "formal"


# Phrase library organized by intent
PHRASE_LIBRARY: Dict[str, Dict[str, List[str]]] = {
    "question": {
        "en": [
            "Yes?",
            "What is it?",
            "Go ahead",
            "I'm listening",
            "What would you like to know?",
        ],
        "ar": [
            "نعم؟",
            "تفضل",
            "ما هو سؤالك؟",
            "أنا أستمع",
        ],
    },
    "correction": {
        "en": [
            "I see",
            "Got it",
            "Understood",
            "Let me correct that",
            "My apologies",
            "Thanks for the correction",
        ],
        "ar": [
            "فهمت",
            "حسناً",
            "أعتذر",
            "شكراً للتصحيح",
        ],
    },
    "clarification": {
        "en": [
            "Let me explain",
            "Of course",
            "I'll clarify",
            "What specifically?",
        ],
        "ar": [
            "دعني أوضح",
            "بالتأكيد",
            "ما الذي تريد توضيحه؟",
        ],
    },
    "agreement": {
        "en": [
            "Great",
            "Perfect",
            "Excellent",
            "Wonderful",
        ],
        "ar": [
            "ممتاز",
            "رائع",
            "جميل",
        ],
    },
    "disagreement": {
        "en": [
            "I understand",
            "I hear you",
            "Let me reconsider",
            "Fair point",
        ],
        "ar": [
            "أفهم",
            "أسمعك",
            "نقطة جيدة",
        ],
    },
    "hesitation": {
        "en": [
            "Take your time",
            "No rush",
            "I'm here",
            "Whenever you're ready",
        ],
        "ar": [
            "خذ وقتك",
            "لا تستعجل",
            "أنا هنا",
        ],
    },
    "interruption": {
        "en": [
            "Of course",
            "Go ahead",
            "Yes?",
            "Please, continue",
        ],
        "ar": [
            "بالتأكيد",
            "تفضل",
            "نعم؟",
        ],
    },
    "command": {
        "en": [
            "Right away",
            "On it",
            "Sure thing",
            "Doing that now",
        ],
        "ar": [
            "حالاً",
            "فوراً",
            "بالتأكيد",
        ],
    },
    "continuation": {
        "en": [
            "Certainly",
            "Of course",
            "Let me continue",
            "Where was I...",
        ],
        "ar": [
            "بالتأكيد",
            "حسناً",
            "دعني أكمل",
        ],
    },
    "unknown": {
        "en": [
            "I'm listening",
            "Go ahead",
            "Yes?",
        ],
        "ar": [
            "أنا أستمع",
            "تفضل",
            "نعم؟",
        ],
    },
}


def get_phrases_for_intent(
    intent: str,
    language: str = "en",
    formality: FormalityLevel = FormalityLevel.NEUTRAL,
) -> List[str]:
    """
    Get acknowledgment phrases for a given intent.

    Args:
        intent: The classified intent (from AcknowledgmentIntent)
        language: Language code (en, ar, etc.)
        formality: Formality level for phrase selection

    Returns:
        List of suitable phrases
    """
    intent_phrases = PHRASE_LIBRARY.get(intent, PHRASE_LIBRARY["unknown"])
    return intent_phrases.get(language, intent_phrases.get("en", ["I'm listening"]))


def select_phrase(
    intent: str,
    language: str = "en",
    avoid_recent: List[str] = None,
) -> str:
    """
    Select a single phrase, avoiding recently used ones.

    Args:
        intent: The classified intent
        language: Language code
        avoid_recent: List of recently used phrases to avoid

    Returns:
        Selected phrase
    """
    import random

    phrases = get_phrases_for_intent(intent, language)

    if avoid_recent:
        available = [p for p in phrases if p not in avoid_recent]
        if available:
            phrases = available

    return random.choice(phrases)
```

### 3. Phrase Cache Service

**Location:** `services/api-gateway/app/services/phrase_cache_service.py`

```python
"""
Phrase Cache Service

Pre-synthesizes and caches acknowledgment phrases for instant playback.
Uses ElevenLabs TTS with the user's selected voice.
"""

import asyncio
import hashlib
from typing import Dict, Optional
from dataclasses import dataclass
import aioredis

from app.services.elevenlabs_service import ElevenLabsService
from app.services.smart_phrase_library import PHRASE_LIBRARY
from app.core.voice_constants import DEFAULT_VOICE_ID


@dataclass
class CachedPhrase:
    """A pre-synthesized phrase."""

    text: str
    voice_id: str
    language: str
    audio_data: bytes
    duration_ms: int


class PhraseCacheService:
    """
    Manages pre-synthesized acknowledgment phrases.

    Caches phrases in Redis for fast retrieval.
    Pre-warms cache on voice selection.
    """

    CACHE_PREFIX = "phrase_cache:"
    CACHE_TTL = 86400 * 7  # 7 days

    def __init__(
        self,
        redis_client: aioredis.Redis,
        elevenlabs: ElevenLabsService,
    ):
        self.redis = redis_client
        self.elevenlabs = elevenlabs
        self._warming = False

    def _cache_key(self, text: str, voice_id: str, language: str) -> str:
        """Generate cache key for a phrase."""
        content = f"{text}:{voice_id}:{language}"
        hash_val = hashlib.sha256(content.encode()).hexdigest()[:16]
        return f"{self.CACHE_PREFIX}{hash_val}"

    async def get_phrase(
        self,
        text: str,
        voice_id: str = DEFAULT_VOICE_ID,
        language: str = "en",
    ) -> Optional[bytes]:
        """
        Get cached audio for a phrase.

        Args:
            text: The phrase text
            voice_id: ElevenLabs voice ID
            language: Language code

        Returns:
            Audio bytes if cached, None otherwise
        """
        key = self._cache_key(text, voice_id, language)
        data = await self.redis.get(key)
        return data

    async def cache_phrase(
        self,
        text: str,
        voice_id: str,
        language: str,
        audio_data: bytes,
    ) -> None:
        """Cache synthesized audio for a phrase."""
        key = self._cache_key(text, voice_id, language)
        await self.redis.setex(key, self.CACHE_TTL, audio_data)

    async def synthesize_and_cache(
        self,
        text: str,
        voice_id: str = DEFAULT_VOICE_ID,
        language: str = "en",
    ) -> bytes:
        """
        Synthesize a phrase and cache it.

        Args:
            text: Phrase to synthesize
            voice_id: ElevenLabs voice ID
            language: Language code

        Returns:
            Synthesized audio bytes
        """
        # Check cache first
        cached = await self.get_phrase(text, voice_id, language)
        if cached:
            return cached

        # Synthesize
        audio_chunks = []
        async for chunk in self.elevenlabs.synthesize_stream(
            text=text,
            voice_id=voice_id,
            model_id="eleven_flash_v2_5",  # Fast model for acknowledgments
        ):
            audio_chunks.append(chunk)

        audio_data = b"".join(audio_chunks)

        # Cache for future use
        await self.cache_phrase(text, voice_id, language, audio_data)

        return audio_data

    async def warm_cache(
        self,
        voice_id: str,
        languages: List[str] = ["en", "ar"],
    ) -> None:
        """
        Pre-synthesize all phrases for a voice.

        Called when user selects a voice to pre-warm cache.

        Args:
            voice_id: ElevenLabs voice ID
            languages: Languages to cache
        """
        if self._warming:
            return

        self._warming = True

        try:
            tasks = []

            for intent, lang_phrases in PHRASE_LIBRARY.items():
                for lang in languages:
                    if lang not in lang_phrases:
                        continue

                    for phrase in lang_phrases[lang]:
                        # Check if already cached
                        cached = await self.get_phrase(phrase, voice_id, lang)
                        if not cached:
                            tasks.append(
                                self.synthesize_and_cache(phrase, voice_id, lang)
                            )

            # Synthesize in batches to avoid rate limits
            batch_size = 5
            for i in range(0, len(tasks), batch_size):
                batch = tasks[i:i + batch_size]
                await asyncio.gather(*batch, return_exceptions=True)
                await asyncio.sleep(0.5)  # Rate limit buffer

        finally:
            self._warming = False
```

### 4. Smart Acknowledgment Service

**Location:** `services/api-gateway/app/services/smart_acknowledgment_service.py`

```python
"""
Smart Acknowledgment Service

Orchestrates intent classification, phrase selection, and audio playback
for contextual barge-in acknowledgments.
"""

import asyncio
from typing import Optional, List, Callable
from dataclasses import dataclass
import time

from app.services.acknowledgment_intent_classifier import (
    AcknowledgmentIntentClassifier,
    IntentResult,
)
from app.services.smart_phrase_library import select_phrase
from app.services.phrase_cache_service import PhraseCacheService
from app.core.voice_constants import DEFAULT_VOICE_ID


@dataclass
class AcknowledgmentResult:
    """Result of acknowledgment generation."""

    phrase: str
    intent: str
    confidence: float
    audio_data: Optional[bytes]
    latency_ms: int


class SmartAcknowledgmentService:
    """
    Generates contextual acknowledgments for barge-in events.

    Pipeline:
    1. Classify user intent from transcript
    2. Select appropriate phrase
    3. Retrieve cached audio (or synthesize)
    4. Return for playback

    Target latency: <100ms
    """

    def __init__(
        self,
        phrase_cache: PhraseCacheService,
    ):
        self.classifier = AcknowledgmentIntentClassifier()
        self.phrase_cache = phrase_cache
        self._recent_phrases: List[str] = []
        self._max_recent = 5

    async def generate_acknowledgment(
        self,
        transcript: str,
        duration_ms: int,
        during_ai_speech: bool,
        voice_id: str = DEFAULT_VOICE_ID,
        language: str = "en",
        conversation_context: Optional[str] = None,
    ) -> AcknowledgmentResult:
        """
        Generate a contextual acknowledgment for a barge-in.

        Args:
            transcript: User's speech transcript
            duration_ms: How long user has been speaking
            during_ai_speech: Whether AI was speaking
            voice_id: Voice to use for TTS
            language: User's language preference
            conversation_context: Recent conversation for context

        Returns:
            AcknowledgmentResult with phrase and audio
        """
        start_time = time.monotonic()

        # 1. Classify intent
        intent_result = self.classifier.classify(
            transcript=transcript,
            duration_ms=duration_ms,
            during_ai_speech=during_ai_speech,
            conversation_context=conversation_context,
        )

        # 2. Select phrase (avoid repetition)
        phrase = select_phrase(
            intent=intent_result.intent.value,
            language=language,
            avoid_recent=self._recent_phrases,
        )

        # Track recent phrases
        self._recent_phrases.append(phrase)
        if len(self._recent_phrases) > self._max_recent:
            self._recent_phrases.pop(0)

        # 3. Get cached audio
        audio_data = await self.phrase_cache.get_phrase(
            text=phrase,
            voice_id=voice_id,
            language=language,
        )

        # 4. Synthesize if not cached (should be rare after warm-up)
        if not audio_data:
            audio_data = await self.phrase_cache.synthesize_and_cache(
                text=phrase,
                voice_id=voice_id,
                language=language,
            )

        latency_ms = int((time.monotonic() - start_time) * 1000)

        return AcknowledgmentResult(
            phrase=phrase,
            intent=intent_result.intent.value,
            confidence=intent_result.confidence,
            audio_data=audio_data,
            latency_ms=latency_ms,
        )

    def reset_recent_phrases(self) -> None:
        """Reset recent phrase tracking (e.g., on new session)."""
        self._recent_phrases.clear()
```

### 5. Frontend Integration

**Location:** `apps/web-app/src/hooks/useSmartAcknowledgment.ts`

```typescript
/**
 * useSmartAcknowledgment Hook
 *
 * Fetches and plays contextual acknowledgment audio based on
 * user intent classification.
 */

import { useCallback, useRef } from "react";
import { voiceLog } from "../lib/logger";

interface SmartAcknowledgmentOptions {
  /** ElevenLabs voice ID */
  voiceId?: string;
  /** Language code */
  language?: string;
  /** API base URL */
  apiBaseUrl?: string;
  /** Auth token getter */
  getAccessToken?: () => string | null;
  /** Volume (0-1) */
  volume?: number;
}

interface AcknowledgmentResult {
  phrase: string;
  intent: string;
  confidence: number;
  latency_ms: number;
}

export function useSmartAcknowledgment(options: SmartAcknowledgmentOptions = {}) {
  const {
    voiceId,
    language = "en",
    apiBaseUrl = typeof window !== "undefined" ? window.location.origin : "",
    getAccessToken,
    volume = 0.8,
  } = options;

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  /**
   * Play a smart acknowledgment based on user transcript.
   */
  const playAcknowledgment = useCallback(
    async (transcript: string, durationMs: number, duringAiSpeech: boolean): Promise<AcknowledgmentResult | null> => {
      try {
        const token = getAccessToken?.();
        const url = `${apiBaseUrl}/api/voice/smart-acknowledgment`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            transcript,
            duration_ms: durationMs,
            during_ai_speech: duringAiSpeech,
            voice_id: voiceId,
            language,
          }),
        });

        if (!response.ok) {
          throw new Error(`Acknowledgment request failed: ${response.status}`);
        }

        // Response contains both metadata and audio
        const contentType = response.headers.get("content-type");

        if (contentType?.includes("application/json")) {
          // Metadata-only response (audio from cache)
          const data = await response.json();

          // Fetch audio separately
          const audioResponse = await fetch(
            `${apiBaseUrl}/api/voice/phrase-audio?` +
              `phrase=${encodeURIComponent(data.phrase)}&` +
              `voice_id=${voiceId}&language=${language}`,
            {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            },
          );

          if (audioResponse.ok) {
            const audioData = await audioResponse.arrayBuffer();
            await playAudioBuffer(audioData);
          }

          return data;
        } else {
          // Multipart response with audio embedded
          // Parse and play
          const audioData = await response.arrayBuffer();
          await playAudioBuffer(audioData);

          // Extract metadata from header
          const metadata = response.headers.get("X-Acknowledgment-Metadata");
          return metadata ? JSON.parse(metadata) : null;
        }
      } catch (error) {
        voiceLog.error("[SmartAcknowledgment] Failed to play:", error);
        return null;
      }
    },
    [apiBaseUrl, voiceId, language, getAccessToken],
  );

  const playAudioBuffer = useCallback(
    async (audioData: ArrayBuffer): Promise<void> => {
      const ctx = getAudioContext();
      const audioBuffer = await ctx.decodeAudioData(audioData);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      if (!gainNodeRef.current) {
        gainNodeRef.current = ctx.createGain();
        gainNodeRef.current.connect(ctx.destination);
      }
      gainNodeRef.current.gain.value = volume;

      source.connect(gainNodeRef.current);
      source.start(0);
    },
    [getAudioContext, volume],
  );

  return {
    playAcknowledgment,
  };
}
```

### 6. Voice Pipeline Integration

**Location:** Update `services/api-gateway/app/services/voice_pipeline_service.py`

```python
# Add to VoicePipelineService class

async def _handle_barge_in_with_smart_ack(
    self,
    transcript: str,
    duration_ms: int,
) -> None:
    """
    Handle barge-in with smart acknowledgment.

    Called when user interrupts AI speech.
    """
    # Stop current speech
    await self._stop_speaking(reason="barge_in")

    # Generate smart acknowledgment
    if self._smart_ack_service:
        result = await self._smart_ack_service.generate_acknowledgment(
            transcript=transcript,
            duration_ms=duration_ms,
            during_ai_speech=True,
            voice_id=self._config.voice_id,
            language=self._config.language,
        )

        # Send acknowledgment audio to client
        if result.audio_data:
            await self._on_message(
                PipelineMessage(
                    type="voice.acknowledgment",
                    data={
                        "phrase": result.phrase,
                        "intent": result.intent,
                        "confidence": result.confidence,
                        "audio": base64.b64encode(result.audio_data).decode(),
                    },
                )
            )
```

---

# Phase 3: Natural Conversational Flow

## Overview

Make voice mode feel like a natural human conversation with proper turn-taking, prosody variation, and adaptive timing.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                 Natural Conversational Flow System                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Turn-Taking Manager                           │   │
│  │                                                                  │   │
│  │   User Speaking ◄────────────────────────────► AI Speaking      │   │
│  │        │                                            │            │   │
│  │        ▼                                            ▼            │   │
│  │   ┌─────────────┐                          ┌─────────────┐      │   │
│  │   │ End-of-Turn │                          │ Yield Point │      │   │
│  │   │ Detector    │                          │ Detector    │      │   │
│  │   └─────────────┘                          └─────────────┘      │   │
│  │                                                                  │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                 │                                       │
│  ┌──────────────────────────────▼──────────────────────────────────┐   │
│  │                    Prosody Controller                            │   │
│  │                                                                  │   │
│  │   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │   │
│  │   │ Emotion   │  │ Emphasis  │  │ Pacing    │  │ Intonation│   │   │
│  │   │ Mapping   │  │ Markers   │  │ Control   │  │ Patterns  │   │   │
│  │   └───────────┘  └───────────┘  └───────────┘  └───────────┘   │   │
│  │                                                                  │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                 │                                       │
│  ┌──────────────────────────────▼──────────────────────────────────┐   │
│  │                 Adaptive Timing Engine                           │   │
│  │                                                                  │   │
│  │   ┌───────────────┐    ┌───────────────┐    ┌───────────────┐   │   │
│  │   │ User Pattern  │    │ Response Gap  │    │ Hesitation    │   │   │
│  │   │ Learning      │    │ Calibration   │    │ Detection     │   │   │
│  │   └───────────────┘    └───────────────┘    └───────────────┘   │   │
│  │                                                                  │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                 │                                       │
│  ┌──────────────────────────────▼──────────────────────────────────┐   │
│  │                 Conversational Fillers                           │   │
│  │                                                                  │   │
│  │   "So..."  "Well..."  "Let me see..."  "Hmm..."  [thinking]     │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Turn-Taking Manager

**Location:** `services/api-gateway/app/services/turn_taking_manager.py`

```python
"""
Turn-Taking Manager

Manages conversational turn-taking between user and AI.
Detects end-of-turn signals and yield points for natural flow.
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, List, Callable
import asyncio
import time


class TurnState(str, Enum):
    """Current turn state."""

    USER_SPEAKING = "user_speaking"
    USER_FINISHED = "user_finished"
    AI_THINKING = "ai_thinking"
    AI_SPEAKING = "ai_speaking"
    AI_YIELDING = "ai_yielding"  # AI pausing for potential user input
    IDLE = "idle"


class EndOfTurnSignal(str, Enum):
    """Detected end-of-turn signals."""

    SILENCE = "silence"           # Long pause
    FALLING_INTONATION = "falling_intonation"  # Voice pitch drops
    COMPLETE_SENTENCE = "complete_sentence"    # Syntactically complete
    QUESTION_MARKER = "question_marker"        # Rising intonation / "?"
    EXPLICIT_HANDOFF = "explicit_handoff"      # "What do you think?"
    BACKCHANNEL_REQUEST = "backchannel_request"  # Trailing "right?", "you know?"


@dataclass
class TurnEvent:
    """A turn-taking event."""

    timestamp: float
    previous_state: TurnState
    new_state: TurnState
    signal: Optional[EndOfTurnSignal] = None
    confidence: float = 1.0
    metadata: dict = field(default_factory=dict)


class TurnTakingManager:
    """
    Manages natural turn-taking in voice conversations.

    Features:
    - End-of-turn detection with multiple signals
    - Yield point detection for AI speech
    - Overlap handling
    - Turn history tracking
    """

    # Timing thresholds (ms)
    SILENCE_THRESHOLD_SHORT = 300   # Brief pause (continue listening)
    SILENCE_THRESHOLD_MEDIUM = 700  # Possible end of turn
    SILENCE_THRESHOLD_LONG = 1200   # Definite end of turn

    # AI yield points (opportunities to yield floor to user)
    YIELD_AFTER_QUESTION = True
    YIELD_AFTER_LIST_ITEM = True
    YIELD_AFTER_PARAGRAPH = True

    def __init__(
        self,
        on_turn_change: Optional[Callable[[TurnEvent], None]] = None,
    ):
        self._state = TurnState.IDLE
        self._on_turn_change = on_turn_change
        self._turn_history: List[TurnEvent] = []
        self._last_activity_time = time.monotonic()
        self._user_pattern_stats = UserPatternStats()

    @property
    def state(self) -> TurnState:
        return self._state

    def user_started_speaking(self) -> TurnEvent:
        """Called when VAD detects user speech start."""
        return self._transition(
            TurnState.USER_SPEAKING,
            signal=None,
        )

    def user_silence_detected(self, silence_ms: int) -> Optional[TurnEvent]:
        """
        Called periodically during user silence.

        Returns TurnEvent if this silence indicates end of turn.
        """
        if self._state != TurnState.USER_SPEAKING:
            return None

        # Use adaptive threshold based on user patterns
        threshold = self._user_pattern_stats.get_silence_threshold()

        if silence_ms >= threshold:
            return self._transition(
                TurnState.USER_FINISHED,
                signal=EndOfTurnSignal.SILENCE,
                confidence=min(silence_ms / self.SILENCE_THRESHOLD_LONG, 1.0),
            )

        return None

    def user_sentence_complete(
        self,
        transcript: str,
        is_question: bool = False,
    ) -> Optional[TurnEvent]:
        """
        Called when syntactic analysis detects complete sentence.
        """
        if self._state != TurnState.USER_SPEAKING:
            return None

        signal = (
            EndOfTurnSignal.QUESTION_MARKER
            if is_question
            else EndOfTurnSignal.COMPLETE_SENTENCE
        )

        return self._transition(
            TurnState.USER_FINISHED,
            signal=signal,
            metadata={"transcript": transcript, "is_question": is_question},
        )

    def ai_started_thinking(self) -> TurnEvent:
        """Called when LLM processing begins."""
        return self._transition(TurnState.AI_THINKING)

    def ai_started_speaking(self) -> TurnEvent:
        """Called when TTS audio starts playing."""
        return self._transition(TurnState.AI_SPEAKING)

    def ai_yield_point(self, reason: str) -> TurnEvent:
        """
        Called at natural yield points in AI speech.

        Yield points:
        - After asking a question
        - After each list item
        - After paragraph breaks
        - After "What do you think?" type phrases
        """
        if self._state != TurnState.AI_SPEAKING:
            return self._state

        return self._transition(
            TurnState.AI_YIELDING,
            metadata={"yield_reason": reason},
        )

    def ai_finished_speaking(self) -> TurnEvent:
        """Called when AI finishes speaking."""
        return self._transition(TurnState.IDLE)

    def user_interrupted(self) -> TurnEvent:
        """Called when user barges in during AI speech."""
        return self._transition(
            TurnState.USER_SPEAKING,
            signal=None,
            metadata={"was_interruption": True},
        )

    def _transition(
        self,
        new_state: TurnState,
        signal: Optional[EndOfTurnSignal] = None,
        confidence: float = 1.0,
        metadata: dict = None,
    ) -> TurnEvent:
        """Perform state transition and notify listeners."""
        event = TurnEvent(
            timestamp=time.monotonic(),
            previous_state=self._state,
            new_state=new_state,
            signal=signal,
            confidence=confidence,
            metadata=metadata or {},
        )

        self._state = new_state
        self._turn_history.append(event)
        self._last_activity_time = event.timestamp

        # Keep history bounded
        if len(self._turn_history) > 100:
            self._turn_history = self._turn_history[-50:]

        if self._on_turn_change:
            self._on_turn_change(event)

        return event

    def get_conversation_stats(self) -> dict:
        """Get statistics about turn-taking patterns."""
        user_turns = [e for e in self._turn_history if e.new_state == TurnState.USER_SPEAKING]
        ai_turns = [e for e in self._turn_history if e.new_state == TurnState.AI_SPEAKING]
        interruptions = [e for e in self._turn_history if e.metadata.get("was_interruption")]

        return {
            "user_turns": len(user_turns),
            "ai_turns": len(ai_turns),
            "interruptions": len(interruptions),
            "avg_user_turn_duration_ms": self._user_pattern_stats.avg_turn_duration_ms,
            "learned_silence_threshold_ms": self._user_pattern_stats.get_silence_threshold(),
        }


@dataclass
class UserPatternStats:
    """
    Tracks user's speech patterns for adaptive timing.

    Learns:
    - Typical pause duration within utterances
    - Typical turn duration
    - Speaking rate
    """

    pause_durations: List[int] = field(default_factory=list)
    turn_durations: List[int] = field(default_factory=list)

    @property
    def avg_pause_ms(self) -> int:
        if not self.pause_durations:
            return 500
        return int(sum(self.pause_durations) / len(self.pause_durations))

    @property
    def avg_turn_duration_ms(self) -> int:
        if not self.turn_durations:
            return 3000
        return int(sum(self.turn_durations) / len(self.turn_durations))

    def record_pause(self, duration_ms: int) -> None:
        """Record a within-utterance pause."""
        self.pause_durations.append(duration_ms)
        if len(self.pause_durations) > 20:
            self.pause_durations.pop(0)

    def record_turn(self, duration_ms: int) -> None:
        """Record a complete turn duration."""
        self.turn_durations.append(duration_ms)
        if len(self.turn_durations) > 20:
            self.turn_durations.pop(0)

    def get_silence_threshold(self) -> int:
        """
        Get adaptive silence threshold for end-of-turn detection.

        Based on user's typical pause patterns.
        """
        # Use 1.5x the average pause as threshold
        # Bounded between 400-1200ms
        threshold = int(self.avg_pause_ms * 1.5)
        return max(400, min(1200, threshold))
```

### 2. Prosody Controller

**Location:** `services/api-gateway/app/services/prosody_controller.py`

```python
"""
Prosody Controller

Controls speech prosody (pitch, rate, emphasis) for natural delivery.
Generates SSML-like annotations for ElevenLabs TTS.
"""

from enum import Enum
from dataclasses import dataclass
from typing import List, Optional, Tuple
import re


class EmotionalTone(str, Enum):
    """Emotional tone for speech."""

    NEUTRAL = "neutral"
    WARM = "warm"
    CONCERNED = "concerned"
    ENTHUSIASTIC = "enthusiastic"
    THOUGHTFUL = "thoughtful"
    ENCOURAGING = "encouraging"
    APOLOGETIC = "apologetic"


class EmphasisLevel(str, Enum):
    """Level of emphasis for words/phrases."""

    NONE = "none"
    MODERATE = "moderate"
    STRONG = "strong"


@dataclass
class ProsodyMarker:
    """A prosody annotation for a text segment."""

    start_pos: int
    end_pos: int
    tone: Optional[EmotionalTone] = None
    emphasis: EmphasisLevel = EmphasisLevel.NONE
    rate_multiplier: float = 1.0  # 0.5 = half speed, 2.0 = double
    pause_before_ms: int = 0
    pause_after_ms: int = 0


@dataclass
class ProsodyAnnotatedText:
    """Text with prosody annotations."""

    text: str
    markers: List[ProsodyMarker]
    overall_tone: EmotionalTone
    overall_rate: float


class ProsodyController:
    """
    Analyzes text and generates prosody annotations.

    Features:
    - Emotion detection from content
    - Emphasis marking for key words
    - Rate adjustment for complexity
    - Natural pause insertion
    """

    # Patterns for prosody detection
    QUESTION_PATTERNS = [
        r'\?$',
        r'\b(what|where|when|why|how|who|which|can|could|would|should)\b',
    ]

    EMPHASIS_PATTERNS = [
        (r'\b(important|critical|essential|key|main|primary)\b', EmphasisLevel.STRONG),
        (r'\b(note|remember|consider|notice)\b', EmphasisLevel.MODERATE),
        (r'\*\*([^*]+)\*\*', EmphasisLevel.STRONG),  # Markdown bold
    ]

    PAUSE_PATTERNS = [
        (r'\.\s+', 400),   # Period
        (r',\s+', 150),    # Comma
        (r':\s+', 300),    # Colon
        (r';\s+', 250),    # Semicolon
        (r'\n\n', 600),    # Paragraph
    ]

    TONE_KEYWORDS = {
        EmotionalTone.WARM: ['welcome', 'glad', 'happy', 'pleased', 'wonderful'],
        EmotionalTone.CONCERNED: ['sorry', 'unfortunately', 'problem', 'issue', 'concern'],
        EmotionalTone.ENTHUSIASTIC: ['great', 'excellent', 'amazing', 'fantastic', 'exciting'],
        EmotionalTone.THOUGHTFUL: ['consider', 'perhaps', 'maybe', 'interesting', 'curious'],
        EmotionalTone.ENCOURAGING: ['you can', 'try', 'keep going', 'good job', 'well done'],
        EmotionalTone.APOLOGETIC: ['sorry', 'apologies', 'my mistake', 'I apologize'],
    }

    def __init__(self):
        self._compiled_patterns = {
            'questions': [re.compile(p, re.IGNORECASE) for p in self.QUESTION_PATTERNS],
            'emphasis': [(re.compile(p, re.IGNORECASE), level) for p, level in self.EMPHASIS_PATTERNS],
            'pauses': [(re.compile(p), duration) for p, duration in self.PAUSE_PATTERNS],
        }

    def analyze(self, text: str, context: Optional[str] = None) -> ProsodyAnnotatedText:
        """
        Analyze text and generate prosody annotations.

        Args:
            text: The text to analyze
            context: Optional conversation context

        Returns:
            ProsodyAnnotatedText with markers
        """
        markers = []

        # Detect overall tone
        overall_tone = self._detect_tone(text)

        # Find emphasis points
        for pattern, level in self._compiled_patterns['emphasis']:
            for match in pattern.finditer(text):
                markers.append(ProsodyMarker(
                    start_pos=match.start(),
                    end_pos=match.end(),
                    emphasis=level,
                ))

        # Find pause points
        for pattern, duration in self._compiled_patterns['pauses']:
            for match in pattern.finditer(text):
                # Add pause after the punctuation
                markers.append(ProsodyMarker(
                    start_pos=match.end(),
                    end_pos=match.end(),
                    pause_before_ms=duration,
                ))

        # Detect questions (for rising intonation)
        is_question = any(p.search(text) for p in self._compiled_patterns['questions'])

        # Adjust rate based on complexity
        overall_rate = self._calculate_rate(text)

        return ProsodyAnnotatedText(
            text=text,
            markers=sorted(markers, key=lambda m: m.start_pos),
            overall_tone=overall_tone,
            overall_rate=overall_rate,
        )

    def _detect_tone(self, text: str) -> EmotionalTone:
        """Detect the emotional tone of the text."""
        text_lower = text.lower()

        scores = {}
        for tone, keywords in self.TONE_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in text_lower)
            scores[tone] = score

        if max(scores.values()) > 0:
            return max(scores, key=scores.get)

        return EmotionalTone.NEUTRAL

    def _calculate_rate(self, text: str) -> float:
        """
        Calculate speaking rate based on content complexity.

        Complex content (technical terms, numbers) spoken slower.
        Simple greetings/acknowledgments spoken at normal pace.
        """
        # Count complexity indicators
        technical_terms = len(re.findall(r'\b[A-Z]{2,}\b', text))  # Acronyms
        numbers = len(re.findall(r'\d+', text))
        long_words = len(re.findall(r'\b\w{10,}\b', text))

        complexity = technical_terms * 2 + numbers + long_words

        # Adjust rate (0.85 to 1.1)
        if complexity > 5:
            return 0.85  # Slower for complex content
        elif complexity > 2:
            return 0.92
        else:
            return 1.0

    def to_elevenlabs_params(
        self,
        annotated: ProsodyAnnotatedText,
    ) -> dict:
        """
        Convert prosody annotations to ElevenLabs parameters.

        ElevenLabs doesn't support SSML, so we adjust:
        - stability (0-1): lower for more expressive
        - similarity_boost (0-1): voice clarity
        - style (0-1): expressiveness
        """
        # Map emotional tone to ElevenLabs parameters
        tone_params = {
            EmotionalTone.NEUTRAL: {"stability": 0.65, "style": 0.15},
            EmotionalTone.WARM: {"stability": 0.55, "style": 0.25},
            EmotionalTone.CONCERNED: {"stability": 0.70, "style": 0.20},
            EmotionalTone.ENTHUSIASTIC: {"stability": 0.45, "style": 0.35},
            EmotionalTone.THOUGHTFUL: {"stability": 0.70, "style": 0.15},
            EmotionalTone.ENCOURAGING: {"stability": 0.50, "style": 0.30},
            EmotionalTone.APOLOGETIC: {"stability": 0.75, "style": 0.10},
        }

        params = tone_params.get(annotated.overall_tone, tone_params[EmotionalTone.NEUTRAL])

        return {
            "stability": params["stability"],
            "similarity_boost": 0.80,
            "style": params["style"],
            "speaking_rate": annotated.overall_rate,
        }
```

### 3. Conversational Filler Service

**Location:** `services/api-gateway/app/services/conversational_filler_service.py`

```python
"""
Conversational Filler Service

Generates natural filler phrases during AI thinking/processing.
Makes the AI feel more human-like by not having awkward silences.
"""

from enum import Enum
from dataclasses import dataclass
from typing import List, Optional
import random
import time


class FillerType(str, Enum):
    """Type of conversational filler."""

    THINKING = "thinking"       # "Hmm...", "Let me see..."
    SEARCHING = "searching"     # "Looking that up...", "Checking..."
    PROCESSING = "processing"   # "One moment...", "Just a second..."
    TRANSITIONING = "transitioning"  # "So...", "Well..."
    ACKNOWLEDGING = "acknowledging"  # "Right...", "I see..."


@dataclass
class FillerPhrase:
    """A filler phrase with metadata."""

    text: str
    filler_type: FillerType
    duration_estimate_ms: int  # How long this typically takes to say
    can_interrupt: bool  # Can be cut off if response is ready


# Filler phrase library
FILLER_LIBRARY = {
    FillerType.THINKING: [
        FillerPhrase("Hmm...", FillerType.THINKING, 400, True),
        FillerPhrase("Let me think...", FillerType.THINKING, 600, True),
        FillerPhrase("Let me see...", FillerType.THINKING, 500, True),
        FillerPhrase("That's an interesting question...", FillerType.THINKING, 900, True),
    ],
    FillerType.SEARCHING: [
        FillerPhrase("Looking that up...", FillerType.SEARCHING, 600, True),
        FillerPhrase("Let me find that for you...", FillerType.SEARCHING, 800, True),
        FillerPhrase("Checking the knowledge base...", FillerType.SEARCHING, 900, True),
    ],
    FillerType.PROCESSING: [
        FillerPhrase("One moment...", FillerType.PROCESSING, 500, True),
        FillerPhrase("Just a second...", FillerType.PROCESSING, 600, True),
        FillerPhrase("Bear with me...", FillerType.PROCESSING, 500, True),
    ],
    FillerType.TRANSITIONING: [
        FillerPhrase("So...", FillerType.TRANSITIONING, 300, False),
        FillerPhrase("Well...", FillerType.TRANSITIONING, 300, False),
        FillerPhrase("Alright...", FillerType.TRANSITIONING, 400, False),
    ],
    FillerType.ACKNOWLEDGING: [
        FillerPhrase("Right...", FillerType.ACKNOWLEDGING, 300, True),
        FillerPhrase("I see...", FillerType.ACKNOWLEDGING, 400, True),
        FillerPhrase("Understood...", FillerType.ACKNOWLEDGING, 500, True),
    ],
}

# Arabic fillers
FILLER_LIBRARY_AR = {
    FillerType.THINKING: [
        FillerPhrase("هممم...", FillerType.THINKING, 400, True),
        FillerPhrase("دعني أفكر...", FillerType.THINKING, 600, True),
    ],
    FillerType.SEARCHING: [
        FillerPhrase("أبحث عن ذلك...", FillerType.SEARCHING, 700, True),
        FillerPhrase("لحظة...", FillerType.SEARCHING, 400, True),
    ],
    FillerType.PROCESSING: [
        FillerPhrase("لحظة من فضلك...", FillerType.PROCESSING, 600, True),
    ],
}


class ConversationalFillerService:
    """
    Manages conversational fillers during AI processing.

    Features:
    - Context-appropriate filler selection
    - Timing coordination with response generation
    - Avoids repetition
    - Language support
    """

    def __init__(self):
        self._recent_fillers: List[str] = []
        self._max_recent = 5
        self._last_filler_time = 0
        self._min_filler_interval_ms = 2000  # Don't spam fillers

    def should_play_filler(
        self,
        processing_duration_ms: int,
        has_tool_call: bool = False,
        expected_response_time_ms: Optional[int] = None,
    ) -> bool:
        """
        Determine if a filler should be played.

        Args:
            processing_duration_ms: How long processing has taken
            has_tool_call: Whether a tool call is in progress
            expected_response_time_ms: Estimated time until response

        Returns:
            True if a filler should be played
        """
        current_time = time.monotonic() * 1000

        # Don't spam fillers
        if current_time - self._last_filler_time < self._min_filler_interval_ms:
            return False

        # Play filler if processing is taking a while
        if processing_duration_ms > 1500:
            return True

        # Play filler for tool calls (searching/processing)
        if has_tool_call and processing_duration_ms > 800:
            return True

        return False

    def select_filler(
        self,
        filler_type: FillerType,
        language: str = "en",
    ) -> Optional[FillerPhrase]:
        """
        Select an appropriate filler phrase.

        Args:
            filler_type: Type of filler needed
            language: Language code

        Returns:
            Selected filler phrase, or None if none available
        """
        # Get library for language
        library = FILLER_LIBRARY_AR if language == "ar" else FILLER_LIBRARY

        phrases = library.get(filler_type, [])
        if not phrases:
            return None

        # Filter out recent fillers
        available = [p for p in phrases if p.text not in self._recent_fillers]
        if not available:
            available = phrases  # Reset if all used

        selected = random.choice(available)

        # Track recent usage
        self._recent_fillers.append(selected.text)
        if len(self._recent_fillers) > self._max_recent:
            self._recent_fillers.pop(0)

        self._last_filler_time = time.monotonic() * 1000

        return selected

    def get_filler_for_context(
        self,
        is_tool_call: bool = False,
        tool_name: Optional[str] = None,
        is_complex_query: bool = False,
        language: str = "en",
    ) -> Optional[FillerPhrase]:
        """
        Get a context-appropriate filler phrase.

        Args:
            is_tool_call: Whether a tool is being called
            tool_name: Name of the tool (for specific fillers)
            is_complex_query: Whether the query is complex
            language: Language code

        Returns:
            Appropriate filler phrase
        """
        # Determine filler type based on context
        if is_tool_call:
            if tool_name and "search" in tool_name.lower():
                filler_type = FillerType.SEARCHING
            else:
                filler_type = FillerType.PROCESSING
        elif is_complex_query:
            filler_type = FillerType.THINKING
        else:
            filler_type = FillerType.THINKING

        return self.select_filler(filler_type, language)
```

### 4. Frontend: Adaptive Timing Hook

**Location:** `apps/web-app/src/hooks/useAdaptiveTiming.ts`

```typescript
/**
 * useAdaptiveTiming Hook
 *
 * Learns user's speech patterns and adapts timing thresholds.
 */

import { useCallback, useRef, useState, useEffect } from "react";

interface TimingStats {
  avgPauseMs: number;
  avgTurnDurationMs: number;
  silenceThresholdMs: number;
  turnCount: number;
}

interface UseAdaptiveTimingOptions {
  /** Initial silence threshold */
  initialSilenceThresholdMs?: number;
  /** Maximum turns to track */
  maxTurnsTracked?: number;
  /** Callback when threshold changes significantly */
  onThresholdChange?: (newThreshold: number) => void;
}

export function useAdaptiveTiming(options: UseAdaptiveTimingOptions = {}) {
  const { initialSilenceThresholdMs = 700, maxTurnsTracked = 20, onThresholdChange } = options;

  const [stats, setStats] = useState<TimingStats>({
    avgPauseMs: 500,
    avgTurnDurationMs: 3000,
    silenceThresholdMs: initialSilenceThresholdMs,
    turnCount: 0,
  });

  const pauseDurationsRef = useRef<number[]>([]);
  const turnDurationsRef = useRef<number[]>([]);
  const turnStartTimeRef = useRef<number | null>(null);
  const lastThresholdRef = useRef(initialSilenceThresholdMs);

  /**
   * Called when user starts speaking.
   */
  const onSpeechStart = useCallback(() => {
    turnStartTimeRef.current = Date.now();
  }, []);

  /**
   * Called when user stops speaking (end of turn).
   */
  const onSpeechEnd = useCallback(() => {
    if (turnStartTimeRef.current) {
      const duration = Date.now() - turnStartTimeRef.current;
      turnDurationsRef.current.push(duration);

      // Keep bounded
      if (turnDurationsRef.current.length > maxTurnsTracked) {
        turnDurationsRef.current.shift();
      }

      // Update stats
      const avgTurn = turnDurationsRef.current.reduce((a, b) => a + b, 0) / turnDurationsRef.current.length;

      setStats((prev) => ({
        ...prev,
        avgTurnDurationMs: avgTurn,
        turnCount: prev.turnCount + 1,
      }));

      turnStartTimeRef.current = null;
    }
  }, [maxTurnsTracked]);

  /**
   * Called when a pause is detected within user speech.
   */
  const onPauseDetected = useCallback(
    (pauseMs: number) => {
      pauseDurationsRef.current.push(pauseMs);

      // Keep bounded
      if (pauseDurationsRef.current.length > maxTurnsTracked) {
        pauseDurationsRef.current.shift();
      }

      // Calculate new threshold (1.5x average pause)
      const avgPause = pauseDurationsRef.current.reduce((a, b) => a + b, 0) / pauseDurationsRef.current.length;

      const newThreshold = Math.max(400, Math.min(1200, avgPause * 1.5));

      setStats((prev) => ({
        ...prev,
        avgPauseMs: avgPause,
        silenceThresholdMs: newThreshold,
      }));

      // Notify if threshold changed significantly
      if (Math.abs(newThreshold - lastThresholdRef.current) > 100) {
        onThresholdChange?.(newThreshold);
        lastThresholdRef.current = newThreshold;
      }
    },
    [maxTurnsTracked, onThresholdChange],
  );

  /**
   * Reset learned patterns (e.g., for new session).
   */
  const reset = useCallback(() => {
    pauseDurationsRef.current = [];
    turnDurationsRef.current = [];
    turnStartTimeRef.current = null;
    lastThresholdRef.current = initialSilenceThresholdMs;

    setStats({
      avgPauseMs: 500,
      avgTurnDurationMs: 3000,
      silenceThresholdMs: initialSilenceThresholdMs,
      turnCount: 0,
    });
  }, [initialSilenceThresholdMs]);

  return {
    stats,
    onSpeechStart,
    onSpeechEnd,
    onPauseDetected,
    reset,
    silenceThresholdMs: stats.silenceThresholdMs,
  };
}
```

### 5. Integration into Voice Pipeline

**Location:** Update `services/api-gateway/app/services/voice_pipeline_service.py`

Add these integrations:

```python
class VoicePipelineService:
    """Updated with Phase 2 & 3 components."""

    def __init__(self, ...):
        # ... existing init ...

        # Phase 2: Smart acknowledgments
        self._smart_ack_service = SmartAcknowledgmentService(
            phrase_cache=phrase_cache_service,
        )

        # Phase 3: Natural conversational flow
        self._turn_manager = TurnTakingManager(
            on_turn_change=self._handle_turn_change,
        )
        self._prosody_controller = ProsodyController()
        self._filler_service = ConversationalFillerService()

    async def _handle_turn_change(self, event: TurnEvent) -> None:
        """Handle turn-taking state changes."""
        await self._on_message(
            PipelineMessage(
                type="voice.turn",
                data={
                    "state": event.new_state.value,
                    "previous_state": event.previous_state.value,
                    "signal": event.signal.value if event.signal else None,
                    "confidence": event.confidence,
                },
            )
        )

    async def _maybe_play_filler(
        self,
        processing_start_time: float,
        has_tool_call: bool,
        tool_name: Optional[str] = None,
    ) -> None:
        """Play a conversational filler if appropriate."""
        processing_ms = int((time.monotonic() - processing_start_time) * 1000)

        if self._filler_service.should_play_filler(
            processing_duration_ms=processing_ms,
            has_tool_call=has_tool_call,
        ):
            filler = self._filler_service.get_filler_for_context(
                is_tool_call=has_tool_call,
                tool_name=tool_name,
                language=self._config.language,
            )

            if filler:
                # Synthesize and send filler audio
                audio_data = await self._phrase_cache.synthesize_and_cache(
                    text=filler.text,
                    voice_id=self._config.voice_id,
                    language=self._config.language,
                )

                await self._on_message(
                    PipelineMessage(
                        type="voice.filler",
                        data={
                            "text": filler.text,
                            "type": filler.filler_type.value,
                            "can_interrupt": filler.can_interrupt,
                            "audio": base64.b64encode(audio_data).decode(),
                        },
                    )
                )

    async def _synthesize_with_prosody(
        self,
        text: str,
    ) -> AsyncIterator[bytes]:
        """Synthesize text with prosody control."""
        # Analyze prosody
        annotated = self._prosody_controller.analyze(text)
        params = self._prosody_controller.to_elevenlabs_params(annotated)

        # Synthesize with adjusted parameters
        async for chunk in self._elevenlabs.synthesize_stream(
            text=text,
            voice_id=self._config.voice_id,
            stability=params["stability"],
            similarity_boost=params["similarity_boost"],
            style=params["style"],
        ):
            yield chunk
```

---

## API Endpoints

### Phase 2 Endpoints

```
POST /api/voice/smart-acknowledgment
  Request: { transcript, duration_ms, during_ai_speech, voice_id, language }
  Response: { phrase, intent, confidence, audio (base64) }

GET /api/voice/phrase-audio
  Query: phrase, voice_id, language
  Response: audio/mpeg

POST /api/voice/warm-phrase-cache
  Request: { voice_id, languages }
  Response: { cached_count, total_count }
```

### Phase 3 Endpoints

```
POST /api/voice/analyze-prosody
  Request: { text, context }
  Response: { tone, rate, emphasis_points }

GET /api/voice/timing-stats
  Response: { avg_pause_ms, avg_turn_ms, threshold_ms }
```

---

## Configuration

### voiceSettingsStore.ts additions

```typescript
// Phase 2: Smart Acknowledgments
smartAcknowledgmentsEnabled: boolean; // Default: true
acknowledgmentVolume: number; // 0-100, default: 70

// Phase 3: Natural Flow
conversationalFillersEnabled: boolean; // Default: true
fillerVolume: number; // 0-100, default: 50
adaptiveTimingEnabled: boolean; // Default: true
prosodyEnhancementEnabled: boolean; // Default: true
```

---

## Testing Plan

### Phase 2 Tests

1. **Intent Classification Accuracy**
   - Test with 100+ sample transcripts
   - Target: >80% intent accuracy

2. **Phrase Cache Performance**
   - Measure cache hit rate
   - Target: >95% hit rate after warm-up

3. **End-to-End Latency**
   - From barge-in detection to acknowledgment playback
   - Target: <150ms

### Phase 3 Tests

1. **Turn-Taking Accuracy**
   - Measure false end-of-turn detections
   - Target: <10% false positives

2. **Filler Timing**
   - Ensure fillers don't overlap with responses
   - Measure user perception of naturalness

3. **Prosody Quality**
   - A/B test with/without prosody enhancement
   - User preference surveys

---

## Rollout Plan

### Phase 2: Smart Acknowledgments

1. **Week 1**: Implement backend services
2. **Week 2**: Integrate with voice pipeline
3. **Week 3**: Frontend integration
4. **Week 4**: Testing and tuning

### Phase 3: Natural Conversational Flow

1. **Week 1**: Turn-taking manager
2. **Week 2**: Prosody controller
3. **Week 3**: Filler service
4. **Week 4**: Frontend adaptive timing
5. **Week 5**: Integration testing

---

## Related Documentation

- [Voice Configuration](/docs/voice/voice-configuration)
- [Talker Service](/docs/services/talker-service)
- [Thinker-Talker Pipeline](/docs/THINKER_TALKER_PIPELINE)
- [Barge-In Classifier](/docs/voice/barge-in-classifier)

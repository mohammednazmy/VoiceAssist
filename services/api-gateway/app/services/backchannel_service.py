"""
Backchannel Service - Natural Verbal Acknowledgments

Provides natural verbal cues during user speech to show active listening.
Examples: "uh-huh", "mm-hmm", "I see", "right", "got it"

Features:
- Pre-cached backchannel audio clips per voice
- Intelligent timing based on speech patterns
- Multi-language support
- Integration with ElevenLabs TTS

Phase: Voice Mode Backchanneling Enhancement
"""

import asyncio
import base64
import hashlib
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Awaitable, Callable, Dict, List, Optional, Set

from app.core.config import settings
from app.core.logging import get_logger
from app.services.elevenlabs_service import ElevenLabsService

logger = get_logger(__name__)


# ==============================================================================
# Data Classes and Enums
# ==============================================================================


class BackchannelType(str, Enum):
    """Types of backchannels based on conversational function."""

    ACKNOWLEDGMENT = "acknowledgment"  # "uh-huh", "mm-hmm"
    UNDERSTANDING = "understanding"  # "I see", "right", "got it"
    ENCOURAGEMENT = "encouragement"  # "go on", "yes"
    SURPRISE = "surprise"  # "oh", "wow", "really"
    EMPATHY = "empathy"  # "hmm", "I understand"


@dataclass
class BackchannelPhrase:
    """A backchannel phrase with metadata."""

    text: str
    type: BackchannelType
    language: str = "en"
    weight: float = 1.0  # Probability weight for selection
    min_gap_seconds: float = 5.0  # Minimum gap before this can be used again


# Language-specific backchannel phrases
BACKCHANNEL_PHRASES: Dict[str, List[BackchannelPhrase]] = {
    "en": [
        # Acknowledgments (most common)
        BackchannelPhrase("uh-huh", BackchannelType.ACKNOWLEDGMENT, weight=2.0),
        BackchannelPhrase("mm-hmm", BackchannelType.ACKNOWLEDGMENT, weight=2.0),
        BackchannelPhrase("mhm", BackchannelType.ACKNOWLEDGMENT, weight=1.5),
        # Understanding
        BackchannelPhrase("I see", BackchannelType.UNDERSTANDING, weight=1.5),
        BackchannelPhrase("right", BackchannelType.UNDERSTANDING, weight=1.5),
        BackchannelPhrase("got it", BackchannelType.UNDERSTANDING, weight=1.0),
        BackchannelPhrase("okay", BackchannelType.UNDERSTANDING, weight=1.0),
        # Encouragement
        BackchannelPhrase("yes", BackchannelType.ENCOURAGEMENT, weight=1.0),
        BackchannelPhrase("go on", BackchannelType.ENCOURAGEMENT, weight=0.5),
        # Empathy
        BackchannelPhrase("hmm", BackchannelType.EMPATHY, weight=1.0),
    ],
    "ar": [
        # Arabic acknowledgments
        BackchannelPhrase("اها", BackchannelType.ACKNOWLEDGMENT, "ar", weight=2.0),
        BackchannelPhrase("نعم", BackchannelType.UNDERSTANDING, "ar", weight=1.5),
        BackchannelPhrase("صح", BackchannelType.UNDERSTANDING, "ar", weight=1.0),
        BackchannelPhrase("طيب", BackchannelType.UNDERSTANDING, "ar", weight=1.0),
        BackchannelPhrase("تمام", BackchannelType.UNDERSTANDING, "ar", weight=1.0),
    ],
    "es": [
        BackchannelPhrase("ajá", BackchannelType.ACKNOWLEDGMENT, "es", weight=2.0),
        BackchannelPhrase("mm-hmm", BackchannelType.ACKNOWLEDGMENT, "es", weight=1.5),
        BackchannelPhrase("ya", BackchannelType.UNDERSTANDING, "es", weight=1.5),
        BackchannelPhrase("entiendo", BackchannelType.UNDERSTANDING, "es", weight=1.0),
        BackchannelPhrase("claro", BackchannelType.UNDERSTANDING, "es", weight=1.0),
    ],
    "fr": [
        BackchannelPhrase("mm-hmm", BackchannelType.ACKNOWLEDGMENT, "fr", weight=2.0),
        BackchannelPhrase("oui", BackchannelType.UNDERSTANDING, "fr", weight=1.5),
        BackchannelPhrase("d'accord", BackchannelType.UNDERSTANDING, "fr", weight=1.0),
        BackchannelPhrase("je vois", BackchannelType.UNDERSTANDING, "fr", weight=1.0),
    ],
}


@dataclass
class BackchannelTrigger:
    """Result of backchannel timing analysis."""

    should_trigger: bool
    phrase: Optional[BackchannelPhrase] = None
    reason: str = ""
    confidence: float = 0.0


@dataclass
class BackchannelAudio:
    """Cached backchannel audio data."""

    phrase: str
    voice_id: str
    audio_data: bytes
    format: str = "pcm_24000"
    duration_ms: int = 0
    cached_at: float = field(default_factory=time.time)


@dataclass
class BackchannelState:
    """State tracking for backchannel timing in a session."""

    last_backchannel_time: float = 0.0
    last_phrase_used: Optional[str] = None
    recent_phrases: List[str] = field(default_factory=list)
    speech_start_time: float = 0.0
    continuous_speech_ms: int = 0
    pause_count: int = 0
    total_backchannels: int = 0


# ==============================================================================
# Backchannel Timing Logic
# ==============================================================================


class BackchannelTimingEngine:
    """
    Determines when to trigger backchannels based on speech patterns.

    Timing rules:
    - Minimum 5 seconds between backchannels
    - Only during natural pauses (150-300ms silence)
    - After sustained speech (2-3 seconds minimum)
    - Never interrupt mid-sentence
    - Vary phrase selection to avoid repetition
    """

    # Timing constants
    MIN_GAP_BETWEEN_BACKCHANNELS_MS = 5000  # 5 seconds
    MIN_SPEECH_BEFORE_BACKCHANNEL_MS = 2000  # 2 seconds
    OPTIMAL_PAUSE_MIN_MS = 150  # Short pause start
    OPTIMAL_PAUSE_MAX_MS = 400  # Short pause end (before it becomes long pause)
    MAX_PHRASE_REPEAT_COUNT = 3  # Max times to use same phrase before cycling

    def __init__(self, language: str = "en"):
        self.language = language
        self._phrases = BACKCHANNEL_PHRASES.get(language, BACKCHANNEL_PHRASES["en"])
        self._phrase_weights = [p.weight for p in self._phrases]

    def should_trigger(
        self,
        state: BackchannelState,
        current_time: float,
        pause_duration_ms: int,
        is_speaking: bool,
    ) -> BackchannelTrigger:
        """
        Determine if a backchannel should be triggered.

        Args:
            state: Current session backchannel state
            current_time: Current timestamp
            pause_duration_ms: Duration of current pause in speech
            is_speaking: Whether user is currently speaking

        Returns:
            BackchannelTrigger with decision and selected phrase
        """
        # Rule 1: Minimum gap between backchannels
        time_since_last = (current_time - state.last_backchannel_time) * 1000
        if time_since_last < self.MIN_GAP_BETWEEN_BACKCHANNELS_MS:
            return BackchannelTrigger(
                should_trigger=False,
                reason=f"Too soon (last: {time_since_last:.0f}ms ago)",
            )

        # Rule 2: Need minimum speech before backchannel
        if state.continuous_speech_ms < self.MIN_SPEECH_BEFORE_BACKCHANNEL_MS:
            return BackchannelTrigger(
                should_trigger=False,
                reason=f"Not enough speech ({state.continuous_speech_ms}ms)",
            )

        # Rule 3: Only trigger during optimal pause window
        if is_speaking:
            return BackchannelTrigger(
                should_trigger=False,
                reason="User still speaking",
            )

        if pause_duration_ms < self.OPTIMAL_PAUSE_MIN_MS:
            return BackchannelTrigger(
                should_trigger=False,
                reason=f"Pause too short ({pause_duration_ms}ms)",
            )

        if pause_duration_ms > self.OPTIMAL_PAUSE_MAX_MS:
            # Pause is too long - might be end of thought, don't backchannel
            return BackchannelTrigger(
                should_trigger=False,
                reason=f"Pause too long ({pause_duration_ms}ms) - likely end of thought",
            )

        # All conditions met - select phrase
        phrase = self._select_phrase(state)

        return BackchannelTrigger(
            should_trigger=True,
            phrase=phrase,
            reason="Optimal timing",
            confidence=0.8,
        )

    def _select_phrase(self, state: BackchannelState) -> BackchannelPhrase:
        """Select a backchannel phrase, avoiding recent repetition."""
        available_phrases = [
            p for p in self._phrases if p.text not in state.recent_phrases[-self.MAX_PHRASE_REPEAT_COUNT :]
        ]

        if not available_phrases:
            # All phrases used recently, reset and use any
            available_phrases = self._phrases

        # Weighted random selection
        weights = [p.weight for p in available_phrases]
        total_weight = sum(weights)
        r = random.random() * total_weight

        cumulative = 0
        for phrase, weight in zip(available_phrases, weights):
            cumulative += weight
            if r <= cumulative:
                return phrase

        # Fallback
        return available_phrases[0]


# ==============================================================================
# Backchannel Audio Cache
# ==============================================================================


class BackchannelAudioCache:
    """
    Manages pre-generated backchannel audio clips.

    Caches audio per voice_id to avoid repeated TTS calls.
    """

    def __init__(self, cache_dir: Optional[Path] = None):
        self._cache: Dict[str, BackchannelAudio] = {}
        self._cache_dir = cache_dir or Path("/tmp/voiceassist_backchannel_cache")
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._generating: Set[str] = set()  # Track in-progress generations

    def _cache_key(self, phrase: str, voice_id: str) -> str:
        """Generate cache key for phrase/voice combination."""
        return hashlib.md5(f"{phrase}:{voice_id}".encode()).hexdigest()

    def get(self, phrase: str, voice_id: str) -> Optional[BackchannelAudio]:
        """Get cached audio for phrase/voice."""
        key = self._cache_key(phrase, voice_id)
        return self._cache.get(key)

    def put(self, audio: BackchannelAudio) -> None:
        """Store audio in cache."""
        key = self._cache_key(audio.phrase, audio.voice_id)
        self._cache[key] = audio

    def is_generating(self, phrase: str, voice_id: str) -> bool:
        """Check if audio is currently being generated."""
        key = self._cache_key(phrase, voice_id)
        return key in self._generating

    def mark_generating(self, phrase: str, voice_id: str) -> None:
        """Mark phrase as being generated."""
        key = self._cache_key(phrase, voice_id)
        self._generating.add(key)

    def unmark_generating(self, phrase: str, voice_id: str) -> None:
        """Remove generating mark."""
        key = self._cache_key(phrase, voice_id)
        self._generating.discard(key)

    def get_cache_stats(self) -> Dict:
        """Get cache statistics."""
        return {
            "cached_phrases": len(self._cache),
            "generating": len(self._generating),
        }


# ==============================================================================
# Backchannel Session
# ==============================================================================


class BackchannelSession:
    """
    Manages backchanneling for a voice session.

    Tracks speech patterns and determines when to emit backchannels.
    """

    def __init__(
        self,
        session_id: str,
        voice_id: str,
        language: str = "en",
        elevenlabs_service: Optional[ElevenLabsService] = None,
        audio_cache: Optional[BackchannelAudioCache] = None,
        on_backchannel: Optional[Callable[[BackchannelAudio], Awaitable[None]]] = None,
    ):
        self.session_id = session_id
        self.voice_id = voice_id
        self.language = language
        self._elevenlabs = elevenlabs_service
        self._cache = audio_cache or BackchannelAudioCache()
        self._on_backchannel = on_backchannel

        # Timing engine
        self._timing = BackchannelTimingEngine(language)

        # State
        self._state = BackchannelState()
        self._active = False
        self._speech_active = False
        self._pause_start_time: Optional[float] = None

    async def start(self) -> None:
        """Start the backchannel session."""
        self._active = True
        self._state = BackchannelState()
        logger.info(f"Backchannel session started: {self.session_id}")

        # Pre-warm cache with common phrases
        asyncio.create_task(self._prewarm_cache())

    async def stop(self) -> None:
        """Stop the session."""
        self._active = False
        logger.info(
            f"Backchannel session stopped: {self.session_id}, " f"total backchannels: {self._state.total_backchannels}"
        )

    async def _prewarm_cache(self) -> None:
        """Pre-generate common backchannel audio clips."""
        phrases = BACKCHANNEL_PHRASES.get(self.language, BACKCHANNEL_PHRASES["en"])

        # Prioritize high-weight phrases
        sorted_phrases = sorted(phrases, key=lambda p: p.weight, reverse=True)

        for phrase in sorted_phrases[:5]:  # Pre-warm top 5
            if not self._cache.get(phrase.text, self.voice_id):
                await self._generate_audio(phrase.text)

    async def on_speech_start(self) -> None:
        """Called when user starts speaking."""
        if not self._active:
            return

        self._speech_active = True
        self._state.speech_start_time = time.time()
        self._pause_start_time = None

    async def on_speech_continue(self, duration_ms: int) -> None:
        """Called periodically while user is speaking."""
        if not self._active or not self._speech_active:
            return

        self._state.continuous_speech_ms = duration_ms

    async def on_pause_detected(self, pause_duration_ms: int) -> None:
        """
        Called when a pause is detected in user speech.

        This is the main trigger point for backchannels.
        """
        if not self._active:
            return

        if self._pause_start_time is None:
            self._pause_start_time = time.time()

        current_time = time.time()

        # Check if we should backchannel
        trigger = self._timing.should_trigger(
            state=self._state,
            current_time=current_time,
            pause_duration_ms=pause_duration_ms,
            is_speaking=False,
        )

        if trigger.should_trigger and trigger.phrase:
            await self._emit_backchannel(trigger.phrase)

    async def on_speech_end(self) -> None:
        """Called when user finishes speaking (end of utterance)."""
        self._speech_active = False
        self._state.continuous_speech_ms = 0
        self._pause_start_time = None

    async def _emit_backchannel(self, phrase: BackchannelPhrase) -> None:
        """Emit a backchannel audio clip."""
        # Get or generate audio
        audio = self._cache.get(phrase.text, self.voice_id)

        if not audio:
            audio = await self._generate_audio(phrase.text)

        if not audio:
            logger.warning(f"Failed to get backchannel audio for: {phrase.text}")
            return

        # Update state
        self._state.last_backchannel_time = time.time()
        self._state.last_phrase_used = phrase.text
        self._state.recent_phrases.append(phrase.text)
        self._state.total_backchannels += 1

        # Keep recent phrases list bounded
        if len(self._state.recent_phrases) > 10:
            self._state.recent_phrases = self._state.recent_phrases[-10:]

        logger.info(f"Emitting backchannel: '{phrase.text}' (total: {self._state.total_backchannels})")

        # Emit to callback
        if self._on_backchannel:
            await self._on_backchannel(audio)

    async def _generate_audio(self, phrase: str) -> Optional[BackchannelAudio]:
        """Generate backchannel audio using TTS."""
        if not self._elevenlabs:
            logger.warning("No ElevenLabs service available for backchannel TTS")
            return None

        # Check if already generating
        if self._cache.is_generating(phrase, self.voice_id):
            # Wait for it to complete
            for _ in range(20):  # 2 second timeout
                await asyncio.sleep(0.1)
                cached = self._cache.get(phrase, self.voice_id)
                if cached:
                    return cached
            return None

        try:
            self._cache.mark_generating(phrase, self.voice_id)

            # Generate with ElevenLabs
            # Use specific settings for natural backchannel sound
            result = await self._elevenlabs.synthesize(
                text=phrase,
                voice_id=self.voice_id,
                stability=0.7,  # Natural but consistent
                similarity_boost=0.8,
                style=0.3,  # Slightly expressive
                output_format="pcm_24000",
            )

            if not result or not result.audio_data:
                return None

            audio_data = result.audio_data

            # Calculate duration (PCM 24kHz, 16-bit mono)
            duration_ms = int(len(audio_data) / 2 / 24000 * 1000)

            audio = BackchannelAudio(
                phrase=phrase,
                voice_id=self.voice_id,
                audio_data=audio_data,
                format="pcm_24000",
                duration_ms=duration_ms,
            )

            self._cache.put(audio)
            return audio

        except Exception as e:
            logger.error(f"Failed to generate backchannel audio: {e}")
            return None

        finally:
            self._cache.unmark_generating(phrase, self.voice_id)


# ==============================================================================
# Backchannel Service
# ==============================================================================


class BackchannelService:
    """
    Factory service for creating backchannel sessions.

    Manages shared audio cache and ElevenLabs integration.
    """

    def __init__(self):
        self._cache = BackchannelAudioCache()
        self._sessions: Dict[str, BackchannelSession] = {}
        self._elevenlabs: Optional[ElevenLabsService] = None
        self._enabled = bool(settings.ELEVENLABS_API_KEY)

        if self._enabled:
            self._elevenlabs = ElevenLabsService()
            logger.info("Backchannel service initialized")
        else:
            logger.info("Backchannel service disabled (no ELEVENLABS_API_KEY)")

    def is_enabled(self) -> bool:
        """Check if backchanneling is available."""
        return self._enabled

    async def create_session(
        self,
        session_id: str,
        voice_id: str,
        language: str = "en",
        on_backchannel: Optional[Callable[[BackchannelAudio], Awaitable[None]]] = None,
    ) -> Optional[BackchannelSession]:
        """
        Create a new backchannel session.

        Args:
            session_id: Unique session identifier
            voice_id: ElevenLabs voice ID for TTS
            language: Language code (en, ar, es, fr)
            on_backchannel: Callback for backchannel triggers

        Returns:
            BackchannelSession or None if disabled
        """
        if not self._enabled:
            logger.debug("Backchanneling disabled")
            return None

        session = BackchannelSession(
            session_id=session_id,
            voice_id=voice_id,
            language=language,
            elevenlabs_service=self._elevenlabs,
            audio_cache=self._cache,
            on_backchannel=on_backchannel,
        )

        self._sessions[session_id] = session
        await session.start()

        return session

    async def remove_session(self, session_id: str) -> None:
        """Remove and cleanup a backchannel session."""
        session = self._sessions.pop(session_id, None)
        if session:
            await session.stop()

    def get_session(self, session_id: str) -> Optional[BackchannelSession]:
        """Get an active session by ID."""
        return self._sessions.get(session_id)

    def get_available_phrases(self, language: str = "en") -> List[Dict]:
        """Get available backchannel phrases for a language."""
        phrases = BACKCHANNEL_PHRASES.get(language, BACKCHANNEL_PHRASES["en"])
        return [
            {
                "text": p.text,
                "type": p.type.value,
                "language": p.language,
            }
            for p in phrases
        ]

    def get_cache_stats(self) -> Dict:
        """Get cache statistics."""
        return self._cache.get_cache_stats()


# Global service instance
backchannel_service = BackchannelService()

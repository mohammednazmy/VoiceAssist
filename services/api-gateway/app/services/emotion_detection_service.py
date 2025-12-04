"""
Emotion Detection Service - Hume AI Integration

Provides real-time emotion detection from audio for voice mode.
Uses Hume AI's Expression Measurement API to analyze:
- Valence (positive/negative emotional state)
- Arousal (energy/activation level)
- Discrete emotions (joy, sadness, frustration, etc.)

Features:
- Async audio chunk analysis (parallel to STT)
- Emotion state caching for trending
- Response style mapping for TTS adaptation

Phase: Voice Mode Emotional Intelligence Enhancement
"""

import asyncio
import base64
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Awaitable, Callable, Dict, List, Optional

import httpx
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Data Classes and Enums
# ==============================================================================


class EmotionCategory(str, Enum):
    """Discrete emotion categories detected from voice."""

    NEUTRAL = "neutral"
    JOY = "joy"
    SADNESS = "sadness"
    ANGER = "anger"
    FEAR = "fear"
    SURPRISE = "surprise"
    DISGUST = "disgust"
    CONTEMPT = "contempt"
    FRUSTRATION = "frustration"
    ANXIETY = "anxiety"
    CONFUSION = "confusion"
    EXCITEMENT = "excitement"
    INTEREST = "interest"
    BOREDOM = "boredom"


@dataclass
class EmotionResult:
    """Result of emotion analysis on an audio chunk."""

    # Primary emotion detected
    primary_emotion: EmotionCategory
    primary_confidence: float  # 0-1

    # Dimensional measures
    valence: float  # -1 to 1 (negative to positive)
    arousal: float  # 0 to 1 (calm to excited)

    # All detected emotions with confidence scores
    emotions: Dict[str, float] = field(default_factory=dict)

    # Metadata
    timestamp: float = field(default_factory=time.time)
    audio_duration_ms: int = 0

    def to_dict(self) -> Dict:
        """Convert to dictionary for WebSocket messages."""
        return {
            "primary_emotion": self.primary_emotion.value,
            "primary_confidence": round(self.primary_confidence, 3),
            "valence": round(self.valence, 3),
            "arousal": round(self.arousal, 3),
            "emotions": {k: round(v, 3) for k, v in self.emotions.items()},
            "timestamp": self.timestamp,
        }


@dataclass
class EmotionTrend:
    """Trend analysis of emotions over a time window."""

    # Average values over window
    avg_valence: float
    avg_arousal: float

    # Dominant emotion in window
    dominant_emotion: EmotionCategory
    dominant_confidence: float

    # Trend direction
    valence_trend: str  # "increasing", "decreasing", "stable"
    arousal_trend: str

    # Window metadata
    sample_count: int
    window_duration_ms: int

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "avg_valence": round(self.avg_valence, 3),
            "avg_arousal": round(self.avg_arousal, 3),
            "dominant_emotion": self.dominant_emotion.value,
            "dominant_confidence": round(self.dominant_confidence, 3),
            "valence_trend": self.valence_trend,
            "arousal_trend": self.arousal_trend,
            "sample_count": self.sample_count,
        }


# ==============================================================================
# Response Style Mapping
# ==============================================================================


@dataclass
class ResponseStyleAdjustment:
    """Adjustments to response style based on detected emotion."""

    # TTS parameters
    stability_modifier: float  # Add to base stability (-0.2 to 0.2)
    speech_rate_modifier: float  # Multiply base rate (0.8 to 1.2)
    style_modifier: float  # Add to base style (-0.2 to 0.2)

    # LLM response guidance
    tone_instruction: str  # Instruction to add to system prompt
    response_length_hint: str  # "brief", "normal", "detailed"

    # Priority flags
    prioritize_empathy: bool = False
    prioritize_clarity: bool = False
    prioritize_urgency: bool = False


# Emotion to response style mapping
EMOTION_STYLE_MAP: Dict[EmotionCategory, ResponseStyleAdjustment] = {
    EmotionCategory.NEUTRAL: ResponseStyleAdjustment(
        stability_modifier=0.0,
        speech_rate_modifier=1.0,
        style_modifier=0.0,
        tone_instruction="Respond in a calm, professional manner.",
        response_length_hint="normal",
    ),
    EmotionCategory.FRUSTRATION: ResponseStyleAdjustment(
        stability_modifier=0.1,  # More stable = calming
        speech_rate_modifier=0.9,  # Slower = more patient
        style_modifier=-0.1,  # Less expressive = calming
        tone_instruction="The user seems frustrated. Respond with patience, acknowledge their concern, and provide clear, helpful guidance.",
        response_length_hint="brief",
        prioritize_empathy=True,
    ),
    EmotionCategory.ANXIETY: ResponseStyleAdjustment(
        stability_modifier=0.15,
        speech_rate_modifier=0.85,
        style_modifier=-0.05,
        tone_instruction="The user seems anxious. Respond calmly and reassuringly, breaking down information into simple steps.",
        response_length_hint="brief",
        prioritize_empathy=True,
        prioritize_clarity=True,
    ),
    EmotionCategory.CONFUSION: ResponseStyleAdjustment(
        stability_modifier=0.05,
        speech_rate_modifier=0.9,
        style_modifier=0.0,
        tone_instruction="The user seems confused. Provide clear, structured explanations and offer to clarify.",
        response_length_hint="detailed",
        prioritize_clarity=True,
    ),
    EmotionCategory.EXCITEMENT: ResponseStyleAdjustment(
        stability_modifier=-0.1,  # More dynamic
        speech_rate_modifier=1.1,  # Slightly faster
        style_modifier=0.1,  # More expressive
        tone_instruction="The user seems excited. Match their energy while staying helpful and professional.",
        response_length_hint="normal",
    ),
    EmotionCategory.SADNESS: ResponseStyleAdjustment(
        stability_modifier=0.1,
        speech_rate_modifier=0.85,
        style_modifier=-0.1,
        tone_instruction="The user seems sad. Respond with warmth and empathy, acknowledging their feelings.",
        response_length_hint="brief",
        prioritize_empathy=True,
    ),
    EmotionCategory.ANGER: ResponseStyleAdjustment(
        stability_modifier=0.15,
        speech_rate_modifier=0.85,
        style_modifier=-0.15,
        tone_instruction="The user seems upset. Respond calmly without being defensive, acknowledge their concern, and focus on solutions.",
        response_length_hint="brief",
        prioritize_empathy=True,
    ),
    EmotionCategory.FEAR: ResponseStyleAdjustment(
        stability_modifier=0.15,
        speech_rate_modifier=0.8,
        style_modifier=-0.1,
        tone_instruction="The user seems worried or fearful. Respond with reassurance, provide accurate information, and offer support.",
        response_length_hint="detailed",
        prioritize_empathy=True,
        prioritize_clarity=True,
    ),
    EmotionCategory.JOY: ResponseStyleAdjustment(
        stability_modifier=-0.05,
        speech_rate_modifier=1.05,
        style_modifier=0.1,
        tone_instruction="The user seems happy. Respond warmly and share in their positive energy.",
        response_length_hint="normal",
    ),
    EmotionCategory.INTEREST: ResponseStyleAdjustment(
        stability_modifier=0.0,
        speech_rate_modifier=1.0,
        style_modifier=0.05,
        tone_instruction="The user seems engaged and interested. Provide thorough, informative responses.",
        response_length_hint="detailed",
    ),
    EmotionCategory.BOREDOM: ResponseStyleAdjustment(
        stability_modifier=-0.05,
        speech_rate_modifier=1.1,
        style_modifier=0.1,
        tone_instruction="The user may be losing interest. Keep responses concise and engaging.",
        response_length_hint="brief",
    ),
    EmotionCategory.SURPRISE: ResponseStyleAdjustment(
        stability_modifier=0.0,
        speech_rate_modifier=1.0,
        style_modifier=0.0,
        tone_instruction="Respond naturally to the user's surprise.",
        response_length_hint="normal",
    ),
    EmotionCategory.DISGUST: ResponseStyleAdjustment(
        stability_modifier=0.1,
        speech_rate_modifier=0.95,
        style_modifier=-0.05,
        tone_instruction="Acknowledge the user's reaction and respond professionally.",
        response_length_hint="brief",
    ),
    EmotionCategory.CONTEMPT: ResponseStyleAdjustment(
        stability_modifier=0.1,
        speech_rate_modifier=0.9,
        style_modifier=-0.1,
        tone_instruction="Respond professionally and focus on being helpful, regardless of the user's tone.",
        response_length_hint="brief",
    ),
}


# ==============================================================================
# Hume AI Session
# ==============================================================================


class EmotionDetectionSession:
    """
    A session for continuous emotion detection during voice interaction.

    Manages:
    - Async audio chunk analysis
    - Emotion state history
    - Trend calculation
    """

    # Window size for trend analysis
    TREND_WINDOW_SIZE = 10
    TREND_TIME_WINDOW_MS = 30000  # 30 seconds

    def __init__(
        self,
        session_id: str,
        api_key: str,
        secret_key: Optional[str] = None,
        on_emotion: Optional[Callable[[EmotionResult], Awaitable[None]]] = None,
    ):
        self.session_id = session_id
        self._api_key = api_key
        self._secret_key = secret_key
        self._on_emotion = on_emotion

        # Build authorization header
        # Hume AI supports both API key only and API key + secret key auth
        auth_headers = {
            "X-Hume-Api-Key": api_key,
            "Content-Type": "application/json",
        }
        if secret_key:
            # When using secret key, use Bearer token format
            auth_headers["Authorization"] = f"Bearer {api_key}"

        # HTTP client for Hume API
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(5.0, connect=2.0),
            headers=auth_headers,
        )

        # Emotion history for trending
        self._emotion_history: deque[EmotionResult] = deque(maxlen=self.TREND_WINDOW_SIZE)

        # Current emotion state
        self._current_emotion: Optional[EmotionResult] = None

        # Analysis queue for batching
        self._audio_buffer: bytes = b""
        self._buffer_start_time: float = 0
        self._min_buffer_ms = 500  # Analyze every 500ms of audio

        # State
        self._active = False

    @property
    def current_emotion(self) -> Optional[EmotionResult]:
        """Get the most recent emotion result."""
        return self._current_emotion

    async def start(self) -> None:
        """Start the emotion detection session."""
        self._active = True
        self._buffer_start_time = time.time()
        logger.info(f"Emotion detection session started: {self.session_id}")

    async def stop(self) -> None:
        """Stop the session and cleanup."""
        self._active = False

        # Process any remaining audio
        if self._audio_buffer:
            await self._analyze_buffer()

        await self._client.aclose()
        logger.info(f"Emotion detection session stopped: {self.session_id}")

    async def add_audio(self, audio_chunk: bytes, sample_rate: int = 16000) -> None:
        """
        Add audio chunk for emotion analysis.

        Buffers audio and triggers analysis every min_buffer_ms.
        """
        if not self._active:
            return

        self._audio_buffer += audio_chunk

        # Calculate buffer duration
        # PCM16 = 2 bytes per sample
        samples = len(self._audio_buffer) // 2
        duration_ms = (samples / sample_rate) * 1000

        if duration_ms >= self._min_buffer_ms:
            # Trigger async analysis without blocking
            asyncio.create_task(self._analyze_buffer())

    async def _analyze_buffer(self) -> None:
        """Analyze buffered audio and emit emotion result."""
        if not self._audio_buffer:
            return

        audio_data = self._audio_buffer
        buffer_duration_ms = int((len(audio_data) / 2 / 16000) * 1000)
        self._audio_buffer = b""
        self._buffer_start_time = time.time()

        try:
            # Encode audio as base64 for Hume API
            audio_b64 = base64.b64encode(audio_data).decode()

            # Call Hume AI Expression Measurement API
            result = await self._call_hume_api(audio_b64, buffer_duration_ms)

            if result:
                self._current_emotion = result
                self._emotion_history.append(result)

                # Emit to callback
                if self._on_emotion:
                    await self._on_emotion(result)

        except Exception as e:
            logger.warning(f"Emotion analysis failed: {e}")

    async def _call_hume_api(
        self,
        audio_b64: str,
        duration_ms: int,
    ) -> Optional[EmotionResult]:
        """
        Call Hume AI Expression Measurement API.

        Uses the streaming prosody model for real-time analysis.
        """
        try:
            # Hume AI Expression Measurement API endpoint
            url = "https://api.hume.ai/v0/batch/jobs"

            # Build request payload
            payload = {
                "models": {"prosody": {}},  # Analyze voice prosody for emotions
                "urls": [],  # We're sending raw audio
                "text": [],
                "files": [
                    {
                        "data": audio_b64,
                        "filename": "audio.wav",
                        "content_type": "audio/wav",
                    }
                ],
            }

            # For real-time analysis, use the streaming endpoint
            # Fall back to batch if streaming not available
            stream_url = "https://api.hume.ai/v0/stream/models"

            stream_payload = {
                "data": audio_b64,
                "models": {"prosody": {}},
                "raw_text": False,
            }

            response = await self._client.post(
                stream_url,
                json=stream_payload,
            )

            if response.status_code == 200:
                data = response.json()
                return self._parse_hume_response(data, duration_ms)

            elif response.status_code == 401:
                logger.error("Hume AI authentication failed - check API key")
                return None

            else:
                logger.warning(f"Hume API returned {response.status_code}: {response.text[:200]}")
                return None

        except httpx.TimeoutException:
            logger.warning("Hume API timeout - skipping emotion analysis")
            return None

        except Exception as e:
            logger.error(f"Hume API call failed: {e}")
            return None

    def _parse_hume_response(
        self,
        data: Dict,
        duration_ms: int,
    ) -> Optional[EmotionResult]:
        """Parse Hume AI response into EmotionResult."""
        try:
            # Hume prosody response structure
            predictions = data.get("prosody", {}).get("predictions", [])

            if not predictions:
                return EmotionResult(
                    primary_emotion=EmotionCategory.NEUTRAL,
                    primary_confidence=0.5,
                    valence=0.0,
                    arousal=0.5,
                    audio_duration_ms=duration_ms,
                )

            # Aggregate emotions from predictions
            emotion_scores: Dict[str, List[float]] = {}

            for pred in predictions:
                emotions = pred.get("emotions", [])
                for emotion in emotions:
                    name = emotion.get("name", "").lower()
                    score = emotion.get("score", 0.0)
                    if name not in emotion_scores:
                        emotion_scores[name] = []
                    emotion_scores[name].append(score)

            # Average scores
            avg_emotions = {name: sum(scores) / len(scores) for name, scores in emotion_scores.items() if scores}

            # Map Hume emotions to our categories
            emotion_mapping = {
                "joy": EmotionCategory.JOY,
                "sadness": EmotionCategory.SADNESS,
                "anger": EmotionCategory.ANGER,
                "fear": EmotionCategory.FEAR,
                "surprise": EmotionCategory.SURPRISE,
                "disgust": EmotionCategory.DISGUST,
                "contempt": EmotionCategory.CONTEMPT,
                "excitement": EmotionCategory.EXCITEMENT,
                "interest": EmotionCategory.INTEREST,
                "boredom": EmotionCategory.BOREDOM,
                "confusion": EmotionCategory.CONFUSION,
                "anxiety": EmotionCategory.ANXIETY,
                "frustration": EmotionCategory.FRUSTRATION,
                # Aliases
                "disappointment": EmotionCategory.FRUSTRATION,
                "annoyance": EmotionCategory.FRUSTRATION,
                "nervousness": EmotionCategory.ANXIETY,
                "worry": EmotionCategory.ANXIETY,
            }

            # Find primary emotion
            primary_emotion = EmotionCategory.NEUTRAL
            primary_confidence = 0.5

            for hume_name, score in sorted(avg_emotions.items(), key=lambda x: x[1], reverse=True):
                mapped = emotion_mapping.get(hume_name)
                if mapped and score > primary_confidence:
                    primary_emotion = mapped
                    primary_confidence = score
                    break

            # Calculate valence and arousal from emotion mix
            valence = self._calculate_valence(avg_emotions)
            arousal = self._calculate_arousal(avg_emotions)

            return EmotionResult(
                primary_emotion=primary_emotion,
                primary_confidence=primary_confidence,
                valence=valence,
                arousal=arousal,
                emotions=avg_emotions,
                audio_duration_ms=duration_ms,
            )

        except Exception as e:
            logger.error(f"Failed to parse Hume response: {e}")
            return None

    def _calculate_valence(self, emotions: Dict[str, float]) -> float:
        """
        Calculate valence (-1 to 1) from emotion mix.

        Positive emotions increase valence, negative decrease it.
        """
        positive_emotions = ["joy", "excitement", "interest", "amusement", "contentment"]
        negative_emotions = ["sadness", "anger", "fear", "disgust", "contempt", "frustration", "anxiety"]

        positive_sum = sum(emotions.get(e, 0) for e in positive_emotions)
        negative_sum = sum(emotions.get(e, 0) for e in negative_emotions)

        total = positive_sum + negative_sum
        if total == 0:
            return 0.0

        # Scale to -1 to 1
        valence = (positive_sum - negative_sum) / max(total, 1)
        return max(-1.0, min(1.0, valence))

    def _calculate_arousal(self, emotions: Dict[str, float]) -> float:
        """
        Calculate arousal (0 to 1) from emotion mix.

        High-energy emotions increase arousal, low-energy decrease it.
        """
        high_arousal = ["excitement", "anger", "fear", "surprise", "joy"]
        low_arousal = ["sadness", "boredom", "contentment", "tiredness"]

        high_sum = sum(emotions.get(e, 0) for e in high_arousal)
        low_sum = sum(emotions.get(e, 0) for e in low_arousal)

        total = high_sum + low_sum
        if total == 0:
            return 0.5

        # Scale to 0 to 1
        arousal = high_sum / max(total, 1)
        return max(0.0, min(1.0, arousal))

    def get_trend(self) -> Optional[EmotionTrend]:
        """Calculate emotion trend from history."""
        if len(self._emotion_history) < 2:
            return None

        history = list(self._emotion_history)

        # Calculate averages
        avg_valence = sum(e.valence for e in history) / len(history)
        avg_arousal = sum(e.arousal for e in history) / len(history)

        # Calculate trends
        if len(history) >= 3:
            recent = history[-3:]
            older = history[:-3] if len(history) > 3 else history[:1]

            recent_valence = sum(e.valence for e in recent) / len(recent)
            older_valence = sum(e.valence for e in older) / len(older)
            valence_diff = recent_valence - older_valence

            recent_arousal = sum(e.arousal for e in recent) / len(recent)
            older_arousal = sum(e.arousal for e in older) / len(older)
            arousal_diff = recent_arousal - older_arousal

            valence_trend = "stable"
            if valence_diff > 0.1:
                valence_trend = "increasing"
            elif valence_diff < -0.1:
                valence_trend = "decreasing"

            arousal_trend = "stable"
            if arousal_diff > 0.1:
                arousal_trend = "increasing"
            elif arousal_diff < -0.1:
                arousal_trend = "decreasing"
        else:
            valence_trend = "stable"
            arousal_trend = "stable"

        # Find dominant emotion
        emotion_counts: Dict[EmotionCategory, float] = {}
        for e in history:
            emotion_counts[e.primary_emotion] = emotion_counts.get(e.primary_emotion, 0) + e.primary_confidence

        dominant_emotion = max(emotion_counts, key=emotion_counts.get) if emotion_counts else EmotionCategory.NEUTRAL
        dominant_confidence = emotion_counts.get(dominant_emotion, 0) / len(history)

        # Calculate window duration
        if history:
            window_duration_ms = int((history[-1].timestamp - history[0].timestamp) * 1000)
        else:
            window_duration_ms = 0

        return EmotionTrend(
            avg_valence=avg_valence,
            avg_arousal=avg_arousal,
            dominant_emotion=dominant_emotion,
            dominant_confidence=dominant_confidence,
            valence_trend=valence_trend,
            arousal_trend=arousal_trend,
            sample_count=len(history),
            window_duration_ms=window_duration_ms,
        )


# ==============================================================================
# Emotion Detection Service
# ==============================================================================


class EmotionDetectionService:
    """
    Factory service for creating emotion detection sessions.

    Manages API key validation and session lifecycle.
    """

    def __init__(self):
        self._api_key = settings.HUME_API_KEY
        self._secret_key = settings.HUME_SECRET_KEY
        self._enabled = settings.HUME_ENABLED and bool(self._api_key)
        self._sessions: Dict[str, EmotionDetectionSession] = {}

        if self._enabled:
            logger.info("Emotion detection service initialized with Hume AI")
        else:
            logger.info("Emotion detection service disabled (no HUME_API_KEY)")

    def is_enabled(self) -> bool:
        """Check if emotion detection is available."""
        return self._enabled

    async def create_session(
        self,
        session_id: str,
        on_emotion: Optional[Callable[[EmotionResult], Awaitable[None]]] = None,
    ) -> Optional[EmotionDetectionSession]:
        """
        Create a new emotion detection session.

        Args:
            session_id: Unique session identifier
            on_emotion: Callback for emotion detection results

        Returns:
            EmotionDetectionSession or None if disabled
        """
        if not self._enabled:
            logger.debug("Emotion detection disabled, skipping session creation")
            return None

        session = EmotionDetectionSession(
            session_id=session_id,
            api_key=self._api_key,
            secret_key=self._secret_key,
            on_emotion=on_emotion,
        )

        self._sessions[session_id] = session
        await session.start()

        logger.info(f"Created emotion detection session: {session_id}")
        return session

    async def remove_session(self, session_id: str) -> None:
        """Remove and cleanup an emotion detection session."""
        session = self._sessions.pop(session_id, None)
        if session:
            await session.stop()
            logger.info(f"Removed emotion detection session: {session_id}")

    def get_session(self, session_id: str) -> Optional[EmotionDetectionSession]:
        """Get an active session by ID."""
        return self._sessions.get(session_id)

    def get_response_style(
        self,
        emotion: EmotionCategory,
    ) -> ResponseStyleAdjustment:
        """Get response style adjustment for an emotion."""
        return EMOTION_STYLE_MAP.get(
            emotion,
            EMOTION_STYLE_MAP[EmotionCategory.NEUTRAL],
        )

    def build_emotion_context_prompt(
        self,
        emotion: Optional[EmotionResult],
        trend: Optional[EmotionTrend] = None,
    ) -> str:
        """
        Build a context prompt for the LLM based on detected emotion.

        This is injected into the system prompt to guide response tone.
        """
        if not emotion:
            return ""

        style = self.get_response_style(emotion.primary_emotion)

        parts = [
            "\n[EMOTIONAL CONTEXT]",
            f"User emotional state: {emotion.primary_emotion.value} (confidence: {emotion.primary_confidence:.0%})",
            f"Guidance: {style.tone_instruction}",
        ]

        if trend:
            if trend.valence_trend == "decreasing":
                parts.append("Note: User's mood appears to be declining. Extra empathy may help.")
            elif trend.arousal_trend == "increasing" and emotion.arousal > 0.7:
                parts.append("Note: User's energy is rising. Match their pace while staying helpful.")

        if style.prioritize_empathy:
            parts.append("Priority: Show empathy and understanding.")
        if style.prioritize_clarity:
            parts.append("Priority: Be extra clear and structured.")
        if style.prioritize_urgency:
            parts.append("Priority: Respond with appropriate urgency.")

        parts.append("[END EMOTIONAL CONTEXT]\n")

        return "\n".join(parts)


# Global service instance
emotion_detection_service = EmotionDetectionService()

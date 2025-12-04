"""
Tests for EmotionEngine and related components.

Tests:
- Emotion detection
- Personalization and baseline learning
- Multi-modal fusion
- Response adaptation
- Event publishing
"""

# Import test subjects
import sys
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, "/home/asimo/VoiceAssist/services/api-gateway/app")

from app.core.event_bus import VoiceEvent, VoiceEventBus
from app.engines.emotion_engine import EmotionEngine, EmotionState, UserEmotionBaseline
from app.engines.emotion_engine.fusion import EmotionFusion, FusionWeights
from app.engines.emotion_engine.personalization import DeviationResult, EmotionPersonalization
from app.engines.emotion_engine.response_adaptation import AdaptationResult, ResponseAdaptation


class TestEmotionState:
    """Tests for EmotionState dataclass"""

    def test_default_values(self):
        """Test default EmotionState values"""
        state = EmotionState()
        assert state.valence == 0.0
        assert state.arousal == 0.5
        assert state.dominant_emotion == "neutral"
        assert state.confidence == 0.0
        assert state.emotions == {}
        assert state.source == "unknown"

    def test_custom_values(self):
        """Test EmotionState with custom values"""
        state = EmotionState(
            valence=0.5,
            arousal=0.8,
            dominant_emotion="joy",
            confidence=0.9,
            emotions={"joy": 0.8, "excitement": 0.6},
            source="hume",
        )
        assert state.valence == 0.5
        assert state.dominant_emotion == "joy"
        assert state.source == "hume"


class TestUserEmotionBaseline:
    """Tests for UserEmotionBaseline dataclass"""

    def test_default_values(self):
        """Test default baseline values"""
        baseline = UserEmotionBaseline(user_id="test-user")
        assert baseline.user_id == "test-user"
        assert baseline.baseline_valence == 0.0
        assert baseline.baseline_arousal == 0.5
        assert baseline.total_samples == 0
        assert baseline.confidence_level == 0.0

    def test_cultural_profile(self):
        """Test cultural profile setting"""
        baseline = UserEmotionBaseline(
            user_id="test-user",
            cultural_profile="eastern_collectivist",
        )
        assert baseline.cultural_profile == "eastern_collectivist"


class TestEmotionPersonalization:
    """Tests for EmotionPersonalization service"""

    @pytest.fixture
    def personalization(self):
        """Create EmotionPersonalization instance"""
        return EmotionPersonalization()

    @pytest.mark.asyncio
    async def test_get_baseline_creates_new(self, personalization):
        """Test getting baseline for new user creates it"""
        baseline = await personalization.get_baseline("new-user")
        assert baseline is not None
        assert baseline.user_id == "new-user"
        assert baseline.total_samples == 0

    @pytest.mark.asyncio
    async def test_update_baseline_increments_samples(self, personalization):
        """Test updating baseline increments sample count"""
        emotion = EmotionState(valence=0.3, arousal=0.6)
        baseline = await personalization.update_baseline("test-user", emotion)

        assert baseline.total_samples == 1

        # Update again
        baseline = await personalization.update_baseline("test-user", emotion)
        assert baseline.total_samples == 2

    @pytest.mark.asyncio
    async def test_baseline_learning_ema(self, personalization):
        """Test EMA baseline learning"""
        # Start with neutral
        baseline = await personalization.get_baseline("test-user")
        initial_valence = baseline.baseline_valence

        # Feed positive emotions
        for _ in range(20):
            emotion = EmotionState(valence=0.8, arousal=0.6)
            baseline = await personalization.update_baseline("test-user", emotion)

        # Baseline should have shifted towards positive
        assert baseline.baseline_valence > initial_valence
        assert baseline.baseline_valence < 0.8  # But not fully there (EMA)

    @pytest.mark.asyncio
    async def test_deviation_detection_insufficient_samples(self, personalization):
        """Test deviation returns None with insufficient samples"""
        emotion = EmotionState(valence=0.8, arousal=0.9)
        baseline = await personalization.get_baseline("test-user")

        # Only a few samples, confidence too low
        for _ in range(5):
            await personalization.update_baseline("test-user", EmotionState())

        deviation = await personalization.check_deviation(emotion, baseline)
        assert deviation is None  # Not enough samples

    @pytest.mark.asyncio
    async def test_deviation_detection_significant(self, personalization):
        """Test significant deviation is detected"""
        # Build up baseline with neutral emotions
        for _ in range(15):
            await personalization.update_baseline("test-user", EmotionState(valence=0.0, arousal=0.5))

        baseline = await personalization.get_baseline("test-user")

        # Now test with very different emotion
        extreme_emotion = EmotionState(valence=0.9, arousal=0.9)
        deviation = await personalization.check_deviation(extreme_emotion, baseline)

        assert deviation is not None
        assert deviation > 0

    @pytest.mark.asyncio
    async def test_reset_baseline(self, personalization):
        """Test resetting baseline"""
        # Create baseline
        await personalization.update_baseline("test-user", EmotionState(valence=0.5))

        # Reset
        result = await personalization.reset_baseline("test-user")
        assert result is True

        # Should be fresh baseline
        baseline = await personalization.get_baseline("test-user")
        assert baseline.total_samples == 0


class TestEmotionFusion:
    """Tests for EmotionFusion service"""

    @pytest.fixture
    def fusion(self):
        """Create EmotionFusion instance"""
        return EmotionFusion()

    @pytest.mark.asyncio
    async def test_audio_only_fusion(self, fusion):
        """Test fusion with only audio emotion"""
        audio_emotion = EmotionState(
            valence=0.5,
            arousal=0.7,
            dominant_emotion="joy",
            confidence=0.8,
        )

        result = await fusion.fuse(audio_emotion)

        assert result.valence == 0.5
        assert result.arousal == 0.7
        assert "audio" in result.source

    @pytest.mark.asyncio
    async def test_fusion_with_prosody(self, fusion):
        """Test fusion combining audio and prosody"""
        audio_emotion = EmotionState(
            valence=0.5,
            arousal=0.7,
            dominant_emotion="joy",
            confidence=0.8,
        )
        prosody_features = {
            "speech_rate": 1.5,  # Fast speech
            "pitch_variance": 0.7,  # High variance
        }

        result = await fusion.fuse(
            audio_emotion,
            prosody_features=prosody_features,
        )

        # Should include both sources
        assert "fusion" in result.source
        assert "audio" in result.source
        assert "prosody" in result.source

    @pytest.mark.asyncio
    async def test_fusion_with_text(self, fusion):
        """Test fusion including text sentiment"""
        audio_emotion = EmotionState(
            valence=0.5,
            arousal=0.5,
            confidence=0.8,
        )

        result = await fusion.fuse(
            audio_emotion,
            text="I'm so happy about this great news!",
        )

        # Text has positive words, should boost valence slightly
        assert "text" in result.source

    @pytest.mark.asyncio
    async def test_custom_weights(self):
        """Test fusion with custom weights"""
        weights = FusionWeights(audio=0.5, prosody=0.4, text=0.1)
        fusion = EmotionFusion(weights=weights)

        audio_emotion = EmotionState(valence=0.5, arousal=0.5, confidence=0.8)
        prosody = {"speech_rate": 0.5, "pitch_variance": 0.3}  # Slow, steady

        result = await fusion.fuse(audio_emotion, prosody_features=prosody)

        # With higher prosody weight and sad prosody features,
        # result should reflect that
        assert result.source is not None


class TestResponseAdaptation:
    """Tests for ResponseAdaptation service"""

    @pytest.fixture
    def adaptation(self):
        """Create ResponseAdaptation instance"""
        return ResponseAdaptation()

    @pytest.mark.asyncio
    async def test_neutral_emotion_no_adaptation(self, adaptation):
        """Test neutral emotion returns minimal adaptation"""
        emotion = EmotionState(
            dominant_emotion="neutral",
            confidence=0.9,
        )

        result = await adaptation.get_adaptation(emotion)

        assert result["system_prompt_addition"] == ""
        assert result["should_acknowledge_emotion"] is False

    @pytest.mark.asyncio
    async def test_frustration_adaptation(self, adaptation):
        """Test frustration triggers appropriate adaptation"""
        emotion = EmotionState(
            dominant_emotion="frustration",
            confidence=0.9,
        )

        result = await adaptation.get_adaptation(emotion)

        assert "direct" in result["tone_guidance"].lower()
        assert result["should_acknowledge_emotion"] is True
        assert result["max_response_length"] == "brief"

    @pytest.mark.asyncio
    async def test_confusion_adaptation(self, adaptation):
        """Test confusion triggers simplified response"""
        emotion = EmotionState(
            dominant_emotion="confusion",
            confidence=0.8,
        )

        result = await adaptation.get_adaptation(emotion)

        assert (
            "simple" in result["system_prompt_addition"].lower() or "steps" in result["system_prompt_addition"].lower()
        )
        assert "patient" in result["tone_guidance"].lower()

    @pytest.mark.asyncio
    async def test_low_confidence_uses_neutral(self, adaptation):
        """Test low confidence emotion defaults to neutral"""
        emotion = EmotionState(
            dominant_emotion="anger",
            confidence=0.3,  # Low confidence
        )

        result = await adaptation.get_adaptation(emotion)

        # Should use neutral adaptation due to low confidence
        assert result["detected_emotion"] == "neutral"


class TestEmotionEngine:
    """Integration tests for EmotionEngine facade"""

    @pytest.fixture
    def event_bus(self):
        """Create mock event bus"""
        bus = AsyncMock(spec=VoiceEventBus)
        bus.publish_event = AsyncMock()
        return bus

    @pytest.fixture
    def engine(self, event_bus):
        """Create EmotionEngine with mock event bus"""
        return EmotionEngine(event_bus=event_bus)

    @pytest.mark.asyncio
    async def test_engine_initialization(self, engine):
        """Test lazy initialization"""
        assert engine._detection is None
        await engine.initialize()
        assert engine._detection is not None
        assert engine._personalization is not None
        assert engine._fusion is not None

    @pytest.mark.asyncio
    async def test_detect_emotion_publishes_event(self, engine, event_bus):
        """Test emotion detection publishes event"""
        await engine.initialize()

        # Mock detection to return known result
        engine._detection.analyze_audio = AsyncMock(
            return_value=EmotionState(
                valence=0.5,
                arousal=0.7,
                dominant_emotion="joy",
                confidence=0.8,
            )
        )

        result = await engine.detect_emotion(
            audio_data=b"fake_audio",
            session_id="test-session",
        )

        # Verify event was published
        event_bus.publish_event.assert_called()
        call_args = event_bus.publish_event.call_args
        assert call_args.kwargs["event_type"] == "emotion.updated"

    @pytest.mark.asyncio
    async def test_detect_emotion_with_user_personalization(self, engine, event_bus):
        """Test emotion detection with user personalization"""
        await engine.initialize()

        engine._detection.analyze_audio = AsyncMock(
            return_value=EmotionState(
                valence=0.5,
                arousal=0.7,
                confidence=0.8,
            )
        )

        result = await engine.detect_emotion(
            audio_data=b"fake_audio",
            session_id="test-session",
            user_id="test-user",
        )

        assert result is not None

        # Get baseline was called
        baseline = await engine.get_user_baseline("test-user")
        assert baseline is not None

    @pytest.mark.asyncio
    async def test_reset_user_baseline(self, engine):
        """Test resetting user baseline"""
        await engine.initialize()

        # Create some baseline data
        emotion = EmotionState(valence=0.5)
        await engine._personalization.update_baseline("test-user", emotion)

        # Reset
        result = await engine.reset_user_baseline("test-user")
        assert result is True


class TestVoiceEventBus:
    """Tests for VoiceEventBus"""

    @pytest.fixture
    def event_bus(self):
        """Create fresh event bus"""
        return VoiceEventBus()

    @pytest.mark.asyncio
    async def test_subscribe_and_publish(self, event_bus):
        """Test basic subscribe and publish"""
        received_events = []

        async def handler(event: VoiceEvent):
            received_events.append(event)

        event_bus.subscribe("test.event", handler)

        await event_bus.publish_event(
            event_type="test.event",
            data={"key": "value"},
            session_id="test-session",
            source_engine="test",
        )

        assert len(received_events) == 1
        assert received_events[0].data["key"] == "value"

    @pytest.mark.asyncio
    async def test_wildcard_subscription(self, event_bus):
        """Test wildcard subscription receives all events"""
        received_events = []

        async def handler(event: VoiceEvent):
            received_events.append(event)

        event_bus.subscribe("*", handler)

        await event_bus.publish_event("event.one", {}, "s1", "test")
        await event_bus.publish_event("event.two", {}, "s2", "test")

        assert len(received_events) == 2

    @pytest.mark.asyncio
    async def test_priority_ordering(self, event_bus):
        """Test handlers called in priority order"""
        call_order = []

        async def low_priority(event):
            call_order.append("low")

        async def high_priority(event):
            call_order.append("high")

        event_bus.subscribe("test.event", low_priority, priority=0)
        event_bus.subscribe("test.event", high_priority, priority=10)

        await event_bus.publish_event("test.event", {}, "s1", "test")

        assert call_order == ["high", "low"]

    @pytest.mark.asyncio
    async def test_correlation_tracking(self, event_bus):
        """Test correlation ID links related events"""
        session_id = "test-session"

        # Start new correlation
        corr_id = event_bus.start_new_correlation(session_id)

        # Publish multiple events
        await event_bus.publish_event("event.one", {}, session_id, "test")
        await event_bus.publish_event("event.two", {}, session_id, "test")

        # Get event chain
        chain = await event_bus.get_event_chain(corr_id)

        assert len(chain) == 2
        assert all(e.correlation_id == corr_id for e in chain)

    @pytest.mark.asyncio
    async def test_session_events_filtering(self, event_bus):
        """Test getting events for specific session"""
        await event_bus.publish_event("test", {"n": 1}, "session-a", "test")
        await event_bus.publish_event("test", {"n": 2}, "session-b", "test")
        await event_bus.publish_event("test", {"n": 3}, "session-a", "test")

        session_a_events = await event_bus.get_session_events("session-a")

        assert len(session_a_events) == 2
        assert all(e.session_id == "session-a" for e in session_a_events)

    def test_get_stats(self, event_bus):
        """Test getting event bus statistics"""

        async def handler(e):
            pass

        event_bus.subscribe("test.event", handler)

        stats = event_bus.get_stats()

        assert "total_events" in stats
        assert "registered_handlers" in stats
        assert stats["registered_handlers"] >= 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

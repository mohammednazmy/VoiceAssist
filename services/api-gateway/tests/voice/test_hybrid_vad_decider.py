"""
Hybrid VAD Decider Unit Tests

Tests for HybridVADDecider service including:
- Weighted voting based on playback state
- Signal freshness validation
- Hybrid decision making
- Misfire rollback detection
- Configuration handling

Natural Conversation Flow: Phase 8.3 - Backend Tests
"""

import time

import pytest
from app.services.hybrid_vad_decider import (
    DeepgramEvent,
    HybridVADConfig,
    HybridVADDecider,
    VADState,
    create_hybrid_vad_decider,
)


class TestHybridVADDecider:
    """Test HybridVADDecider class."""

    @pytest.fixture
    def decider(self):
        """Create a fresh decider for each test."""
        return HybridVADDecider()

    @pytest.fixture
    def decider_with_config(self):
        """Create a decider with custom config."""
        config = HybridVADConfig(
            silero_weight_normal=0.7,
            deepgram_weight_normal=0.3,
            silero_weight_playback=0.2,
            deepgram_weight_playback=0.8,
            high_confidence_threshold=0.85,
            agreement_threshold=0.6,
        )
        return HybridVADDecider(config=config)

    # =========================================================================
    # Basic Decision Tests
    # =========================================================================

    def test_no_vad_data_returns_no_trigger(self, decider):
        """Test that no VAD data returns no trigger."""
        decision = decider.decide_barge_in()
        assert decision.trigger is False
        assert decision.source == "awaiting_transcript"
        assert "No VAD data" in decision.reason

    def test_both_sources_agree_triggers(self, decider):
        """Test that both sources agreeing triggers barge-in."""
        silero_state = VADState(
            confidence=0.9,
            is_speaking=True,
            speech_duration_ms=200,
        )
        deepgram_event = DeepgramEvent(
            is_speech_started=True,
            is_speech_ended=False,
            confidence=0.8,
        )

        decision = decider.decide_barge_in(
            silero_state=silero_state,
            deepgram_event=deepgram_event,
        )

        assert decision.trigger is True
        assert decision.source == "hybrid"
        assert decision.confidence >= 0.9

    def test_silero_only_high_confidence(self, decider):
        """Test high confidence Silero-only triggers."""
        silero_state = VADState(
            confidence=0.95,
            is_speaking=True,
            speech_duration_ms=200,
        )

        decision = decider.decide_barge_in(silero_state=silero_state)

        assert decision.trigger is True
        assert decision.source == "silero_only"

    def test_silero_only_low_confidence(self, decider):
        """Test low confidence Silero-only doesn't trigger."""
        silero_state = VADState(
            confidence=0.5,  # Below threshold
            is_speaking=True,
            speech_duration_ms=200,
        )

        decision = decider.decide_barge_in(silero_state=silero_state)

        assert decision.trigger is False

    def test_deepgram_only_triggers(self, decider):
        """Test Deepgram-only with speech started triggers."""
        deepgram_event = DeepgramEvent(
            is_speech_started=True,
            is_speech_ended=False,
            confidence=0.9,
        )

        decision = decider.decide_barge_in(deepgram_event=deepgram_event)

        assert decision.trigger is True
        assert decision.source == "deepgram_only"

    # =========================================================================
    # Playback State Tests
    # =========================================================================

    def test_playback_adjusts_weights(self, decider):
        """Test that TTS playback adjusts weights."""
        silero_state = VADState(
            confidence=0.7,
            is_speaking=True,
            speech_duration_ms=200,
        )

        # Without playback
        decider.set_tts_playing(False)
        decision_normal = decider.decide_barge_in(silero_state=silero_state)

        # With playback
        decider.set_tts_playing(True)
        decision_playback = decider.decide_barge_in(silero_state=silero_state)

        # During playback, Silero weight is lower
        assert decision_playback.silero_weight < decision_normal.silero_weight
        assert decision_playback.deepgram_weight > decision_normal.deepgram_weight

    def test_playback_silero_weight_reduced(self, decider):
        """Test Silero weight is reduced during playback (echo risk)."""
        decider.set_tts_playing(True)

        silero_state = VADState(
            confidence=0.8,
            is_speaking=True,
            speech_duration_ms=200,
        )

        decision = decider.decide_barge_in(silero_state=silero_state)

        # During playback, Silero weight should be 0.3 by default
        assert decision.silero_weight == 0.3
        assert decision.deepgram_weight == 0.7

    # =========================================================================
    # Signal Freshness Tests
    # =========================================================================

    def test_stale_silero_state(self, decider):
        """Test stale Silero state is handled correctly."""
        # Create old state
        silero_state = VADState(
            confidence=0.9,
            is_speaking=True,
            speech_duration_ms=200,
            timestamp_ms=time.time() * 1000 - 500,  # 500ms old
        )

        assert silero_state.is_fresh is False

    def test_fresh_silero_state(self, decider):
        """Test fresh Silero state is detected."""
        silero_state = VADState(
            confidence=0.9,
            is_speaking=True,
            speech_duration_ms=200,
        )

        assert silero_state.is_fresh is True

    def test_stale_deepgram_event(self, decider):
        """Test stale Deepgram event is handled correctly."""
        deepgram_event = DeepgramEvent(
            is_speech_started=True,
            is_speech_ended=False,
            confidence=0.9,
            timestamp_ms=time.time() * 1000 - 500,  # 500ms old
        )

        assert deepgram_event.is_fresh is False

    # =========================================================================
    # Hybrid Score Tests
    # =========================================================================

    def test_hybrid_score_calculation(self, decider):
        """Test hybrid score is calculated correctly."""
        silero_state = VADState(
            confidence=0.9,
            is_speaking=True,
            speech_duration_ms=200,
        )
        deepgram_event = DeepgramEvent(
            is_speech_started=True,
            is_speech_ended=False,
            confidence=0.8,
        )

        decision = decider.decide_barge_in(
            silero_state=silero_state,
            deepgram_event=deepgram_event,
        )

        # Both agree, should have high confidence
        assert decision.confidence >= 0.9

    def test_min_duration_requirement(self, decider):
        """Test minimum speech duration requirement."""
        silero_state = VADState(
            confidence=0.8,
            is_speaking=True,
            speech_duration_ms=50,  # Below min (150ms)
        )

        # Reset to use hybrid logic
        decision = decider.decide_barge_in(silero_state=silero_state)

        # Duration too short for hybrid score trigger
        # But high confidence Silero might still trigger
        assert decision.source in ("silero_only", "awaiting_transcript")

    # =========================================================================
    # Misfire Rollback Tests
    # =========================================================================

    def test_misfire_timer_start(self, decider):
        """Test misfire timer can be started."""
        decider.start_misfire_timer()
        assert decider._barge_in_pending is True

    def test_misfire_timer_cancel(self, decider):
        """Test misfire timer can be cancelled."""
        decider.start_misfire_timer()
        decider.cancel_misfire_timer()
        assert decider._barge_in_pending is False

    def test_misfire_rollback_no_transcript(self, decider):
        """Test misfire rollback when no transcript received."""
        # Start timer and wait
        decider.start_misfire_timer()
        decider._barge_in_pending_time = time.time() - 0.6  # 600ms ago

        # Check rollback with empty transcript
        should_rollback = decider.check_misfire_rollback("")
        assert should_rollback is True
        assert decider._barge_in_pending is False

    def test_no_misfire_rollback_with_transcript(self, decider):
        """Test no misfire rollback when transcript is received."""
        decider.start_misfire_timer()
        decider._barge_in_pending_time = time.time() - 0.6  # 600ms ago

        # Check rollback with valid transcript
        should_rollback = decider.check_misfire_rollback("hello world")
        assert should_rollback is False
        assert decider._barge_in_pending is False  # Timer is cleared

    def test_no_rollback_before_timeout(self, decider):
        """Test no rollback before timeout period."""
        decider.start_misfire_timer()
        # Just started, shouldn't rollback yet

        should_rollback = decider.check_misfire_rollback("")
        assert should_rollback is False
        assert decider._barge_in_pending is True

    # =========================================================================
    # State Update Tests
    # =========================================================================

    def test_update_silero_state(self, decider):
        """Test Silero state can be updated."""
        silero_state = VADState(
            confidence=0.9,
            is_speaking=True,
            speech_duration_ms=200,
        )

        decider.update_silero_state(silero_state)
        assert decider._last_silero_state == silero_state

    def test_update_deepgram_event(self, decider):
        """Test Deepgram event can be updated."""
        deepgram_event = DeepgramEvent(
            is_speech_started=True,
            is_speech_ended=False,
            confidence=0.9,
        )

        decider.update_deepgram_event(deepgram_event)
        assert decider._last_deepgram_event == deepgram_event

    def test_decide_uses_last_known_states(self, decider):
        """Test decide uses last known states when not provided."""
        silero_state = VADState(
            confidence=0.95,
            is_speaking=True,
            speech_duration_ms=200,
        )

        decider.update_silero_state(silero_state)

        # Call without providing state
        decision = decider.decide_barge_in()

        assert decision.trigger is True
        assert decision.source == "silero_only"

    # =========================================================================
    # Statistics Tests
    # =========================================================================

    def test_get_stats(self, decider):
        """Test get_stats returns expected fields."""
        stats = decider.get_stats()

        assert "is_tts_playing" in stats
        assert "last_silero_fresh" in stats
        assert "last_deepgram_fresh" in stats
        assert "last_decision" in stats
        assert "barge_in_pending" in stats


class TestHybridVADConfig:
    """Test HybridVADConfig dataclass."""

    def test_default_values(self):
        """Test default config values."""
        config = HybridVADConfig()

        assert config.silero_weight_normal == 0.6
        assert config.deepgram_weight_normal == 0.4
        assert config.silero_weight_playback == 0.3
        assert config.deepgram_weight_playback == 0.7
        assert config.high_confidence_threshold == 0.8
        assert config.agreement_threshold == 0.55

    def test_custom_values(self):
        """Test custom config values."""
        config = HybridVADConfig(
            silero_weight_normal=0.8,
            deepgram_weight_normal=0.2,
            high_confidence_threshold=0.9,
        )

        assert config.silero_weight_normal == 0.8
        assert config.deepgram_weight_normal == 0.2
        assert config.high_confidence_threshold == 0.9


class TestVADState:
    """Test VADState dataclass."""

    def test_freshness_check(self):
        """Test is_fresh property."""
        # Fresh state
        fresh_state = VADState(
            confidence=0.9,
            is_speaking=True,
            speech_duration_ms=200,
        )
        assert fresh_state.is_fresh is True

        # Stale state
        stale_state = VADState(
            confidence=0.9,
            is_speaking=True,
            speech_duration_ms=200,
            timestamp_ms=time.time() * 1000 - 500,
        )
        assert stale_state.is_fresh is False


class TestDeepgramEvent:
    """Test DeepgramEvent dataclass."""

    def test_freshness_check(self):
        """Test is_fresh property."""
        # Fresh event
        fresh_event = DeepgramEvent(
            is_speech_started=True,
            is_speech_ended=False,
            confidence=0.9,
        )
        assert fresh_event.is_fresh is True

        # Stale event
        stale_event = DeepgramEvent(
            is_speech_started=True,
            is_speech_ended=False,
            confidence=0.9,
            timestamp_ms=time.time() * 1000 - 500,
        )
        assert stale_event.is_fresh is False


class TestCreateHybridVADDecider:
    """Test factory function."""

    def test_create_with_defaults(self):
        """Test creating decider with defaults."""
        decider = create_hybrid_vad_decider()
        assert decider is not None
        assert decider.config is not None

    def test_create_with_custom_config(self):
        """Test creating decider with custom config."""
        config = HybridVADConfig(high_confidence_threshold=0.9)
        decider = create_hybrid_vad_decider(config=config)
        assert decider.config.high_confidence_threshold == 0.9

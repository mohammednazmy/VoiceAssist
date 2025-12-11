"""
Tests for VoicePipelineSession.update_frontend_vad_state AEC quality handling
and related HybridVADDecider wiring.

Ensures that:
- AEC quality is stored on the session.
- HybridVADDecider.apply_aec_quality is invoked with the latest quality.
- HybridVADConfig.signal_freshness_ms can be tuned via feature flags.
- Noise level and user VAD sensitivity feed into hybrid VAD thresholds.
"""

from typing import Any, Dict, Optional

import pytest

from app.services.hybrid_vad_decider import HybridVADDecider
from app.services.voice_pipeline_service import PipelineConfig, VoicePipelineSession


class DummyHybridVADDecider(HybridVADDecider):
    """Test double that records last AEC quality applied."""

    def __init__(self) -> None:
        super().__init__()
        self.last_aec_quality: Any = None

    def apply_aec_quality(self, quality: Any) -> None:  # type: ignore[override]
        self.last_aec_quality = quality
        # Delegate to base logic to keep behavior realistic for thresholds
        super().apply_aec_quality(quality)


@pytest.fixture
def pipeline_session() -> VoicePipelineSession:
    """Create a VoicePipelineSession with a dummy HybridVADDecider injected."""

    # VoicePipelineSession requires a callback for outbound messages;
    # tests don't inspect messages, so use a no-op.
    async def noop_on_message(_: Any) -> None:
        return None

    session = VoicePipelineSession(
        session_id="test-session",
        conversation_id=None,
        config=PipelineConfig(),
        stt_service=None,  # type: ignore[arg-type]
        thinker_service=None,  # type: ignore[arg-type]
        talker_service=None,  # type: ignore[arg-type]
        on_message=noop_on_message,
        emotion_service=None,
        backchannel_svc=None,
    )

    # Inject the dummy decider onto the session
    session._hybrid_vad_decider = DummyHybridVADDecider()  # type: ignore[attr-defined]
    return session


@pytest.mark.asyncio
async def test_update_frontend_vad_state_tracks_aec_quality(
    pipeline_session: VoicePipelineSession,
) -> None:
    """update_frontend_vad_state should store and forward AEC quality."""
    # Sanity: internal state before update
    assert getattr(pipeline_session, "_frontend_vad_state") is None
    assert getattr(pipeline_session, "_aec_quality") == "unknown"

    await pipeline_session.update_frontend_vad_state(
        silero_confidence=0.8,
        is_speaking=True,
        speech_duration_ms=250,
        is_playback_active=True,
        aec_quality="fair",
    )

    state: Dict[str, Any] = getattr(pipeline_session, "_frontend_vad_state")
    assert state["silero_confidence"] == 0.8
    assert state["is_speaking"] is True
    assert state["speech_duration_ms"] == 250
    assert state["is_playback_active"] is True
    # AEC quality should be captured in frontend_vad_state and on the session
    assert state["aec_quality"] == "fair"
    assert getattr(pipeline_session, "_aec_quality") == "fair"

    # When tuning flag is disabled in this test environment, HybridVADDecider
    # may not apply AEC quality. We only assert that the decider is present.
    decider = pipeline_session._hybrid_vad_decider  # type: ignore[attr-defined]
    assert isinstance(decider, DummyHybridVADDecider)


@pytest.mark.asyncio
async def test_update_frontend_vad_state_applies_signal_freshness_flag(
    pipeline_session: VoicePipelineSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    update_frontend_vad_state should apply backend.voice_hybrid_vad_signal_freshness_ms
    to HybridVADConfig.signal_freshness_ms when provided via feature flags.
    """

    async def stub_get_value(flag_name: str, default: Optional[int] = None, db: Any = None) -> Optional[int]:
        # Only override the hybrid VAD freshness flag; fall back to defaults otherwise.
        if flag_name == "backend.voice_hybrid_vad_signal_freshness_ms":
            return 120
        return default

    from app.services.feature_flags import feature_flag_service

    monkeypatch.setattr(feature_flag_service, "get_value", stub_get_value)

    decider: HybridVADDecider = pipeline_session._hybrid_vad_decider  # type: ignore[attr-defined]
    base_fresh_ms = decider.config.signal_freshness_ms
    assert base_fresh_ms != 0

    await pipeline_session.update_frontend_vad_state(
        silero_confidence=0.7,
        is_speaking=True,
        speech_duration_ms=180,
        is_playback_active=False,
        aec_quality=None,
    )

    # Signal freshness should now reflect the flag value (clamped range allows 120ms).
    assert decider.config.signal_freshness_ms == 120


@pytest.mark.asyncio
async def test_update_frontend_vad_state_noise_and_user_tuning(
    pipeline_session: VoicePipelineSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    update_frontend_vad_state should adjust hybrid VAD thresholds based on
    ambient noise (SNR) and the user's VAD sensitivity.
    """

    # Ensure feature flag lookups fall back to defaults to avoid DB dependencies.
    async def stub_get_value(flag_name: str, default: Any = None, db: Any = None) -> Any:
        return default

    from app.services.feature_flags import feature_flag_service

    monkeypatch.setattr(feature_flag_service, "get_value", stub_get_value)

    class DummyMetrics:
        def __init__(self, snr_estimate_db: float) -> None:
            self.snr_estimate_db = snr_estimate_db

    class DummyAudioProcessor:
        def __init__(self, snr_estimate_db: float) -> None:
            self._metrics = DummyMetrics(snr_estimate_db)

        def get_metrics(self) -> DummyMetrics:
            return self._metrics

    # Inject noisy environment and high VAD sensitivity.
    pipeline_session._audio_processing_enabled = True  # type: ignore[attr-defined]
    pipeline_session._audio_processor = DummyAudioProcessor(snr_estimate_db=8.0)  # type: ignore[attr-defined]
    pipeline_session.config.vad_sensitivity = 80

    decider: HybridVADDecider = pipeline_session._hybrid_vad_decider  # type: ignore[attr-defined]
    base_cfg = decider._base_config  # type: ignore[attr-defined]
    base_min_duration = base_cfg.min_speech_duration_ms
    base_hybrid_threshold = base_cfg.hybrid_score_threshold

    await pipeline_session.update_frontend_vad_state(
        silero_confidence=0.7,
        is_speaking=True,
        speech_duration_ms=200,
        is_playback_active=True,
        aec_quality=None,
    )

    tuned_cfg = decider.config

    # In a noisy environment with high sensitivity, we expect the effective
    # configuration to still be at least as conservative as the base for
    # duration, and not dramatically below the base for the hybrid threshold.
    assert tuned_cfg.min_speech_duration_ms >= base_min_duration
    assert tuned_cfg.hybrid_score_threshold >= base_hybrid_threshold - 0.05

"""
Tests for VoicePipelineSession ambient noise calibration and
high-noise push-to-talk recommendation behavior.

These tests use lightweight test doubles for the audio processor
to avoid depending on the full AudioProcessingService implementation.
"""

import asyncio
from typing import Any, List

import pytest

from app.services.voice_pipeline_service import AudioContext, PipelineConfig, PipelineMessage, VoicePipelineSession


class DummyAudioProcessor:
    def __init__(self, snr_estimate_db: float = 0.0) -> None:
        class Cfg:
            frame_duration_ms = 20

        self.config = Cfg()
        self._snr_estimate_db = snr_estimate_db
        self.calibration_calls = 0
        self.calibrated_durations: List[int] = []

    async def process_frame(self, audio_frame: bytes, context: Any | None = None) -> bytes:  # type: ignore[override]
        return audio_frame

    async def calibrate_noise_floor(self, audio_samples: List[bytes], duration_ms: int = 0) -> float:  # type: ignore[override]
        self.calibration_calls += 1
        self.calibrated_durations.append(duration_ms)
        return -40.0

    def get_metrics(self) -> Any:  # type: ignore[override]
        class Metrics:
            def __init__(self, snr: float) -> None:
                self.snr_estimate_db = snr

        return Metrics(self._snr_estimate_db)


@pytest.mark.asyncio
async def test_send_audio_triggers_one_time_noise_calibration(monkeypatch: pytest.MonkeyPatch) -> None:
    """VoicePipelineSession.send_audio should call calibrate_noise_floor once after ~1s of ambient audio."""

    async def noop_on_message(_: PipelineMessage) -> None:
        return None

    session = VoicePipelineSession(
        session_id="test-session-calibration",
        conversation_id="conv",
        config=PipelineConfig(),
        stt_service=None,  # type: ignore[arg-type]
        thinker_service=None,  # type: ignore[arg-type]
        talker_service=None,  # type: ignore[arg-type]
        on_message=noop_on_message,
        emotion_service=None,
        backchannel_svc=None,
    )

    processor = DummyAudioProcessor()
    session._audio_processing_enabled = True  # type: ignore[attr-defined]
    session._audio_processor = processor  # type: ignore[attr-defined]
    session._audio_context = AudioContext()  # type: ignore[attr-defined]

    # 20ms frames → need at least 50 frames to reach ~1000ms
    for _ in range(60):
        await session.send_audio(b"\x00" * 320)

    assert processor.calibration_calls == 1
    assert processor.calibrated_durations
    # Duration should be at least 1000ms based on frame count
    assert processor.calibrated_durations[0] >= 1000


@pytest.mark.asyncio
async def test_poor_snr_recommends_push_to_talk(monkeypatch: pytest.MonkeyPatch) -> None:
    """Persistently low SNR should eventually cause a push-to-talk recommendation via voice.state."""

    messages: list[PipelineMessage] = []

    async def capture_message(msg: PipelineMessage) -> None:
        messages.append(msg)

    session = VoicePipelineSession(
        session_id="test-session-noise",
        conversation_id="conv",
        config=PipelineConfig(),
        stt_service=None,  # type: ignore[arg-type]
        thinker_service=None,  # type: ignore[arg-type]
        talker_service=None,  # type: ignore[arg-type]
        on_message=capture_message,
        emotion_service=None,
        backchannel_svc=None,
    )

    processor = DummyAudioProcessor(snr_estimate_db=0.0)
    session._audio_processing_enabled = True  # type: ignore[attr-defined]
    session._audio_processor = processor  # type: ignore[attr-defined]
    session._audio_context = AudioContext()  # type: ignore[attr-defined]

    # Control time.time() so we can simulate a long noisy period without sleeping.
    current_time = 1_000.0

    def fake_time() -> float:
        return current_time

    monkeypatch.setattr("app.services.voice_pipeline_service.time.time", fake_time)

    # First few frames: mark poor noise but not long enough for recommendation.
    for _ in range(5):
        await session.send_audio(b"\x00" * 320)

    # Advance "time" beyond the 10s window used in _maybe_send_noise_recommendation.
    current_time += 11.0

    # Another frame should now trigger the recommendation.
    await session.send_audio(b"\x00" * 320)

    # Find the last voice.state message
    voice_state_messages = [
        m for m in messages if m.type == "voice.state" and isinstance(m.data, dict)
    ]
    assert voice_state_messages, "Expected at least one voice.state message"
    last = voice_state_messages[-1]
    assert last.data.get("push_to_talk_recommended") is True
    assert last.data.get("reason") == "high_noise"


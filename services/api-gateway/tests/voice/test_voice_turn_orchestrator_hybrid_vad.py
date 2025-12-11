"""
VoiceTurnOrchestrator Hybrid VAD Signal Freshness Tests.

Ensures that VoiceTurnOrchestrator.set_signal_freshness_ms wires through to the
underlying HybridVADDecider so that the same signal_freshness_ms flag used by
the Thinker/Talker pipeline also governs orchestrator-driven barge-in decisions.
"""

import time

from app.services.hybrid_vad_decider import DeepgramEvent, HybridVADConfig, HybridVADDecider
from app.services.voice_turn_orchestrator import (
    OrchestratorConfig,
    TurnState,
    VoiceTurnOrchestrator,
)


def test_voice_turn_orchestrator_respects_signal_freshness_ms() -> None:
    """
    When the orchestrator's signal freshness window is shortened, older Deepgram
    events should be treated as stale by HybridVADDecider, preventing barge-in.
    """
    # Configure HybridVADDecider with a lenient base config; we will tighten
    # freshness via the orchestrator API.
    vad_config = HybridVADConfig(
        hybrid_score_threshold=0.7,
        agreement_threshold=0.55,
        signal_freshness_ms=300,
    )
    hybrid_vad = HybridVADDecider(config=vad_config)

    # Orchestrator with hybrid VAD enabled and our custom decider injected.
    orchestrator = VoiceTurnOrchestrator(
        config=OrchestratorConfig(enable_hybrid_vad=True),
        hybrid_vad=hybrid_vad,
    )
    orchestrator.set_state(TurnState.SPEAKING)

    # Use a short freshness window (100ms) so we can easily create a stale event.
    orchestrator.set_signal_freshness_ms(100)

    now_ms = time.time() * 1000

    # Fresh Deepgram event should be considered for barge-in.
    deepgram_fresh = DeepgramEvent(
        is_speech_started=True,
        is_speech_ended=False,
        confidence=0.9,
        timestamp_ms=now_ms,
    )

    decision_fresh = orchestrator.analyze_turn(
        transcript="user speaking over AI",
        silence_duration_ms=0,
        is_partial=True,
        language="en",
        prosody_hints=None,
        silero_state=None,
        deepgram_event=deepgram_fresh,
    )

    assert decision_fresh.barge_in_decision is not None
    assert decision_fresh.action == "stop_ai"
    assert decision_fresh.barge_in_decision.source == "deepgram_only"
    assert decision_fresh.barge_in_decision.trigger is True

    # Stale Deepgram event (older than the configured freshness window) should
    # not trigger barge-in once the window is applied.
    deepgram_stale = DeepgramEvent(
        is_speech_started=True,
        is_speech_ended=False,
        confidence=0.9,
        timestamp_ms=now_ms - 200,  # > 100ms freshness window
    )

    decision_stale = orchestrator.analyze_turn(
        transcript="user speaking over AI",
        silence_duration_ms=0,
        is_partial=True,
        language="en",
        prosody_hints=None,
        silero_state=None,
        deepgram_event=deepgram_stale,
    )

    # With a 100ms window, the stale Deepgram event should be ignored by HybridVAD,
    # so no barge-in decision is attached and action falls back to the semantic
    # / continuation logic (which defaults to "wait" for partials).
    assert decision_stale.barge_in_decision is None
    assert decision_stale.action in ("wait", "respond")


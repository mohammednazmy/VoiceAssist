"""
Hybrid VAD Decider Service

Combines frontend Silero VAD with backend Deepgram VAD using weighted voting
to achieve optimal barge-in detection accuracy during AI speech playback.

Features:
- Weighted voting based on playback state
- Configurable thresholds per source
- Misfire rollback timer (500ms)
- Freshness validation for VAD signals
- Feature flag controlled

Natural Conversation Flow: Phase 3 - Hybrid VAD Fusion
Feature Flag: backend.voice_hybrid_vad_fusion
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Literal, Optional

from app.core.logging import get_logger
from app.core.metrics import (
    voice_barge_in_misfires_total,
    voice_hybrid_vad_decision_total,
)

logger = get_logger(__name__)


# ============================================================================
# Type Definitions
# ============================================================================


@dataclass
class VADState:
    """Frontend Silero VAD state."""

    confidence: float
    is_speaking: bool
    speech_duration_ms: int
    timestamp_ms: float = field(default_factory=lambda: time.time() * 1000)

    @property
    def is_fresh(self) -> bool:
        """
        Check if VAD state is fresh (less than 300ms old).

        NOTE: This helper uses a fixed 300ms window for backwards-compatible
        sanity checks and unit tests. The HybridVADDecider applies the
        configurable HybridVADConfig.signal_freshness_ms value when making
        real barge-in decisions.
        """
        return (time.time() * 1000 - self.timestamp_ms) < 300


@dataclass
class DeepgramEvent:
    """Backend Deepgram speech event."""

    is_speech_started: bool
    is_speech_ended: bool
    confidence: float
    timestamp_ms: float = field(default_factory=lambda: time.time() * 1000)

    @property
    def is_fresh(self) -> bool:
        """
        Check if Deepgram event is fresh (less than 300ms old).

        NOTE: This helper uses a fixed 300ms window for backwards-compatible
        sanity checks and unit tests. The HybridVADDecider applies the
        configurable HybridVADConfig.signal_freshness_ms value when making
        real barge-in decisions.
        """
        return (time.time() * 1000 - self.timestamp_ms) < 300


@dataclass
class BargeInDecision:
    """Decision from the hybrid VAD decider."""

    trigger: bool
    source: Literal["hybrid", "silero_only", "deepgram_only", "awaiting_transcript", "suppressed"]
    confidence: float
    silero_weight: float
    deepgram_weight: float
    reason: str = ""


@dataclass
class HybridVADConfig:
    """Configuration for hybrid VAD fusion."""

    # Weight configuration
    silero_weight_normal: float = 0.6
    deepgram_weight_normal: float = 0.4
    silero_weight_playback: float = 0.3  # Lower during playback (echo risk)
    deepgram_weight_playback: float = 0.7  # Higher during playback (reliable)

    # Thresholds
    high_confidence_threshold: float = 0.8  # Silero-only trigger threshold
    agreement_threshold: float = 0.55  # Both sources agree threshold
    hybrid_score_threshold: float = 0.75  # Combined score threshold

    # Timing
    min_speech_duration_ms: int = 150  # Minimum speech duration to consider
    signal_freshness_ms: int = 300  # Maximum age for fresh signals
    misfire_rollback_ms: int = 500  # Time to wait before confirming barge-in


# ============================================================================
# Hybrid VAD Decider
# ============================================================================


class HybridVADDecider:
    """
    Combines frontend Silero VAD with backend Deepgram VAD for optimal
    barge-in detection during AI speech playback.

    The hybrid approach addresses:
    - Echo from AI playback triggering false positives
    - Network latency causing delayed Deepgram detection
    - Missed barge-ins when only one source detects speech
    """

    def __init__(self, config: Optional[HybridVADConfig] = None):
        self.config = config or HybridVADConfig()
        # Preserve a copy of the base configuration so we can apply
        # layered adjustments (e.g., quality preset, AEC quality)
        # without permanently mutating caller-provided settings.
        self._base_config = HybridVADConfig(**vars(self.config))
        self._quality_preset: Optional[str] = None
        self._current_aec_quality: Optional[str] = None
        self._is_tts_playing: bool = False
        self._last_silero_state: Optional[VADState] = None
        self._last_deepgram_event: Optional[DeepgramEvent] = None
        self._last_decision: Optional[BargeInDecision] = None
        self._barge_in_pending: bool = False
        self._barge_in_pending_time: float = 0.0

        logger.debug(
            "HybridVADDecider initialized",
            extra={
                "silero_weight_normal": self.config.silero_weight_normal,
                "deepgram_weight_normal": self.config.deepgram_weight_normal,
            },
        )

    # ---------------------------------------------------------------------
    # Configuration tuning helpers
    # ---------------------------------------------------------------------

    def _recompute_config(self) -> None:
        """
        Recompute effective config from base, applying:
        1) Barge-in quality preset (responsive/balanced/smooth)
        2) AEC capability-aware tuning (excellent/good/fair/poor)

        This keeps adjustments composable and idempotent.
        """
        # Start from immutable base config
        self.config = HybridVADConfig(**vars(self._base_config))

        # Step 1: Apply quality preset (user preference: latency vs smoothness)
        if self._quality_preset in {"balanced", "smooth"}:
            if self._quality_preset == "balanced":
                # Slightly more conservative than "responsive":
                # - Require a bit longer speech duration
                # - Raise hybrid/high-confidence thresholds modestly
                self.config.min_speech_duration_ms = int(
                    self.config.min_speech_duration_ms + 30,
                )
                self.config.hybrid_score_threshold = min(
                    0.95,
                    self.config.hybrid_score_threshold + 0.03,
                )
                self.config.high_confidence_threshold = min(
                    0.95,
                    self.config.high_confidence_threshold + 0.03,
                )
            elif self._quality_preset == "smooth":
                # Significantly more conservative:
                # - Longer duration and higher thresholds
                self.config.min_speech_duration_ms = int(
                    self.config.min_speech_duration_ms + 60,
                )
                self.config.hybrid_score_threshold = min(
                    0.97,
                    self.config.hybrid_score_threshold + 0.05,
                )
                self.config.high_confidence_threshold = min(
                    0.97,
                    self.config.high_confidence_threshold + 0.05,
                )

            logger.debug(
                "[HybridVAD] Applied quality preset '%s'",
                self._quality_preset,
                extra={
                    "min_speech_duration_ms": self.config.min_speech_duration_ms,
                    "hybrid_score_threshold": self.config.hybrid_score_threshold,
                    "high_confidence_threshold": self.config.high_confidence_threshold,
                },
            )

        # Step 2: Apply AEC capability-aware tuning on top
        if self._current_aec_quality in {"fair", "poor"}:
            if self._current_aec_quality == "fair":
                self.config.min_speech_duration_ms = int(
                    self.config.min_speech_duration_ms + 50,
                )
                self.config.hybrid_score_threshold = min(
                    0.95,
                    self.config.hybrid_score_threshold + 0.05,
                )
                self.config.high_confidence_threshold = min(
                    0.95,
                    self.config.high_confidence_threshold + 0.05,
                )
                self.config.misfire_rollback_ms = int(
                    self.config.misfire_rollback_ms + 100,
                )
                logger.debug(
                    "[HybridVAD] Applied AEC quality='fair' config",
                    extra={
                        "min_speech_duration_ms": self.config.min_speech_duration_ms,
                        "hybrid_score_threshold": self.config.hybrid_score_threshold,
                        "high_confidence_threshold": self.config.high_confidence_threshold,
                        "misfire_rollback_ms": self.config.misfire_rollback_ms,
                    },
                )
            elif self._current_aec_quality == "poor":
                self.config.min_speech_duration_ms = int(
                    self.config.min_speech_duration_ms + 100,
                )
                self.config.hybrid_score_threshold = min(
                    0.99,
                    self.config.hybrid_score_threshold + 0.1,
                )
                self.config.high_confidence_threshold = min(
                    0.99,
                    self.config.high_confidence_threshold + 0.1,
                )
                self.config.misfire_rollback_ms = int(
                    self.config.misfire_rollback_ms + 300,
                )
                logger.debug(
                    "[HybridVAD] Applied AEC quality='poor' config",
                    extra={
                        "min_speech_duration_ms": self.config.min_speech_duration_ms,
                        "hybrid_score_threshold": self.config.hybrid_score_threshold,
                        "high_confidence_threshold": self.config.high_confidence_threshold,
                        "misfire_rollback_ms": self.config.misfire_rollback_ms,
                    },
                )

    def apply_quality_preset(self, preset: Optional[str]) -> None:
        """
        Adjust HybridVADConfig thresholds based on barge-in quality preset.

        Presets mirror frontend Silero behavior:
        - responsive: fastest barge-in, minimal extra constraints
        - balanced: slightly more conservative (default)
        - smooth: waits for more natural pauses

        The preset is composed with AEC quality adjustments via _recompute_config().
        """
        if not preset:
            return

        if preset == self._quality_preset:
            return

        if preset not in {"responsive", "balanced", "smooth"}:
            logger.debug(
                "[HybridVAD] Unknown quality preset '%s' - keeping base config",
                preset,
            )
            self._quality_preset = None
            self._recompute_config()
            return

        self._quality_preset = preset
        self._recompute_config()

    def apply_aec_quality(self, quality: Optional[str]) -> None:
        """
        Adjust HybridVADConfig thresholds based on AEC capability level.

        The frontend categorizes AEC quality as:
        - excellent / good: native AEC works well → keep defaults
        - fair: some echo risk → slightly more conservative barge-in
        - poor: AEC ineffective → significantly more conservative
        - unknown: no signal → keep defaults
        """
        if quality is None or quality == self._current_aec_quality:
            return

        self._current_aec_quality = quality
        # Recompute config with new AEC quality layered on existing preset
        self._recompute_config()
        if quality not in {"fair", "poor"}:
            logger.debug(
                "[HybridVAD] Using base/preset config for AEC quality=%s",
                quality,
            )

    def set_tts_playing(self, is_playing: bool) -> None:
        """Update TTS playback state for weight adjustment."""
        self._is_tts_playing = is_playing
        logger.debug(f"[HybridVAD] TTS playing: {is_playing}")

    def set_signal_freshness_ms(self, value: int) -> None:
        """
        Update the signal freshness window (ms) for both the effective and base configs.

        This ensures that subsequent quality/AEC recomputations preserve the
        caller-provided window instead of reverting to the default.
        """
        if value <= 0:
            return

        self.config.signal_freshness_ms = value
        self._base_config.signal_freshness_ms = value

    def update_silero_state(self, state: VADState) -> None:
        """Update the latest Silero VAD state."""
        self._last_silero_state = state

    def update_deepgram_event(self, event: DeepgramEvent) -> None:
        """Update the latest Deepgram event."""
        self._last_deepgram_event = event

    # ---------------------------------------------------------------------
    # Freshness helpers
    # ---------------------------------------------------------------------

    def _is_timestamp_fresh(self, timestamp_ms: float) -> bool:
        """
        Determine whether a timestamp is fresh based on the configured window.

        Uses HybridVADConfig.signal_freshness_ms instead of a hard-coded
        constant so deployments can tune hybrid behavior via feature flags.
        """
        if timestamp_ms <= 0:
            return False
        age_ms = time.time() * 1000 - timestamp_ms
        return age_ms < self.config.signal_freshness_ms

    def decide_barge_in(
        self,
        silero_state: Optional[VADState] = None,
        deepgram_event: Optional[DeepgramEvent] = None,
    ) -> BargeInDecision:
        """
        Decide whether to trigger barge-in based on hybrid VAD fusion.

        Args:
            silero_state: Current Silero VAD state (or use last known)
            deepgram_event: Current Deepgram event (or use last known)

        Returns:
            BargeInDecision with trigger, source, and confidence
        """
        # Use provided or last known states
        silero = silero_state or self._last_silero_state
        deepgram = deepgram_event or self._last_deepgram_event

        # Update stored states
        if silero_state:
            self._last_silero_state = silero_state
        if deepgram_event:
            self._last_deepgram_event = deepgram_event

        # No VAD data available
        if not silero and not deepgram:
            decision = BargeInDecision(
                trigger=False,
                source="awaiting_transcript",
                confidence=0.0,
                silero_weight=0.0,
                deepgram_weight=0.0,
                reason="No VAD data available",
            )
            voice_hybrid_vad_decision_total.labels(
                source=decision.source,
                silero_fresh="false",
                deepgram_fresh="false",
            ).inc()
            return decision

        # Determine weights based on playback state
        if self._is_tts_playing:
            weights = {
                "silero": self.config.silero_weight_playback,
                "deepgram": self.config.deepgram_weight_playback,
            }
        else:
            weights = {
                "silero": self.config.silero_weight_normal,
                "deepgram": self.config.deepgram_weight_normal,
            }

        # Check freshness
        silero_fresh = bool(silero and self._is_timestamp_fresh(silero.timestamp_ms))
        deepgram_fresh = bool(deepgram and self._is_timestamp_fresh(deepgram.timestamp_ms))

        # Case 1: Both sources agree - high confidence trigger
        if (
            silero
            and deepgram
            and silero.is_speaking
            and deepgram.is_speech_started
            and silero.confidence >= self.config.agreement_threshold
        ):
            decision = BargeInDecision(
                trigger=True,
                source="hybrid",
                confidence=0.95,
                silero_weight=weights["silero"],
                deepgram_weight=weights["deepgram"],
                reason="Both Silero and Deepgram agree on speech detection",
            )
            self._last_decision = decision
            voice_hybrid_vad_decision_total.labels(
                source=decision.source,
                silero_fresh="true" if silero_fresh else "false",
                deepgram_fresh="true" if deepgram_fresh else "false",
            ).inc()
            return decision

        # Case 2: Only Silero is fresh
        if silero_fresh and not deepgram_fresh:
            if silero and silero.confidence > self.config.high_confidence_threshold:
                decision = BargeInDecision(
                    trigger=True,
                    source="silero_only",
                    confidence=silero.confidence,
                    silero_weight=weights["silero"],
                    deepgram_weight=weights["deepgram"],
                    reason=f"High confidence Silero ({silero.confidence:.2f}) with stale Deepgram",
                )
                self._last_decision = decision
                voice_hybrid_vad_decision_total.labels(
                    source=decision.source,
                    silero_fresh="true",
                    deepgram_fresh="false",
                ).inc()
                return decision
            else:
                decision = BargeInDecision(
                    trigger=False,
                    source="silero_only",
                    confidence=silero.confidence if silero else 0.0,
                    silero_weight=weights["silero"],
                    deepgram_weight=weights["deepgram"],
                    reason="Silero confidence below threshold, awaiting Deepgram",
                )
                voice_hybrid_vad_decision_total.labels(
                    source=decision.source,
                    silero_fresh="true",
                    deepgram_fresh="false",
                ).inc()
                return decision

        # Case 3: Only Deepgram is fresh
        if deepgram_fresh and not silero_fresh:
            if (
                deepgram
                and deepgram.is_speech_started
                and deepgram.confidence >= self.config.agreement_threshold
            ):
                decision = BargeInDecision(
                    trigger=True,
                    source="deepgram_only",
                    confidence=deepgram.confidence,
                    silero_weight=weights["silero"],
                    deepgram_weight=weights["deepgram"],
                    reason=(
                        "Deepgram speech started with stale Silero "
                        f"(conf={deepgram.confidence:.2f}>=threshold={self.config.agreement_threshold:.2f})"
                    ),
                )
                self._last_decision = decision
                voice_hybrid_vad_decision_total.labels(
                    source=decision.source,
                    silero_fresh="false",
                    deepgram_fresh="true",
                ).inc()
                return decision
            else:
                decision = BargeInDecision(
                    trigger=False,
                    source="deepgram_only",
                    confidence=deepgram.confidence if deepgram else 0.0,
                    silero_weight=weights["silero"],
                    deepgram_weight=weights["deepgram"],
                    reason="Deepgram confidence below threshold or no speech started",
                )
                voice_hybrid_vad_decision_total.labels(
                    source=decision.source,
                    silero_fresh="false",
                    deepgram_fresh="true",
                ).inc()
                return decision

        # Case 4: Hybrid weighted scoring
        if silero and silero.is_speaking:
            deepgram_contrib = (
                weights["deepgram"] * deepgram.confidence
                if deepgram and deepgram.is_speech_started
                else 0.0
            )
            hybrid_score = silero.confidence * weights["silero"] + deepgram_contrib

            # Check duration requirement
            duration_ok = silero.speech_duration_ms >= self.config.min_speech_duration_ms

            if hybrid_score >= self.config.hybrid_score_threshold and duration_ok:
                decision = BargeInDecision(
                    trigger=True,
                    source="hybrid",
                    confidence=hybrid_score,
                    silero_weight=weights["silero"],
                    deepgram_weight=weights["deepgram"],
                    reason=f"Hybrid score {hybrid_score:.2f} exceeds threshold",
                )
                self._last_decision = decision
                voice_hybrid_vad_decision_total.labels(
                    source=decision.source,
                    silero_fresh="true" if silero_fresh else "false",
                    deepgram_fresh="true" if deepgram_fresh else "false",
                ).inc()
                return decision

        # Default: No barge-in
        decision = BargeInDecision(
            trigger=False,
            source="awaiting_transcript",
            confidence=0.0,
            silero_weight=weights["silero"],
            deepgram_weight=weights["deepgram"],
            reason="Insufficient evidence for barge-in",
        )
        voice_hybrid_vad_decision_total.labels(
            source=decision.source,
            silero_fresh="true" if silero_fresh else "false",
            deepgram_fresh="true" if deepgram_fresh else "false",
        ).inc()
        return decision

    def check_misfire_rollback(self, transcript: str) -> bool:
        """
        Check if a barge-in was a misfire (no transcript after 500ms).

        Returns True if we should rollback (resume playback).
        """
        if not self._barge_in_pending:
            return False

        elapsed_ms = (time.time() - self._barge_in_pending_time) * 1000

        if elapsed_ms >= self.config.misfire_rollback_ms:
            if not transcript.strip():
                logger.info(f"[HybridVAD] Misfire detected: No transcript after {elapsed_ms:.0f}ms")
                voice_barge_in_misfires_total.labels(cause="no_transcript").inc()
                self._barge_in_pending = False
                return True
            else:
                # Transcript received, confirm barge-in
                self._barge_in_pending = False
                return False

        return False

    def start_misfire_timer(self) -> None:
        """Start the misfire rollback timer when barge-in is triggered."""
        self._barge_in_pending = True
        self._barge_in_pending_time = time.time()

    def cancel_misfire_timer(self) -> None:
        """Cancel the misfire timer (transcript received)."""
        self._barge_in_pending = False

    def get_stats(self) -> dict:
        """Get current decider statistics."""
        return {
            "is_tts_playing": self._is_tts_playing,
            "last_silero_fresh": self._is_timestamp_fresh(self._last_silero_state.timestamp_ms)
            if self._last_silero_state
            else False,
            "last_deepgram_fresh": self._is_timestamp_fresh(self._last_deepgram_event.timestamp_ms)
            if self._last_deepgram_event
            else False,
            "last_decision": self._last_decision.source if self._last_decision else None,
            "barge_in_pending": self._barge_in_pending,
        }


# ============================================================================
# Factory Function
# ============================================================================


def create_hybrid_vad_decider(
    config: Optional[HybridVADConfig] = None,
) -> HybridVADDecider:
    """Create a new HybridVADDecider instance."""
    return HybridVADDecider(config=config)

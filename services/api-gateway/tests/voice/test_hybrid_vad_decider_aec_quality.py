"""
Additional tests for HybridVADDecider AEC‑aware configuration.

Validates that apply_aec_quality() adjusts thresholds and timing
for different AEC capability levels without breaking the base config.
"""

from app.services.hybrid_vad_decider import HybridVADConfig, HybridVADDecider


def test_apply_aec_quality_fair_adjusts_config() -> None:
    """AEC quality 'fair' should make hybrid VAD slightly more conservative."""
    base = HybridVADConfig(
        min_speech_duration_ms=150,
        hybrid_score_threshold=0.75,
        high_confidence_threshold=0.8,
        misfire_rollback_ms=500,
    )
    decider = HybridVADDecider(config=base)

    decider.apply_aec_quality("fair")

    cfg = decider.config
    # Duration increased modestly
    assert cfg.min_speech_duration_ms == base.min_speech_duration_ms + 50
    # Thresholds raised but still bounded
    assert cfg.hybrid_score_threshold == base.hybrid_score_threshold + 0.05
    assert cfg.high_confidence_threshold == base.high_confidence_threshold + 0.05
    # Misfire rollback window extended slightly
    assert cfg.misfire_rollback_ms == base.misfire_rollback_ms + 100


def test_apply_aec_quality_poor_adjusts_config_more() -> None:
    """AEC quality 'poor' should make hybrid VAD clearly more conservative."""
    base = HybridVADConfig(
        min_speech_duration_ms=150,
        hybrid_score_threshold=0.75,
        high_confidence_threshold=0.8,
        misfire_rollback_ms=500,
    )
    decider = HybridVADDecider(config=base)

    decider.apply_aec_quality("poor")

    cfg = decider.config
    # Duration increased more than 'fair'
    assert cfg.min_speech_duration_ms == base.min_speech_duration_ms + 100
    # Thresholds raised more aggressively
    assert cfg.hybrid_score_threshold == base.hybrid_score_threshold + 0.1
    assert cfg.high_confidence_threshold == base.high_confidence_threshold + 0.1
    # Misfire rollback window extended more
    assert cfg.misfire_rollback_ms == base.misfire_rollback_ms + 300


def test_apply_aec_quality_good_or_excellent_uses_base_config() -> None:
    """AEC quality 'good' or 'excellent' should keep base thresholds."""
    base = HybridVADConfig(
        min_speech_duration_ms=150,
        hybrid_score_threshold=0.75,
        high_confidence_threshold=0.8,
        misfire_rollback_ms=500,
    )
    decider = HybridVADDecider(config=base)

    decider.apply_aec_quality("good")
    cfg_good = decider.config

    assert cfg_good.min_speech_duration_ms == base.min_speech_duration_ms
    assert cfg_good.hybrid_score_threshold == base.hybrid_score_threshold
    assert cfg_good.high_confidence_threshold == base.high_confidence_threshold
    assert cfg_good.misfire_rollback_ms == base.misfire_rollback_ms

    # Switching to "excellent" from "good" should still preserve base config
    decider.apply_aec_quality("excellent")
    cfg_excellent = decider.config

    assert cfg_excellent.min_speech_duration_ms == base.min_speech_duration_ms
    assert cfg_excellent.hybrid_score_threshold == base.hybrid_score_threshold
    assert cfg_excellent.high_confidence_threshold == base.high_confidence_threshold
    assert cfg_excellent.misfire_rollback_ms == base.misfire_rollback_ms


def test_apply_aec_quality_is_idempotent_per_quality() -> None:
    """Repeated calls with the same quality should not further mutate config."""
    base = HybridVADConfig(
        min_speech_duration_ms=150,
        hybrid_score_threshold=0.75,
        high_confidence_threshold=0.8,
        misfire_rollback_ms=500,
    )
    decider = HybridVADDecider(config=base)

    decider.apply_aec_quality("fair")
    first_cfg = decider.config
    decider.apply_aec_quality("fair")
    second_cfg = decider.config

    # Values remain stable after second call
    assert second_cfg.min_speech_duration_ms == first_cfg.min_speech_duration_ms
    assert second_cfg.hybrid_score_threshold == first_cfg.hybrid_score_threshold
    assert second_cfg.high_confidence_threshold == first_cfg.high_confidence_threshold
    assert second_cfg.misfire_rollback_ms == first_cfg.misfire_rollback_ms


def test_apply_quality_preset_balanced_adjusts_config() -> None:
    """Quality preset 'balanced' should make hybrid VAD slightly more conservative."""
    base = HybridVADConfig(
        min_speech_duration_ms=150,
        hybrid_score_threshold=0.75,
        high_confidence_threshold=0.8,
        misfire_rollback_ms=500,
    )
    decider = HybridVADDecider(config=base)

    decider.apply_quality_preset("balanced")
    cfg = decider.config

    assert cfg.min_speech_duration_ms == base.min_speech_duration_ms + 30
    assert cfg.hybrid_score_threshold == base.hybrid_score_threshold + 0.03
    assert cfg.high_confidence_threshold == base.high_confidence_threshold + 0.03
    # Misfire window should remain unchanged for preset-only tuning
    assert cfg.misfire_rollback_ms == base.misfire_rollback_ms


def test_apply_quality_preset_smooth_adjusts_config_more() -> None:
    """Quality preset 'smooth' should be clearly more conservative than 'balanced'."""
    base = HybridVADConfig(
        min_speech_duration_ms=150,
        hybrid_score_threshold=0.75,
        high_confidence_threshold=0.8,
        misfire_rollback_ms=500,
    )
    decider = HybridVADDecider(config=base)

    decider.apply_quality_preset("smooth")
    cfg = decider.config

    assert cfg.min_speech_duration_ms == base.min_speech_duration_ms + 60
    assert cfg.hybrid_score_threshold == base.hybrid_score_threshold + 0.05
    assert cfg.high_confidence_threshold == base.high_confidence_threshold + 0.05
    assert cfg.misfire_rollback_ms == base.misfire_rollback_ms


def test_quality_preset_and_aec_quality_layer_composition() -> None:
    """
    Quality preset and AEC quality should compose rather than overwrite each other.

    Balanced + fair → base + 30ms (preset) + 50ms (AEC) and thresholds +0.03 +0.05.
    """
    base = HybridVADConfig(
        min_speech_duration_ms=150,
        hybrid_score_threshold=0.75,
        high_confidence_threshold=0.8,
        misfire_rollback_ms=500,
    )
    decider = HybridVADDecider(config=base)

    decider.apply_quality_preset("balanced")
    decider.apply_aec_quality("fair")
    cfg = decider.config

    assert cfg.min_speech_duration_ms == base.min_speech_duration_ms + 30 + 50
    assert cfg.hybrid_score_threshold == base.hybrid_score_threshold + 0.03 + 0.05
    assert cfg.high_confidence_threshold == base.high_confidence_threshold + 0.03 + 0.05
    # Misfire rollback only affected by AEC quality
    assert cfg.misfire_rollback_ms == base.misfire_rollback_ms + 100

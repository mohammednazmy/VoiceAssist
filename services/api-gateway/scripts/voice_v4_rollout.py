"""Voice Mode v4 Staged Rollout Configuration.

Phase 3 Deliverable: Feature flags staged deployment (10% → 50% → 100%)

This script manages the staged rollout of Voice Mode v4 features.
It provides commands to progress through rollout stages safely.

Rollout Stages:
  Stage 1 (10%): Initial beta testing with selected users
  Stage 2 (50%): Extended beta for broader validation
  Stage 3 (100%): General availability

Usage:
    python scripts/voice_v4_rollout.py status          # Show current rollout status
    python scripts/voice_v4_rollout.py stage1          # Enable 10% rollout
    python scripts/voice_v4_rollout.py stage2          # Enable 50% rollout
    python scripts/voice_v4_rollout.py stage3          # Enable 100% rollout (GA)
    python scripts/voice_v4_rollout.py rollback        # Disable all v4 features
    python scripts/voice_v4_rollout.py --feature vad stage2  # Single feature rollout

Reference: ~/.claude/plans/noble-bubbling-trinket.md (Phase 3)
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.logging import get_logger  # noqa: E402
from app.services.feature_flags import feature_flag_service  # noqa: E402

logger = get_logger(__name__)


# =============================================================================
# Voice Mode v4 Feature Groups
# =============================================================================


@dataclass
class RolloutStage:
    """Rollout stage configuration."""

    name: str
    percentage: int
    description: str


# Rollout stages
STAGES = {
    "stage1": RolloutStage(
        name="Beta (10%)",
        percentage=10,
        description="Initial beta testing with selected users",
    ),
    "stage2": RolloutStage(
        name="Extended Beta (50%)",
        percentage=50,
        description="Extended beta for broader validation",
    ),
    "stage3": RolloutStage(
        name="General Availability (100%)",
        percentage=100,
        description="Full production rollout",
    ),
    "rollback": RolloutStage(
        name="Rollback (0%)",
        percentage=0,
        description="Emergency rollback - all features disabled",
    ),
}


# Voice Mode v4 feature flags organized by priority
VOICE_V4_FLAGS = {
    # Core features (Phase 1 - Foundation)
    "core": [
        "backend.voice_v4_adaptive_vad",
        "backend.voice_v4_audio_processing",
        "backend.voice_v4_local_whisper",
        "backend.voice_v4_language_detection",
        "ui.voice_v4_voice_first_ui",
    ],
    # Integration features (Phase 2)
    "integration": [
        "backend.voice_v4_translation_fallback",
        "backend.voice_v4_multilingual_rag",
        "backend.voice_v4_phi_routing",
        "backend.voice_v4_unified_memory",
        "backend.voice_v4_tts_cache",
        "backend.voice_v4_fallback_orchestration",
        "backend.voice_v4_parallel_stt",
        "backend.voice_v4_unified_orchestration",
        "backend.voice_v4_code_switching",
        "ui.voice_v4_streaming_text",
        "ui.voice_v4_rtl_ui",
    ],
    # Polish features (Phase 3)
    "polish": [
        "backend.voice_v4_latency_budgets",
        "backend.voice_v4_thinking_tones",
        "backend.voice_v4_lexicon_service",
        "backend.voice_v4_rtl_support",
        "backend.voice_v4_fhir_streaming",
        "backend.voice_v4_speaker_diarization",
        "backend.voice_v4_adaptive_quality",
        "ui.voice_v4_latency_indicator",
        "ui.voice_v4_thinking_feedback_panel",
    ],
}

# All Voice v4 flags flattened
ALL_VOICE_V4_FLAGS = VOICE_V4_FLAGS["core"] + VOICE_V4_FLAGS["integration"] + VOICE_V4_FLAGS["polish"]


# =============================================================================
# Rollout Functions
# =============================================================================


async def get_rollout_status() -> Dict[str, Dict]:
    """Get current rollout status for all Voice v4 flags.

    Returns:
        Dictionary mapping flag names to their current status
    """
    status = {}

    for flag_name in ALL_VOICE_V4_FLAGS:
        flag = await feature_flag_service.get_flag(flag_name)
        if flag:
            status[flag_name] = {
                "enabled": flag.enabled,
                "rollout_percentage": getattr(flag, "rollout_percentage", 100),
                "description": flag.description,
                "updated_at": flag.updated_at.isoformat() if flag.updated_at else None,
            }
        else:
            status[flag_name] = {
                "enabled": False,
                "rollout_percentage": 0,
                "description": "Flag not found in database",
                "updated_at": None,
            }

    return status


async def set_rollout_stage(
    stage_key: str,
    feature_group: Optional[str] = None,
    specific_flag: Optional[str] = None,
) -> Dict[str, bool]:
    """Set rollout stage for Voice v4 features.

    Args:
        stage_key: Stage key (stage1, stage2, stage3, rollback)
        feature_group: Optional group to target (core, integration, polish)
        specific_flag: Optional specific flag to target

    Returns:
        Dictionary mapping flag names to success status
    """
    if stage_key not in STAGES:
        raise ValueError(f"Invalid stage: {stage_key}. Valid: {list(STAGES.keys())}")

    stage = STAGES[stage_key]
    results = {}

    # Determine which flags to update
    if specific_flag:
        flags_to_update = [specific_flag]
    elif feature_group and feature_group in VOICE_V4_FLAGS:
        flags_to_update = VOICE_V4_FLAGS[feature_group]
    else:
        flags_to_update = ALL_VOICE_V4_FLAGS

    logger.info(f"Setting rollout stage '{stage.name}' ({stage.percentage}%) " f"for {len(flags_to_update)} flags")

    for flag_name in flags_to_update:
        try:
            # Get current flag
            flag = await feature_flag_service.get_flag(flag_name)

            if not flag:
                logger.warning(f"Flag '{flag_name}' not found, skipping")
                results[flag_name] = False
                continue

            # Update flag
            enabled = stage.percentage > 0

            # Update flag with new rollout percentage
            updated = await feature_flag_service.update_flag(
                name=flag_name,
                enabled=enabled,
                metadata={
                    **(flag.flag_metadata or {}),
                    "rollout_percentage": stage.percentage,
                    "rollout_stage": stage_key,
                    "rollout_updated": datetime.now(timezone.utc).isoformat(),
                },
            )

            if updated:
                logger.info(f"  ✓ {flag_name}: enabled={enabled}, rollout={stage.percentage}%")
                results[flag_name] = True
            else:
                logger.error(f"  ✗ {flag_name}: update failed")
                results[flag_name] = False

        except Exception as e:
            logger.error(f"  ✗ {flag_name}: {e}")
            results[flag_name] = False

    return results


async def validate_prerequisites(stage_key: str) -> List[str]:
    """Validate prerequisites before changing rollout stage.

    Args:
        stage_key: Target stage key

    Returns:
        List of warning/error messages (empty if all checks pass)
    """
    warnings = []
    stage = STAGES[stage_key]

    # For stage2+, verify core features are working
    if stage.percentage >= 50:
        core_status = {}
        for flag_name in VOICE_V4_FLAGS["core"]:
            flag = await feature_flag_service.get_flag(flag_name)
            if flag:
                core_status[flag_name] = flag.enabled

        disabled_core = [k for k, v in core_status.items() if not v]
        if disabled_core:
            warnings.append(f"Warning: Core features not enabled: {', '.join(disabled_core)}")

    # For GA (100%), verify all integration features
    if stage.percentage >= 100:
        integration_status = {}
        for flag_name in VOICE_V4_FLAGS["integration"]:
            flag = await feature_flag_service.get_flag(flag_name)
            if flag:
                integration_status[flag_name] = flag.enabled

        disabled_integration = [k for k, v in integration_status.items() if not v]
        if disabled_integration:
            warnings.append(f"Warning: Integration features not enabled: " f"{', '.join(disabled_integration)}")

    return warnings


def print_status(status: Dict[str, Dict]) -> None:
    """Print formatted rollout status."""
    print("\n" + "=" * 70)
    print("Voice Mode v4 Rollout Status")
    print("=" * 70)

    # Group by category
    for group_name, flags in VOICE_V4_FLAGS.items():
        print(f"\n📦 {group_name.upper()} Features:")
        print("-" * 50)

        for flag_name in flags:
            if flag_name in status:
                info = status[flag_name]
                enabled = "✓" if info["enabled"] else "✗"
                pct = info.get("rollout_percentage", 0)
                print(f"  {enabled} {flag_name}")
                print(f"      Rollout: {pct}% | {info.get('description', 'N/A')[:40]}...")
            else:
                print(f"  ? {flag_name} (not found)")

    # Summary
    total = len(status)
    enabled = sum(1 for s in status.values() if s.get("enabled"))
    print(f"\n📊 Summary: {enabled}/{total} features enabled")
    print("=" * 70)


# =============================================================================
# CLI
# =============================================================================


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Voice Mode v4 Staged Rollout Configuration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s status                     # Show current rollout status
  %(prog)s stage1                     # Enable 10%% rollout (beta)
  %(prog)s stage2                     # Enable 50%% rollout (extended beta)
  %(prog)s stage3                     # Enable 100%% rollout (GA)
  %(prog)s rollback                   # Emergency rollback
  %(prog)s --group core stage2        # Rollout only core features
  %(prog)s --flag backend.voice_v4_adaptive_vad stage1  # Single flag
        """,
    )

    parser.add_argument(
        "command",
        choices=["status", "stage1", "stage2", "stage3", "rollback"],
        help="Rollout command to execute",
    )

    parser.add_argument(
        "--group",
        choices=["core", "integration", "polish"],
        help="Target specific feature group",
    )

    parser.add_argument(
        "--flag",
        type=str,
        help="Target specific flag name",
    )

    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip prerequisite validation",
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )

    args = parser.parse_args()

    if args.command == "status":
        # Show current status
        status = asyncio.run(get_rollout_status())
        print_status(status)
        return

    # Validate prerequisites
    if not args.skip_validation:
        warnings = asyncio.run(validate_prerequisites(args.command))
        if warnings:
            print("\n⚠️  Validation Warnings:")
            for warning in warnings:
                print(f"   {warning}")

            if not args.dry_run:
                confirm = input("\nProceed anyway? (yes/no): ")
                if confirm.lower() != "yes":
                    print("Aborted.")
                    sys.exit(0)

    # Show what would be done
    stage = STAGES[args.command]
    target = args.flag or args.group or "all features"

    print(f"\n🚀 Rolling out to: {stage.name}")
    print(f"   Target: {target}")
    print(f"   Rollout percentage: {stage.percentage}%")
    print(f"   Description: {stage.description}")

    if args.dry_run:
        print("\n🔍 DRY RUN - No changes made")

        # Show which flags would be updated
        if args.flag:
            flags = [args.flag]
        elif args.group:
            flags = VOICE_V4_FLAGS.get(args.group, [])
        else:
            flags = ALL_VOICE_V4_FLAGS

        print(f"\nFlags that would be updated ({len(flags)}):")
        for flag in flags:
            print(f"  - {flag}")

        sys.exit(0)

    # Execute rollout
    print("\nExecuting rollout...")
    results = asyncio.run(
        set_rollout_stage(
            args.command,
            feature_group=args.group,
            specific_flag=args.flag,
        )
    )

    # Print results
    success = sum(1 for v in results.values() if v)
    failed = sum(1 for v in results.values() if not v)

    print("\n" + "=" * 50)
    if failed == 0:
        print(f"✅ Rollout complete: {success} flags updated")
    else:
        print(f"⚠️  Rollout complete with errors:")
        print(f"   Success: {success}")
        print(f"   Failed: {failed}")

        # Show failed flags
        failed_flags = [k for k, v in results.items() if not v]
        print(f"\n   Failed flags: {', '.join(failed_flags)}")
    print("=" * 50)

    # Exit with error if any failures
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

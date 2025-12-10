"""Initialize default feature flags from shared definitions (Phase 7 Enhancement).

This script creates the default feature flags for the VoiceAssist system
using the shared definitions from app.core.flag_definitions.

Single source of truth: app/core/flag_definitions.py

Usage:
    python scripts/init_feature_flags.py
    python scripts/init_feature_flags.py --force  # Recreate all flags (dangerous!)
    python scripts/init_feature_flags.py --migrate  # Migrate legacy flag names
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Tuple

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.flag_definitions import LEGACY_FLAG_NAME_MAP, FlagType, get_all_flags  # noqa: E402
from app.core.logging import get_logger  # noqa: E402
from app.models.feature_flag import FeatureFlagType  # noqa: E402
from app.services.feature_flags import feature_flag_service  # noqa: E402

logger = get_logger(__name__)


def flag_type_to_model_type(flag_type: FlagType) -> FeatureFlagType:
    """Convert FlagType enum to FeatureFlagType model enum."""
    mapping = {
        FlagType.BOOLEAN: FeatureFlagType.BOOLEAN,
        FlagType.STRING: FeatureFlagType.STRING,
        FlagType.NUMBER: FeatureFlagType.NUMBER,
        FlagType.JSON: FeatureFlagType.JSON,
        FlagType.MULTIVARIATE: FeatureFlagType.JSON,  # Multivariate stored as JSON
    }
    return mapping.get(flag_type, FeatureFlagType.BOOLEAN)


async def init_feature_flags(force: bool = False) -> Tuple[int, int, int]:
    """Initialize feature flags from shared definitions.

    Args:
        force: If True, delete and recreate all flags (dangerous!)

    Returns:
        Tuple of (created_count, skipped_count, error_count)
    """
    logger.info("Starting feature flag initialization from shared definitions...")
    logger.info(f"Total flags defined: {len(get_all_flags())}")

    created_count = 0
    skipped_count = 0
    error_count = 0

    for flag_def in get_all_flags():
        try:
            # Check if flag already exists
            existing = await feature_flag_service.get_flag(flag_def.name)

            if existing:
                if force:
                    # Delete and recreate
                    logger.warning(f"Force mode: deleting existing flag '{flag_def.name}'")
                    await feature_flag_service.delete_flag(flag_def.name)
                else:
                    logger.info(f"Feature flag '{flag_def.name}' already exists, skipping")
                    skipped_count += 1
                    continue

            # Build metadata dict
            metadata = {
                "category": flag_def.category.value,
                "criticality": flag_def.metadata.criticality,
            }
            if flag_def.metadata.owner:
                metadata["owner"] = flag_def.metadata.owner
            if flag_def.metadata.docs_url:
                metadata["docs_url"] = flag_def.metadata.docs_url
            if flag_def.metadata.allowed_values:
                metadata["allowed_values"] = flag_def.metadata.allowed_values
            if flag_def.metadata.min_value is not None:
                metadata["min"] = flag_def.metadata.min_value
            if flag_def.metadata.max_value is not None:
                metadata["max"] = flag_def.metadata.max_value
            if flag_def.dependencies.services:
                metadata["services"] = flag_def.dependencies.services
            if flag_def.dependencies.components:
                metadata["components"] = flag_def.dependencies.components
            if flag_def.dependencies.other_flags:
                metadata["depends_on"] = flag_def.dependencies.other_flags

            # Determine value based on flag type
            value = None
            if flag_def.flag_type != FlagType.BOOLEAN:
                value = flag_def.default_value

            # Create flag
            flag = await feature_flag_service.create_flag(
                name=flag_def.name,
                description=flag_def.description,
                flag_type=flag_type_to_model_type(flag_def.flag_type),
                enabled=flag_def.default_enabled,
                value=value,
                default_value=flag_def.default_value,
                metadata=metadata,
            )

            if flag:
                logger.info(f"Created feature flag: {flag_def.name} ({flag_def.category.value})")
                created_count += 1
            else:
                logger.error(f"Failed to create feature flag: {flag_def.name}")
                error_count += 1

        except Exception as e:
            logger.error(
                f"Error creating feature flag '{flag_def.name}': {e}",
                exc_info=True,
            )
            error_count += 1

    logger.info(
        f"Feature flag initialization complete: "
        f"{created_count} created, {skipped_count} skipped, {error_count} errors"
    )

    return created_count, skipped_count, error_count


async def migrate_legacy_flags() -> Tuple[int, int, int]:
    """Migrate legacy flag names to new dot-based naming convention.

    This creates aliases in the database so old flag names still work
    while transitioning to the new naming convention.

    Returns:
        Tuple of (migrated_count, skipped_count, error_count)
    """
    logger.info("Starting legacy flag migration...")

    migrated_count = 0
    skipped_count = 0
    error_count = 0

    for old_name, new_name in LEGACY_FLAG_NAME_MAP.items():
        try:
            # Check if old flag exists
            old_flag = await feature_flag_service.get_flag(old_name)
            if not old_flag:
                skipped_count += 1
                continue

            # Check if new flag exists
            new_flag = await feature_flag_service.get_flag(new_name)
            if new_flag:
                logger.info(f"New flag '{new_name}' already exists, skipping migration of '{old_name}'")
                skipped_count += 1
                continue

            # Create new flag with same settings
            await feature_flag_service.create_flag(
                name=new_name,
                description=old_flag.description + f" (migrated from {old_name})",
                flag_type=FeatureFlagType(old_flag.flag_type),
                enabled=old_flag.enabled,
                value=old_flag.value,
                default_value=old_flag.default_value,
                metadata={
                    **(old_flag.flag_metadata or {}),
                    "migrated_from": old_name,
                },
            )

            # Mark old flag as deprecated
            await feature_flag_service.update_flag(
                name=old_name,
                metadata={
                    **(old_flag.flag_metadata or {}),
                    "deprecated": True,
                    "deprecated_message": f"Use '{new_name}' instead",
                    "migrated_to": new_name,
                },
            )

            logger.info(f"Migrated '{old_name}' -> '{new_name}'")
            migrated_count += 1

        except Exception as e:
            logger.error(f"Error migrating flag '{old_name}': {e}", exc_info=True)
            error_count += 1

    logger.info(
        f"Legacy flag migration complete: " f"{migrated_count} migrated, {skipped_count} skipped, {error_count} errors"
    )

    return migrated_count, skipped_count, error_count


def main():
    """Main entry point with CLI argument parsing."""
    parser = argparse.ArgumentParser(description="Initialize feature flags from shared definitions")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force recreate all flags (dangerous! deletes existing flags)",
    )
    parser.add_argument(
        "--migrate",
        action="store_true",
        help="Migrate legacy flag names to new format",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )

    args = parser.parse_args()

    if args.dry_run:
        print("\n🔍 DRY RUN MODE - No changes will be made\n")
        print("Feature flags that would be created:")
        for flag in get_all_flags():
            print(f"  - {flag.name} ({flag.category.value}): {flag.description[:50]}...")
        print(f"\nTotal: {len(get_all_flags())} flags")
        sys.exit(0)

    if args.force:
        print("\n⚠️  WARNING: Force mode will delete and recreate all flags!")
        confirm = input("Are you sure? (yes/no): ")
        if confirm.lower() != "yes":
            print("Aborted.")
            sys.exit(0)

    # Run initialization
    created, skipped, errors = asyncio.run(init_feature_flags(force=args.force))

    # Run migration if requested
    if args.migrate:
        migrated, m_skipped, m_errors = asyncio.run(migrate_legacy_flags())
        print(f"\n📦 Migration: {migrated} migrated, {m_skipped} skipped, {m_errors} errors")

    # Print summary
    print("\n" + "=" * 50)
    print("✅ Feature flag initialization complete!")
    print("=" * 50)
    print(f"   Created: {created}")
    print(f"   Skipped: {skipped}")
    print(f"   Errors:  {errors}")

    # Exit with error code if there were errors
    if errors > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()

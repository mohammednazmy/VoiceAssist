"""Variant Assignment Service for Feature Flags.

Handles consistent variant assignment for multivariate feature flags with:
- Hash bucket caching (Redis and per-request) to avoid repeated SHA-256 computations
- Scheduled variant percentage changes (gradual ramp-up)
- Targeting rule evaluation
- Consistent user-to-variant mapping

Usage:
    from app.services.variant_assignment import variant_assignment_service

    # Get variant for user
    variant = await variant_assignment_service.get_variant(
        flag_name="onboarding_flow",
        user_id="user-123",
        context={"country": "US", "tier": "premium"}
    )
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.database import redis_client
from app.core.logging import get_logger

logger = get_logger(__name__)

# Redis key prefixes
BUCKET_CACHE_PREFIX = "flag_bucket:"
FLAG_VARIANTS_VERSION_PREFIX = "flag_variants_version:"  # Version tracking per flag
SCHEDULED_CHANGES_PREFIX = "flag_scheduled_changes:"  # Scheduled changes per flag

# Configurable TTLs (can be overridden via environment)
BUCKET_CACHE_TTL = 3600  # 1 hour default (buckets are stable)
BUCKET_CACHE_TTL_ON_CHANGE = 300  # 5 minutes after variant change
SCHEDULED_CHANGES_TTL = 86400 * 7  # 7 days for scheduled changes

# Number of buckets for consistent hashing (0-9999)
BUCKET_COUNT = 10000


class FlagVariant:
    """Represents a variant in a multivariate feature flag."""

    def __init__(
        self,
        id: str,
        name: str,
        value: Any,
        weight: int,
        description: Optional[str] = None,
    ):
        self.id = id
        self.name = name
        self.value = value
        self.weight = max(0, weight)  # Ensure non-negative
        self.description = description

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FlagVariant":
        """Create variant from dictionary."""
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            value=data.get("value"),
            weight=data.get("weight", 0),
            description=data.get("description"),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "value": self.value,
            "weight": self.weight,
            "description": self.description,
        }


class RuleCondition:
    """Represents a condition in a targeting rule."""

    OPERATORS = {
        "equals": lambda a, b: a == b,
        "not_equals": lambda a, b: a != b,
        "contains": lambda a, b: b in str(a) if a else False,
        "not_contains": lambda a, b: b not in str(a) if a else True,
        "starts_with": lambda a, b: str(a).startswith(str(b)) if a else False,
        "ends_with": lambda a, b: str(a).endswith(str(b)) if a else False,
        "greater_than": lambda a, b: float(a) > float(b) if a is not None else False,
        "less_than": lambda a, b: float(a) < float(b) if a is not None else False,
        "greater_than_or_equal": lambda a, b: (float(a) >= float(b) if a is not None else False),
        "less_than_or_equal": lambda a, b: (float(a) <= float(b) if a is not None else False),
        "in_list": lambda a, b: a in b if isinstance(b, (list, tuple, set)) else a == b,
        "not_in_list": lambda a, b: (a not in b if isinstance(b, (list, tuple, set)) else a != b),
        "regex_match": lambda a, b: _regex_match(a, b),
        "semver_gt": lambda a, b: _semver_compare(a, b) > 0,
        "semver_lt": lambda a, b: _semver_compare(a, b) < 0,
        "semver_gte": lambda a, b: _semver_compare(a, b) >= 0,
        "semver_lte": lambda a, b: _semver_compare(a, b) <= 0,
        "semver_eq": lambda a, b: _semver_compare(a, b) == 0,
    }

    def __init__(self, attribute: str, operator: str, value: Any):
        self.attribute = attribute
        self.operator = operator
        self.value = value

    def evaluate(self, context: Dict[str, Any]) -> bool:
        """Evaluate the condition against the given context."""
        actual_value = context.get(self.attribute)
        op_func = self.OPERATORS.get(self.operator)

        if not op_func:
            logger.warning(f"Unknown operator: {self.operator}")
            return False

        try:
            return op_func(actual_value, self.value)
        except Exception as e:
            logger.warning(f"Error evaluating condition {self.attribute} {self.operator}: {e}")
            return False

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "RuleCondition":
        """Create condition from dictionary."""
        return cls(
            attribute=data.get("attribute", ""),
            operator=data.get("operator", "equals"),
            value=data.get("value"),
        )


class TargetingRule:
    """Represents a targeting rule for variant assignment."""

    def __init__(
        self,
        id: str,
        name: str,
        priority: int,
        conditions: List[RuleCondition],
        variant: Optional[str] = None,
        enabled: Optional[bool] = None,
        percentage: Optional[int] = None,
    ):
        self.id = id
        self.name = name
        self.priority = priority
        self.conditions = conditions
        self.variant = variant
        self.enabled = enabled
        self.percentage = percentage  # For partial rollout within rule

    def evaluate(self, context: Dict[str, Any]) -> bool:
        """Evaluate if all conditions match the context."""
        return all(cond.evaluate(context) for cond in self.conditions)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TargetingRule":
        """Create rule from dictionary."""
        conditions = [RuleCondition.from_dict(c) for c in data.get("conditions", [])]
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            priority=data.get("priority", 0),
            conditions=conditions,
            variant=data.get("variant"),
            enabled=data.get("enabled"),
            percentage=data.get("percentage"),
        )


class ScheduledChange:
    """Represents a scheduled change to variant weights.

    Supports timezone-aware scheduling with modification tracking.
    """

    def __init__(
        self,
        id: str,
        scheduled_at: datetime,
        changes: Dict[str, int],  # variant_id -> new_weight
        applied: bool = False,
        flag_name: Optional[str] = None,
        description: Optional[str] = None,
        created_at: Optional[datetime] = None,
        created_by: Optional[str] = None,
        modified_at: Optional[datetime] = None,
        modified_by: Optional[str] = None,
        timezone_id: str = "UTC",  # IANA timezone identifier
        cancelled: bool = False,
        cancelled_at: Optional[datetime] = None,
        cancelled_by: Optional[str] = None,
    ):
        self.id = id
        self.scheduled_at = scheduled_at
        self.changes = changes
        self.applied = applied
        self.flag_name = flag_name
        self.description = description
        self.created_at = created_at or datetime.now(timezone.utc)
        self.created_by = created_by
        self.modified_at = modified_at
        self.modified_by = modified_by
        self.timezone_id = timezone_id
        self.cancelled = cancelled
        self.cancelled_at = cancelled_at
        self.cancelled_by = cancelled_by

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ScheduledChange":
        """Create from dictionary."""
        scheduled_at = data.get("scheduled_at")
        if isinstance(scheduled_at, str):
            scheduled_at = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))

        created_at = data.get("created_at")
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))

        modified_at = data.get("modified_at")
        if isinstance(modified_at, str):
            modified_at = datetime.fromisoformat(modified_at.replace("Z", "+00:00"))

        cancelled_at = data.get("cancelled_at")
        if isinstance(cancelled_at, str):
            cancelled_at = datetime.fromisoformat(cancelled_at.replace("Z", "+00:00"))

        return cls(
            id=data.get("id", ""),
            scheduled_at=scheduled_at,
            changes=data.get("changes", {}),
            applied=data.get("applied", False),
            flag_name=data.get("flag_name"),
            description=data.get("description"),
            created_at=created_at,
            created_by=data.get("created_by"),
            modified_at=modified_at,
            modified_by=data.get("modified_by"),
            timezone_id=data.get("timezone_id", "UTC"),
            cancelled=data.get("cancelled", False),
            cancelled_at=cancelled_at,
            cancelled_by=data.get("cancelled_by"),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "scheduled_at": (self.scheduled_at.isoformat() if self.scheduled_at else None),
            "changes": self.changes,
            "applied": self.applied,
            "flag_name": self.flag_name,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "created_by": self.created_by,
            "modified_at": self.modified_at.isoformat() if self.modified_at else None,
            "modified_by": self.modified_by,
            "timezone_id": self.timezone_id,
            "cancelled": self.cancelled,
            "cancelled_at": (self.cancelled_at.isoformat() if self.cancelled_at else None),
            "cancelled_by": self.cancelled_by,
        }

    def is_due(self, current_time: Optional[datetime] = None) -> bool:
        """Check if this change is due for application.

        Args:
            current_time: Current time (defaults to now in UTC)

        Returns:
            True if the change should be applied now
        """
        if self.applied or self.cancelled:
            return False

        if current_time is None:
            current_time = datetime.now(timezone.utc)

        return self.scheduled_at <= current_time

    def preview(self, variants: List["FlagVariant"]) -> Dict[str, Any]:
        """Preview what this change would do to variants.

        Args:
            variants: Current variant list

        Returns:
            Dictionary showing before/after state
        """
        preview_data = {
            "scheduled_change_id": self.id,
            "scheduled_at": (self.scheduled_at.isoformat() if self.scheduled_at else None),
            "changes": [],
        }

        variant_map = {v.id: v for v in variants}
        for variant_id, new_weight in self.changes.items():
            current_weight = variant_map.get(variant_id, FlagVariant("", "", None, 0)).weight
            preview_data["changes"].append(
                {
                    "variant_id": variant_id,
                    "current_weight": current_weight,
                    "new_weight": new_weight,
                    "difference": new_weight - current_weight,
                }
            )

        return preview_data


class VariantAssignmentService:
    """Service for consistent variant assignment with caching and scheduling.

    Features:
    - Consistent hash-based bucket assignment (deterministic per user/flag)
    - Redis cache for hash buckets (avoid repeated SHA-256)
    - Per-request context cache for multi-flag evaluation
    - Targeting rule evaluation with priority ordering
    - Scheduled weight changes for gradual rollout
    - Weight normalization for variants
    """

    def __init__(self):
        self.logger = get_logger(__name__)
        # Per-request cache for hash buckets (cleared between requests)
        self._request_bucket_cache: Dict[str, int] = {}

    def clear_request_cache(self) -> None:
        """Clear per-request bucket cache. Call at start of each request."""
        self._request_bucket_cache.clear()

    def _compute_hash_bucket(self, user_id: str, flag_name: str, salt: Optional[str] = None) -> int:
        """Compute consistent hash bucket for user/flag combination.

        Uses SHA-256 for uniform distribution across 10000 buckets.

        Args:
            user_id: Unique user identifier
            flag_name: Feature flag name
            salt: Optional salt for additional randomization

        Returns:
            Bucket number (0-9999)
        """
        # Construct hash input
        hash_input = f"{user_id}:{flag_name}"
        if salt:
            hash_input = f"{hash_input}:{salt}"

        # Compute SHA-256 hash
        hash_bytes = hashlib.sha256(hash_input.encode()).digest()

        # Use first 4 bytes to get a number, then mod by bucket count
        hash_int = int.from_bytes(hash_bytes[:4], byteorder="big")
        return hash_int % BUCKET_COUNT

    async def get_bucket(
        self,
        user_id: str,
        flag_name: str,
        salt: Optional[str] = None,
        use_cache: bool = True,
    ) -> int:
        """Get hash bucket for user/flag with caching.

        Checks caches in order:
        1. Per-request cache (fastest, process-local)
        2. Redis cache (shared across instances)
        3. Compute and cache

        Args:
            user_id: Unique user identifier
            flag_name: Feature flag name
            salt: Optional salt
            use_cache: Whether to use caching

        Returns:
            Bucket number (0-9999)
        """
        cache_key = f"{user_id}:{flag_name}:{salt or ''}"

        # Check per-request cache first
        if use_cache and cache_key in self._request_bucket_cache:
            self.logger.debug(f"Request cache hit for bucket: {cache_key}")
            return self._request_bucket_cache[cache_key]

        # Check Redis cache
        if use_cache:
            try:
                redis_key = f"{BUCKET_CACHE_PREFIX}{cache_key}"
                cached = redis_client.get(redis_key)
                if cached is not None:
                    bucket = int(cached)
                    self._request_bucket_cache[cache_key] = bucket
                    self.logger.debug(f"Redis cache hit for bucket: {cache_key}")
                    return bucket
            except Exception as e:
                self.logger.warning(f"Redis bucket cache error: {e}")

        # Compute bucket
        bucket = self._compute_hash_bucket(user_id, flag_name, salt)

        # Cache in both levels
        if use_cache:
            self._request_bucket_cache[cache_key] = bucket
            try:
                redis_key = f"{BUCKET_CACHE_PREFIX}{cache_key}"
                redis_client.setex(redis_key, BUCKET_CACHE_TTL, str(bucket))
            except Exception as e:
                self.logger.warning(f"Failed to cache bucket in Redis: {e}")

        return bucket

    def normalize_weights(self, variants: List[FlagVariant]) -> List[Tuple[FlagVariant, int, int]]:
        """Normalize variant weights to bucket ranges.

        Converts weights to bucket ranges (0-9999). For example:
        - Variant A (weight 50) -> buckets 0-4999
        - Variant B (weight 30) -> buckets 5000-7999
        - Variant C (weight 20) -> buckets 8000-9999

        Args:
            variants: List of variants with weights

        Returns:
            List of (variant, start_bucket, end_bucket) tuples
        """
        total_weight = sum(v.weight for v in variants)
        if total_weight == 0:
            self.logger.warning("All variant weights are zero")
            return []

        ranges = []
        current_bucket = 0

        for variant in variants:
            if variant.weight <= 0:
                continue

            # Calculate bucket range for this variant
            bucket_share = int((variant.weight / total_weight) * BUCKET_COUNT)

            # Ensure at least 1 bucket if weight > 0
            bucket_share = max(1, bucket_share)

            start = current_bucket
            end = min(start + bucket_share - 1, BUCKET_COUNT - 1)

            ranges.append((variant, start, end))
            current_bucket = end + 1

            if current_bucket >= BUCKET_COUNT:
                break

        # Adjust last variant to cover remaining buckets (handles rounding)
        if ranges and ranges[-1][2] < BUCKET_COUNT - 1:
            last_variant, start, _ = ranges[-1]
            ranges[-1] = (last_variant, start, BUCKET_COUNT - 1)

        return ranges

    async def apply_scheduled_changes(
        self,
        variants: List[FlagVariant],
        scheduled_changes: List[ScheduledChange],
        current_time: Optional[datetime] = None,
        flag_name: Optional[str] = None,
    ) -> Tuple[List[FlagVariant], List[ScheduledChange], Dict[str, Any]]:
        """Apply scheduled weight changes that are due.

        Enhanced with timezone handling, duplicate detection, and detailed logging.

        Args:
            variants: Current variant list
            scheduled_changes: List of scheduled changes
            current_time: Current time (defaults to now in UTC)
            flag_name: Optional flag name for logging

        Returns:
            Tuple of (updated_variants, updated_scheduled_changes, apply_log)
            apply_log contains details about what was applied/skipped
        """
        if current_time is None:
            current_time = datetime.now(timezone.utc)

        # Ensure current_time is timezone-aware
        if current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=timezone.utc)

        # Create variant lookup
        variant_map = {v.id: v for v in variants}

        # Track what we did
        apply_log = {
            "applied": [],
            "skipped_already_applied": [],
            "skipped_cancelled": [],
            "skipped_future": [],
            "skipped_timezone_issue": [],
            "skipped_duplicate": [],
            "errors": [],
        }

        # Track applied change IDs to detect duplicates
        applied_change_ids = set()

        # Sort by scheduled_at to ensure consistent ordering
        sorted_changes = sorted(
            scheduled_changes,
            key=lambda s: s.scheduled_at.timestamp() if s.scheduled_at else 0,
        )

        # Apply due changes
        updated_schedules = []
        for schedule in sorted_changes:
            # Skip already applied
            if schedule.applied:
                apply_log["skipped_already_applied"].append(
                    {
                        "id": schedule.id,
                        "scheduled_at": (schedule.scheduled_at.isoformat() if schedule.scheduled_at else None),
                    }
                )
                updated_schedules.append(schedule)
                continue

            # Skip cancelled
            if schedule.cancelled:
                apply_log["skipped_cancelled"].append(
                    {
                        "id": schedule.id,
                        "cancelled_at": (schedule.cancelled_at.isoformat() if schedule.cancelled_at else None),
                        "cancelled_by": schedule.cancelled_by,
                    }
                )
                updated_schedules.append(schedule)
                continue

            # Detect duplicates (same ID applied in this batch)
            if schedule.id in applied_change_ids:
                self.logger.warning(
                    f"Skipping duplicate scheduled change: {schedule.id}",
                    extra={"flag_name": flag_name},
                )
                apply_log["skipped_duplicate"].append({"id": schedule.id})
                updated_schedules.append(schedule)
                continue

            # Handle timezone comparison
            try:
                scheduled_at = schedule.scheduled_at
                if scheduled_at.tzinfo is None:
                    # Assume UTC if no timezone
                    scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
                    self.logger.warning(
                        f"Scheduled change {schedule.id} has no timezone, assuming UTC",
                        extra={"flag_name": flag_name},
                    )
            except Exception as e:
                self.logger.error(
                    f"Timezone error for scheduled change {schedule.id}: {e}",
                    extra={"flag_name": flag_name},
                )
                apply_log["skipped_timezone_issue"].append(
                    {
                        "id": schedule.id,
                        "error": str(e),
                    }
                )
                updated_schedules.append(schedule)
                continue

            # Check if due
            if scheduled_at <= current_time:
                # Apply changes
                changes_applied = []
                for variant_id, new_weight in schedule.changes.items():
                    if variant_id in variant_map:
                        old_weight = variant_map[variant_id].weight
                        variant_map[variant_id].weight = max(0, new_weight)
                        changes_applied.append(
                            {
                                "variant_id": variant_id,
                                "old_weight": old_weight,
                                "new_weight": new_weight,
                            }
                        )
                        self.logger.info(
                            f"Applied scheduled weight change: {variant_id} {old_weight} -> {new_weight}",
                            extra={"flag_name": flag_name, "change_id": schedule.id},
                        )
                    else:
                        self.logger.warning(
                            f"Variant {variant_id} not found for scheduled change {schedule.id}",
                            extra={"flag_name": flag_name},
                        )
                        apply_log["errors"].append(
                            {
                                "id": schedule.id,
                                "error": f"Variant {variant_id} not found",
                            }
                        )

                # Mark as applied
                schedule.applied = True
                applied_change_ids.add(schedule.id)

                apply_log["applied"].append(
                    {
                        "id": schedule.id,
                        "scheduled_at": (schedule.scheduled_at.isoformat() if schedule.scheduled_at else None),
                        "changes": changes_applied,
                    }
                )
            else:
                # Not yet due
                apply_log["skipped_future"].append(
                    {
                        "id": schedule.id,
                        "scheduled_at": (schedule.scheduled_at.isoformat() if schedule.scheduled_at else None),
                        "seconds_until_due": (scheduled_at - current_time).total_seconds(),
                    }
                )

            updated_schedules.append(schedule)

        # Log summary
        if apply_log["applied"]:
            self.logger.info(
                f"Applied {len(apply_log['applied'])} scheduled changes for flag {flag_name}",
                extra={"applied_ids": [c["id"] for c in apply_log["applied"]]},
            )

        return list(variant_map.values()), updated_schedules, apply_log

    async def evaluate_targeting_rules(
        self,
        rules: List[TargetingRule],
        context: Dict[str, Any],
        user_id: str,
        flag_name: str,
        salt: Optional[str] = None,
    ) -> Optional[Tuple[Optional[str], Optional[bool]]]:
        """Evaluate targeting rules against context.

        Rules are evaluated in priority order (lower number = higher priority).
        First matching rule wins.

        Args:
            rules: List of targeting rules
            context: User context for evaluation
            user_id: User ID for percentage-based rules
            flag_name: Flag name for bucket calculation
            salt: Optional salt for bucket calculation

        Returns:
            Tuple of (variant_id, enabled) if rule matches, None if no match
        """
        # Sort by priority (ascending)
        sorted_rules = sorted(rules, key=lambda r: r.priority)

        for rule in sorted_rules:
            if rule.evaluate(context):
                # Check percentage if specified
                if rule.percentage is not None and rule.percentage < 100:
                    bucket = await self.get_bucket(user_id, f"{flag_name}:rule:{rule.id}", salt)
                    if bucket >= (rule.percentage * 100):  # Convert percentage to bucket threshold
                        continue  # User not in percentage

                self.logger.debug(f"Targeting rule matched: {rule.name}")
                return (rule.variant, rule.enabled)

        return None

    async def get_variant(
        self,
        flag_name: str,
        user_id: str,
        variants: List[FlagVariant],
        targeting_rules: Optional[List[TargetingRule]] = None,
        scheduled_changes: Optional[List[ScheduledChange]] = None,
        context: Optional[Dict[str, Any]] = None,
        salt: Optional[str] = None,
        default_variant: Optional[str] = None,
    ) -> Tuple[Optional[FlagVariant], Dict[str, Any]]:
        """Get variant assignment for a user.

        Assignment logic:
        1. Apply any due scheduled weight changes
        2. Evaluate targeting rules (if any match, use that variant)
        3. Fall back to weight-based bucket assignment

        Args:
            flag_name: Feature flag name
            user_id: Unique user identifier
            variants: List of available variants
            targeting_rules: Optional targeting rules
            scheduled_changes: Optional scheduled changes
            context: User context for targeting rules
            salt: Optional salt for bucket calculation
            default_variant: Default variant ID if assignment fails

        Returns:
            Tuple of (assigned_variant, metadata)
        """
        metadata = {
            "flag_name": flag_name,
            "user_id": user_id,
            "assignment_method": None,
            "bucket": None,
            "rule_matched": None,
        }

        if not variants:
            self.logger.warning(f"No variants for flag: {flag_name}")
            return None, metadata

        # Apply scheduled changes
        if scheduled_changes:
            variants, _, apply_log = await self.apply_scheduled_changes(
                variants, scheduled_changes, flag_name=flag_name
            )
            if apply_log.get("applied"):
                # Invalidate cache since variants changed
                await self.invalidate_bucket_cache_for_flag(flag_name)

        # Evaluate targeting rules first
        if targeting_rules and context:
            rule_result = await self.evaluate_targeting_rules(targeting_rules, context, user_id, flag_name, salt)
            if rule_result:
                variant_id, _ = rule_result
                if variant_id:
                    for variant in variants:
                        if variant.id == variant_id:
                            metadata["assignment_method"] = "targeting_rule"
                            return variant, metadata

        # Fall back to weight-based assignment
        bucket = await self.get_bucket(user_id, flag_name, salt)
        metadata["bucket"] = bucket
        metadata["assignment_method"] = "bucket"

        # Normalize weights and find matching variant
        ranges = self.normalize_weights(variants)
        for variant, start, end in ranges:
            if start <= bucket <= end:
                return variant, metadata

        # Fallback to default variant if specified
        if default_variant:
            for variant in variants:
                if variant.id == default_variant:
                    metadata["assignment_method"] = "default"
                    return variant, metadata

        # Last resort: return first variant
        if variants:
            metadata["assignment_method"] = "fallback"
            return variants[0], metadata

        return None, metadata

    async def is_user_in_rollout(
        self,
        flag_name: str,
        user_id: str,
        rollout_percentage: int,
        salt: Optional[str] = None,
    ) -> bool:
        """Check if user is included in a percentage rollout.

        Used for simple boolean flags with rollout_percentage.

        Args:
            flag_name: Feature flag name
            user_id: User identifier
            rollout_percentage: Percentage (0-100) of users to include
            salt: Optional salt for bucket calculation

        Returns:
            True if user is in rollout percentage
        """
        if rollout_percentage >= 100:
            return True
        if rollout_percentage <= 0:
            return False

        bucket = await self.get_bucket(user_id, flag_name, salt)
        threshold = rollout_percentage * 100  # Convert to bucket range (0-10000)
        return bucket < threshold

    # ========================================================================
    # Cache Invalidation Methods
    # ========================================================================

    async def invalidate_bucket_cache_for_flag(self, flag_name: str) -> int:
        """Invalidate all cached buckets for a specific flag.

        Called when variant definitions or weights change to ensure
        users get re-evaluated with new variant configuration.

        Args:
            flag_name: The flag whose buckets should be invalidated

        Returns:
            Number of cache entries invalidated
        """
        pattern = f"{BUCKET_CACHE_PREFIX}*:{flag_name}:*"
        invalidated = 0

        try:
            # Use SCAN to find all matching keys
            cursor = 0
            keys_to_delete = []

            while True:
                cursor, keys = redis_client.scan(cursor, match=pattern, count=100)
                keys_to_delete.extend(keys)
                if cursor == 0:
                    break

            # Delete all matching keys
            if keys_to_delete:
                invalidated = redis_client.delete(*keys_to_delete)
                self.logger.info(f"Invalidated {invalidated} bucket cache entries for flag: {flag_name}")

            # Also clear per-request cache for this flag
            keys_to_remove = [k for k in self._request_bucket_cache if f":{flag_name}:" in k]
            for k in keys_to_remove:
                del self._request_bucket_cache[k]

            # Increment flag variants version to signal change
            version_key = f"{FLAG_VARIANTS_VERSION_PREFIX}{flag_name}"
            redis_client.incr(version_key)

        except Exception as e:
            self.logger.warning(f"Failed to invalidate bucket cache for {flag_name}: {e}")

        return invalidated

    async def invalidate_bucket_cache_for_user(
        self,
        user_id: str,
        flag_name: Optional[str] = None,
    ) -> int:
        """Invalidate cached buckets for a specific user.

        Useful when a user's targeting context changes significantly
        or when testing flag behavior for a specific user.

        Args:
            user_id: The user whose buckets should be invalidated
            flag_name: Optional flag to limit invalidation to

        Returns:
            Number of cache entries invalidated
        """
        if flag_name:
            pattern = f"{BUCKET_CACHE_PREFIX}{user_id}:{flag_name}:*"
        else:
            pattern = f"{BUCKET_CACHE_PREFIX}{user_id}:*"

        invalidated = 0

        try:
            cursor = 0
            keys_to_delete = []

            while True:
                cursor, keys = redis_client.scan(cursor, match=pattern, count=100)
                keys_to_delete.extend(keys)
                if cursor == 0:
                    break

            if keys_to_delete:
                invalidated = redis_client.delete(*keys_to_delete)
                self.logger.info(f"Invalidated {invalidated} bucket cache entries for user: {user_id}")

            # Clear per-request cache
            if flag_name:
                keys_to_remove = [k for k in self._request_bucket_cache if k.startswith(f"{user_id}:{flag_name}:")]
            else:
                keys_to_remove = [k for k in self._request_bucket_cache if k.startswith(f"{user_id}:")]
            for k in keys_to_remove:
                del self._request_bucket_cache[k]

        except Exception as e:
            self.logger.warning(f"Failed to invalidate bucket cache for user {user_id}: {e}")

        return invalidated

    def get_flag_variants_version(self, flag_name: str) -> int:
        """Get the current variants version for a flag.

        Used to detect if cached bucket assignments are stale.

        Args:
            flag_name: The flag name

        Returns:
            Current version number (0 if not set)
        """
        try:
            version_key = f"{FLAG_VARIANTS_VERSION_PREFIX}{flag_name}"
            version = redis_client.get(version_key)
            return int(version) if version else 0
        except Exception:
            return 0

    # ========================================================================
    # Scheduled Changes Persistence
    # ========================================================================

    async def save_scheduled_change(
        self,
        flag_name: str,
        change: ScheduledChange,
    ) -> bool:
        """Persist a scheduled change to Redis.

        Args:
            flag_name: Flag name for this change
            change: The scheduled change to save

        Returns:
            True if saved successfully
        """
        try:
            key = f"{SCHEDULED_CHANGES_PREFIX}{flag_name}"
            change_data = change.to_dict()
            change_data["flag_name"] = flag_name

            # Use sorted set with scheduled_at as score for ordering
            score = change.scheduled_at.timestamp() if change.scheduled_at else 0
            redis_client.zadd(key, {json.dumps(change_data): score})
            redis_client.expire(key, SCHEDULED_CHANGES_TTL)

            self.logger.info(
                f"Saved scheduled change {change.id} for flag {flag_name}",
                extra={"scheduled_at": change.scheduled_at.isoformat()},
            )
            return True
        except Exception as e:
            self.logger.error(f"Failed to save scheduled change: {e}")
            return False

    async def get_scheduled_changes(
        self,
        flag_name: str,
        include_applied: bool = False,
        include_cancelled: bool = False,
    ) -> List[ScheduledChange]:
        """Get all scheduled changes for a flag.

        Args:
            flag_name: Flag name to get changes for
            include_applied: Include already-applied changes
            include_cancelled: Include cancelled changes

        Returns:
            List of scheduled changes sorted by scheduled_at
        """
        try:
            key = f"{SCHEDULED_CHANGES_PREFIX}{flag_name}"
            # Get all entries ordered by score (scheduled_at)
            entries = redis_client.zrange(key, 0, -1, withscores=True)

            changes = []
            for entry_json, _ in entries:
                try:
                    data = json.loads(entry_json)
                    change = ScheduledChange.from_dict(data)

                    # Filter based on flags
                    if not include_applied and change.applied:
                        continue
                    if not include_cancelled and change.cancelled:
                        continue

                    changes.append(change)
                except json.JSONDecodeError:
                    continue

            return changes
        except Exception as e:
            self.logger.warning(f"Failed to get scheduled changes for {flag_name}: {e}")
            return []

    async def cancel_scheduled_change(
        self,
        flag_name: str,
        change_id: str,
        cancelled_by: Optional[str] = None,
    ) -> bool:
        """Cancel a scheduled change.

        Args:
            flag_name: Flag name
            change_id: ID of the change to cancel
            cancelled_by: User who cancelled (for audit)

        Returns:
            True if cancelled successfully
        """
        try:
            key = f"{SCHEDULED_CHANGES_PREFIX}{flag_name}"
            entries = redis_client.zrange(key, 0, -1, withscores=True)

            for entry_json, score in entries:
                data = json.loads(entry_json)
                if data.get("id") == change_id:
                    # Remove old entry
                    redis_client.zrem(key, entry_json)

                    # Update and re-add with cancelled flag
                    data["cancelled"] = True
                    data["cancelled_at"] = datetime.now(timezone.utc).isoformat()
                    data["cancelled_by"] = cancelled_by

                    redis_client.zadd(key, {json.dumps(data): score})

                    self.logger.info(
                        f"Cancelled scheduled change {change_id} for flag {flag_name}",
                        extra={"cancelled_by": cancelled_by},
                    )
                    return True

            self.logger.warning(f"Scheduled change {change_id} not found for flag {flag_name}")
            return False
        except Exception as e:
            self.logger.error(f"Failed to cancel scheduled change: {e}")
            return False

    async def delete_scheduled_change(
        self,
        flag_name: str,
        change_id: str,
    ) -> bool:
        """Permanently delete a scheduled change.

        Args:
            flag_name: Flag name
            change_id: ID of the change to delete

        Returns:
            True if deleted successfully
        """
        try:
            key = f"{SCHEDULED_CHANGES_PREFIX}{flag_name}"
            entries = redis_client.zrange(key, 0, -1)

            for entry_json in entries:
                data = json.loads(entry_json)
                if data.get("id") == change_id:
                    redis_client.zrem(key, entry_json)
                    self.logger.info(f"Deleted scheduled change {change_id}")
                    return True

            return False
        except Exception as e:
            self.logger.error(f"Failed to delete scheduled change: {e}")
            return False

    async def get_all_pending_scheduled_changes(
        self,
    ) -> Dict[str, List[ScheduledChange]]:
        """Get all pending scheduled changes across all flags.

        Returns:
            Dictionary of flag_name -> list of pending changes
        """
        try:
            pattern = f"{SCHEDULED_CHANGES_PREFIX}*"
            all_changes: Dict[str, List[ScheduledChange]] = {}

            cursor = 0
            while True:
                cursor, keys = redis_client.scan(cursor, match=pattern, count=100)
                for key in keys:
                    flag_name = key.replace(SCHEDULED_CHANGES_PREFIX, "")
                    changes = await self.get_scheduled_changes(flag_name)
                    if changes:
                        all_changes[flag_name] = changes
                if cursor == 0:
                    break

            return all_changes
        except Exception as e:
            self.logger.warning(f"Failed to get all pending scheduled changes: {e}")
            return {}


# Helper functions for condition operators


def _regex_match(value: Any, pattern: str) -> bool:
    """Match value against regex pattern."""
    import re

    if value is None:
        return False
    try:
        return bool(re.search(pattern, str(value)))
    except re.error:
        return False


def _semver_compare(a: str, b: str) -> int:
    """Compare two semantic versions.

    Returns:
        -1 if a < b, 0 if a == b, 1 if a > b
    """
    try:
        from packaging.version import Version

        va = Version(str(a) if a else "0.0.0")
        vb = Version(str(b) if b else "0.0.0")

        if va < vb:
            return -1
        elif va > vb:
            return 1
        return 0
    except Exception:
        # Fallback to string comparison
        if str(a) < str(b):
            return -1
        elif str(a) > str(b):
            return 1
        return 0


# Global singleton instance
variant_assignment_service = VariantAssignmentService()

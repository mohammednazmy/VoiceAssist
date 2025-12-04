"""Feature Flag Rule Engine (Phase 3.2).

Evaluates targeting rules to determine which users should see which flag variants.
Supports user attribute matching, percentage rollouts, and variant assignment.

Usage:
    from app.services.rule_engine import RuleEngine, UserContext

    engine = RuleEngine()
    user_ctx = UserContext(user_id="user-123", user_role="admin")

    # Evaluate a flag for a user
    result = engine.evaluate(flag, user_ctx)
    if result.matched:
        variant = result.variant
        value = result.value
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ============================================================================
# Type Definitions
# ============================================================================


class Operator(str, Enum):
    """Supported operators for targeting conditions."""

    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    IN = "in"
    NOT_IN = "not_in"
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    REGEX = "regex"
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"
    SEMVER_GT = "semver_gt"
    SEMVER_GTE = "semver_gte"
    SEMVER_LT = "semver_lt"
    SEMVER_LTE = "semver_lte"


@dataclass
class UserContext:
    """User context for evaluating targeting rules.

    Attributes:
        user_id: User's unique identifier
        user_email: User's email address
        user_role: User's role (admin, physician, staff, patient)
        user_created_at: Account creation timestamp
        user_plan: Subscription plan
        user_country: ISO 3166-1 alpha-2 country code
        user_language: Preferred language code
        app_version: Application version string
        platform: Platform (web, ios, android)
        custom_attributes: Additional custom attributes
    """

    user_id: Optional[str] = None
    user_email: Optional[str] = None
    user_role: Optional[str] = None
    user_created_at: Optional[str] = None
    user_plan: Optional[str] = None
    user_country: Optional[str] = None
    user_language: Optional[str] = None
    app_version: Optional[str] = None
    platform: Optional[str] = None
    custom_attributes: Dict[str, Any] = field(default_factory=dict)

    def get_attribute(self, attribute: str, custom_key: Optional[str] = None) -> Any:
        """Get an attribute value from the context.

        Args:
            attribute: Attribute name (user_id, user_role, etc.)
            custom_key: Key for custom attributes

        Returns:
            Attribute value or None if not found
        """
        if attribute == "custom" and custom_key:
            return self.custom_attributes.get(custom_key)

        # Map attribute names to context fields
        attr_map = {
            "user_id": self.user_id,
            "user_email": self.user_email,
            "user_role": self.user_role,
            "user_created_at": self.user_created_at,
            "user_plan": self.user_plan,
            "user_country": self.user_country,
            "user_language": self.user_language,
            "app_version": self.app_version,
            "platform": self.platform,
        }

        return attr_map.get(attribute)


@dataclass
class TargetingCondition:
    """A single targeting rule condition."""

    attribute: str
    operator: str
    value: Any
    custom_attribute_key: Optional[str] = None


@dataclass
class TargetingRule:
    """A targeting rule with conditions and outcome."""

    id: str
    name: str
    priority: int
    conditions: List[TargetingCondition]
    variant: Optional[str] = None
    enabled: Optional[bool] = None
    value: Optional[Any] = None
    description: Optional[str] = None


@dataclass
class Variant:
    """A flag variant definition."""

    id: str
    name: str
    value: Any
    weight: int
    description: Optional[str] = None


@dataclass
class EvaluationResult:
    """Result of evaluating a flag for a user."""

    matched: bool
    variant: Optional[str] = None
    value: Optional[Any] = None
    enabled: Optional[bool] = None
    matched_rule_id: Optional[str] = None
    matched_rule_name: Optional[str] = None
    reason: str = "default"


# ============================================================================
# Rule Engine Implementation
# ============================================================================


class RuleEngine:
    """Evaluates targeting rules for feature flags.

    The engine processes rules in priority order, evaluating conditions
    against user context to determine which variant/value to serve.
    """

    def evaluate_condition(
        self,
        condition: TargetingCondition,
        user_ctx: UserContext,
    ) -> bool:
        """Evaluate a single condition against user context.

        Args:
            condition: The condition to evaluate
            user_ctx: User context with attributes

        Returns:
            True if condition matches, False otherwise
        """
        user_value = user_ctx.get_attribute(
            condition.attribute,
            condition.custom_attribute_key,
        )

        if user_value is None:
            # No value means condition doesn't match
            # Exception: not_in and not_equals can match if value is None
            if condition.operator in (Operator.NOT_IN.value, Operator.NOT_EQUALS.value):
                return True
            return False

        target_value = condition.value
        operator = condition.operator

        try:
            return self._apply_operator(operator, user_value, target_value)
        except Exception as e:
            logger.warning(
                "condition_evaluation_error",
                attribute=condition.attribute,
                operator=operator,
                error=str(e),
            )
            return False

    def _apply_operator(
        self,
        operator: str,
        user_value: Any,
        target_value: Any,
    ) -> bool:
        """Apply an operator to compare values.

        Args:
            operator: The operator to apply
            user_value: User's attribute value
            target_value: Target value from the condition

        Returns:
            True if comparison succeeds
        """
        # String comparison operators
        if operator == Operator.EQUALS.value:
            return str(user_value).lower() == str(target_value).lower()

        if operator == Operator.NOT_EQUALS.value:
            return str(user_value).lower() != str(target_value).lower()

        if operator == Operator.IN.value:
            if isinstance(target_value, list):
                return str(user_value).lower() in [str(v).lower() for v in target_value]
            return str(user_value).lower() == str(target_value).lower()

        if operator == Operator.NOT_IN.value:
            if isinstance(target_value, list):
                return str(user_value).lower() not in [str(v).lower() for v in target_value]
            return str(user_value).lower() != str(target_value).lower()

        if operator == Operator.CONTAINS.value:
            return str(target_value).lower() in str(user_value).lower()

        if operator == Operator.STARTS_WITH.value:
            return str(user_value).lower().startswith(str(target_value).lower())

        if operator == Operator.ENDS_WITH.value:
            return str(user_value).lower().endswith(str(target_value).lower())

        if operator == Operator.REGEX.value:
            try:
                pattern = re.compile(str(target_value), re.IGNORECASE)
                return bool(pattern.search(str(user_value)))
            except re.error:
                return False

        # Numeric comparison operators
        if operator in (Operator.GT.value, Operator.GTE.value, Operator.LT.value, Operator.LTE.value):
            try:
                user_num = float(user_value)
                target_num = float(target_value)

                if operator == Operator.GT.value:
                    return user_num > target_num
                if operator == Operator.GTE.value:
                    return user_num >= target_num
                if operator == Operator.LT.value:
                    return user_num < target_num
                if operator == Operator.LTE.value:
                    return user_num <= target_num
            except (TypeError, ValueError):
                return False

        # Semantic version operators
        if operator.startswith("semver_"):
            return self._compare_semver(operator, str(user_value), str(target_value))

        return False

    def _compare_semver(self, operator: str, user_version: str, target_version: str) -> bool:
        """Compare semantic versions.

        Args:
            operator: Semver comparison operator
            user_version: User's version string
            target_version: Target version string

        Returns:
            True if comparison succeeds
        """
        try:
            user_parts = self._parse_semver(user_version)
            target_parts = self._parse_semver(target_version)

            if user_parts is None or target_parts is None:
                return False

            comparison = self._compare_version_tuples(user_parts, target_parts)

            if operator == Operator.SEMVER_GT.value:
                return comparison > 0
            if operator == Operator.SEMVER_GTE.value:
                return comparison >= 0
            if operator == Operator.SEMVER_LT.value:
                return comparison < 0
            if operator == Operator.SEMVER_LTE.value:
                return comparison <= 0

        except Exception:
            return False

        return False

    def _parse_semver(self, version: str) -> Optional[tuple]:
        """Parse a semantic version string into components.

        Args:
            version: Version string (e.g., "1.2.3", "2.0.0-beta")

        Returns:
            Tuple of (major, minor, patch) or None if invalid
        """
        # Remove any prefix like 'v'
        version = version.lstrip("vV")

        # Remove prerelease/metadata suffix
        version = version.split("-")[0].split("+")[0]

        parts = version.split(".")
        if len(parts) < 2:
            return None

        try:
            major = int(parts[0])
            minor = int(parts[1])
            patch = int(parts[2]) if len(parts) > 2 else 0
            return (major, minor, patch)
        except ValueError:
            return None

    def _compare_version_tuples(self, v1: tuple, v2: tuple) -> int:
        """Compare two version tuples.

        Returns:
            -1 if v1 < v2, 0 if equal, 1 if v1 > v2
        """
        for a, b in zip(v1, v2):
            if a < b:
                return -1
            if a > b:
                return 1
        return 0

    def evaluate_rule(
        self,
        rule: TargetingRule,
        user_ctx: UserContext,
    ) -> bool:
        """Evaluate a targeting rule against user context.

        All conditions must match (AND logic).

        Args:
            rule: The targeting rule to evaluate
            user_ctx: User context with attributes

        Returns:
            True if all conditions match
        """
        if not rule.conditions:
            # Empty conditions means rule always matches
            return True

        for condition in rule.conditions:
            if not self.evaluate_condition(condition, user_ctx):
                return False

        return True

    def evaluate_targeting_rules(
        self,
        rules_config: Dict[str, Any],
        user_ctx: UserContext,
        flag_type: str = "boolean",
    ) -> EvaluationResult:
        """Evaluate all targeting rules for a flag.

        Args:
            rules_config: Targeting rules configuration from flag
            user_ctx: User context with attributes
            flag_type: Type of flag (boolean, multivariate, etc.)

        Returns:
            EvaluationResult with matched variant/value
        """
        if not rules_config or "rules" not in rules_config:
            return EvaluationResult(
                matched=False,
                reason="no_rules",
            )

        rules = rules_config.get("rules", [])

        # Parse and sort rules by priority
        parsed_rules = []
        for rule_dict in rules:
            conditions = [
                TargetingCondition(
                    attribute=c.get("attribute", ""),
                    operator=c.get("operator", "equals"),
                    value=c.get("value"),
                    custom_attribute_key=c.get("customAttributeKey"),
                )
                for c in rule_dict.get("conditions", [])
            ]
            parsed_rules.append(
                TargetingRule(
                    id=rule_dict.get("id", ""),
                    name=rule_dict.get("name", ""),
                    priority=rule_dict.get("priority", 999),
                    conditions=conditions,
                    variant=rule_dict.get("variant"),
                    enabled=rule_dict.get("enabled"),
                    value=rule_dict.get("value"),
                    description=rule_dict.get("description"),
                )
            )

        # Sort by priority (lower = higher priority)
        parsed_rules.sort(key=lambda r: r.priority)

        # Evaluate rules in order
        for rule in parsed_rules:
            if self.evaluate_rule(rule, user_ctx):
                return EvaluationResult(
                    matched=True,
                    variant=rule.variant,
                    enabled=rule.enabled,
                    value=rule.value,
                    matched_rule_id=rule.id,
                    matched_rule_name=rule.name,
                    reason="rule_matched",
                )

        # No rules matched, return default
        return EvaluationResult(
            matched=False,
            variant=rules_config.get("defaultVariant"),
            enabled=rules_config.get("defaultEnabled"),
            reason="no_match",
        )

    def select_variant(
        self,
        variants: List[Dict[str, Any]],
        user_id: str,
        flag_name: str,
        salt: Optional[str] = None,
    ) -> Optional[Variant]:
        """Select a variant for a user using consistent hashing.

        The same user will always get the same variant for a given flag,
        ensuring consistency across sessions.

        Args:
            variants: List of variant definitions
            user_id: User's unique identifier
            flag_name: Name of the flag (used in hash)
            salt: Optional salt for hash (defaults to flag_name)

        Returns:
            Selected Variant or None if no variants
        """
        if not variants:
            return None

        # Parse variants
        parsed_variants = [
            Variant(
                id=v.get("id", ""),
                name=v.get("name", ""),
                value=v.get("value"),
                weight=v.get("weight", 0),
                description=v.get("description"),
            )
            for v in variants
        ]

        # Calculate total weight
        total_weight = sum(v.weight for v in parsed_variants)
        if total_weight == 0:
            # Equal distribution if no weights
            total_weight = len(parsed_variants) * 100
            for v in parsed_variants:
                v.weight = 100

        # Generate consistent hash bucket (0-99)
        bucket = self._get_bucket(user_id, flag_name, salt)

        # Map bucket to percentage of total weight
        bucket_percentage = bucket * total_weight / 100

        # Find which variant this bucket falls into
        cumulative_weight = 0
        for variant in parsed_variants:
            cumulative_weight += variant.weight
            if bucket_percentage < cumulative_weight:
                return variant

        # Fallback to last variant
        return parsed_variants[-1] if parsed_variants else None

    def _get_bucket(self, user_id: str, flag_name: str, salt: Optional[str] = None) -> int:
        """Calculate a consistent bucket (0-99) for user/flag combination.

        Args:
            user_id: User's unique identifier
            flag_name: Name of the flag
            salt: Optional salt value

        Returns:
            Bucket number 0-99
        """
        hash_input = f"{user_id}:{flag_name}:{salt or flag_name}"
        hash_bytes = hashlib.sha256(hash_input.encode()).digest()
        # Use first 4 bytes as unsigned int, mod 100 for bucket
        hash_int = int.from_bytes(hash_bytes[:4], byteorder="big", signed=False)
        return hash_int % 100

    def is_in_rollout(
        self,
        user_id: str,
        flag_name: str,
        rollout_percentage: int,
        salt: Optional[str] = None,
    ) -> bool:
        """Check if a user is within the rollout percentage.

        Args:
            user_id: User's unique identifier
            flag_name: Name of the flag
            rollout_percentage: Percentage of users to include (0-100)
            salt: Optional salt for hash

        Returns:
            True if user is in rollout
        """
        if rollout_percentage >= 100:
            return True
        if rollout_percentage <= 0:
            return False

        bucket = self._get_bucket(user_id, flag_name, salt)
        return bucket < rollout_percentage


# Singleton instance
rule_engine = RuleEngine()

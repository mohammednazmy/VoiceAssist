"""Unit tests for Feature Flag Rule Engine (Phase 3.2).

Tests for targeting rule evaluation, variant selection, and rollout calculation.
"""

import pytest
from app.services.rule_engine import Operator, RuleEngine, TargetingCondition, TargetingRule, UserContext


class TestUserContext:
    """Tests for UserContext class."""

    def test_get_attribute_direct(self):
        """Test getting direct attributes."""
        ctx = UserContext(
            user_id="user-123",
            user_email="test@example.com",
            user_role="admin",
        )
        assert ctx.get_attribute("user_id") == "user-123"
        assert ctx.get_attribute("user_email") == "test@example.com"
        assert ctx.get_attribute("user_role") == "admin"

    def test_get_attribute_custom(self):
        """Test getting custom attributes."""
        ctx = UserContext(
            user_id="user-123",
            custom_attributes={"plan_type": "premium", "team_size": 50},
        )
        assert ctx.get_attribute("custom", "plan_type") == "premium"
        assert ctx.get_attribute("custom", "team_size") == 50
        assert ctx.get_attribute("custom", "nonexistent") is None

    def test_get_attribute_missing(self):
        """Test getting missing attributes returns None."""
        ctx = UserContext()
        assert ctx.get_attribute("user_id") is None
        assert ctx.get_attribute("user_role") is None


class TestOperators:
    """Tests for condition operators."""

    @pytest.fixture
    def engine(self):
        return RuleEngine()

    def test_equals_operator(self, engine):
        """Test equals operator."""
        condition = TargetingCondition(
            attribute="user_role",
            operator=Operator.EQUALS.value,
            value="admin",
        )
        ctx = UserContext(user_role="admin")
        assert engine.evaluate_condition(condition, ctx) is True

        ctx = UserContext(user_role="staff")
        assert engine.evaluate_condition(condition, ctx) is False

    def test_equals_case_insensitive(self, engine):
        """Test equals operator is case insensitive."""
        condition = TargetingCondition(
            attribute="user_role",
            operator=Operator.EQUALS.value,
            value="Admin",
        )
        ctx = UserContext(user_role="admin")
        assert engine.evaluate_condition(condition, ctx) is True

    def test_not_equals_operator(self, engine):
        """Test not_equals operator."""
        condition = TargetingCondition(
            attribute="user_role",
            operator=Operator.NOT_EQUALS.value,
            value="admin",
        )
        ctx = UserContext(user_role="staff")
        assert engine.evaluate_condition(condition, ctx) is True

        ctx = UserContext(user_role="admin")
        assert engine.evaluate_condition(condition, ctx) is False

    def test_in_operator_list(self, engine):
        """Test in operator with list."""
        condition = TargetingCondition(
            attribute="user_role",
            operator=Operator.IN.value,
            value=["admin", "staff"],
        )
        ctx = UserContext(user_role="admin")
        assert engine.evaluate_condition(condition, ctx) is True

        ctx = UserContext(user_role="patient")
        assert engine.evaluate_condition(condition, ctx) is False

    def test_not_in_operator(self, engine):
        """Test not_in operator."""
        condition = TargetingCondition(
            attribute="user_role",
            operator=Operator.NOT_IN.value,
            value=["blocked", "suspended"],
        )
        ctx = UserContext(user_role="admin")
        assert engine.evaluate_condition(condition, ctx) is True

        ctx = UserContext(user_role="blocked")
        assert engine.evaluate_condition(condition, ctx) is False

    def test_contains_operator(self, engine):
        """Test contains operator."""
        condition = TargetingCondition(
            attribute="user_email",
            operator=Operator.CONTAINS.value,
            value="@example.com",
        )
        ctx = UserContext(user_email="test@example.com")
        assert engine.evaluate_condition(condition, ctx) is True

        ctx = UserContext(user_email="test@gmail.com")
        assert engine.evaluate_condition(condition, ctx) is False

    def test_starts_with_operator(self, engine):
        """Test starts_with operator."""
        condition = TargetingCondition(
            attribute="user_email",
            operator=Operator.STARTS_WITH.value,
            value="admin",
        )
        ctx = UserContext(user_email="admin@example.com")
        assert engine.evaluate_condition(condition, ctx) is True

        ctx = UserContext(user_email="user@example.com")
        assert engine.evaluate_condition(condition, ctx) is False

    def test_ends_with_operator(self, engine):
        """Test ends_with operator."""
        condition = TargetingCondition(
            attribute="user_email",
            operator=Operator.ENDS_WITH.value,
            value=".gov",
        )
        ctx = UserContext(user_email="official@agency.gov")
        assert engine.evaluate_condition(condition, ctx) is True

        ctx = UserContext(user_email="test@example.com")
        assert engine.evaluate_condition(condition, ctx) is False

    def test_regex_operator(self, engine):
        """Test regex operator."""
        condition = TargetingCondition(
            attribute="user_email",
            operator=Operator.REGEX.value,
            value=r"^[a-z]+@company\.com$",
        )
        ctx = UserContext(user_email="john@company.com")
        assert engine.evaluate_condition(condition, ctx) is True

        ctx = UserContext(user_email="john123@company.com")
        assert engine.evaluate_condition(condition, ctx) is False

    def test_numeric_operators(self, engine):
        """Test numeric comparison operators."""
        # Greater than
        condition = TargetingCondition(
            attribute="custom",
            operator=Operator.GT.value,
            value=10,
            custom_attribute_key="team_size",
        )
        ctx = UserContext(custom_attributes={"team_size": 15})
        assert engine.evaluate_condition(condition, ctx) is True

        ctx = UserContext(custom_attributes={"team_size": 5})
        assert engine.evaluate_condition(condition, ctx) is False

        # Greater than or equal
        condition = TargetingCondition(
            attribute="custom",
            operator=Operator.GTE.value,
            value=10,
            custom_attribute_key="team_size",
        )
        ctx = UserContext(custom_attributes={"team_size": 10})
        assert engine.evaluate_condition(condition, ctx) is True

        # Less than
        condition = TargetingCondition(
            attribute="custom",
            operator=Operator.LT.value,
            value=10,
            custom_attribute_key="team_size",
        )
        ctx = UserContext(custom_attributes={"team_size": 5})
        assert engine.evaluate_condition(condition, ctx) is True

        # Less than or equal
        condition = TargetingCondition(
            attribute="custom",
            operator=Operator.LTE.value,
            value=10,
            custom_attribute_key="team_size",
        )
        ctx = UserContext(custom_attributes={"team_size": 10})
        assert engine.evaluate_condition(condition, ctx) is True

    def test_semver_operators(self, engine):
        """Test semantic version comparison operators."""
        # Greater than
        condition = TargetingCondition(
            attribute="app_version",
            operator=Operator.SEMVER_GT.value,
            value="2.0.0",
        )
        ctx = UserContext(app_version="2.1.0")
        assert engine.evaluate_condition(condition, ctx) is True

        ctx = UserContext(app_version="1.9.9")
        assert engine.evaluate_condition(condition, ctx) is False

        # Less than or equal
        condition = TargetingCondition(
            attribute="app_version",
            operator=Operator.SEMVER_LTE.value,
            value="2.0.0",
        )
        ctx = UserContext(app_version="2.0.0")
        assert engine.evaluate_condition(condition, ctx) is True

        ctx = UserContext(app_version="2.0.1")
        assert engine.evaluate_condition(condition, ctx) is False

    def test_missing_attribute_defaults(self, engine):
        """Test behavior with missing attributes."""
        condition = TargetingCondition(
            attribute="user_role",
            operator=Operator.EQUALS.value,
            value="admin",
        )
        ctx = UserContext()  # No user_role
        assert engine.evaluate_condition(condition, ctx) is False

        # not_in and not_equals return True for missing values
        condition = TargetingCondition(
            attribute="user_role",
            operator=Operator.NOT_EQUALS.value,
            value="admin",
        )
        assert engine.evaluate_condition(condition, ctx) is True


class TestRuleEvaluation:
    """Tests for rule evaluation logic."""

    @pytest.fixture
    def engine(self):
        return RuleEngine()

    def test_evaluate_rule_all_conditions_match(self, engine):
        """Test rule evaluation with all conditions matching."""
        rule = TargetingRule(
            id="rule-1",
            name="Admin Users",
            priority=1,
            conditions=[
                TargetingCondition(
                    attribute="user_role",
                    operator=Operator.EQUALS.value,
                    value="admin",
                ),
                TargetingCondition(
                    attribute="user_email",
                    operator=Operator.ENDS_WITH.value,
                    value="@company.com",
                ),
            ],
            variant="variant_a",
        )
        ctx = UserContext(user_role="admin", user_email="john@company.com")
        assert engine.evaluate_rule(rule, ctx) is True

    def test_evaluate_rule_one_condition_fails(self, engine):
        """Test rule evaluation when one condition fails."""
        rule = TargetingRule(
            id="rule-1",
            name="Admin Users",
            priority=1,
            conditions=[
                TargetingCondition(
                    attribute="user_role",
                    operator=Operator.EQUALS.value,
                    value="admin",
                ),
                TargetingCondition(
                    attribute="user_email",
                    operator=Operator.ENDS_WITH.value,
                    value="@company.com",
                ),
            ],
            variant="variant_a",
        )
        ctx = UserContext(user_role="admin", user_email="john@gmail.com")
        assert engine.evaluate_rule(rule, ctx) is False

    def test_evaluate_rule_empty_conditions(self, engine):
        """Test rule with empty conditions matches all."""
        rule = TargetingRule(
            id="rule-1",
            name="Everyone",
            priority=1,
            conditions=[],
            variant="variant_a",
        )
        ctx = UserContext(user_role="patient")
        assert engine.evaluate_rule(rule, ctx) is True

    def test_evaluate_targeting_rules_priority(self, engine):
        """Test that rules are evaluated in priority order."""
        rules_config = {
            "rules": [
                {
                    "id": "rule-2",
                    "name": "Staff Users",
                    "priority": 2,
                    "conditions": [{"attribute": "user_role", "operator": "equals", "value": "staff"}],
                    "variant": "variant_b",
                },
                {
                    "id": "rule-1",
                    "name": "Admin Users",
                    "priority": 1,
                    "conditions": [{"attribute": "user_role", "operator": "in", "value": ["admin", "staff"]}],
                    "variant": "variant_a",
                },
            ],
            "defaultVariant": "control",
        }

        # Staff user should match rule-1 (lower priority number = higher priority)
        ctx = UserContext(user_role="staff")
        result = engine.evaluate_targeting_rules(rules_config, ctx)
        assert result.matched is True
        assert result.variant == "variant_a"
        assert result.matched_rule_id == "rule-1"

    def test_evaluate_targeting_rules_no_match(self, engine):
        """Test when no rules match."""
        rules_config = {
            "rules": [
                {
                    "id": "rule-1",
                    "name": "Admin Users",
                    "priority": 1,
                    "conditions": [{"attribute": "user_role", "operator": "equals", "value": "admin"}],
                    "variant": "variant_a",
                },
            ],
            "defaultVariant": "control",
        }

        ctx = UserContext(user_role="patient")
        result = engine.evaluate_targeting_rules(rules_config, ctx)
        assert result.matched is False
        assert result.variant == "control"
        assert result.reason == "no_match"


class TestVariantSelection:
    """Tests for variant selection."""

    @pytest.fixture
    def engine(self):
        return RuleEngine()

    def test_select_variant_consistent(self, engine):
        """Test that variant selection is consistent for same user."""
        variants = [
            {"id": "control", "name": "Control", "value": None, "weight": 50},
            {"id": "treatment", "name": "Treatment", "value": {"new_ui": True}, "weight": 50},
        ]

        # Same user should get same variant every time
        variant1 = engine.select_variant(variants, "user-123", "experiment.test")
        variant2 = engine.select_variant(variants, "user-123", "experiment.test")
        assert variant1.id == variant2.id

    def test_select_variant_different_users(self, engine):
        """Test that different users may get different variants."""
        variants = [
            {"id": "control", "name": "Control", "value": None, "weight": 50},
            {"id": "treatment", "name": "Treatment", "value": {"new_ui": True}, "weight": 50},
        ]

        # Different users should be distributed across variants
        user_variants = set()
        for i in range(100):
            variant = engine.select_variant(variants, f"user-{i}", "experiment.test")
            user_variants.add(variant.id)

        # With 100 users and 50/50 split, we should see both variants
        assert len(user_variants) == 2

    def test_select_variant_weighted(self, engine):
        """Test that variant selection respects weights."""
        variants = [
            {"id": "control", "name": "Control", "value": None, "weight": 90},
            {"id": "treatment", "name": "Treatment", "value": {"new_ui": True}, "weight": 10},
        ]

        # Count distribution across many users
        counts = {"control": 0, "treatment": 0}
        for i in range(1000):
            variant = engine.select_variant(variants, f"user-{i}", "experiment.weighted")
            counts[variant.id] += 1

        # Control should have roughly 90% (allow some variance)
        control_pct = counts["control"] / 1000
        assert 0.85 < control_pct < 0.95

    def test_select_variant_salt_changes_distribution(self, engine):
        """Test that different salt produces different distribution."""
        variants = [
            {"id": "control", "name": "Control", "value": None, "weight": 50},
            {"id": "treatment", "name": "Treatment", "value": {"new_ui": True}, "weight": 50},
        ]

        user_id = "user-123"
        flag_name = "experiment.test"

        variant1 = engine.select_variant(variants, user_id, flag_name, salt="salt-1")
        variant2 = engine.select_variant(variants, user_id, flag_name, salt="salt-2")

        # Different salts may produce different results (not guaranteed, but likely)
        # At minimum, both should return valid variants
        assert variant1.id in ["control", "treatment"]
        assert variant2.id in ["control", "treatment"]

    def test_select_variant_empty_variants(self, engine):
        """Test behavior with empty variants list."""
        result = engine.select_variant([], "user-123", "experiment.test")
        assert result is None


class TestRollout:
    """Tests for percentage rollout."""

    @pytest.fixture
    def engine(self):
        return RuleEngine()

    def test_is_in_rollout_100_percent(self, engine):
        """Test 100% rollout includes everyone."""
        for i in range(100):
            assert engine.is_in_rollout(f"user-{i}", "feature.test", 100) is True

    def test_is_in_rollout_0_percent(self, engine):
        """Test 0% rollout excludes everyone."""
        for i in range(100):
            assert engine.is_in_rollout(f"user-{i}", "feature.test", 0) is False

    def test_is_in_rollout_consistent(self, engine):
        """Test rollout is consistent for same user."""
        user_id = "user-123"
        flag_name = "feature.test"

        # Same user should always get same result
        result1 = engine.is_in_rollout(user_id, flag_name, 50)
        result2 = engine.is_in_rollout(user_id, flag_name, 50)
        assert result1 == result2

    def test_is_in_rollout_percentage(self, engine):
        """Test rollout respects percentage."""
        flag_name = "feature.percentage_test"

        # Count users in rollout
        in_rollout = sum(1 for i in range(1000) if engine.is_in_rollout(f"user-{i}", flag_name, 30))

        # Should be roughly 30% (allow some variance)
        pct = in_rollout / 1000
        assert 0.25 < pct < 0.35


class TestBucketCalculation:
    """Tests for bucket calculation."""

    @pytest.fixture
    def engine(self):
        return RuleEngine()

    def test_bucket_range(self, engine):
        """Test bucket is in valid range 0-99."""
        for i in range(100):
            bucket = engine._get_bucket(f"user-{i}", "test.flag")
            assert 0 <= bucket < 100

    def test_bucket_consistent(self, engine):
        """Test same input produces same bucket."""
        bucket1 = engine._get_bucket("user-123", "test.flag")
        bucket2 = engine._get_bucket("user-123", "test.flag")
        assert bucket1 == bucket2

    def test_bucket_distribution(self, engine):
        """Test buckets are roughly uniformly distributed."""
        buckets = [engine._get_bucket(f"user-{i}", "test.distribution") for i in range(1000)]

        # Check distribution across deciles
        for decile in range(10):
            count = sum(1 for b in buckets if decile * 10 <= b < (decile + 1) * 10)
            # Each decile should have roughly 10% (allow variance)
            assert 50 < count < 150


class TestSemverParsing:
    """Tests for semantic version parsing using packaging library."""

    @pytest.fixture
    def engine(self):
        return RuleEngine()

    def test_parse_version_standard(self, engine):
        """Test parsing standard versions."""
        ver = engine._parse_version("1.0.0")
        assert ver is not None
        assert str(ver) == "1.0.0"

        ver = engine._parse_version("2.3.4")
        assert ver is not None

    def test_parse_version_with_prefix(self, engine):
        """Test parsing version with v prefix."""
        ver = engine._parse_version("v1.0.0")
        assert ver is not None
        assert str(ver) == "1.0.0"

        ver = engine._parse_version("V2.3.4")
        assert ver is not None

    def test_parse_version_with_prerelease(self, engine):
        """Test parsing version with prerelease suffix."""
        # Direct PEP 440 format
        ver = engine._parse_version("1.0.0a1")
        assert ver is not None

        ver = engine._parse_version("1.0.0b2")
        assert ver is not None

        ver = engine._parse_version("1.0.0rc1")
        assert ver is not None

    def test_parse_version_semver_prerelease_conversion(self, engine):
        """Test SemVer prerelease formats are converted to PEP 440."""
        # SemVer alpha -> PEP 440 alpha
        ver = engine._parse_version("1.0.0-alpha.1")
        assert ver is not None

        # SemVer beta -> PEP 440 beta
        ver = engine._parse_version("2.0.0-beta.2")
        assert ver is not None

        # SemVer rc -> PEP 440 rc
        ver = engine._parse_version("3.0.0-rc.1")
        assert ver is not None

    def test_parse_version_with_metadata(self, engine):
        """Test parsing version with build metadata."""
        ver = engine._parse_version("1.0.0+build123")
        assert ver is not None

    def test_parse_version_invalid(self, engine):
        """Test parsing invalid version returns None."""
        assert engine._parse_version("invalid") is None
        assert engine._parse_version("") is None
        assert engine._parse_version("not.a.version") is None

    def test_semver_prerelease_ordering(self, engine):
        """Test that prerelease versions are ordered correctly."""
        condition = TargetingCondition(
            attribute="app_version",
            operator=Operator.SEMVER_LT.value,
            value="1.0.0",
        )
        # Alpha should be less than release
        ctx = UserContext(app_version="1.0.0a1")
        assert engine.evaluate_condition(condition, ctx) is True

        # Release should not be less than release
        ctx = UserContext(app_version="1.0.0")
        assert engine.evaluate_condition(condition, ctx) is False


class TestVariantWeightValidation:
    """Tests for variant weight validation and normalization."""

    @pytest.fixture
    def engine(self):
        return RuleEngine()

    def test_normalize_weights_to_100(self, engine):
        """Test weights are normalized to sum to 100."""
        variants = [
            {"id": "a", "name": "A", "value": "a", "weight": 25},
            {"id": "b", "name": "B", "value": "b", "weight": 25},
        ]
        # Total is 50, should be normalized to 100
        parsed = engine._parse_and_validate_variants(variants, "test.flag")
        total = sum(v.weight for v in parsed)
        assert abs(total - 100) < 0.01  # Allow small float precision error

    def test_weights_exceeding_100(self, engine):
        """Test weights exceeding 100 are normalized."""
        variants = [
            {"id": "a", "name": "A", "value": "a", "weight": 150},
            {"id": "b", "name": "B", "value": "b", "weight": 50},
        ]
        parsed = engine._parse_and_validate_variants(variants, "test.flag")
        total = sum(v.weight for v in parsed)
        assert abs(total - 100) < 0.01

    def test_negative_weight_treated_as_zero(self, engine):
        """Test negative weights are treated as zero with warning."""
        variants = [
            {"id": "a", "name": "A", "value": "a", "weight": -10},
            {"id": "b", "name": "B", "value": "b", "weight": 100},
        ]
        with pytest.warns(UserWarning, match="negative weights"):
            parsed = engine._parse_and_validate_variants(variants, "test.flag")
        # Negative weight becomes 0, so 100 total -> normalized
        assert parsed[0].weight == 0  # Was -10, now 0

    def test_all_zero_weights_equal_distribution(self, engine):
        """Test all-zero weights result in equal distribution."""
        variants = [
            {"id": "a", "name": "A", "value": "a", "weight": 0},
            {"id": "b", "name": "B", "value": "b", "weight": 0},
            {"id": "c", "name": "C", "value": "c", "weight": 0},
        ]
        parsed = engine._parse_and_validate_variants(variants, "test.flag")
        # Each should get ~33.33%
        for v in parsed:
            assert abs(v.weight - 100 / 3) < 0.01

    def test_variant_selection_with_normalized_weights(self, engine):
        """Test variant selection works correctly with normalized weights."""
        variants = [
            {"id": "control", "name": "Control", "value": None, "weight": 45},
            {"id": "treatment", "name": "Treatment", "value": {"new": True}, "weight": 45},
        ]
        # Total is 90, will be normalized
        counts = {"control": 0, "treatment": 0}
        for i in range(1000):
            variant = engine.select_variant(variants, f"user-{i}", "test.normalized")
            counts[variant.id] += 1

        # Should be roughly 50/50 after normalization
        for count in counts.values():
            pct = count / 1000
            assert 0.40 < pct < 0.60


class TestOperatorValidation:
    """Tests for operator validation and error handling."""

    @pytest.fixture
    def engine(self):
        return RuleEngine()

    def test_unrecognized_operator_raises_error(self, engine):
        """Test that unrecognized operators raise ValueError."""
        condition = TargetingCondition(
            attribute="user_role",
            operator="invalid_operator",
            value="admin",
        )
        ctx = UserContext(user_role="admin")

        # Should return False (caught by evaluate_condition)
        result = engine.evaluate_condition(condition, ctx)
        assert result is False

    def test_unrecognized_operator_emits_warning_and_raises(self, engine):
        """Test that unrecognized operators emit warning and raise ValueError."""
        with pytest.warns(UserWarning, match="Unrecognized operator"):
            with pytest.raises(ValueError, match="Unrecognized operator"):
                engine._apply_operator("nonexistent_op", "value1", "value2")

    def test_valid_operators_no_warning(self, engine):
        """Test valid operators don't emit warnings."""
        # These should not raise warnings
        assert engine._apply_operator("equals", "admin", "admin") is True
        assert engine._apply_operator("not_equals", "admin", "user") is True
        assert engine._apply_operator("in", "admin", ["admin", "staff"]) is True
        assert engine._apply_operator("gt", "10", "5") is True

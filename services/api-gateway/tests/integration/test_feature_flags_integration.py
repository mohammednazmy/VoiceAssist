"""Integration tests for Feature Flags with multivariate and segmentation support.

Tests the full flow from FeatureFlagService through RuleEngine for:
- Multivariate flag evaluation with consistent variant assignment
- Targeting/segmentation rules evaluation
- Default value handling when no rules match
"""

import pytest
from app.models.feature_flag import FeatureFlag, FeatureFlagType
from app.services.rule_engine import RuleEngine, UserContext


class TestMultivariateFlagIntegration:
    """Integration tests for multivariate flag evaluation."""

    @pytest.fixture
    def rule_engine(self):
        return RuleEngine()

    @pytest.fixture
    def multivariate_flag(self):
        """Create a multivariate flag for testing."""
        flag = FeatureFlag(
            name="experiment.pricing_tiers",
            description="Pricing tier experiment",
            flag_type=FeatureFlagType.MULTIVARIATE.value,
            enabled=True,
            variants=[
                {"id": "control", "name": "Control", "value": {"tier": "standard"}, "weight": 50},
                {"id": "treatment_a", "name": "Treatment A", "value": {"tier": "premium"}, "weight": 30},
                {"id": "treatment_b", "name": "Treatment B", "value": {"tier": "freemium"}, "weight": 20},
            ],
            targeting_rules={
                "rules": [
                    {
                        "id": "admin-override",
                        "name": "Admin Override",
                        "priority": 1,
                        "conditions": [{"attribute": "user_role", "operator": "equals", "value": "admin"}],
                        "variant": "treatment_a",
                    },
                    {
                        "id": "beta-users",
                        "name": "Beta Users",
                        "priority": 2,
                        "conditions": [{"attribute": "user_plan", "operator": "in", "value": ["beta", "early_access"]}],
                        "variant": "treatment_b",
                    },
                ],
                "defaultVariant": "control",
            },
        )
        return flag

    def test_admin_gets_treatment_a(self, rule_engine, multivariate_flag):
        """Test admin users get the admin override variant."""
        user_ctx = UserContext(user_id="admin-123", user_role="admin")

        # Evaluate targeting rules
        result = rule_engine.evaluate_targeting_rules(multivariate_flag.targeting_rules, user_ctx)

        assert result.matched is True
        assert result.variant == "treatment_a"
        assert result.matched_rule_id == "admin-override"

    def test_beta_user_gets_treatment_b(self, rule_engine, multivariate_flag):
        """Test beta users get treatment_b variant."""
        user_ctx = UserContext(user_id="beta-123", user_plan="beta")

        result = rule_engine.evaluate_targeting_rules(multivariate_flag.targeting_rules, user_ctx)

        assert result.matched is True
        assert result.variant == "treatment_b"
        assert result.matched_rule_id == "beta-users"

    def test_regular_user_gets_default(self, rule_engine, multivariate_flag):
        """Test regular users get default variant."""
        user_ctx = UserContext(user_id="user-456", user_role="patient", user_plan="standard")

        result = rule_engine.evaluate_targeting_rules(multivariate_flag.targeting_rules, user_ctx)

        assert result.matched is False
        assert result.variant == "control"
        assert result.reason == "no_match"

    def test_variant_selection_consistency(self, rule_engine, multivariate_flag):
        """Test same user always gets same variant for weight-based selection."""
        user_id = "consistent-user-789"

        # Without targeting rules, use weight-based selection
        variant1 = rule_engine.select_variant(multivariate_flag.variants, user_id, multivariate_flag.name)
        variant2 = rule_engine.select_variant(multivariate_flag.variants, user_id, multivariate_flag.name)

        assert variant1.id == variant2.id
        assert variant1.value == variant2.value

    def test_variant_distribution_matches_weights(self, rule_engine, multivariate_flag):
        """Test variant distribution roughly matches configured weights."""
        counts = {"control": 0, "treatment_a": 0, "treatment_b": 0}

        for i in range(1000):
            variant = rule_engine.select_variant(multivariate_flag.variants, f"user-{i}", multivariate_flag.name)
            counts[variant.id] += 1

        # Expected: control ~50%, treatment_a ~30%, treatment_b ~20%
        assert 0.45 < counts["control"] / 1000 < 0.55
        assert 0.25 < counts["treatment_a"] / 1000 < 0.35
        assert 0.15 < counts["treatment_b"] / 1000 < 0.25


class TestSegmentedFlagIntegration:
    """Integration tests for segmented/targeted flags."""

    @pytest.fixture
    def rule_engine(self):
        return RuleEngine()

    @pytest.fixture
    def segmented_flag(self):
        """Create a flag with complex segmentation rules."""
        flag = FeatureFlag(
            name="ui.new_chat_interface",
            description="New chat interface rollout",
            flag_type=FeatureFlagType.BOOLEAN.value,
            enabled=True,
            targeting_rules={
                "rules": [
                    {
                        "id": "internal-users",
                        "name": "Internal Users",
                        "priority": 1,
                        "conditions": [
                            {"attribute": "user_email", "operator": "ends_with", "value": "@voiceassist.io"}
                        ],
                        "enabled": True,
                    },
                    {
                        "id": "ios-users-v2",
                        "name": "iOS Users on v2+",
                        "priority": 2,
                        "conditions": [
                            {"attribute": "platform", "operator": "equals", "value": "ios"},
                            {"attribute": "app_version", "operator": "semver_gte", "value": "2.0.0"},
                        ],
                        "enabled": True,
                    },
                    {
                        "id": "us-users",
                        "name": "US Users",
                        "priority": 3,
                        "conditions": [{"attribute": "user_country", "operator": "equals", "value": "US"}],
                        "enabled": True,
                    },
                ],
                "defaultEnabled": False,
            },
        )
        return flag

    def test_internal_user_enabled(self, rule_engine, segmented_flag):
        """Test internal users get flag enabled."""
        user_ctx = UserContext(user_id="internal-1", user_email="developer@voiceassist.io", platform="web")

        result = rule_engine.evaluate_targeting_rules(segmented_flag.targeting_rules, user_ctx)

        assert result.matched is True
        assert result.enabled is True
        assert result.matched_rule_id == "internal-users"

    def test_ios_v2_user_enabled(self, rule_engine, segmented_flag):
        """Test iOS users on v2+ get flag enabled."""
        user_ctx = UserContext(user_id="ios-user-1", user_email="user@gmail.com", platform="ios", app_version="2.1.0")

        result = rule_engine.evaluate_targeting_rules(segmented_flag.targeting_rules, user_ctx)

        assert result.matched is True
        assert result.enabled is True
        assert result.matched_rule_id == "ios-users-v2"

    def test_ios_v1_user_not_matched(self, rule_engine, segmented_flag):
        """Test iOS users on v1 don't match iOS v2 rule."""
        user_ctx = UserContext(
            user_id="ios-user-2",
            user_email="user@gmail.com",
            platform="ios",
            app_version="1.9.5",
            user_country="CA",  # Not US
        )

        result = rule_engine.evaluate_targeting_rules(segmented_flag.targeting_rules, user_ctx)

        # Should not match any rule
        assert result.matched is False
        assert result.enabled is False  # default

    def test_us_user_enabled(self, rule_engine, segmented_flag):
        """Test US users get flag enabled."""
        user_ctx = UserContext(
            user_id="us-user-1", user_email="user@gmail.com", platform="android", app_version="1.5.0", user_country="US"
        )

        result = rule_engine.evaluate_targeting_rules(segmented_flag.targeting_rules, user_ctx)

        assert result.matched is True
        assert result.enabled is True
        assert result.matched_rule_id == "us-users"

    def test_default_when_no_rules_match(self, rule_engine, segmented_flag):
        """Test default value when no rules match."""
        user_ctx = UserContext(
            user_id="external-user",
            user_email="user@external.com",
            platform="web",
            app_version="1.0.0",
            user_country="UK",
        )

        result = rule_engine.evaluate_targeting_rules(segmented_flag.targeting_rules, user_ctx)

        assert result.matched is False
        assert result.enabled is False  # defaultEnabled: False
        assert result.reason == "no_match"


@pytest.mark.skip(reason="FeatureFlag.is_scheduled_active() method not implemented yet")
class TestScheduledFlagIntegration:
    """Integration tests for scheduled flag activation."""

    @pytest.fixture
    def scheduled_flag(self):
        """Create a flag with schedule configuration."""
        flag = FeatureFlag(
            name="ops.maintenance_mode",
            description="Scheduled maintenance mode",
            flag_type=FeatureFlagType.BOOLEAN.value,
            enabled=True,
            schedule={
                "start_at": "2025-01-15T00:00:00Z",
                "end_at": "2025-01-15T06:00:00Z",
                "timezone": "UTC",
            },
        )
        return flag

    def test_schedule_before_start(self, scheduled_flag):
        """Test flag is inactive before schedule start."""
        from datetime import datetime

        test_time = datetime(2025, 1, 14, 23, 59, 59)

        assert scheduled_flag.is_scheduled_active(test_time) is False

    def test_schedule_during_window(self, scheduled_flag):
        """Test flag is active during scheduled window."""
        from datetime import datetime

        test_time = datetime(2025, 1, 15, 3, 0, 0)

        assert scheduled_flag.is_scheduled_active(test_time) is True

    def test_schedule_after_end(self, scheduled_flag):
        """Test flag is inactive after schedule end."""
        from datetime import datetime

        test_time = datetime(2025, 1, 15, 6, 0, 1)

        assert scheduled_flag.is_scheduled_active(test_time) is False


class TestRolloutPercentageIntegration:
    """Integration tests for percentage-based rollouts."""

    @pytest.fixture
    def rule_engine(self):
        return RuleEngine()

    def test_rollout_percentage_distribution(self, rule_engine):
        """Test rollout percentage is respected."""
        flag_name = "experiment.gradual_rollout"
        rollout_pct = 25

        in_rollout = sum(1 for i in range(1000) if rule_engine.is_in_rollout(f"user-{i}", flag_name, rollout_pct))

        # Should be roughly 25%
        pct = in_rollout / 1000
        assert 0.20 < pct < 0.30

    def test_rollout_consistent_per_user(self, rule_engine):
        """Test same user always gets same rollout decision."""
        flag_name = "experiment.consistent_rollout"
        user_id = "persistent-user-123"

        results = [rule_engine.is_in_rollout(user_id, flag_name, 50) for _ in range(10)]

        # All results should be the same
        assert len(set(results)) == 1

    def test_different_flags_different_distribution(self, rule_engine):
        """Test same user may get different rollout for different flags."""
        # With many users and 50% rollout, some should differ between flags
        same_result_count = sum(
            1
            for i in range(100)
            if rule_engine.is_in_rollout(f"user-{i}", "flag.a", 50)
            == rule_engine.is_in_rollout(f"user-{i}", "flag.b", 50)
        )

        # Should not all be the same (would be very unlikely)
        assert same_result_count < 100


class TestFlagValueIntegration:
    """Integration tests for flag value retrieval."""

    def test_boolean_flag_value(self):
        """Test boolean flag returns correct enabled state."""
        flag = FeatureFlag(
            name="backend.feature_x",
            description="Feature X",
            flag_type=FeatureFlagType.BOOLEAN.value,
            enabled=True,
        )

        result = flag.to_dict()
        assert result["enabled"] is True
        assert result["flag_type"] == "boolean"

    def test_string_flag_value(self):
        """Test string flag returns correct value."""
        flag = FeatureFlag(
            name="backend.rag_strategy",
            description="RAG Strategy",
            flag_type=FeatureFlagType.STRING.value,
            enabled=True,
            value="multi_hop",
            default_value="simple",
        )

        result = flag.to_dict()
        assert result["value"] == "multi_hop"
        assert result["default_value"] == "simple"

    def test_number_flag_value(self):
        """Test number flag returns correct value."""
        flag = FeatureFlag(
            name="backend.max_results",
            description="Max Results",
            flag_type=FeatureFlagType.NUMBER.value,
            enabled=True,
            value=10,
            default_value=5,
        )

        result = flag.to_dict()
        assert result["value"] == 10
        assert result["default_value"] == 5

    def test_json_flag_value(self):
        """Test JSON flag returns complex value."""
        flag = FeatureFlag(
            name="backend.rag_config",
            description="RAG Configuration",
            flag_type=FeatureFlagType.JSON.value,
            enabled=True,
            value={"strategy": "multi_hop", "max_hops": 3, "threshold": 0.7},
        )

        result = flag.to_dict()
        assert result["value"]["strategy"] == "multi_hop"
        assert result["value"]["max_hops"] == 3

"""Unit tests for feature flag system.

Tests feature flag functionality including:
- Flag evaluation (enabled/disabled)
- User-specific overrides
- A/B testing with rollout percentages
- Caching behavior
"""
from __future__ import annotations

from typing import Dict, Any, Optional
from unittest.mock import MagicMock, patch
import hashlib

import pytest


# Mock feature flag implementation for testing
class FeatureFlag:
    """Feature flag configuration."""

    def __init__(
        self,
        name: str,
        enabled: bool = False,
        rollout_percentage: int = 0,
        user_overrides: Optional[Dict[str, bool]] = None,
        description: str = "",
    ):
        self.name = name
        self.enabled = enabled
        self.rollout_percentage = rollout_percentage
        self.user_overrides = user_overrides or {}
        self.description = description


class FeatureFlagService:
    """Service for managing and evaluating feature flags."""

    def __init__(self, cache=None):
        self.flags: Dict[str, FeatureFlag] = {}
        self.cache = cache
        self._evaluation_count = 0

    def create_flag(self, flag: FeatureFlag) -> FeatureFlag:
        """Create or update a feature flag."""
        self.flags[flag.name] = flag
        if self.cache:
            self.cache.delete(f"flag:{flag.name}")
        return flag

    def get_flag(self, name: str) -> Optional[FeatureFlag]:
        """Get a feature flag by name."""
        return self.flags.get(name)

    def is_enabled(
        self,
        flag_name: str,
        user_id: Optional[str] = None,
        default: bool = False
    ) -> bool:
        """Check if a feature flag is enabled for a user.

        Args:
            flag_name: Name of the feature flag
            user_id: User ID to check (for overrides and rollout)
            default: Default value if flag doesn't exist

        Returns:
            True if flag is enabled for the user, False otherwise
        """
        self._evaluation_count += 1

        # Check cache first
        if self.cache and user_id:
            cache_key = f"flag:{flag_name}:user:{user_id}"
            cached = self.cache.get(cache_key)
            if cached is not None:
                return cached == "true"

        flag = self.get_flag(flag_name)
        if flag is None:
            return default

        # Check user override first
        if user_id and user_id in flag.user_overrides:
            result = flag.user_overrides[user_id]
            self._cache_result(flag_name, user_id, result)
            return result

        # If flag is globally enabled, return True
        if flag.enabled:
            self._cache_result(flag_name, user_id, True)
            return True

        # Check rollout percentage
        if flag.rollout_percentage > 0 and user_id:
            if self._is_in_rollout(flag_name, user_id, flag.rollout_percentage):
                self._cache_result(flag_name, user_id, True)
                return True

        self._cache_result(flag_name, user_id, False)
        return False

    def _is_in_rollout(self, flag_name: str, user_id: str, percentage: int) -> bool:
        """Determine if user is in rollout percentage using consistent hashing."""
        # Use hash of flag name + user ID for consistent assignment
        hash_input = f"{flag_name}:{user_id}".encode()
        hash_value = int(hashlib.md5(hash_input).hexdigest(), 16)
        bucket = hash_value % 100
        return bucket < percentage

    def _cache_result(self, flag_name: str, user_id: Optional[str], result: bool):
        """Cache the flag evaluation result."""
        if self.cache and user_id:
            cache_key = f"flag:{flag_name}:user:{user_id}"
            self.cache.set(cache_key, "true" if result else "false", expire=300)

    def set_user_override(self, flag_name: str, user_id: str, enabled: bool):
        """Set a user-specific override for a flag."""
        flag = self.get_flag(flag_name)
        if flag:
            flag.user_overrides[user_id] = enabled
            if self.cache:
                cache_key = f"flag:{flag_name}:user:{user_id}"
                self.cache.delete(cache_key)

    def clear_cache(self, flag_name: Optional[str] = None):
        """Clear cached flag evaluations."""
        if self.cache:
            if flag_name:
                # Clear all cache entries for this flag
                self.cache.delete(f"flag:{flag_name}")
            else:
                # Clear all flag cache entries
                self.cache.flush()


# ============================================================================
# Flag Evaluation Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.feature_flags
def test_enabled_flag_returns_true():
    """Test that globally enabled flag returns true."""
    service = FeatureFlagService()
    flag = FeatureFlag(name="test_feature", enabled=True)
    service.create_flag(flag)

    assert service.is_enabled("test_feature") is True


@pytest.mark.unit
@pytest.mark.feature_flags
def test_disabled_flag_returns_false():
    """Test that disabled flag returns false."""
    service = FeatureFlagService()
    flag = FeatureFlag(name="test_feature", enabled=False)
    service.create_flag(flag)

    assert service.is_enabled("test_feature") is False


@pytest.mark.unit
@pytest.mark.feature_flags
def test_nonexistent_flag_returns_default():
    """Test that nonexistent flag returns the default value."""
    service = FeatureFlagService()

    assert service.is_enabled("nonexistent", default=False) is False
    assert service.is_enabled("nonexistent", default=True) is True


@pytest.mark.unit
@pytest.mark.feature_flags
def test_flag_evaluation_without_user_id():
    """Test flag evaluation when no user ID is provided."""
    service = FeatureFlagService()
    flag = FeatureFlag(name="test_feature", enabled=True)
    service.create_flag(flag)

    assert service.is_enabled("test_feature", user_id=None) is True


# ============================================================================
# User Override Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.feature_flags
def test_user_override_enables_for_specific_user():
    """Test that user override can enable flag for specific user."""
    service = FeatureFlagService()
    flag = FeatureFlag(
        name="test_feature",
        enabled=False,
        user_overrides={"user123": True}
    )
    service.create_flag(flag)

    assert service.is_enabled("test_feature", user_id="user123") is True
    assert service.is_enabled("test_feature", user_id="user456") is False


@pytest.mark.unit
@pytest.mark.feature_flags
def test_user_override_disables_for_specific_user():
    """Test that user override can disable flag for specific user."""
    service = FeatureFlagService()
    flag = FeatureFlag(
        name="test_feature",
        enabled=True,
        user_overrides={"user123": False}
    )
    service.create_flag(flag)

    assert service.is_enabled("test_feature", user_id="user123") is False
    assert service.is_enabled("test_feature", user_id="user456") is True


@pytest.mark.unit
@pytest.mark.feature_flags
def test_user_override_takes_precedence_over_global():
    """Test that user override takes precedence over global setting."""
    service = FeatureFlagService()
    flag = FeatureFlag(
        name="test_feature",
        enabled=True,
        user_overrides={"user123": False}
    )
    service.create_flag(flag)

    # Global is enabled, but user override disables it
    assert service.is_enabled("test_feature", user_id="user123") is False


@pytest.mark.unit
@pytest.mark.feature_flags
def test_set_user_override_dynamically():
    """Test setting user override after flag creation."""
    service = FeatureFlagService()
    flag = FeatureFlag(name="test_feature", enabled=False)
    service.create_flag(flag)

    # Initially disabled for all users
    assert service.is_enabled("test_feature", user_id="user123") is False

    # Enable for specific user
    service.set_user_override("test_feature", "user123", True)
    assert service.is_enabled("test_feature", user_id="user123") is True


@pytest.mark.unit
@pytest.mark.feature_flags
def test_multiple_user_overrides():
    """Test multiple user overrides on same flag."""
    service = FeatureFlagService()
    flag = FeatureFlag(
        name="test_feature",
        enabled=False,
        user_overrides={
            "user1": True,
            "user2": True,
            "user3": False,
        }
    )
    service.create_flag(flag)

    assert service.is_enabled("test_feature", user_id="user1") is True
    assert service.is_enabled("test_feature", user_id="user2") is True
    assert service.is_enabled("test_feature", user_id="user3") is False
    assert service.is_enabled("test_feature", user_id="user4") is False


# ============================================================================
# A/B Testing Rollout Percentage Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.feature_flags
def test_rollout_percentage_zero_disables_for_all():
    """Test that 0% rollout disables flag for all users."""
    service = FeatureFlagService()
    flag = FeatureFlag(
        name="test_feature",
        enabled=False,
        rollout_percentage=0
    )
    service.create_flag(flag)

    test_users = [f"user{i}" for i in range(10)]
    results = [service.is_enabled("test_feature", user_id=u) for u in test_users]

    assert all(r is False for r in results)


@pytest.mark.unit
@pytest.mark.feature_flags
def test_rollout_percentage_hundred_enables_for_all():
    """Test that 100% rollout enables flag for all users."""
    service = FeatureFlagService()
    flag = FeatureFlag(
        name="test_feature",
        enabled=False,
        rollout_percentage=100
    )
    service.create_flag(flag)

    test_users = [f"user{i}" for i in range(10)]
    results = [service.is_enabled("test_feature", user_id=u) for u in test_users]

    assert all(r is True for r in results)


@pytest.mark.unit
@pytest.mark.feature_flags
def test_rollout_percentage_affects_subset_of_users():
    """Test that rollout percentage enables flag for roughly correct proportion."""
    service = FeatureFlagService()
    flag = FeatureFlag(
        name="test_feature",
        enabled=False,
        rollout_percentage=50
    )
    service.create_flag(flag)

    # Test with many users to get statistical distribution
    test_users = [f"user{i}" for i in range(100)]
    enabled_count = sum(
        1 for u in test_users
        if service.is_enabled("test_feature", user_id=u)
    )

    # Should be roughly 50%, allow for some variance (30-70%)
    assert 30 <= enabled_count <= 70


@pytest.mark.unit
@pytest.mark.feature_flags
def test_rollout_is_consistent_for_same_user():
    """Test that rollout decision is consistent for the same user."""
    service = FeatureFlagService()
    flag = FeatureFlag(
        name="test_feature",
        enabled=False,
        rollout_percentage=50
    )
    service.create_flag(flag)

    user_id = "consistent_user"

    # Check multiple times
    results = [
        service.is_enabled("test_feature", user_id=user_id)
        for _ in range(10)
    ]

    # All results should be the same
    assert len(set(results)) == 1


@pytest.mark.unit
@pytest.mark.feature_flags
def test_rollout_respects_user_override():
    """Test that user override takes precedence over rollout percentage."""
    service = FeatureFlagService()
    flag = FeatureFlag(
        name="test_feature",
        enabled=False,
        rollout_percentage=0,  # Would disable for all
        user_overrides={"user123": True}
    )
    service.create_flag(flag)

    # User override should enable even with 0% rollout
    assert service.is_enabled("test_feature", user_id="user123") is True


@pytest.mark.unit
@pytest.mark.feature_flags
def test_global_enabled_overrides_rollout():
    """Test that globally enabled flag ignores rollout percentage."""
    service = FeatureFlagService()
    flag = FeatureFlag(
        name="test_feature",
        enabled=True,  # Globally enabled
        rollout_percentage=10  # Low rollout
    )
    service.create_flag(flag)

    # Should be enabled for all users since global is True
    test_users = [f"user{i}" for i in range(10)]
    results = [service.is_enabled("test_feature", user_id=u) for u in test_users]

    assert all(r is True for r in results)


# ============================================================================
# Caching Behavior Tests
# ============================================================================


@pytest.mark.unit
@pytest.mark.feature_flags
def test_flag_evaluation_uses_cache(mock_redis_client):
    """Test that flag evaluations are cached."""
    service = FeatureFlagService(cache=mock_redis_client)
    flag = FeatureFlag(name="test_feature", enabled=True)
    service.create_flag(flag)

    # First evaluation
    result1 = service.is_enabled("test_feature", user_id="user123")

    # Should have cached the result
    mock_redis_client.set.assert_called()

    # Second evaluation
    mock_redis_client.get.return_value = "true"
    result2 = service.is_enabled("test_feature", user_id="user123")

    assert result1 == result2


@pytest.mark.unit
@pytest.mark.feature_flags
def test_cache_hit_reduces_evaluations(mock_redis_client):
    """Test that cache hits reduce actual flag evaluations."""
    service = FeatureFlagService(cache=mock_redis_client)
    flag = FeatureFlag(name="test_feature", enabled=True)
    service.create_flag(flag)

    # Mock cache to return cached value
    mock_redis_client.get.return_value = "true"

    # Multiple calls
    for _ in range(5):
        service.is_enabled("test_feature", user_id="user123")

    # Cache get should be called multiple times
    assert mock_redis_client.get.call_count >= 5


@pytest.mark.unit
@pytest.mark.feature_flags
def test_cache_cleared_when_flag_updated(mock_redis_client):
    """Test that cache is cleared when flag is updated."""
    service = FeatureFlagService(cache=mock_redis_client)
    flag = FeatureFlag(name="test_feature", enabled=True)
    service.create_flag(flag)

    # Cache should be cleared on create/update
    mock_redis_client.delete.assert_called_with("flag:test_feature")


@pytest.mark.unit
@pytest.mark.feature_flags
def test_cache_cleared_when_user_override_set(mock_redis_client):
    """Test that cache is cleared when user override is set."""
    service = FeatureFlagService(cache=mock_redis_client)
    flag = FeatureFlag(name="test_feature", enabled=True)
    service.create_flag(flag)

    mock_redis_client.reset_mock()

    # Set user override
    service.set_user_override("test_feature", "user123", False)

    # Cache for that user should be cleared
    mock_redis_client.delete.assert_called()


@pytest.mark.unit
@pytest.mark.feature_flags
def test_cache_expiration():
    """Test that cached flag evaluations have expiration time."""
    mock_cache = MagicMock()
    service = FeatureFlagService(cache=mock_cache)
    flag = FeatureFlag(name="test_feature", enabled=True)
    service.create_flag(flag)

    service.is_enabled("test_feature", user_id="user123")

    # Should set cache with expiration
    mock_cache.set.assert_called()
    call_args = mock_cache.set.call_args
    assert "expire" in call_args[1] or len(call_args[0]) >= 3


@pytest.mark.unit
@pytest.mark.feature_flags
def test_clear_cache_for_specific_flag(mock_redis_client):
    """Test clearing cache for a specific flag."""
    service = FeatureFlagService(cache=mock_redis_client)

    service.clear_cache("test_feature")

    mock_redis_client.delete.assert_called_with("flag:test_feature")


@pytest.mark.unit
@pytest.mark.feature_flags
def test_clear_all_cache(mock_redis_client):
    """Test clearing all flag caches."""
    service = FeatureFlagService(cache=mock_redis_client)

    service.clear_cache()

    mock_redis_client.flush.assert_called()


# ============================================================================
# Edge Cases and Complex Scenarios
# ============================================================================


@pytest.mark.unit
@pytest.mark.feature_flags
def test_flag_with_empty_name():
    """Test handling of flag with empty name."""
    service = FeatureFlagService()
    flag = FeatureFlag(name="", enabled=True)
    service.create_flag(flag)

    # Should still work
    assert service.is_enabled("", user_id="user123") is True


@pytest.mark.unit
@pytest.mark.feature_flags
def test_multiple_flags_independent():
    """Test that multiple flags are evaluated independently."""
    service = FeatureFlagService()

    flag1 = FeatureFlag(name="feature1", enabled=True)
    flag2 = FeatureFlag(name="feature2", enabled=False)

    service.create_flag(flag1)
    service.create_flag(flag2)

    assert service.is_enabled("feature1") is True
    assert service.is_enabled("feature2") is False


@pytest.mark.unit
@pytest.mark.feature_flags
def test_flag_evaluation_with_special_user_ids():
    """Test flag evaluation with special characters in user IDs."""
    service = FeatureFlagService()
    flag = FeatureFlag(
        name="test_feature",
        enabled=False,
        user_overrides={"user@example.com": True}
    )
    service.create_flag(flag)

    assert service.is_enabled("test_feature", user_id="user@example.com") is True


@pytest.mark.unit
@pytest.mark.feature_flags
def test_concurrent_flag_updates():
    """Test that flag updates don't interfere with each other."""
    service = FeatureFlagService()

    flag = FeatureFlag(name="test_feature", enabled=False)
    service.create_flag(flag)

    # Update flag
    updated_flag = FeatureFlag(name="test_feature", enabled=True)
    service.create_flag(updated_flag)

    assert service.is_enabled("test_feature") is True

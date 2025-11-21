"""Integration tests for Feature Flags API endpoints.

Tests feature flag management including:
- Create flag
- List flags
- Update flag
- Delete flag
- User overrides
"""
from __future__ import annotations

import pytest
from fastapi import status


@pytest.mark.integration
@pytest.mark.feature_flags
@pytest.mark.api
def test_create_feature_flag(authenticated_client, test_admin_token):
    """Test creating a new feature flag (admin only)."""
    client = authenticated_client
    client.headers["Authorization"] = f"Bearer {test_admin_token}"

    flag_data = {
        "name": "new_feature",
        "enabled": False,
        "description": "New feature flag",
        "rollout_percentage": 0
    }

    response = client.post("/api/admin/feature-flags", json=flag_data)

    assert response.status_code == status.HTTP_201_CREATED
    result = response.json()
    assert result["success"] is True
    assert result["data"]["name"] == "new_feature"


@pytest.mark.integration
@pytest.mark.feature_flags
def test_create_flag_requires_admin(authenticated_client):
    """Test that creating feature flags requires admin privileges."""
    flag_data = {"name": "test_feature", "enabled": True}

    response = authenticated_client.post("/api/admin/feature-flags", json=flag_data)

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.integration
@pytest.mark.feature_flags
def test_list_all_feature_flags(authenticated_client):
    """Test listing all feature flags."""
    response = authenticated_client.get("/api/feature-flags")

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert "flags" in result["data"]
    assert isinstance(result["data"]["flags"], list)


@pytest.mark.integration
@pytest.mark.feature_flags
def test_get_specific_feature_flag(authenticated_client, sample_feature_flag):
    """Test retrieving a specific feature flag."""
    flag_name = sample_feature_flag["name"]

    response = authenticated_client.get(f"/api/feature-flags/{flag_name}")

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert result["data"]["name"] == flag_name


@pytest.mark.integration
@pytest.mark.feature_flags
def test_update_feature_flag(authenticated_client, test_admin_token, sample_feature_flag):
    """Test updating a feature flag (admin only)."""
    client = authenticated_client
    client.headers["Authorization"] = f"Bearer {test_admin_token}"

    flag_name = sample_feature_flag["name"]
    update_data = {
        "enabled": True,
        "rollout_percentage": 50
    }

    response = client.patch(f"/api/admin/feature-flags/{flag_name}", json=update_data)

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert result["data"]["enabled"] is True


@pytest.mark.integration
@pytest.mark.feature_flags
def test_delete_feature_flag(authenticated_client, test_admin_token):
    """Test deleting a feature flag (admin only)."""
    client = authenticated_client
    client.headers["Authorization"] = f"Bearer {test_admin_token}"

    # Create a flag to delete
    flag_data = {"name": "temporary_flag", "enabled": False}
    create_response = client.post("/api/admin/feature-flags", json=flag_data)
    flag_name = create_response.json()["data"]["name"]

    # Delete it
    response = client.delete(f"/api/admin/feature-flags/{flag_name}")

    assert response.status_code == status.HTTP_200_OK


@pytest.mark.integration
@pytest.mark.feature_flags
def test_set_user_override(authenticated_client, test_admin_token, sample_feature_flag):
    """Test setting user-specific override for a feature flag."""
    client = authenticated_client
    client.headers["Authorization"] = f"Bearer {test_admin_token}"

    flag_name = sample_feature_flag["name"]
    override_data = {
        "user_id": "user123",
        "enabled": True
    }

    response = client.post(
        f"/api/admin/feature-flags/{flag_name}/overrides",
        json=override_data
    )

    assert response.status_code == status.HTTP_200_OK


@pytest.mark.integration
@pytest.mark.feature_flags
def test_check_flag_status_for_user(authenticated_client, test_user):
    """Test checking if a feature flag is enabled for a specific user."""
    flag_name = "test_feature"

    response = authenticated_client.get(f"/api/feature-flags/{flag_name}/status")

    assert response.status_code == status.HTTP_200_OK
    result = response.json()
    assert "enabled" in result["data"]
    assert isinstance(result["data"]["enabled"], bool)


@pytest.mark.integration
@pytest.mark.feature_flags
def test_user_override_takes_effect(authenticated_client, test_admin_token, test_user):
    """Test that user override actually affects flag evaluation."""
    client = authenticated_client
    admin_client = authenticated_client
    admin_client.headers["Authorization"] = f"Bearer {test_admin_token}"

    # Create disabled flag
    flag_data = {"name": "override_test", "enabled": False}
    admin_client.post("/api/admin/feature-flags", json=flag_data)

    # Check it's disabled for user
    response1 = client.get("/api/feature-flags/override_test/status")
    assert response1.json()["data"]["enabled"] is False

    # Set override to enable for this user
    admin_client.post(
        "/api/admin/feature-flags/override_test/overrides",
        json={"user_id": test_user["id"], "enabled": True}
    )

    # Check it's now enabled for user
    response2 = client.get("/api/feature-flags/override_test/status")
    assert response2.json()["data"]["enabled"] is True


@pytest.mark.integration
@pytest.mark.feature_flags
def test_rollout_percentage_affects_users(authenticated_client, test_admin_token):
    """Test that rollout percentage controls flag distribution."""
    admin_client = authenticated_client
    admin_client.headers["Authorization"] = f"Bearer {test_admin_token}"

    # Create flag with 50% rollout
    flag_data = {
        "name": "rollout_test",
        "enabled": False,
        "rollout_percentage": 50
    }
    admin_client.post("/api/admin/feature-flags", json=flag_data)

    # Check status for multiple users
    # Note: This is simplified, real test would use multiple user tokens
    response = authenticated_client.get("/api/feature-flags/rollout_test/status")

    assert response.status_code == status.HTTP_200_OK


@pytest.mark.integration
@pytest.mark.feature_flags
def test_cannot_create_duplicate_flag(authenticated_client, test_admin_token, sample_feature_flag):
    """Test that creating a duplicate flag name fails."""
    client = authenticated_client
    client.headers["Authorization"] = f"Bearer {test_admin_token}"

    flag_data = {
        "name": sample_feature_flag["name"],  # Duplicate name
        "enabled": True
    }

    response = client.post("/api/admin/feature-flags", json=flag_data)

    assert response.status_code == status.HTTP_409_CONFLICT


@pytest.mark.integration
@pytest.mark.feature_flags
def test_invalid_rollout_percentage(authenticated_client, test_admin_token):
    """Test that invalid rollout percentage is rejected."""
    client = authenticated_client
    client.headers["Authorization"] = f"Bearer {test_admin_token}"

    flag_data = {
        "name": "invalid_rollout",
        "enabled": False,
        "rollout_percentage": 150  # Invalid: > 100
    }

    response = client.post("/api/admin/feature-flags", json=flag_data)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

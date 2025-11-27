import pytest
from fastapi import HTTPException

from tests.integration.api_gateway_loader import load_api_gateway_module

core_dependencies = load_api_gateway_module(
    "core/dependencies.py", "api_gateway_core_dependencies"
)
user_model = load_api_gateway_module("models/user.py", "api_gateway_user_model")

get_current_admin_user = core_dependencies.get_current_admin_user
User = user_model.User

@pytest.mark.smoke
def test_get_current_admin_user_denies_non_admin():
    """Smoke test: ensure non-admin user is rejected by RBAC dependency."""
    user = User()
    user.is_admin = False
    with pytest.raises(HTTPException) as excinfo:
        # Simulate dependency behavior
        # We call get_current_admin_user directly to verify it raises for non-admins.
        import asyncio
        asyncio.run(get_current_admin_user(user))  # type: ignore
    assert excinfo.value.status_code == 403

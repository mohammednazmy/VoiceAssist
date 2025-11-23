import pytest
from fastapi import HTTPException

from services.api-gateway.app.core.dependencies import get_current_admin_user
from services.api-gateway.app.models.user import User

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

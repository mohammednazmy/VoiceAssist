import pytest
from app.core.dependencies import get_current_admin_user
from app.models.user import User
from fastapi import HTTPException


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_get_current_admin_user_denies_non_admin():
    """Smoke test: ensure non-admin user is rejected by RBAC dependency."""
    user = User()
    user.is_admin = False
    user.is_active = True
    with pytest.raises(HTTPException) as excinfo:
        # Call the dependency function directly with a non-admin user
        await get_current_admin_user(current_user=user)
    assert excinfo.value.status_code == 403
    assert "Admin privileges required" in str(excinfo.value.detail)

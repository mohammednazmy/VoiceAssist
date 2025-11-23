import pytest
from app.main import app
from fastapi.testclient import TestClient


@pytest.mark.smoke
def test_admin_panel_summary_route_exists():
    """Smoke test: ensure /api/admin/panel/summary is registered.

    We don't assert on RBAC behavior here because that requires
    a full auth setup; this test just confirms the route is wired.
    """
    client = TestClient(app)
    # We expect a 401 or 403 for unauthenticated call, but not 404.
    resp = client.get("/api/admin/panel/summary")
    assert resp.status_code in (401, 403)

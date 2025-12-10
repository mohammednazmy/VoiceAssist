import pytest

from tests.conftest import TEST_API_BASE_URL


@pytest.fixture(scope="session", autouse=True)
async def ensure_api_available(api_client):
    """Skip e2e suite when the API gateway is unreachable."""
    try:
        resp = await api_client.get("/live", timeout=5.0)
    except Exception as exc:  # pragma: no cover - defensive
        pytest.skip(f"API unavailable at {TEST_API_BASE_URL}: {exc}")

    if resp.status_code >= 500:
        pytest.skip(
            f"API at {TEST_API_BASE_URL} returned {resp.status_code} for /live; skipping e2e"
        )

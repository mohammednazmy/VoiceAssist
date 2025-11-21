import pytest

@pytest.mark.smoke
def test_integrations_module_imports():
    """Smoke test: ensure integrations API module imports cleanly."""
    try:
        import app.api.integrations as integrations  # type: ignore
    except Exception as e:
        pytest.fail(f"Failed to import integrations API: {e}")

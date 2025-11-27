import os
import sys
import types

os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("JWT_SECRET", "test-jwt")

# Stub optional dependencies that aren't required for signaling tests
dummy_imap = types.SimpleNamespace(IMAP4_SSL=object)
sys.modules.setdefault("aioimaplib", dummy_imap)
sys.modules.setdefault("aiosmtplib", types.SimpleNamespace())


class _PubMedStub(types.ModuleType):
    def __getattr__(self, name):  # noqa: D401
        value = type(name, (), {})
        setattr(self, name, value)
        return value


stub_pubmed = _PubMedStub("app.services.pubmed_enhanced_service")
sys.modules.setdefault("app.services.pubmed_enhanced_service", stub_pubmed)


class _DynamicModule(types.ModuleType):
    def __getattr__(self, name):
        value = type(name, (), {})
        setattr(self, name, value)
        return value


stub_uptodate = _DynamicModule("app.services.uptodate_service")
sys.modules.setdefault("app.services.uptodate_service", stub_uptodate)

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import realtime
from app.core.dependencies import get_current_user


class _DummyUser:
    def __init__(self) -> None:
        self.id = "test-user"


test_app = FastAPI()
test_app.include_router(realtime.router)
test_app.dependency_overrides[get_current_user] = lambda: _DummyUser()
client = TestClient(test_app)


def teardown_module() -> None:
    test_app.dependency_overrides.pop(get_current_user, None)


def test_webrtc_offer_round_trip() -> None:
    response = client.post(
        "/api/realtime/webrtc/offer",
        json={"session_id": "test-session", "sdp": "v=0"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "test-session"
    assert data["offer"] == "v=0"
    assert "processing" in data

    candidate_resp = client.post(
        "/api/realtime/webrtc/candidate",
        json={"session_id": "test-session", "candidate": {"candidate": "abc"}},
    )
    assert candidate_resp.status_code == 200
    assert candidate_resp.json()["ice_candidates"][0]["candidate"] == "abc"


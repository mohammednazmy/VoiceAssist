"""Utility helpers to import modules from services/api-gateway with a hyphenated path."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType
import os
import sys
import types

API_GATEWAY_ROOT = (
    Path(__file__).resolve().parents[2] / "services" / "api-gateway" / "app"
)

# Provide minimal defaults so settings validation passes during tests
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("JWT_SECRET", "test-jwt")
os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "voiceassist_test")
os.environ.setdefault("REDIS_PASSWORD", "test")

# Stub optional external dependencies that aren't needed for contract tests
if "aioimaplib" not in sys.modules:
    sys.modules["aioimaplib"] = types.SimpleNamespace(IMAP4_SSL=object, IMAP4=object)

if str(API_GATEWAY_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(API_GATEWAY_ROOT.parent))


def load_api_gateway_module(relative_path: str, module_name: str) -> ModuleType:
    """Load an API Gateway module by relative path using importlib."""

    module_path = API_GATEWAY_ROOT / relative_path
    spec = spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load module {module_name} from {module_path}")

    module = module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

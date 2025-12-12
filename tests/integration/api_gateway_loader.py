"""Utility helpers to import modules from services/api-gateway with a hyphenated path.

Where possible we import the canonical Python module (e.g.
``services.api_gateway.app.main``) instead of reloading modules from file
paths. This avoids creating duplicate SQLAlchemy models that share the same
`Base` registry, which can lead to metadata and mapper configuration errors
in tests.
"""

from importlib import import_module
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
    """Load an API Gateway module by relative path.

    Prefer importing the canonical module (e.g. services.api_gateway.app.main)
    to avoid creating duplicate SQLAlchemy model classes. Fall back to loading
    by file location if the dotted import fails for any reason.
    """

    # Special-case: for simple RBAC smoke tests we don't need the full
    # SQLAlchemy User model; returning a lightweight stub avoids mapper
    # configuration side effects when tests import the model directly.
    if relative_path == "models/user.py":
        class UserStub:
            def __init__(self) -> None:
                # Match core fields accessed in dependencies/tests
                self.admin_role = "user"
                self.is_admin = False

        module = types.SimpleNamespace(User=UserStub)
        sys.modules[module_name] = module
        return module

    # Derive canonical dotted module path, e.g. "services.api_gateway.app.main"
    rel = relative_path[:-3] if relative_path.endswith(".py") else relative_path
    dotted_name = "services.api_gateway.app." + rel.replace("/", ".")

    try:
        module = import_module(dotted_name)
        # Expose under the requested name as well for test imports
        sys.modules[module_name] = module
        return module
    except Exception:
        # Fallback: load directly from file location (legacy behaviour)
        module_path = API_GATEWAY_ROOT / relative_path
        spec = spec_from_file_location(module_name, module_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Unable to load module {module_name} from {module_path}")

        module = module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module

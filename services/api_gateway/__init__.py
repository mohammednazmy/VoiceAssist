"""
Compatibility alias for the `services.api_gateway` package.

Maps `services.api_gateway` to the actual gateway directory
`services/api-gateway/` so imports like
`from services.api_gateway.app.main import app` continue to work.
"""

from __future__ import annotations

from pathlib import Path

_here = Path(__file__).resolve()
# Path layout: <repo>/services/api_gateway/__init__.py
# Repository root is two levels up from services/api_gateway
_root = _here.parents[2]
_gateway_root = _root / "services" / "api-gateway"

if _gateway_root.exists():
    __path__ = [str(_gateway_root)]  # type: ignore[attr-defined]

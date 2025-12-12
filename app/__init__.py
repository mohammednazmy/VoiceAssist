"""
Compatibility alias for the API gateway's `app` package.

Tests and some tooling import `app.*` assuming the FastAPI application
package lives at the repository root. In this monorepo, the canonical
backend code resides under `services/api-gateway/app/`.

This shim maps the top-level `app` package to that directory without
changing the canonical backend layout.
"""

from __future__ import annotations

from pathlib import Path

_here = Path(__file__).resolve()
# Path layout: <repo>/app/__init__.py
_root = _here.parent.parent  # repository root
_gateway_app = _root / "services" / "api-gateway" / "app"

if _gateway_app.exists():
    # Point this package at the real gateway app directory so that
    # imports like `import app.main` resolve correctly.
    __path__ = [str(_gateway_app)]  # type: ignore[attr-defined]

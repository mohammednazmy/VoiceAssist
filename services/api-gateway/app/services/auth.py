"""
Compatibility shims for authentication dependencies.

Routes historically imported authentication helpers from ``app.services.auth``.
The canonical implementations now live in ``app.core.dependencies``. This
module re-exports those helpers so existing imports keep working without
duplicating logic.
"""

from __future__ import annotations

from app.core.dependencies import (
    get_current_active_user as get_current_active_user,
    get_current_admin_user,
)

# FastAPI routes use ``Depends(require_admin)``; we alias this to the
# canonical admin dependency so behavior stays centralized.
require_admin = get_current_admin_user


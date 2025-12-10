"""Admin Panel API Module.

This module provides the admin panel API endpoints, split into logical submodules:
- schemas: Pydantic request/response models
- utils: Utility functions (rate limiting, audit logging, WebSocket tracking)
- dashboard: System summary and metrics endpoints (coming soon)
- users: User management endpoints (coming soon)
- audit: Audit log endpoints (coming soon)
- websocket: WebSocket management (coming soon)

For backward compatibility, the main router is still in admin_panel.py.
This module structure prepares for gradual migration.
"""

from app.api.admin.schemas import (
    ALLOWED_ADMIN_ROLES,
    AuditLogEntryResponse,
    BulkOperationRequest,
    PasswordResetRequest,
    PermanentDeleteRequest,
    UserCreate,
    UserInviteRequest,
    UserResponse,
    UserUpdate,
)
from app.api.admin.utils import (
    METRICS_CACHE_TTL,
    REDIS_METRICS_CACHE_KEY,
    REDIS_WS_SESSIONS_KEY,
    enforce_admin_action_rate_limit,
    generate_secure_token,
    generate_temporary_password,
    get_active_websocket_count,
    get_all_websocket_sessions,
    log_audit_event,
    register_websocket_session,
    register_websocket_session_cleanup,
    resolve_admin_role,
    unregister_websocket_session,
)

__all__ = [
    # Schemas
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "UserInviteRequest",
    "PasswordResetRequest",
    "AuditLogEntryResponse",
    "BulkOperationRequest",
    "PermanentDeleteRequest",
    "ALLOWED_ADMIN_ROLES",
    # Utils
    "enforce_admin_action_rate_limit",
    "log_audit_event",
    "register_websocket_session",
    "unregister_websocket_session",
    "get_all_websocket_sessions",
    "get_active_websocket_count",
    "register_websocket_session_cleanup",
    "generate_temporary_password",
    "generate_secure_token",
    "resolve_admin_role",
    "REDIS_WS_SESSIONS_KEY",
    "REDIS_METRICS_CACHE_KEY",
    "METRICS_CACHE_TTL",
]

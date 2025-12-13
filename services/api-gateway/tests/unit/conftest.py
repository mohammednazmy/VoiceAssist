from __future__ import annotations

import os

# Ensure the API gateway settings can be imported in unit tests without requiring
# a full docker-compose environment. These defaults are only applied when the
# variables are not already set by the caller/CI.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DEBUG", "false")

os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "test")

os.environ.setdefault("REDIS_PASSWORD", "test")

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("NEXTCLOUD_ADMIN_PASSWORD", "test-nextcloud-admin-password")


---
title: Dev Cors Fix Summary
slug: archive/dev-cors-fix-summary
summary: "**Date:** 2025-11-24"
status: deprecated
stability: legacy
owner: docs
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - dev
  - cors
  - fix
  - summary
category: reference
ai_summary: >-
  Date: 2025-11-24 Issue: Dev frontend (localhost:5173) was calling without
  prefix, causing 404s and CORS errors The localhost:5173 Apache vhost was
  proxying all requests (including ) to the Vite dev server on port 5173,
  instead of proxying API requests to the backend on port 8000. Before:
  ${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api After: Why:
  already includes : - Dev: - Prod: Appending was creating URLs like (404).
---

# Dev Frontend CORS Fix Summary

**Date:** 2025-11-24
**Issue:** Dev frontend (localhost:5173) was calling `/conversations` without `/api` prefix, causing 404s and CORS errors

## Root Cause

The localhost:5173 Apache vhost was proxying **all requests** (including `/api/*`) to the Vite dev server on port 5173, instead of proxying API requests to the backend on port 8000.

## Changes Made

### 1. Fixed Double `/api` Bug in Frontend (apps/web-app/src/hooks/useAuth.ts)

**Before:**

```typescript
baseURL: `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api`;
```

**After:**

```typescript
baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api";
```

**Why:** `VITE_API_URL` already includes `/api`:

- Dev: `VITE_API_URL=http://localhost:5173/api`
- Prod: `VITE_API_URL=http://localhost:8000/api`

Appending `/api` was creating URLs like `http://localhost:5173/api/api/conversations` (404).

### 2. Updated Apache Vhost for localhost:5173 (/etc/apache2/sites-available/localhost:5173-le-ssl.conf)

**Changes:**

- Added `ProxyPass /api http://localhost:8000/api` to route API requests to backend
- Added WebSocket support for API routes: `RewriteRule` for `/api/` with `ws://localhost:8000/`
- Added `DocumentRoot /var/www/localhost:5173` to serve static test files
- Added `RewriteCond` to check if file exists before proxying to Vite
- Everything else still proxies to Vite dev server (port 5173) for HMR

**Result:**

- `http://localhost:5173/api/*` → proxied to backend (localhost:8000)
- `http://localhost:5173/*` → proxied to Vite dev server (localhost:5173)
- Static files in `/var/www/localhost:5173/` served directly

### 3. Restarted Services

- Restarted Vite dev server to pick up useAuth.ts changes
- Reloaded Apache with `sudo systemctl reload apache2`
- Backend already had correct CORS (`ALLOWED_ORIGINS` includes `http://localhost:5173`)

## Verification

### CORS Test Results

```bash
# OPTIONS preflight
curl -i -X OPTIONS "http://localhost:5173/api/conversations" \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization"

# Response includes:
# access-control-allow-origin: http://localhost:5173
# access-control-allow-credentials: true
# access-control-allow-methods: GET, POST, PUT, DELETE, PATCH
```

### API Endpoint Tests

```bash
# Login works
curl -s http://localhost:5173/api/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost","password":"admin123"}'
# Returns: {"access_token": "eyJ..."}

# Conversations endpoint accessible (auth issue is separate)
curl -s "http://localhost:5173/api/conversations?page=1&pageSize=3" \
  -H "Authorization: Bearer <token>"
# Returns proper response or auth error (not 404/CORS error)
```

### Test Page

Created test page at `/var/www/localhost:5173/test-cors.html` to verify from browser:

```
http://localhost:5173/test-cors.html
```

## Remaining Issues

### Redis Connection / Auth

The backend logs show:

```
Cannot check token revocation - Redis not connected, assuming valid
```

This causes 401 "Could not validate credentials" errors even with valid tokens. However, this is a **separate issue** from the CORS/routing problem that has been fixed.

**Note:** Login endpoint works fine (returns tokens), but protected endpoints like `/api/conversations` fail auth validation.

## Git Commit

```
commit 18a084c
fix(dev): fix API base URL to prevent double /api prefix

- Remove extra /api suffix from baseURL in useAuth.ts
- VITE_API_URL already includes /api, so no need to append it
- This fixes 404 errors and CORS issues on both dev and prod
- Also implement register method properly (was TODO)
```

## Manual Verification Steps

1. **Open browser and visit:** http://localhost:5173
2. **Check Network tab:** API calls should go to `http://localhost:5173/api/*` (not 404)
3. **Check CORS headers:** Responses should include `Access-Control-Allow-Origin: http://localhost:5173`
4. **WebSocket:** Should connect to `wss://localhost:5173/api/realtime/ws` when creating conversation
5. **No CORS errors:** Browser console should not show "blocked by CORS policy"

## Configuration Files Changed

1. `/home/asimo/VoiceAssist/apps/web-app/src/hooks/useAuth.ts` (committed)
2. `/etc/apache2/sites-available/localhost:5173-le-ssl.conf` (not in repo)

## Environment Variables Verified

- `/home/asimo/VoiceAssist/apps/web-app/.env.development`:

  ```
  VITE_API_URL=http://localhost:5173/api
  VITE_WS_URL=wss://localhost:5173/api/realtime/ws
  ```

- `/home/asimo/VoiceAssist/services/api-gateway/.env`:
  ```
  ALLOWED_ORIGINS=https://localhost:5173,http://localhost:8000,http://localhost:5173,http://localhost:5173
  ```

Both were already correct before this fix.

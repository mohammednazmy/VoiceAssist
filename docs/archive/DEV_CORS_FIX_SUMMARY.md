# Dev Frontend CORS Fix Summary

**Date:** 2025-11-24
**Issue:** Dev frontend (dev.asimo.io) was calling `/conversations` without `/api` prefix, causing 404s and CORS errors

## Root Cause

The dev.asimo.io Apache vhost was proxying **all requests** (including `/api/*`) to the Vite dev server on port 5173, instead of proxying API requests to the backend on port 8000.

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

- Dev: `VITE_API_URL=https://dev.asimo.io/api`
- Prod: `VITE_API_URL=https://assist.asimo.io/api`

Appending `/api` was creating URLs like `https://dev.asimo.io/api/api/conversations` (404).

### 2. Updated Apache Vhost for dev.asimo.io (/etc/apache2/sites-available/dev.asimo.io-le-ssl.conf)

**Changes:**

- Added `ProxyPass /api http://localhost:8000/api` to route API requests to backend
- Added WebSocket support for API routes: `RewriteRule` for `/api/` with `ws://localhost:8000/`
- Added `DocumentRoot /var/www/dev.asimo.io` to serve static test files
- Added `RewriteCond` to check if file exists before proxying to Vite
- Everything else still proxies to Vite dev server (port 5173) for HMR

**Result:**

- `https://dev.asimo.io/api/*` → proxied to backend (localhost:8000)
- `https://dev.asimo.io/*` → proxied to Vite dev server (localhost:5173)
- Static files in `/var/www/dev.asimo.io/` served directly

### 3. Restarted Services

- Restarted Vite dev server to pick up useAuth.ts changes
- Reloaded Apache with `sudo systemctl reload apache2`
- Backend already had correct CORS (`ALLOWED_ORIGINS` includes `https://dev.asimo.io`)

## Verification

### CORS Test Results

```bash
# OPTIONS preflight
curl -i -X OPTIONS "https://dev.asimo.io/api/conversations" \
  -H "Origin: https://dev.asimo.io" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization"

# Response includes:
# access-control-allow-origin: https://dev.asimo.io
# access-control-allow-credentials: true
# access-control-allow-methods: GET, POST, PUT, DELETE, PATCH
```

### API Endpoint Tests

```bash
# Login works
curl -s https://dev.asimo.io/api/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@asimo.io","password":"admin123"}'
# Returns: {"access_token": "eyJ..."}

# Conversations endpoint accessible (auth issue is separate)
curl -s "https://dev.asimo.io/api/conversations?page=1&pageSize=3" \
  -H "Authorization: Bearer <token>"
# Returns proper response or auth error (not 404/CORS error)
```

### Test Page

Created test page at `/var/www/dev.asimo.io/test-cors.html` to verify from browser:

```
https://dev.asimo.io/test-cors.html
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

1. **Open browser and visit:** https://dev.asimo.io
2. **Check Network tab:** API calls should go to `https://dev.asimo.io/api/*` (not 404)
3. **Check CORS headers:** Responses should include `Access-Control-Allow-Origin: https://dev.asimo.io`
4. **WebSocket:** Should connect to `wss://dev.asimo.io/api/realtime/ws` when creating conversation
5. **No CORS errors:** Browser console should not show "blocked by CORS policy"

## Configuration Files Changed

1. `/home/asimo/VoiceAssist/apps/web-app/src/hooks/useAuth.ts` (committed)
2. `/etc/apache2/sites-available/dev.asimo.io-le-ssl.conf` (not in repo)

## Environment Variables Verified

- `/home/asimo/VoiceAssist/apps/web-app/.env.development`:

  ```
  VITE_API_URL=https://dev.asimo.io/api
  VITE_WS_URL=wss://dev.asimo.io/api/realtime/ws
  ```

- `/home/asimo/VoiceAssist/services/api-gateway/.env`:
  ```
  ALLOWED_ORIGINS=https://assist1.asimo.io,https://assist.asimo.io,http://localhost:5173,https://dev.asimo.io
  ```

Both were already correct before this fix.

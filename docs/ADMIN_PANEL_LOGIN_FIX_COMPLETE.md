---
title: "Admin Panel Login Fix Complete"
slug: "admin-panel-login-fix-complete"
summary: "**Date:** 2025-11-22"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["devops", "sre"]
tags: ["admin", "panel", "login", "fix"]
---

# Admin Panel Login Fix - Complete Resolution

**Date:** 2025-11-22
**Issue:** Admin panel login at https://admin.asimo.io was failing with "Unexpected token '<', '<!DOCTYPE ' is not valid JSON"
**Status:** ✅ RESOLVED

## Problem Summary

The admin panel login was failing due to multiple compounding issues:

1. Frontend receiving HTML error pages instead of JSON responses
2. Apache unable to reach backend container
3. Docker services (Redis, Postgres) stopped
4. API response format mismatch between frontend and backend

## Root Causes and Solutions

### 1. Apache Proxy Configuration

**Problem:** Apache was configured to proxy to `localhost:8000`, but the backend Docker container wasn't accessible via localhost port mapping.

**Solution:** Updated Apache proxy configuration to use container IP directly.

**File:** `/etc/apache2/sites-available/admin.asimo.io.conf`

```apache
# Before:
ProxyPass /api http://localhost:8000/api
ProxyPassReverse /api http://localhost:8000/api

# After:
ProxyPass /api http://172.18.0.2:8000/api
ProxyPassReverse /api http://172.18.0.2:8000/api
```

**Commands:**

```bash
sudo cp /tmp/admin.asimo.io-static.conf /etc/apache2/sites-available/admin.asimo.io.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

### 2. Docker Services Stopped

**Problem:** Redis and Postgres containers had exited, causing backend connection failures.

**Solution:** Restarted both containers.

**Commands:**

```bash
# Identify stopped containers
docker ps -a | grep -E 'redis|postgres'

# Restart services
docker start f478d2901588_voiceassist-redis 5ec82d4fbfa9_voiceassist-postgres

# Verify they're running
docker ps | grep -E 'redis|postgres'
```

### 3. Postgres Password Mismatch

**Problem:** Backend `.env` file had a different Postgres password than the one used when creating the container.

**Details:**

- `.env` password: `kuBoHRZbmT9d3pDXCmZv5gLmttrJZCXO`
- Container password: `b73576d93447d24cfca122df1e9179d0`

**Solution:** Restarted backend container with correct password override.

**Commands:**

```bash
# Stop and remove old container
docker stop voiceassist-server
docker rm voiceassist-server

# Start with correct password
docker run -d \
  --name voiceassist-server \
  --network voiceassist_database-network \
  -p 8000:8000 \
  --env-file /home/asimo/VoiceAssist/.env \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_PASSWORD=b73576d93447d24cfca122df1e9179d0 \
  -e REDIS_HOST=redis \
  -e QDRANT_HOST=qdrant \
  voiceassist_voiceassist-server:latest
```

### 4. Frontend API Response Format Mismatch

**Problem:** The backend `/api/auth/login` endpoint returns a flat JSON response:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer",
  "expires_in": 900
}
```

But the frontend was using `fetchAPI()` which expects responses wrapped in an APIEnvelope:

```json
{
  "success": true,
  "data": { ... }
}
```

**Solution:** Updated `AuthContext.tsx` to use direct `fetch()` for login instead of `fetchAPI()`.

**File:** `/home/asimo/VoiceAssist/apps/admin-panel/src/contexts/AuthContext.tsx`

**Change:**

```typescript
// Before: Using fetchAPI (expects APIEnvelope)
const response = await fetchAPI<{ access_token: string; ... }>(
  '/api/auth/login',
  { method: 'POST', body: JSON.stringify({ email, password }) }
);

// After: Direct fetch (handles flat response)
const res = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

if (!res.ok) {
  throw new Error(`Login failed: ${res.statusText}`);
}

const response = await res.json() as { access_token: string; ... };
```

**Deployment:**

```bash
cd /home/asimo/VoiceAssist/apps/admin-panel
npm run build
sudo cp -r dist/* /var/www/admin.asimo.io/
```

## Verification

### Backend API Test

```bash
curl -s https://admin.asimo.io/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@asimo.io","password":"admin123"}' | jq .
```

**Expected Output:**

```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "bearer",
  "expires_in": 900
}
```

### Docker Services Status

```bash
docker ps | grep -E 'redis|postgres|voiceassist-server'
```

**Expected:** All three containers should show `Up` and `healthy` status.

### Apache Logs

```bash
sudo tail -20 /var/log/apache2/admin-voiceassist-error.log
```

**Expected:** No new 503 errors or connection refused errors.

## Git Changes

**Branch:** `fix/admin-panel-login-api-format`

**Files Changed:**

- `apps/admin-panel/src/contexts/AuthContext.tsx`

**Commit Message:**

```
Fix admin panel login API response format mismatch

The backend /api/auth/login endpoint returns a flat JSON response with
access_token, refresh_token, etc., but the frontend was using fetchAPI()
which expects responses wrapped in an APIEnvelope format.
```

**Push:**

```bash
git checkout -b fix/admin-panel-login-api-format
git add apps/admin-panel/src/contexts/AuthContext.tsx
git commit -m "..."
git push -u origin fix/admin-panel-login-api-format
```

**PR Link:** https://github.com/mohammednazmy/VoiceAssist/pull/new/fix/admin-panel-login-api-format

## Docker Network Configuration

**Network:** `voiceassist_database-network`

**Containers on Network:**

- `voiceassist-server` (172.18.0.2) - Backend API
- `f478d2901588_voiceassist-redis` (172.18.0.3) - Redis cache
- `voiceassist-qdrant` (172.18.0.4) - Vector database
- `5ec82d4fbfa9_voiceassist-postgres` (172.18.0.5) - PostgreSQL database

**Network Aliases:**

- `postgres` → 172.18.0.5
- `redis` → 172.18.0.3
- `qdrant` → 172.18.0.4

## Lessons Learned

1. **Docker Port Publishing:** The `-p 8000:8000` flag doesn't always work as expected when containers are on custom bridge networks. Using container IPs directly in Apache proxy config is more reliable.

2. **Environment Variable Mismatches:** Always verify that `.env` files match the actual container configurations, especially for passwords and hostnames.

3. **API Response Formats:** Backend auth endpoints may use different response formats than standard API endpoints. Don't assume all endpoints follow the same envelope pattern.

4. **Error Diagnosis:** When seeing JSON parse errors with HTML content, check:
   - Apache proxy configuration
   - Backend service availability
   - Network connectivity between Apache and containers

## Future Improvements

1. **Container Management:** Consider using docker-compose to ensure all services start together with correct configurations.

2. **Health Checks:** Add monitoring to detect when Redis/Postgres containers stop unexpectedly.

3. **API Consistency:** Consider wrapping auth endpoints in the same APIEnvelope format as other endpoints, or update frontend to handle both formats gracefully.

4. **Environment Validation:** Add startup checks to verify `.env` values match container configurations.

## Related Documentation

- `/home/asimo/VoiceAssist/docs/ADMIN_PANEL_LOGIN_FIX.md` - Previous troubleshooting attempts
- `/etc/apache2/sites-available/admin.asimo.io.conf` - Apache configuration
- `/home/asimo/VoiceAssist/.env` - Environment variables

## Testing Checklist

- [x] Backend `/api/auth/login` returns valid JSON tokens
- [x] Frontend builds without errors
- [x] Production build deployed to `/var/www/admin.asimo.io/`
- [x] Apache proxies requests to backend correctly
- [x] All Docker containers running and healthy
- [x] Git changes committed and pushed
- [ ] **User tests login at https://admin.asimo.io/login** ← Final verification needed

## Status

✅ **FIXED** - All technical issues resolved. Awaiting user verification of login functionality in browser.

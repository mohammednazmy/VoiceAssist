# PWA Service Worker Hardening

This document describes the hardening measures implemented to prevent stale service worker issues.

## Problem Summary

When users visited localhost:5173 while Vite dev server was running (with `devOptions.enabled: true`), a development service worker was registered. When production was later deployed, this stale dev SW tried to load dev-mode URLs (`/main.tsx`, `/@react-refresh`, etc.) which no longer existed, causing the app to fail loading.

## Implemented Solutions

### 1. Disabled Dev Service Worker (vite.config.ts)

```typescript
devOptions: {
  enabled: false, // Prevents dev SW registration that can conflict with production
  type: "module",
},
```

**Why**: Dev service workers can persist in users' browsers and cause issues when switching to production.

### 2. Aggressive Service Worker Lifecycle (vite.config.ts)

```typescript
workbox: {
  skipWaiting: true,      // New SW activates immediately
  clientsClaim: true,     // SW claims all clients immediately
  cleanupOutdatedCaches: true,  // Auto-removes old cache versions
  navigateFallback: "index.html",
  navigateFallbackDenylist: [/^\/api\//],
}
```

**Why**: Ensures new deployments take effect immediately without waiting for all tabs to close.

### 3. Auto-Update Registration (vite.config.ts)

```typescript
registerType: "autoUpdate",
```

**Why**: Automatically updates to new SW versions without prompting users.

### 4. One-Time Cleanup Script (index.html)

A versioned cleanup script that runs once per deployment to clear any stale service workers:

```javascript
var CLEANUP_VERSION = "20251205";
// Unregisters all SWs and clears all caches on version change
```

**Why**: Handles edge cases where users have corrupted or stale SW state.

### 5. Apache Cache Headers (localhost:5173-le-ssl.conf)

```apache
# SW files: Never cache
<FilesMatch "^(sw|workbox-.*|service-worker)\.js$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
</FilesMatch>

# HTML: Always revalidate
<FilesMatch "\.html$">
    Header set Cache-Control "no-cache, must-revalidate"
</FilesMatch>

# Hashed assets: Cache forever
<Directory /var/www/localhost:5173/assets>
    Header set Cache-Control "public, max-age=31536000, immutable"
</Directory>
```

**Why**: Ensures browsers always fetch the latest SW and HTML while efficiently caching static assets.

## Verification

After deployment, verify headers are correct:

```bash
# SW should have no-cache
curl -sI "http://localhost:5173/sw.js" | grep -i cache
# Expected: Cache-Control: no-cache, no-store, must-revalidate

# HTML should revalidate
curl -sI "http://localhost:5173/index.html" | grep -i cache
# Expected: Cache-Control: no-cache, must-revalidate

# Assets should be cached long-term
curl -sI "http://localhost:5173/assets/index-*.js" | grep -i cache
# Expected: Cache-Control: public, max-age=31536000, immutable
```

## Deployment Checklist

When deploying updates:

1. Run `pnpm build` to create production bundle
2. Copy `dist/*` to `/var/www/localhost:5173/`
3. Verify SW has `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`:
   ```bash
   grep -o "skipWaiting\|clientsClaim\|cleanupOutdatedCaches" /var/www/localhost:5173/sw.js
   ```
4. Test cache headers are correct (see Verification above)

## Troubleshooting

If users report blank pages or module loading errors:

1. **Check browser console** for "Failed to load module script" errors
2. **Clear browser data**: DevTools → Application → Storage → Clear site data
3. **Update CLEANUP_VERSION** in index.html to force cache reset for all users
4. Rebuild and redeploy

## Future Considerations

- Monitor for SW-related errors in Sentry
- Consider implementing a "Check for Updates" button in the UI
- Add SW version logging for debugging

---

_Last updated: 2025-12-05_
_Implemented after production incident with stale dev service workers_

---
title: Frontend Debugging Guide
slug: debugging/frontend
summary: "Debug React web app, admin panel, and frontend issues in VoiceAssist."
status: stable
stability: production
owner: frontend
lastUpdated: "2025-11-27"
audience:
  - human
  - agent
  - ai-agents
  - frontend
tags:
  - debugging
  - runbook
  - frontend
  - react
  - web-app
  - troubleshooting
relatedServices:
  - web-app
  - admin-panel
category: debugging
component: "frontend/web-app"
relatedPaths:
  - "apps/web-app/src/App.tsx"
  - "apps/web-app/src/components/Layout.tsx"
  - "apps/admin-panel/src/App.tsx"
version: 1.0.0
ai_summary: >-
  Last Updated: 2025-11-27 Components: apps/web-app/, apps/admin-panel/ ---
  Likely Causes: - JavaScript syntax error - Missing environment variables -
  Failed API call blocking render - CORS issues Steps to Investigate: 1. Open
  Browser DevTools (F12) → Console tab 2. Look for red error messages 3. C...
---

# Frontend Debugging Guide

**Last Updated:** 2025-11-27
**Components:** `apps/web-app/`, `apps/admin-panel/`

---

## Symptoms

### Blank Page / App Won't Load

**Likely Causes:**

- JavaScript syntax error
- Missing environment variables
- Failed API call blocking render
- CORS issues

**Steps to Investigate:**

1. Open Browser DevTools (F12) → Console tab
2. Look for red error messages
3. Check Network tab for failed requests
4. Verify environment variables:

```bash
# In apps/web-app/
cat .env.local
# Should have VITE_API_URL, etc.
```

**Common Fixes:**

```bash
# Clear cache and rebuild
rm -rf node_modules/.vite
pnpm dev

# Check for TypeScript errors
pnpm tsc --noEmit

# Verify dependencies
pnpm install
```

**Relevant Code Paths:**

- `apps/web-app/src/main.tsx` - Entry point
- `apps/web-app/src/App.tsx` - Root component
- `apps/web-app/vite.config.ts` - Build config

---

### API Calls Failing

**Likely Causes:**

- Wrong API base URL
- CORS not configured
- Auth token expired/missing
- Network connectivity

**Steps to Investigate:**

1. Check Network tab in DevTools:
   - Filter by XHR/Fetch
   - Look at request headers (Authorization present?)
   - Check response status and body

2. Verify API URL:

```javascript
// In browser console
console.log(import.meta.env.VITE_API_URL);
```

3. Test API directly:

```bash
curl -X GET http://localhost:8000/health
```

4. Check CORS headers in response:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
```

**Relevant Code Paths:**

- `apps/web-app/src/lib/api/` - API client
- `apps/web-app/src/stores/authStore.ts` - Auth state
- `packages/api-client/` - Shared HTTP client

---

### State Not Updating

**Likely Causes:**

- Direct state mutation instead of setter
- Missing useEffect dependency
- Stale closure in callback
- Zustand/context not wired correctly

**Steps to Investigate:**

1. Install React DevTools browser extension
2. Inspect component state
3. Add console.log in useEffect:

```typescript
useEffect(() => {
  console.log("Effect triggered, deps:", someDependency);
}, [someDependency]);
```

4. Check for mutations:

```typescript
// BAD - mutates state directly
state.items.push(newItem);

// GOOD - creates new array
setState((prev) => ({ ...prev, items: [...prev.items, newItem] }));
```

**Common Patterns:**

```typescript
// Correct useEffect dependencies
useEffect(() => {
  fetchData();
}, [fetchData]); // Include the function if it's a dependency

// Use useCallback for stable function references
const fetchData = useCallback(async () => {
  // ...
}, [dependency]);
```

**Relevant Code Paths:**

- `apps/web-app/src/stores/` - Zustand stores
- `apps/web-app/src/hooks/` - Custom hooks

---

### Slow Rendering / Performance Issues

**Likely Causes:**

- Unnecessary re-renders
- Large lists without virtualization
- Expensive computations in render
- Memory leaks

**Steps to Investigate:**

1. React DevTools → Profiler tab → Record
2. Look for components re-rendering frequently
3. Check for missing React.memo:

```typescript
// Wrap pure components
export const ExpensiveComponent = React.memo(({ data }) => {
  // ...
});
```

4. Use useMemo for expensive computations:

```typescript
const processedData = useMemo(() => {
  return expensiveComputation(rawData);
}, [rawData]);
```

5. Virtualize long lists:

```typescript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={400}
  itemCount={items.length}
  itemSize={50}
>
  {Row}
</FixedSizeList>
```

**Performance Checklist:**

- [ ] Components using React.memo where appropriate
- [ ] useMemo/useCallback for expensive operations
- [ ] Lists virtualized if > 100 items
- [ ] No inline object/array creation in props
- [ ] Images lazy-loaded

---

### Build Errors

**TypeScript Errors:**

```bash
# Check for type errors
pnpm tsc --noEmit

# Common fixes:
# - Add missing types
# - Fix import paths
# - Update @types/* packages
```

**Vite Build Errors:**

```bash
# Clear cache
rm -rf node_modules/.vite dist

# Check for circular imports
# Look for "Circular dependency detected" warnings

# Verify vite.config.ts aliases match tsconfig.json paths
```

**ESLint Errors:**

```bash
# Run linter
pnpm lint

# Auto-fix what's possible
pnpm lint --fix
```

---

## Browser-Specific Issues

### Safari

- WebSocket connections may need explicit protocol
- AudioContext requires user interaction to start
- Date parsing differs from Chrome

### Firefox

- Stricter CORS enforcement
- Different CSS rendering in some cases

### Mobile Browsers

- Touch events vs click events
- Viewport height issues (100vh)
- Keyboard pushing content

---

## Debugging Tools

### Browser DevTools

| Tool     | Usage                         |
| -------- | ----------------------------- |
| Console  | JavaScript errors, logs       |
| Network  | API calls, assets loading     |
| Elements | DOM inspection, CSS debugging |
| Sources  | Breakpoints, step debugging   |
| Profiler | Performance analysis          |
| Memory   | Memory leaks, heap snapshots  |

### React DevTools

- Component tree inspection
- Props and state viewing
- Profiler for render performance
- Hook inspection

### VS Code

```json
// .vscode/launch.json for debugging
{
  "type": "chrome",
  "request": "launch",
  "name": "Debug Web App",
  "url": "http://localhost:5173",
  "webRoot": "${workspaceFolder}/apps/web-app/src"
}
```

---

## Common Error Messages

| Error                                  | Cause                                    | Fix                                                |
| -------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `Cannot read properties of undefined`  | Accessing nested prop without null check | Optional chaining: `obj?.nested?.prop`             |
| `Objects are not valid as React child` | Rendering object directly                | Use `JSON.stringify()` or access specific property |
| `Each child should have unique key`    | Missing key prop in list                 | Add `key={item.id}` to list items                  |
| `Maximum update depth exceeded`        | Infinite re-render loop                  | Check useEffect dependencies                       |
| `Failed to fetch`                      | Network/CORS error                       | Check API URL and CORS config                      |

---

## Related Documentation

- [Debugging Overview](./DEBUGGING_OVERVIEW.md)
- [Frontend Architecture](../FRONTEND_ARCHITECTURE.md)
- [Design Tokens](../../packages/design-tokens/)

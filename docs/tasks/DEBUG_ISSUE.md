# Task: Debug an Issue

Systematic debugging checklist for VoiceAssist issues.

## Step 1: Identify the Layer

Where is the issue occurring?

```
Issue symptoms?
│
├─ API returns error → Backend issue
├─ Page won't load → Frontend issue
├─ No data displayed → API/Database issue
├─ Container won't start → Docker/Config issue
├─ Tests failing → Code or test issue
└─ Voice not working → Voice pipeline issue
```

## Step 2: Gather Information

### For Backend Issues

```bash
# Check container logs
docker logs voiceassist-server -f --tail 100

# Check health
curl http://localhost:8000/health
curl http://localhost:8000/ready

# Check specific endpoint
curl -v http://localhost:8000/api/endpoint

# Check database
docker exec -it voiceassist-postgres psql -U voiceassist -d voiceassist
```

- [ ] Checked container logs
- [ ] Verified service health
- [ ] Identified error message/stack trace

### For Frontend Issues

```bash
# Check browser console (F12 → Console)
# Check Network tab for failed requests

# Check build
cd apps/web-app
pnpm build

# Check types
pnpm type-check
```

- [ ] Checked browser console for errors
- [ ] Checked network requests
- [ ] Verified build succeeds

### For Docker/Infrastructure Issues

```bash
# Check all containers
docker compose ps

# Check resource usage
docker stats

# Restart all
docker compose down && docker compose up -d

# Rebuild from scratch
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

- [ ] Verified all containers running
- [ ] Checked for resource issues

## Step 3: Common Issues Reference

### Backend

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| 500 Internal Server Error | Unhandled exception | Check logs for stack trace |
| 401 Unauthorized | Invalid/expired token | Re-authenticate |
| 422 Validation Error | Bad request body | Check Pydantic schema |
| Connection refused | Service not running | `docker compose up -d` |
| Database error | Migration issue | `alembic upgrade head` |

### Frontend

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Blank page | JavaScript error | Check console |
| CORS error | Backend misconfigured | Check CORS settings |
| 404 on API | Wrong endpoint URL | Check API route |
| Stale data | Query cache | Invalidate query |
| Type error | Schema mismatch | Sync types with backend |

### Voice

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| No audio input | Microphone permission | Grant browser permission |
| STT not working | Deepgram API key | Check DEEPGRAM_API_KEY |
| TTS not working | ElevenLabs API key | Check ELEVENLABS_API_KEY |
| WebSocket disconnect | Session timeout | Refresh session |

## Step 4: Debug Process

### For Python/Backend

```python
# Add debug logging
import logging
logger = logging.getLogger(__name__)
logger.debug(f"Variable value: {variable}")

# Use breakpoint
breakpoint()  # Will pause execution

# Run with verbose logging
LOG_LEVEL=DEBUG python -m pytest tests/test_file.py -v -s
```

### For TypeScript/Frontend

```typescript
// Add console logging
console.log('Variable:', variable);

// Use debugger
debugger; // Will pause in browser DevTools

// Check React component state
// React DevTools browser extension
```

### For Database

```sql
-- Check table contents
SELECT * FROM users LIMIT 10;

-- Check recent changes
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;

-- Check connections
SELECT * FROM pg_stat_activity;
```

## Step 5: Write a Fix

- [ ] Identified root cause
- [ ] Implemented fix
- [ ] Added test to prevent regression
- [ ] Verified fix works locally

## Step 6: Document (if significant)

For significant bugs or non-obvious fixes:

- [ ] Added code comment explaining fix
- [ ] Updated documentation if behavior changed
- [ ] Mentioned in commit message

## Debugging Resources

- [debugging/DEBUGGING_INDEX.md](../debugging/DEBUGGING_INDEX.md) - Full debugging guides
- [debugging/DEBUGGING_BACKEND.md](../debugging/DEBUGGING_BACKEND.md) - Backend-specific
- [debugging/DEBUGGING_DOCS_SITE.md](../debugging/DEBUGGING_DOCS_SITE.md) - Docs site issues
- [QUICK_REFERENCE.md](../QUICK_REFERENCE.md) - Common commands

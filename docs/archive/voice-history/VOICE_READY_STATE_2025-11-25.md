---
title: Voice Ready State 2025 11 25
slug: voice-ready-state-2025-11-25
summary: >-
  The voice pipeline is now stable on `main` with all tests passing. This
  document serves as context for future AI assistant sessions.
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - voice
  - ready
  - state
  - "2025"
category: reference
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/api/voice.py"
  - "apps/web-app/src/components/voice/VoiceModePanel.tsx"
ai_summary: >-
  The voice pipeline is now stable on main with all tests passing. This document
  serves as context for future AI assistant sessions. - PR #47: Unified Voice
  Mode pipeline (ephemeral tokens, settings -> backend, chat integration,
  metrics) - PR #48: /api/voice/metrics + frontend metrics export (sendB...
---

# VoiceAssist Voice-Ready State - November 25, 2025

## Summary

The voice pipeline is now stable on `main` with all tests passing. This document serves as context for future AI assistant sessions.

## Current State

### Merged PRs

- **PR #47**: Unified Voice Mode pipeline (ephemeral tokens, settings -> backend, chat integration, metrics)
- **PR #48**: `/api/voice/metrics` + frontend metrics export (sendBeacon), 11 metrics tests
- **PR #49**: Voice observability stack (Sentry backend/frontend, SLOs, Prometheus metrics, E2E transcript validation)
- **PR #60**: Fixed 404 on `/api/voice/realtime-session` by adding `prefix="/api"` for voice.router
- **PRs #50-56, #58-59**: All Dependabot dependency updates merged; #57 closed as superseded

### Test Status (All Passing)

| Test Suite                                 | Tests                       | Status |
| ------------------------------------------ | --------------------------- | ------ |
| Backend: test_openai_config.py             | 17 passed, 3 skipped (live) | ✅     |
| Backend: test_voice_metrics.py             | 11 passed                   | ✅     |
| Frontend: useRealtimeVoiceSession          | 22 passed                   | ✅     |
| Frontend: voiceSettingsStore               | 17 passed                   | ✅     |
| Frontend: VoiceModeSettings                | 25 passed                   | ✅     |
| Frontend: MessageInput-voice-settings      | 12 passed                   | ✅     |
| Frontend: useChatSession-voice-integration | 8 passed                    | ✅     |
| UI: MessageBubble                          | 18 passed                   | ✅     |

**Known Issue (Not Voice-Related):** `test_realtime_voice_pipeline.py` has Qdrant DNS errors - this is external infrastructure, not voice code.

### API Gateway Dependency Fix (This Session - 2025-11-25 18:00 UTC)

Resolved arq/redis version conflict that was preventing Docker builds:

**Problem:**

- `requirements.txt` had `redis==7.1.0` but `arq==0.26.3` requires `redis<6`
- Docker build failed with pip dependency resolution error
- Previous hot-patch in running container had `redis==4.6.0` (working)

**Solution:**

- Changed `redis==7.1.0` → `redis==4.6.0` in `services/api-gateway/requirements.txt`
- Updated comment to reflect the actual constraint (arq compatibility, not fastapi-cache2)
- Rebuilt Docker image successfully
- Container now runs from correct built image (no manual `docker cp` needed)

**Verification:**

- Docker build passes cleanly
- Container starts with `redis==4.6.0` + `arq==0.26.3`
- `/api/voice/realtime-session` returns 401 (auth required), not 404
- `/api/voice/metrics` returns 405 (expects POST), not 404
- All 28 backend tests pass
- All 84 frontend voice tests pass

**Branch:** `claude/api-gateway-redis-arq-fix-20251125180054`

### MessageBubble Fix (Previous Session)

Fixed DOM nesting issues in `MessageBubble.tsx` that caused 2 failing tests:

**Problem:** `<div>` and `<pre>` elements inside `<p>` tags when rendering markdown code blocks.

**Solution:**

1. Added `pre` component override returning a Fragment to avoid double-wrapping
2. Improved inline vs block code detection logic
3. Wrapped syntax highlighted code in semantic `<code>` element
4. Used `<span>` instead of `<div>` for line wrappers inside `<pre>`

**Branch:** `claude/ui-tests-cleanup-20251125155226`
**Commit:** `82bc1f7`

## Voice + Observability Stack Architecture

```
Frontend (localhost:5173 / localhost:5173)
├── VoiceModePanel (UI component)
│   └── Uses useRealtimeVoiceSession hook
├── voiceSettingsStore (Zustand)
│   └── Persists: voice, language, vadSensitivity, autoStartOnOpen, showStatusHints
├── Metrics Collection
│   └── sendBeacon to /api/voice/metrics on disconnect
└── Sentry Integration
    └── Frontend error tracking

Backend (FastAPI)
├── /api/voice/realtime-session
│   └── Generates ephemeral OpenAI token + session config
├── /api/voice/metrics
│   └── Accepts voice session metrics
├── RealtimeVoiceService
│   └── Uses settings from request (voice, language, vad_sensitivity)
├── Prometheus Metrics
│   └── voice_session_duration, token_generation_time, etc.
└── Sentry Integration
    └── Backend error tracking with voice SLO alerts
```

## E2E Tests

E2E tests exist at `/home/asimo/VoiceAssist/e2e/`:

- `voice-mode-navigation.spec.ts`
- `voice-mode-session-smoke.spec.ts`
- `voice-transcript-validation.spec.ts`

**To run:** Requires dev server (`pnpm dev`) via Playwright's `webServer` config.

## TODOs for Future Work

### Infrastructure/Observability

- [ ] Configure Prometheus scrapes for voice metrics
- [ ] Set up Grafana dashboards for voice SLOs
- [ ] Configure Sentry alerts for voice SLO violations

### Voice UX Features (After Stable Pipeline)

- [ ] Per-user voice preferences persistence (backend)
- [ ] Voice activity visualization improvements
- [ ] Multi-language auto-detection
- [ ] Session resumption on reconnect

### Testing

- [ ] Add E2E tests to CI pipeline with automated dev server startup
- [ ] Investigate Qdrant DNS issues for full realtime pipeline tests

## Quick Commands

```bash
# Run backend voice tests
cd /home/asimo/VoiceAssist/services/api-gateway
source venv/bin/activate && export PYTHONPATH=.
python -m pytest tests/integration/test_openai_config.py tests/integration/test_voice_metrics.py -v

# Run frontend voice tests
cd /home/asimo/VoiceAssist/apps/web-app
export NODE_OPTIONS="--max-old-space-size=768"
npx vitest run src/hooks/__tests__/useRealtimeVoiceSession.test.ts \
  src/stores/__tests__/voiceSettingsStore.test.ts \
  src/components/voice/__tests__/VoiceModeSettings.test.tsx

# Run MessageBubble tests
npx vitest run src/components/chat/__tests__/MessageBubble.test.tsx
```

---

_Last updated: 2025-11-25 by Claude_

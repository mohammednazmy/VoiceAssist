## Summary

This PR unifies the Voice Mode pipeline with comprehensive documentation, E2E testing, and observability. The pipeline enables real-time voice conversations using OpenAI's Realtime API with secure ephemeral session authentication.

### Key Features

- **Ephemeral token authentication**: No raw OpenAI API keys exposed to browser
- **Settings propagation**: Voice, language, and VAD sensitivity flow from UI to backend
- **Chat timeline integration**: Voice messages appear in chat with `metadata.source: "voice"`
- **Metrics tracking**: Connection time, STT latency, response latency, session duration
- **Robust state management**: Handles connecting, connected, reconnecting, failed, expired states

### Pipeline Flow

```
User Settings → VoiceModePanel → useRealtimeVoiceSession → /api/voice/realtime-session
                                        ↓
                              Backend ephemeral token → WebSocket → OpenAI Realtime
                                        ↓
                              Voice transcripts → Chat timeline (via addMessage)
```

### Documentation Added

- `docs/VOICE_MODE_PIPELINE.md` - Comprehensive pipeline architecture, API contracts, metrics
- Updated `docs/VOICE_MODE_SETTINGS_GUIDE.md` - Links to pipeline doc
- Updated `docs/TESTING_GUIDE.md` - Voice Pipeline Smoke Suite commands

### Commits in this Branch

1. `feat(voice): improve Voice Mode UX and integrate with chat timeline`
2. `test(e2e): align Voice Mode E2E selectors with current UI`
3. `fix(e2e): repair Voice Mode E2E tests for correct panel opening`
4. `feat(voice): add metrics and latency tracking to realtime voice session`
5. `test(voice): add E2E voice→chat integration tests and observability`
6. `docs(voice): document unified Voice Mode pipeline and test suite` (this commit)

## Test Plan

### Voice Pipeline Smoke Suite

All tests pass:

- [x] Backend: 17 passed, 3 skipped (live tests gated)
- [x] useRealtimeVoiceSession: 22/22
- [x] useChatSession-voice-integration: 8/8
- [x] voiceSettingsStore: 17/17
- [x] VoiceModeSettings: 25/25
- [x] MessageInput-voice-settings: 12/12
- [x] E2E voice-mode-navigation: 4/4
- [x] E2E voice-mode-session-smoke: 2/3 (1 skipped for live backend)
- [x] E2E voice-mode-voice-chat-integration: 4/4

**Total: 95 tests passing**

### Test Commands

```bash
# Backend
cd services/api-gateway && source venv/bin/activate
python -m pytest tests/integration/test_openai_config.py -v

# Frontend (run individually)
cd apps/web-app && export NODE_OPTIONS="--max-old-space-size=768"
npx vitest run src/hooks/__tests__/useRealtimeVoiceSession.test.ts --reporter=dot

# E2E
npx playwright test e2e/voice-mode-*.spec.ts --project=chromium --reporter=list
```

## Future Work

- [ ] Metrics export to backend for aggregation/alerting
- [ ] Performance baseline establishment (connection <2s, STT <500ms targets)
- [ ] Error tracking integration (Sentry)
- [ ] Voice→chat transcript content E2E test (actual content validation)

---

Generated with [Claude Code](https://claude.com/claude-code)

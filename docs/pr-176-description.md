## PR #176 – Updated Description

### What’s Included

- Admin-panel test fixes aligned with Silero VAD/feature-flag updates:
  - Prompts hook tests wrap async calls in `act`/`waitFor` and assert error states consistently.
  - VoiceMonitor tests scope assertions to specific panels/rows to avoid duplicate-text collisions; TT/Analytics checks target the correct elements.
  - FeatureFlags tests mock `useFeatureFlagsRealtime`/`useScheduledChanges`, scope stat cards, and target modal content to match the SSE-backed feature flags UI.
  - KB Upload tests updated for retry/progress semantics (progress objects, retries, and error handling).
  - Minor realtime/auth test stability tweaks.

### Status

- Branch: `feat/silero-vad-improvements`
- Latest commit: `029a3c6`
- Tests: `pnpm --filter voiceassist-admin test` ✅, `pnpm test:fast` ✅ (act warnings remain as logs only).

### Notes

- This batch is test-only; no production code changes.
- Existing act warnings remain informational and do not fail suites.

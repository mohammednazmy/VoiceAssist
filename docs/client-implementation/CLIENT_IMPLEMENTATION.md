# Client Implementation Guide (Stub)

Placeholder document to satisfy docs build references. Replace with a real guide as needed.

Suggested outline if you fill it in:
- Overview of client apps: web (`http://localhost:5173`), admin (`http://localhost:5174`), docs (`http://localhost:3001`).
- Local API endpoint: `http://localhost:8000` (WS: `ws://localhost:8000/api/realtime/ws`).
- Env files: apps/web-app/.env.* and apps/admin-panel/.env.* configured for localhost.
- Building: `pnpm --filter voiceassist-web build`, `pnpm --filter voiceassist-admin build`, `pnpm --filter docs-site build`.
- E2E testing: Playwright projects for voice, barge-in, multi-turn.

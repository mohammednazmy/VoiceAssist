# voiceassist-admin Nextcloud App (Skeleton)

This directory contains a **skeleton** Nextcloud app for `voiceassist-admin` as part of
Phase 6: Nextcloud App Integration & Unified Services.

## Status

- Not ready for production
- Proxy routes expose VoiceAssist integration endpoints for admin-focused workflows.
- Packaged via `../package.sh` for deployment testing.

See:
- `docs/phases/PHASE_06_NEXTCLOUD_APPS.md`
- `docs/NEXTCLOUD_INTEGRATION.md`

## Development notes

Set `VOICEASSIST_API_BASE` in the Nextcloud app environment to point at your API Gateway base URL (defaults to `http://localhost:8000`).

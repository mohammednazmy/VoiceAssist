# voiceassist-client Nextcloud App (Skeleton)

This directory contains a **skeleton** Nextcloud app for `voiceassist-client` as part of
Phase 6: Nextcloud App Integration & Unified Services.

## Status

- Not ready for production
- Basic proxy routes are wired to the VoiceAssist API Gateway for calendar, files, contacts, and email integration metadata.
- Packaged via `../package.sh` for deployment testing.

See:

- `docs/phases/PHASE_06_NEXTCLOUD_APPS.md`
- `docs/NEXTCLOUD_INTEGRATION.md`

## Development notes

Set `VOICEASSIST_API_BASE` in the Nextcloud app environment to point at your API Gateway base URL (defaults to `http://localhost:8000`).

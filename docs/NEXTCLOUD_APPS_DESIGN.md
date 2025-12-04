---
title: Nextcloud Apps Design
slug: nextcloud-apps-design
summary: "**Status:** In Progress (Phase 6 foundation started)"
status: stable
stability: beta
owner: docs
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - nextcloud
  - apps
  - design
category: reference
ai_summary: >-
  Status: In Progress (Phase 6 foundation started) Scope: Define how VoiceAssist
  integrates with Nextcloud via dedicated apps. Phase 6 introduces three
  Nextcloud apps under nextcloud-apps/: - voiceassist-client – entry point for
  clinicians to launch the VoiceAssist web client from Nextcloud. - voic...
---

# Nextcloud Apps Design (Phase 6)

**Status:** In Progress (Phase 6 foundation started)
**Scope:** Define how VoiceAssist integrates with Nextcloud via dedicated apps.

## Overview

Phase 6 introduces three Nextcloud apps under `nextcloud-apps/`:

- `voiceassist-client` – entry point for clinicians to launch the VoiceAssist web client from Nextcloud.
- `voiceassist-admin` – admin-facing integration surface (e.g., linking VoiceAssist Admin Panel).
- `voiceassist-docs` – bridges Nextcloud files to the VoiceAssist knowledge base ingestion pipeline.

Each app is currently a **skeleton**:

- `appinfo/info.xml` with metadata
- `appinfo/routes.php` placeholder
- `lib/AppInfo/Application.php` class stub
- `README.md` describing status

These apps are not packaged or enabled by default; they are scaffolding for later work.

## Goals for Phase 6

- Provide real Nextcloud app structures so documentation references are concrete.
- Design a unified experience where:
  - Clinicians can open VoiceAssist directly from Nextcloud.
  - Admins can route documents from Nextcloud into the medical KB.
  - Permissions align between Nextcloud and VoiceAssist roles.

## Future Work

Later in Phase 6 and beyond:

- Implement real routes and controllers in each app.
- Add OAuth/OIDC integration with VoiceAssist auth (see SECURITY_COMPLIANCE.md).
- Connect app UIs to API endpoints in `services/api-gateway/app/` for:
  - Document ingestion
  - Calendar and email actions
  - File search and linking

See also:

- `NEXTCLOUD_INTEGRATION.md`
- `phases/PHASE_06_NEXTCLOUD_APPS.md`

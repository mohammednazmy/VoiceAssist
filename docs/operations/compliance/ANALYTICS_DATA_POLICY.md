---
title: "Analytics Data Policy"
slug: "operations/compliance/analytics-data-policy"
summary: "VoiceAssist uses privacy-preserving analytics to understand feature adoption and reliability. Analytics are **opt-in** and disabled by default until a..."
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["analytics", "data", "policy"]
category: security
---

# VoiceAssist Web Analytics Data Policy

## Overview

VoiceAssist uses privacy-preserving analytics to understand feature adoption and reliability. Analytics are **opt-in** and disabled by default until a user provides consent through the in-app analytics preferences control.

## What we collect (with consent)

- Anonymous event metadata (page views, feature interactions)
- Basic technical context (browser type, viewport size, locale)
- Application health signals (error rates and performance timings)

### What we **do not** collect

- Protected Health Information (PHI) or clinical content
- User-entered message text or uploaded documents
- IP addresses (Plausible is configured to avoid storing IPs)
- Device fingerprints

## Consent and control

- Users can grant or decline analytics from the on-page preferences banner.
- The choice is stored locally and can be revisited at any time via the "Analytics preferences" control.
- When Do Not Track is enabled, analytics remain off regardless of consent.

## Providers and configuration

- Default provider: Plausible, loaded only after consent is granted.
- Runtime configuration: `VITE_ANALYTICS_PROVIDER`, `VITE_ANALYTICS_DOMAIN`, and optional `VITE_ANALYTICS_HOST` for self-hosted deployments.
- Localhost tracking is disabled unless explicitly enabled via configuration.

## Data retention and access

- Event storage respects the retention configured in the analytics provider (Plausible defaults to 24 months; self-hosted instances may differ).
- Access is limited to the observability/ops team for reliability and UX improvements.

## Opt-out process

- Users may revoke consent at any time using the in-app preferences control.
- Administrators can disable analytics globally by omitting analytics environment variables or setting `VITE_ANALYTICS_PROVIDER=none`.

## Security and compliance

- All analytics traffic uses HTTPS.
- Provider scripts are loaded from trusted hosts defined in configuration.
- No data sharing with third parties beyond the configured analytics host.

---
title: Docs Domain
slug: infra/docs-domain
summary: >-
  - **Primary:** `localhost:3001` (served via Apache2 reverse proxy → Next.js app
  on port 3001)
status: stable
stability: production
owner: infra
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - docs
  - domain
category: operations
ai_summary: >-
  - Primary: localhost:3001 (served via Apache2 reverse proxy → Next.js app on
  port 3001) - Secondary: assistlocalhost:3001 (301 redirect to primary for all
  paths and protocols) - Host: production web node running Apache2 with
  localhost:3001 virtual host - Service: docs-site Next.js runtime listening...
---

# Documentation Site Deployment & DNS

## Canonical Domain

- **Primary:** `localhost:3001` (served via Apache2 reverse proxy → Next.js app on port 3001)
- **Secondary:** `assistlocalhost:3001` (301 redirect to primary for all paths and protocols)

## Deployment Target

- Host: production web node running Apache2 with `localhost:3001` virtual host
- Service: `docs-site` Next.js runtime listening on **port 3001**
- Proxy: Apache forwards `http://localhost:3001/*` to `http://127.0.0.1:3001/` with host preservation
- TLS: Certificates managed by Certbot; HSTS enabled on the canonical host

## DNS Records

| Type  | Name                | Value                     | Purpose                                                                      |
| ----- | ------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| CNAME | localhost:3001       | apex/load balancer target | Routes traffic to the production proxy serving the docs site                 |
| CNAME | assistlocalhost:3001 | localhost:3001             | Ensures secondary domain follows the canonical domain and picks up redirects |

> Update the CNAME targets if the production load balancer or proxy host changes. Always keep `assistlocalhost:3001` pointed at `localhost:3001` so the redirect stays valid.

## Verification Checklist

- `curl -I http://localhost:3001/some/path` returns `301` to `http://localhost:3001/some/path`
- `curl -I http://localhost:3001` returns `200` and includes `Strict-Transport-Security`
- `systemctl status docs-site` (or supervisor target) shows the Next.js service running on port 3001

---
title: "Docs Domain"
slug: "infra/docs-domain"
summary: "- **Primary:** `docs.asimo.io` (served via Apache2 reverse proxy → Next.js app on port 3001)"
status: stable
stability: production
owner: infra
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["docs", "domain"]
---

# Documentation Site Deployment & DNS

## Canonical Domain

- **Primary:** `docs.asimo.io` (served via Apache2 reverse proxy → Next.js app on port 3001)
- **Secondary:** `assistdocs.asimo.io` (301 redirect to primary for all paths and protocols)

## Deployment Target

- Host: production web node running Apache2 with `docs.asimo.io` virtual host
- Service: `docs-site` Next.js runtime listening on **port 3001**
- Proxy: Apache forwards `https://docs.asimo.io/*` to `http://127.0.0.1:3001/` with host preservation
- TLS: Certificates managed by Certbot; HSTS enabled on the canonical host

## DNS Records

| Type  | Name                | Value                     | Purpose                                                                      |
| ----- | ------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| CNAME | docs.asimo.io       | apex/load balancer target | Routes traffic to the production proxy serving the docs site                 |
| CNAME | assistdocs.asimo.io | docs.asimo.io             | Ensures secondary domain follows the canonical domain and picks up redirects |

> Update the CNAME targets if the production load balancer or proxy host changes. Always keep `assistdocs.asimo.io` pointed at `docs.asimo.io` so the redirect stays valid.

## Verification Checklist

- `curl -I https://assistdocs.asimo.io/some/path` returns `301` to `https://docs.asimo.io/some/path`
- `curl -I https://docs.asimo.io` returns `200` and includes `Strict-Transport-Security`
- `systemctl status docs-site` (or supervisor target) shows the Next.js service running on port 3001

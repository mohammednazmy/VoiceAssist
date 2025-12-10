---
title: Operations Overview
slug: operations/overview
summary: "Central hub for operations documentation, runbooks, SLOs, and compliance."
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience:
  - devops
  - backend
  - admin
  - ai-agents
tags:
  - operations
  - overview
  - runbooks
  - sre
category: operations
relatedServices:
  - api-gateway
  - web-app
  - admin-panel
version: 1.0.0
ai_summary: >-
  Last Updated: 2025-11-27 This document provides a central hub for all
  operations-related documentation for VoiceAssist. --- --- All runbooks follow
  a standardized format with severity levels, step-by-step procedures, and
  verification steps. --- For HIPAA compliance, see Security & Compliance.
  ---...
---

# Operations Overview

**Last Updated:** 2025-11-27

This document provides a central hub for all operations-related documentation for VoiceAssist.

---

## Quick Links

| Category        | Document                                                        | Purpose                               |
| --------------- | --------------------------------------------------------------- | ------------------------------------- |
| **SLOs**        | [SLO Definitions](SLO_DEFINITIONS.md)                           | Reliability targets and error budgets |
| **Metrics**     | [Business Metrics](BUSINESS_METRICS.md)                         | Key performance indicators            |
| **Performance** | [Connection Pool Optimization](CONNECTION_POOL_OPTIMIZATION.md) | Database connection tuning            |

---

## Runbooks

All runbooks follow a standardized format with severity levels, step-by-step procedures, and verification steps.

| Runbook                                            | Purpose                               | Primary Audience |
| -------------------------------------------------- | ------------------------------------- | ---------------- |
| [Deployment](runbooks/DEPLOYMENT.md)               | Deploy VoiceAssist to production      | DevOps, Backend  |
| [Monitoring](runbooks/MONITORING.md)               | Set up and manage observability stack | DevOps           |
| [Troubleshooting](runbooks/TROUBLESHOOTING.md)     | Diagnose and fix common issues        | DevOps, Backend  |
| [Incident Response](runbooks/INCIDENT_RESPONSE.md) | Handle production incidents           | On-call, DevOps  |
| [Backup & Restore](runbooks/BACKUP_RESTORE.md)     | Data backup and recovery procedures   | DevOps           |
| [Scaling](runbooks/SCALING.md)                     | Scale infrastructure for load         | DevOps, Backend  |

---

## Compliance

| Document                                                     | Purpose                     |
| ------------------------------------------------------------ | --------------------------- |
| [Analytics Data Policy](compliance/ANALYTICS_DATA_POLICY.md) | Data handling for analytics |

For HIPAA compliance, see [Security & Compliance](../SECURITY_COMPLIANCE.md).

---

## Incident Severity Levels

| Severity          | Description                                   | Response Time |
| ----------------- | --------------------------------------------- | ------------- |
| **P1 - Critical** | Complete service outage, data loss risk       | 15 minutes    |
| **P2 - High**     | Major feature broken, significant degradation | 1 hour        |
| **P3 - Medium**   | Minor feature broken, degraded performance    | 4 hours       |
| **P4 - Low**      | Cosmetic issues, minimal impact               | 24 hours      |

---

## Key SLOs

| Metric           | Target  | Measurement Window |
| ---------------- | ------- | ------------------ |
| API Availability | 99.9%   | 30 days            |
| Success Rate     | 99.5%   | 30 days            |
| P95 Latency      | < 200ms | 30 days            |
| Error Rate       | < 0.5%  | 30 days            |

---

## On-Call Essentials

### Quick Diagnostic Commands

```bash
# Check service health
curl http://localhost:8000/health
curl http://localhost:8000/ready

# Check all containers
docker compose ps

# View recent logs
docker compose logs --tail=100 voiceassist-server

# Check database
docker compose exec postgres psql -U voiceassist -c "SELECT 1"

# Check Redis
docker compose exec redis redis-cli ping
```

### Escalation Path

1. **L1 Support**: Check health endpoints, restart services
2. **L2 DevOps**: Investigate logs, check metrics, apply standard fixes
3. **L3 Engineering**: Deep debugging, code-level investigation
4. **Management**: Major incidents requiring business decisions

---

## Related Documentation

- [Unified Architecture](../UNIFIED_ARCHITECTURE.md) - System architecture
- [Backend Architecture](../BACKEND_ARCHITECTURE.md) - Backend details
- [Security & Compliance](../SECURITY_COMPLIANCE.md) - HIPAA compliance
- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - Component status

---

## Version History

| Date       | Version | Changes                     |
| ---------- | ------- | --------------------------- |
| 2025-11-27 | 1.0.0   | Initial operations overview |

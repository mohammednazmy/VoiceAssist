---
title: Administrator Quick Start
slug: start/admins
summary: >-
  Get started administering VoiceAssist - deployment, configuration, and
  monitoring.
status: stable
stability: production
owner: sre
lastUpdated: "2025-12-02"
audience:
  - admin
  - devops
  - agent
  - ai-agents
tags:
  - quickstart
  - admin
  - deployment
  - configuration
category: getting-started
component: "platform/admin"
relatedPaths:
  - "docker-compose.yml"
  - "services/api-gateway/app/main.py"
  - "services/api-gateway/app/api/health.py"
  - "apps/admin-panel/src/App.tsx"
  - ".env.example"
ai_summary: >-
  Last Updated: 2025-12-01 This guide covers deployment, configuration, and
  ongoing administration of VoiceAssist. --- git clone
  https://github.com/your-org/VoiceAssist.git cd VoiceAssist cp .env.example
  .env docker-compose up -d curl http://localhost:8000/health For production
  environments, see: -...
---

# Administrator Quick Start

**Last Updated:** 2025-12-01

This guide covers deployment, configuration, and ongoing administration of VoiceAssist.

---

## Deployment Options

### Quick Start (Docker Compose)

```bash
# Clone repository
git clone https://github.com/your-org/VoiceAssist.git
cd VoiceAssist

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start all services
docker-compose up -d

# Verify deployment
curl http://localhost:8000/health
```

### Production Deployment

For production environments, see:

- [Production Deployment Runbook](../PRODUCTION_DEPLOYMENT_RUNBOOK.md)
- [Infrastructure Setup](../INFRASTRUCTURE_SETUP.md)
- [Terraform Guide](../TERRAFORM_GUIDE.md)

---

## Essential Configuration

### Environment Variables

Key variables in `.env`:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/voiceassist

# Redis
REDIS_URL=redis://localhost:6379

# AI Services
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...

# Security
JWT_SECRET=<secure-random-string>
ENCRYPTION_KEY=<32-byte-key>

# Feature Flags
VOICE_MODE_ENABLED=true
THINKER_TALKER_ENABLED=true
```

For complete configuration reference, see [Configuration Reference](../CONFIGURATION_REFERENCE.md).

---

## Admin Panel

### Accessing Admin Panel

1. Navigate to `http://localhost:8000/admin`
2. Log in with admin credentials
3. You'll see the admin dashboard

### Key Sections

| Section            | Purpose                      |
| ------------------ | ---------------------------- |
| **Dashboard**      | System health and metrics    |
| **Users**          | User management and roles    |
| **Knowledge Base** | Document upload and indexing |
| **Analytics**      | Usage statistics and costs   |
| **Settings**       | System configuration         |

For detailed admin panel documentation, see [Admin Panel Specs](../ADMIN_PANEL_SPECS.md).

---

## Health Monitoring

### Health Endpoints

```bash
# Basic health check
curl http://localhost:8000/health

# Readiness check
curl http://localhost:8000/ready

# Detailed metrics
curl http://localhost:8000/metrics
```

### Key Metrics to Monitor

- **Response latency** - P95 < 500ms target
- **Error rate** - Should be < 1%
- **Voice pipeline latency** - First audio < 300ms
- **Database connections** - Pool utilization
- **Cache hit rate** - Redis effectiveness

### Alerting

Configure alerts for:

- Service downtime
- High error rates (> 5%)
- Latency spikes (P95 > 2s)
- Disk space (< 20% free)
- Memory usage (> 80%)

---

## User Management

### Creating Users

```bash
# Via API
curl -X POST http://localhost:8000/api/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "role": "user"}'
```

### User Roles

| Role       | Permissions                 |
| ---------- | --------------------------- |
| `user`     | Basic chat and voice access |
| `admin`    | Full system access          |
| `readonly` | View-only access            |

### Session Management

- Sessions expire after 24 hours by default
- Configure via `SESSION_TIMEOUT` env var
- Force logout via admin panel

---

## Knowledge Base Management

### Uploading Documents

1. Go to Admin Panel > Knowledge Base
2. Click "Upload Documents"
3. Select PDF or markdown files
4. Wait for indexing to complete

### Via API

```bash
curl -X POST http://localhost:8000/api/admin/kb/upload \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@document.pdf"
```

### Re-indexing

```bash
# Trigger full re-index
curl -X POST http://localhost:8000/api/admin/kb/reindex \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Backup and Recovery

### Database Backups

```bash
# Manual backup
pg_dump -h localhost -U postgres voiceassist > backup.sql

# Restore
psql -h localhost -U postgres voiceassist < backup.sql
```

### Automated Backups

Configure via cron or backup service:

```bash
# Daily backup at 2 AM
0 2 * * * /opt/scripts/backup-voiceassist.sh
```

For complete disaster recovery procedures, see [Disaster Recovery Runbook](../DISASTER_RECOVERY_RUNBOOK.md).

---

## Security

### SSL/TLS

- All traffic should use HTTPS
- Certificates via Let's Encrypt or your CA
- Configure in reverse proxy (nginx/Apache)

### API Security

- JWT tokens for authentication
- Rate limiting enabled by default
- CORS configured for allowed origins

### Audit Logging

All admin actions are logged:

```bash
# View recent admin actions
curl http://localhost:8000/api/admin/audit \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

For complete security documentation, see [Security Compliance](../SECURITY_COMPLIANCE.md).

---

## Troubleshooting

### Common Issues

| Issue               | Solution                                      |
| ------------------- | --------------------------------------------- |
| Service won't start | Check logs: `docker-compose logs api-gateway` |
| Database connection | Verify `DATABASE_URL` and PostgreSQL status   |
| Voice not working   | Check Deepgram/ElevenLabs API keys            |
| Slow responses      | Check Redis cache and AI service latency      |

### Log Locations

```bash
# Docker logs
docker-compose logs -f api-gateway

# Application logs
tail -f /var/log/voiceassist/app.log
```

### Getting Help

- [Debugging Guide](../debugging/DEBUGGING_INDEX.md)
- [Troubleshooting Runbook](../operations/runbooks/TROUBLESHOOTING.md)
- [Operations Overview](../operations/OPERATIONS_OVERVIEW.md)

---

## Maintenance Tasks

### Regular Maintenance

| Task             | Frequency | Command                         |
| ---------------- | --------- | ------------------------------- |
| Database vacuum  | Weekly    | `VACUUM ANALYZE;`               |
| Log rotation     | Daily     | Automatic via logrotate         |
| Cache cleanup    | Monthly   | `redis-cli FLUSHDB` (if needed) |
| Security updates | Weekly    | `apt update && apt upgrade`     |

### Upgrades

```bash
# Pull latest changes
git pull origin main

# Update dependencies
pnpm install

# Run migrations
pnpm db:migrate

# Rebuild and restart
docker-compose build && docker-compose up -d
```

---

## Key Documentation

- [Admin Panel Specs](../ADMIN_PANEL_SPECS.md)
- [Configuration Reference](../CONFIGURATION_REFERENCE.md)
- [Production Deployment Runbook](../PRODUCTION_DEPLOYMENT_RUNBOOK.md)
- [Disaster Recovery Runbook](../DISASTER_RECOVERY_RUNBOOK.md)
- [Security Compliance](../SECURITY_COMPLIANCE.md)
- [HIPAA Compliance Matrix](../HIPAA_COMPLIANCE_MATRIX.md)

---

## Next Steps

1. Review [Production Readiness Checklist](../PRODUCTION_READINESS_CHECKLIST.md)
2. Set up [Monitoring & Observability](../OBSERVABILITY.md)
3. Configure [Backup Procedures](../DISASTER_RECOVERY_RUNBOOK.md)

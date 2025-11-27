---
title: Deployment Runbook
slug: operations/runbooks/deployment
summary: Step-by-step guide for deploying VoiceAssist V2 to production.
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience: ["devops", "backend"]
tags: ["runbook", "deployment", "operations", "production"]
relatedServices: ["api-gateway", "web-app", "admin-panel"]
version: "1.0.0"
---

# Deployment Runbook

**Last Updated**: 2025-11-27
**Purpose**: Step-by-step guide for deploying VoiceAssist V2

---

## Pre-Deployment Checklist

- [ ] All tests passing in CI/CD
- [ ] Code reviewed and approved
- [ ] Database migrations reviewed
- [ ] Breaking changes documented
- [ ] Rollback plan documented
- [ ] Stakeholders notified
- [ ] Maintenance window scheduled (if required)

---

## Deployment Steps

### 1. Pre-Deployment Verification

```bash
# Check current system health
curl http://localhost:8000/health
curl http://localhost:8000/ready

# Verify all containers running
docker compose ps

# Check database connection
docker compose exec postgres psql -U voiceassist -d voiceassist -c "SELECT version();"

# Check Redis
docker compose exec redis redis-cli ping

# Check Qdrant
curl http://localhost:6333/collections
```

### 2. Backup Current State

```bash
# Backup database
docker compose exec postgres pg_dump -U voiceassist voiceassist > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup environment configuration
cp .env .env.backup_$(date +%Y%m%d_%H%M%S)

# Tag current Docker images
docker tag voiceassist-voiceassist-server:latest voiceassist-voiceassist-server:pre-deploy-$(date +%Y%m%d_%H%M%S)
```

### 3. Pull Latest Code

```bash
# Fetch latest changes
git fetch origin

# Check what's changing
git log --oneline HEAD..origin/main

# Pull changes
git pull origin main

# Verify correct branch
git branch --show-current
git log -1 --oneline
```

### 4. Update Environment Configuration

```bash
# Review .env changes
diff .env.example .env

# Update .env if needed
vim .env

# Validate configuration
grep -v '^#' .env | grep -v '^$' | wc -l  # Count non-empty lines
```

### 5. Run Database Migrations

```bash
# Check current migration status
docker compose run --rm voiceassist-server alembic current

# Review pending migrations
docker compose run --rm voiceassist-server alembic history

# Run migrations
docker compose run --rm voiceassist-server alembic upgrade head

# Verify migration success
docker compose run --rm voiceassist-server alembic current
```

### 6. Build New Images

```bash
# Build updated images
docker compose build voiceassist-server

# Verify image built
docker images | grep voiceassist-server

# Check image size (should be reasonable)
docker images voiceassist-voiceassist-server:latest --format "{{.Size}}"
```

### 7. Deploy Services

```bash
# Deploy with zero-downtime (recreate containers)
docker compose up -d voiceassist-server

# Watch logs for startup
docker compose logs -f voiceassist-server

# Wait for healthcheck
sleep 10
```

### 8. Post-Deployment Verification

```bash
# Check health endpoint
curl http://localhost:8000/health

# Check readiness
curl http://localhost:8000/ready

# Verify version
curl http://localhost:8000/health | jq '.version'

# Check all containers running
docker compose ps

# Check logs for errors
docker compose logs --tail=100 voiceassist-server | grep -i error

# Verify metrics endpoint
curl http://localhost:8000/metrics | head -20

# Test a sample API endpoint (requires auth)
# curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/users/me
```

### 9. Smoke Tests

```bash
# Test authentication
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' | jq '.'

# Test database connectivity
docker compose exec postgres psql -U voiceassist -d voiceassist -c "SELECT COUNT(*) FROM users;"

# Test Redis
docker compose exec redis redis-cli --raw incr deployment_test

# Test Qdrant
curl http://localhost:6333/collections
```

### 10. Monitor Initial Traffic

```bash
# Watch logs for first 5 minutes
docker compose logs -f --tail=100 voiceassist-server

# Monitor metrics
watch -n 5 'curl -s http://localhost:8000/metrics | grep -E "(http_requests_total|http_request_duration)"'

# Check error rate
docker compose logs --since 5m voiceassist-server | grep -i error | wc -l
```

---

## Rollback Procedure

If deployment fails, follow these steps:

### Quick Rollback (Image-Based)

```bash
# Stop current containers
docker compose down voiceassist-server

# Revert to previous image
PREVIOUS_TAG="pre-deploy-YYYYMMDD_HHMMSS"  # From backup step
docker tag voiceassist-voiceassist-server:$PREVIOUS_TAG voiceassist-voiceassist-server:latest

# Start previous version
docker compose up -d voiceassist-server

# Verify rollback
curl http://localhost:8000/health | jq '.version'
```

### Full Rollback (Code + Database)

```bash
# Stop services
docker compose down voiceassist-server

# Revert code
git log -1 --oneline  # Note current commit
git checkout HEAD~1   # Or specific commit hash

# Rollback database migration
BACKUP_FILE="backup_YYYYMMDD_HHMMSS.sql"
docker compose exec -T postgres psql -U voiceassist voiceassist < $BACKUP_FILE

# Rebuild image
docker compose build voiceassist-server

# Start services
docker compose up -d voiceassist-server

# Verify rollback
curl http://localhost:8000/health
```

---

## Deployment Checklist

**Post-Deployment:**

- [ ] Health endpoint returning 200
- [ ] Readiness endpoint returning 200
- [ ] No error logs in last 5 minutes
- [ ] Metrics endpoint accessible
- [ ] Database migrations applied
- [ ] All containers running
- [ ] Sample API requests successful
- [ ] Version number updated
- [ ] Stakeholders notified of completion
- [ ] Documentation updated (if needed)

---

## Common Issues & Solutions

### Issue: Database Migration Fails

**Symptoms**: Migration command returns error

**Solution**:

```bash
# Check current state
docker compose run --rm voiceassist-server alembic current

# Manually review SQL
docker compose run --rm voiceassist-server alembic show <revision>

# If safe, downgrade one step
docker compose run --rm voiceassist-server alembic downgrade -1

# Fix issue and retry
docker compose run --rm voiceassist-server alembic upgrade head
```

### Issue: Container Won't Start

**Symptoms**: Container crashes immediately or fails healthcheck

**Solution**:

```bash
# Check logs
docker compose logs --tail=50 voiceassist-server

# Check container exit code
docker compose ps -a voiceassist-server

# Verify environment variables
docker compose config | grep -A 20 voiceassist-server

# Test dependencies
docker compose exec postgres pg_isready
docker compose exec redis redis-cli ping
```

### Issue: High Error Rate After Deployment

**Symptoms**: Increased 5xx errors in logs/metrics

**Solution**:

```bash
# Check error logs
docker compose logs voiceassist-server | grep -i error

# Check database connections
docker compose exec postgres psql -U voiceassist -d voiceassist -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Check Redis memory
docker compose exec redis redis-cli INFO memory | grep used_memory_human

# Rollback if errors > 5% of traffic
```

---

## Emergency Contacts

- **On-Call Engineer**: Check PagerDuty
- **Database Admin**: DBA on-call rotation
- **DevOps Lead**: ops-team@voiceassist.local
- **Product Owner**: product@voiceassist.local

---

##Related Documentation

- [UNIFIED_ARCHITECTURE.md](../../UNIFIED_ARCHITECTURE.md)
- [CONNECTION_POOL_OPTIMIZATION.md](../CONNECTION_POOL_OPTIMIZATION.md)
- [Incident Response Runbook](./INCIDENT_RESPONSE.md)
- [Backup & Restore Runbook](./BACKUP_RESTORE.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-21
**Maintained By**: VoiceAssist DevOps Team
**Review Cycle**: After each major deployment or quarterly

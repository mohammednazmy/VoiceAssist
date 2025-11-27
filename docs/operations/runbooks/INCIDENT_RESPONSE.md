---
title: Incident Response Runbook
slug: operations/runbooks/incident-response
summary: Comprehensive guide for handling incidents in VoiceAssist V2.
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience: ["devops", "backend", "admin"]
tags: ["runbook", "incident", "operations", "on-call"]
relatedServices: ["api-gateway"]
version: "1.0.0"
---

# Incident Response Runbook

**Last Updated**: 2025-11-27
**Purpose**: Comprehensive guide for handling incidents in VoiceAssist V2

---

## Incident Severity Levels

| Severity          | Description                                               | Response Time | Examples                                             |
| ----------------- | --------------------------------------------------------- | ------------- | ---------------------------------------------------- |
| **P1 - Critical** | Complete service outage, data loss risk                   | 15 minutes    | Database down, complete API failure, security breach |
| **P2 - High**     | Major feature broken, significant performance degradation | 1 hour        | Authentication failing, voice processing unavailable |
| **P3 - Medium**   | Minor feature broken, degraded performance                | 4 hours       | Specific API endpoint failing, slow response times   |
| **P4 - Low**      | Cosmetic issues, minimal impact                           | 24 hours      | UI glitches, non-critical warnings in logs           |

---

## Initial Response Procedure

### 1. Incident Detection

```bash
# Check system health
curl -s http://localhost:8000/health | jq '.'

# Expected output:
# {
#   "status": "healthy",
#   "version": "2.0.0",
#   "timestamp": "2025-11-21T..."
# }

# Check all services
docker compose ps

# Check recent error logs
docker compose logs --since 10m voiceassist-server | grep -i error

# Check metrics for anomalies
curl -s http://localhost:8000/metrics | grep -E "(error|failure)"
```

### 2. Immediate Triage (First 5 Minutes)

**Checklist:**

- [ ] Acknowledge the incident (update status page if available)
- [ ] Determine severity level using table above
- [ ] Notify on-call engineer if P1/P2
- [ ] Create incident tracking ticket/document
- [ ] Join incident response channel (Slack/Teams)

```bash
# Quick system overview
echo "=== System Status ==="
docker compose ps
echo ""
echo "=== Error Count (Last 10 min) ==="
docker compose logs --since 10m | grep -i error | wc -l
echo ""
echo "=== Active Database Connections ==="
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
echo ""
echo "=== Redis Memory ==="
docker compose exec redis redis-cli INFO memory | grep used_memory_human
echo ""
echo "=== Disk Usage ==="
df -h
```

### 3. Assess Impact

```bash
# Check request success rate
docker compose logs --since 15m voiceassist-server | \
  grep -oE "status=[0-9]+" | sort | uniq -c

# Check database connectivity
docker compose exec postgres pg_isready
docker compose exec postgres psql -U voiceassist -d voiceassist -c "SELECT 1;"

# Check Redis connectivity
docker compose exec redis redis-cli ping

# Check Qdrant connectivity
curl -s http://localhost:6333/healthz

# Check network connectivity
docker compose exec voiceassist-server ping -c 3 postgres
docker compose exec voiceassist-server ping -c 3 redis
docker compose exec voiceassist-server ping -c 3 qdrant
```

---

## Incident Response by Severity

### P1 - Critical Incident Response

**Timeline: 0-15 minutes**

1. **Immediate Actions:**
   - [ ] Page on-call engineer
   - [ ] Notify management
   - [ ] Update status page: "Investigating outage"
   - [ ] Join war room/incident call

2. **Rapid Assessment:**

```bash
# Check if complete outage
curl -s http://localhost:8000/health || echo "COMPLETE OUTAGE"

# Check all infrastructure
docker compose ps -a

# Check for recent deployments
git log -5 --oneline --since="2 hours ago"

# Check system resources
docker stats --no-stream

# Check disk space (common cause)
df -h
du -sh /var/lib/docker
```

3. **Emergency Mitigation:**

```bash
# Option 1: Restart all services
docker compose restart

# Option 2: Rollback recent deployment (if within 2 hours)
git log -1 --oneline  # Current version
git checkout HEAD~1   # Previous version
docker compose build voiceassist-server
docker compose up -d voiceassist-server

# Option 3: Scale up resources (if performance issue)
docker compose up -d --scale voiceassist-server=3

# Option 4: Enable maintenance mode
# Create maintenance mode flag
touch /tmp/maintenance_mode
docker compose exec voiceassist-server touch /app/maintenance_mode
```

4. **Communication Template (P1):**

```
Subject: [P1 INCIDENT] VoiceAssist Service Outage

Status: INVESTIGATING
Start Time: [TIME]
Impact: Complete service unavailable
Affected Users: All users
Incident Commander: [NAME]

Current Actions:
- Identified root cause as [X]
- Attempting mitigation via [Y]
- ETR: [TIME] (or "investigating")

Next Update: [TIME] (within 15 minutes)
```

### P2 - High Severity Response

**Timeline: 0-60 minutes**

1. **Assessment (First 15 minutes):**

```bash
# Identify affected component
docker compose logs --since 30m voiceassist-server | grep -i error | tail -50

# Check specific service health
curl -s http://localhost:8000/ready | jq '.'

# Check database performance
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT pid, usename, application_name, state, query_start,
   wait_event_type, query
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY query_start DESC
   LIMIT 20;"

# Check slow queries
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT query, calls, total_time, mean_time, max_time
   FROM pg_stat_statements
   ORDER BY mean_time DESC
   LIMIT 10;"
```

2. **Mitigation Actions:**
   - [ ] Isolate affected component
   - [ ] Enable fallback mechanisms
   - [ ] Scale affected service
   - [ ] Update monitoring thresholds

3. **Communication Template (P2):**

```
Subject: [P2 INCIDENT] VoiceAssist Degraded Performance

Status: MITIGATING
Start Time: [TIME]
Impact: [Specific feature] unavailable/degraded
Affected Users: [Percentage or specific user group]
Incident Commander: [NAME]

Timeline:
- [TIME]: Issue detected
- [TIME]: Root cause identified
- [TIME]: Mitigation in progress

Root Cause: [Brief description]
Mitigation: [Actions being taken]
ETR: [TIME]

Next Update: [TIME] (within 30 minutes)
```

### P3 - Medium Severity Response

**Timeline: 0-4 hours**

1. **Standard Investigation:**

```bash
# Detailed log analysis
docker compose logs --since 1h voiceassist-server | grep -A 5 -B 5 "error"

# Check resource utilization trends
docker stats --no-stream

# Review recent changes
git log --since="24 hours ago" --oneline

# Check configuration
docker compose config | grep -A 10 voiceassist-server
```

2. **Documented Fix Process:**
   - [ ] Create issue in tracking system
   - [ ] Assign to appropriate team
   - [ ] Document reproduction steps
   - [ ] Implement fix
   - [ ] Test in staging (if available)
   - [ ] Deploy fix
   - [ ] Verify resolution

### P4 - Low Severity Response

**Standard ticket workflow - no immediate response required**

---

## Escalation Paths

### When to Escalate

**Escalate Immediately If:**

- Unable to identify root cause within 30 minutes (P1) or 2 hours (P2)
- Mitigation attempts unsuccessful
- Data loss suspected
- Security breach suspected
- Multiple systems affected
- Customer data at risk

### Escalation Chain

```
L1 - On-Call Engineer
  ↓ (30 min for P1, 2 hrs for P2)
L2 - Team Lead
  ↓ (1 hr for P1, 4 hrs for P2)
L3 - Engineering Manager
  ↓ (2 hrs for P1)
L4 - CTO / VP Engineering
```

### Escalation Command Script

```bash
# Document current state before escalating
cat > /tmp/escalation_report_$(date +%Y%m%d_%H%M%S).txt <<EOF
ESCALATION REPORT
=================
Time: $(date)
Severity: P1/P2/P3/P4
Duration: [X hours]
Impact: [Description]

Current System State:
$(docker compose ps)

Recent Errors:
$(docker compose logs --since 30m voiceassist-server | grep -i error | tail -20)

Actions Attempted:
- [List all mitigation attempts]
- [Include results of each attempt]

Reason for Escalation:
[Clear explanation of why escalating]

Additional Context:
[Any other relevant information]
EOF

cat /tmp/escalation_report_$(date +%Y%m%d_%H%M%S).txt
```

---

## Common Incident Types

### Database Connection Issues

**Symptoms:**

- "Connection pool exhausted" errors
- "Too many connections" errors
- Slow response times

**Investigation:**

```bash
# Check connection pool status
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Check max connections
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SHOW max_connections;"

# Check current connections
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT datname, usename, application_name, count(*)
   FROM pg_stat_activity
   GROUP BY datname, usename, application_name;"

# Kill idle connections
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle'
   AND state_change < current_timestamp - INTERVAL '10 minutes';"
```

**Resolution:**

```bash
# Restart application to reset connection pool
docker compose restart voiceassist-server

# Temporarily increase connection pool
docker compose exec voiceassist-server sh -c \
  "export DB_POOL_SIZE=30 && supervisorctl restart all"

# Long-term: Update docker-compose.yml or .env
echo "DB_POOL_SIZE=30" >> .env
docker compose up -d voiceassist-server
```

### Memory/Resource Exhaustion

**Symptoms:**

- Container restarts
- OOMKilled status
- Slow performance

**Investigation:**

```bash
# Check container memory usage
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"

# Check for OOMKilled containers
docker inspect voiceassist-voiceassist-server-1 | grep OOMKilled

# Check system memory
free -h

# Check Redis memory
docker compose exec redis redis-cli INFO memory
```

**Resolution:**

```bash
# Increase memory limits in docker-compose.yml
# Edit docker-compose.yml to increase mem_limit

# Clear Redis cache if needed
docker compose exec redis redis-cli FLUSHDB

# Restart affected container
docker compose restart voiceassist-server

# Monitor memory after restart
watch -n 5 'docker stats --no-stream | grep voiceassist-server'
```

### API Performance Degradation

**Symptoms:**

- Slow response times
- Timeout errors
- High request queue

**Investigation:**

```bash
# Check response times in metrics
curl -s http://localhost:8000/metrics | grep http_request_duration

# Check slow queries
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT pid, now() - query_start as duration, query
   FROM pg_stat_activity
   WHERE state != 'idle'
   AND now() - query_start > interval '5 seconds'
   ORDER BY duration DESC;"

# Check for locks
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT * FROM pg_locks WHERE NOT granted;"

# Check CPU usage
docker stats --no-stream
```

**Resolution:**

```bash
# Scale horizontally if needed
docker compose up -d --scale voiceassist-server=3

# Kill slow queries
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state != 'idle'
   AND now() - query_start > interval '30 seconds';"

# Enable query caching in Redis
docker compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Security Incidents

**Symptoms:**

- Unusual traffic patterns
- Unauthorized access attempts
- Data breach alerts

**IMMEDIATE ACTIONS:**

```bash
# 1. DO NOT DESTROY EVIDENCE
# 2. Document everything
# 3. Isolate affected systems

# Stop accepting new connections (if breach confirmed)
docker compose exec voiceassist-server iptables -A INPUT -p tcp --dport 8000 -j DROP

# Capture current state
docker compose logs > /tmp/security_incident_logs_$(date +%Y%m%d_%H%M%S).txt
docker compose exec postgres pg_dump -U voiceassist voiceassist > \
  /tmp/security_incident_db_$(date +%Y%m%d_%H%M%S).sql

# Check for suspicious activity
docker compose logs voiceassist-server | grep -E "401|403|429" | tail -100

# Check database for unauthorized access
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT * FROM user_sessions WHERE created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;"

# Rotate credentials IMMEDIATELY
# Generate new secrets
openssl rand -base64 32 > /tmp/new_secret_key.txt

# Update .env with new credentials
# Force logout all users
docker compose exec redis redis-cli FLUSHALL
```

**ESCALATION: Security incidents ALWAYS require immediate escalation to security team**

---

## Post-Incident Activities

### Immediate Post-Incident (Within 1 Hour)

**Checklist:**

- [ ] Verify incident fully resolved
- [ ] Update status page to "Resolved"
- [ ] Send final communication to stakeholders
- [ ] Document timeline in incident ticket
- [ ] Schedule post-mortem meeting (within 48 hours for P1/P2)

```bash
# Verification script
echo "=== Post-Incident Verification ==="
echo "Health Check:"
curl -s http://localhost:8000/health | jq '.'
echo ""
echo "Error Rate (Last 30 min):"
docker compose logs --since 30m voiceassist-server | grep -i error | wc -l
echo ""
echo "Container Status:"
docker compose ps
echo ""
echo "Database Connections:"
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

### Post-Mortem Process

**Post-Mortem Template:**

```markdown
# Post-Mortem: [Incident Title]

## Incident Details

- **Date**: YYYY-MM-DD
- **Duration**: X hours Y minutes
- **Severity**: P1/P2/P3/P4
- **Incident Commander**: [Name]
- **Participants**: [Names]

## Impact

- **Users Affected**: [Number or percentage]
- **Services Affected**: [List]
- **Financial Impact**: [If applicable]
- **Data Loss**: None / [Description]

## Timeline

| Time  | Event                       |
| ----- | --------------------------- |
| HH:MM | Incident began              |
| HH:MM | Detected by [person/system] |
| HH:MM | Initial response started    |
| HH:MM | Root cause identified       |
| HH:MM | Mitigation deployed         |
| HH:MM | Incident resolved           |

## Root Cause

[Detailed explanation of what caused the incident]

## What Went Well

- [Things that worked during response]
- [Effective tools/processes]

## What Went Wrong

- [Issues encountered during response]
- [Gaps in tooling/process]

## Action Items

| Action                   | Owner  | Due Date | Priority |
| ------------------------ | ------ | -------- | -------- |
| [Preventive measure]     | [Name] | [Date]   | P1/P2/P3 |
| [Monitoring improvement] | [Name] | [Date]   | P1/P2/P3 |
| [Documentation update]   | [Name] | [Date]   | P1/P2/P3 |

## Lessons Learned

- [Key takeaway 1]
- [Key takeaway 2]
- [Key takeaway 3]
```

### Post-Mortem Meeting Agenda

1. **Review Timeline** (10 minutes)
   - Walk through incident from detection to resolution
   - No blame, focus on facts

2. **Root Cause Analysis** (15 minutes)
   - Technical deep-dive
   - Use "5 Whys" technique

3. **Impact Assessment** (10 minutes)
   - User impact
   - Business impact
   - Reputation impact

4. **Prevention Discussion** (20 minutes)
   - How to prevent recurrence
   - Monitoring improvements
   - Process improvements

5. **Action Items** (5 minutes)
   - Assign owners and due dates
   - Set follow-up meeting

---

## Communication Templates

### Initial Notification (P1/P2)

```
Subject: [P1/P2] VoiceAssist Service Issue - [Brief Description]

Dear Team,

We are currently experiencing [issue description] affecting [scope of impact].

Status: INVESTIGATING
Start Time: [TIME]
Severity: P1/P2
Impact: [Description]
Affected Systems: [List]
Incident Commander: [NAME]

We are actively working to resolve this issue and will provide updates
every [15 minutes for P1, 30 minutes for P2].

Next Update: [TIME]

VoiceAssist Operations Team
```

### Status Update (During Incident)

```
Subject: [UPDATE - P1/P2] VoiceAssist Service Issue - [Brief Description]

Update #[N] - [TIME]

Current Status: [INVESTIGATING/IDENTIFIED/MITIGATING/RESOLVED]

Progress:
- [What we've learned]
- [What we've tried]
- [Current approach]

Impact Update: [Any changes to scope]

Next Steps:
- [Action 1]
- [Action 2]

ETR: [Estimated Time to Resolution or "investigating"]

Next Update: [TIME]

VoiceAssist Operations Team
```

### Resolution Notification

```
Subject: [RESOLVED - P1/P2] VoiceAssist Service Issue - [Brief Description]

Status: RESOLVED
Resolution Time: [TIME]
Total Duration: [X hours Y minutes]

The issue affecting [description] has been fully resolved.

Root Cause: [Brief explanation]

Resolution: [What was done to fix it]

Impact Summary:
- Users Affected: [Number/Percentage]
- Duration: [X hours Y minutes]
- Data Loss: None / [Description]

Next Steps:
- Post-mortem scheduled for [DATE/TIME]
- Preventive measures being implemented

We apologize for any inconvenience this may have caused.

VoiceAssist Operations Team
```

---

## Incident Response Tools

### Quick Command Reference

```bash
# Health Check Bundle
alias va-health='curl -s http://localhost:8000/health | jq .'
alias va-ready='curl -s http://localhost:8000/ready | jq .'
alias va-metrics='curl -s http://localhost:8000/metrics'

# Log Analysis
alias va-errors='docker compose logs --since 10m voiceassist-server | grep -i error'
alias va-errors-count='docker compose logs --since 10m voiceassist-server | grep -i error | wc -l'
alias va-logs-tail='docker compose logs -f --tail=100 voiceassist-server'

# Resource Check
alias va-stats='docker stats --no-stream | grep voiceassist'
alias va-disk='df -h | grep -E "(Filesystem|/dev/)"'

# Database Quick Checks
alias va-db-connections='docker compose exec postgres psql -U voiceassist -d voiceassist -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"'
alias va-db-slow='docker compose exec postgres psql -U voiceassist -d voiceassist -c "SELECT pid, now() - query_start as duration, query FROM pg_stat_activity WHERE state != '\''idle'\'' ORDER BY duration DESC LIMIT 10;"'

# Redis Checks
alias va-redis-info='docker compose exec redis redis-cli INFO'
alias va-redis-memory='docker compose exec redis redis-cli INFO memory | grep used_memory_human'
```

### Incident Response Script

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-incident-check

echo "=== VoiceAssist Incident Response Check ==="
echo "Time: $(date)"
echo ""

echo "=== 1. Service Health ==="
curl -s http://localhost:8000/health | jq '.' || echo "HEALTH CHECK FAILED"
echo ""

echo "=== 2. Container Status ==="
docker compose ps
echo ""

echo "=== 3. Recent Errors (Last 10 min) ==="
ERROR_COUNT=$(docker compose logs --since 10m voiceassist-server 2>/dev/null | grep -i error | wc -l)
echo "Error Count: $ERROR_COUNT"
if [ "$ERROR_COUNT" -gt 10 ]; then
    echo "⚠️  HIGH ERROR RATE DETECTED"
    docker compose logs --since 10m voiceassist-server | grep -i error | tail -10
fi
echo ""

echo "=== 4. Database Status ==="
docker compose exec -T postgres pg_isready || echo "DATABASE NOT READY"
docker compose exec -T postgres psql -U voiceassist -d voiceassist -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;" 2>/dev/null
echo ""

echo "=== 5. Redis Status ==="
docker compose exec -T redis redis-cli ping || echo "REDIS NOT RESPONDING"
docker compose exec -T redis redis-cli INFO memory | grep used_memory_human
echo ""

echo "=== 6. Resource Usage ==="
docker stats --no-stream | grep voiceassist
echo ""

echo "=== 7. Disk Space ==="
df -h | grep -E "(Filesystem|/$|/var)"
echo ""

echo "=== Summary ==="
if [ "$ERROR_COUNT" -gt 50 ]; then
    echo "🔴 CRITICAL - High error rate detected"
elif [ "$ERROR_COUNT" -gt 10 ]; then
    echo "🟡 WARNING - Elevated error rate"
else
    echo "🟢 OK - System appears healthy"
fi
```

---

## Emergency Contacts

### Primary Contacts

| Role                    | Contact                       | Availability             |
| ----------------------- | ----------------------------- | ------------------------ |
| **On-Call Engineer**    | PagerDuty alert               | 24/7                     |
| **Backup On-Call**      | PagerDuty escalation          | 24/7                     |
| **Engineering Manager** | ops-manager@voiceassist.local | Business hours           |
| **DevOps Lead**         | devops-lead@voiceassist.local | Business hours + on-call |
| **Database Admin**      | dba-oncall@voiceassist.local  | 24/7                     |
| **Security Team**       | security@voiceassist.local    | 24/7 for P1 security     |

### Escalation Contacts

| Level  | Contact              | When to Escalate                                   |
| ------ | -------------------- | -------------------------------------------------- |
| **L1** | On-Call Engineer     | Initial response                                   |
| **L2** | Team Lead            | No resolution in 30 min (P1) or 2 hrs (P2)         |
| **L3** | Engineering Manager  | No resolution in 1 hr (P1) or 4 hrs (P2)           |
| **L4** | VP Engineering / CTO | Major outage > 2 hours, data loss, security breach |

### External Contacts

- **Cloud Provider Support**: [Support portal URL]
- **Third-party Services**: [Service provider contacts]
- **Legal (for security incidents)**: legal@voiceassist.local

---

## Related Documentation

- [Deployment Runbook](./DEPLOYMENT.md)
- [Backup & Restore Runbook](./BACKUP_RESTORE.md)
- [Monitoring Runbook](./MONITORING.md)
- [Troubleshooting Runbook](./TROUBLESHOOTING.md)
- [Scaling Runbook](./SCALING.md)
- [UNIFIED_ARCHITECTURE.md](../../UNIFIED_ARCHITECTURE.md)
- [CONNECTION_POOL_OPTIMIZATION.md](../CONNECTION_POOL_OPTIMIZATION.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-21
**Maintained By**: VoiceAssist DevOps Team
**Review Cycle**: Monthly or after each P1/P2 incident
**Next Review**: 2025-12-21

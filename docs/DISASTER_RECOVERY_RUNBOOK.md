---
title: Disaster Recovery Runbook
slug: disaster-recovery-runbook
summary: "**Document Version:** 1.0"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - sre
  - backend
  - frontend
  - ai-agents
tags:
  - disaster
  - recovery
  - runbook
category: debugging
ai_summary: >-
  Document Version: 1.0 Last Updated: 2025-11-21 Status: Production-Ready Phase:
  Phase 12 - High Availability & Disaster Recovery --- This runbook provides
  step-by-step procedures for recovering the VoiceAssist platform from various
  disaster scenarios. It covers database failures, complete system f...
---

# Disaster Recovery Runbook

**Document Version:** 1.0
**Last Updated:** 2025-11-21
**Status:** Production-Ready
**Phase:** Phase 12 - High Availability & Disaster Recovery

---

## Executive Summary

This runbook provides step-by-step procedures for recovering the VoiceAssist platform from various disaster scenarios. It covers database failures, complete system failures, data corruption, and ransomware attacks.

**Recovery Objectives:**

- **RTO (Recovery Time Objective):** 4 hours
- **RPO (Recovery Point Objective):** 24 hours (daily backups)
- **RTO (with replication):** 30 minutes (failover to replica)
- **RPO (with replication):** < 1 minute (streaming replication)

---

## Table of Contents

1. [Disaster Scenarios](#disaster-scenarios)
2. [Pre-Disaster Preparation](#pre-disaster-preparation)
3. [Recovery Procedures](#recovery-procedures)
   - [Scenario 1: Database Failure (Primary Down)](#scenario-1-database-failure-primary-down)
   - [Scenario 2: Complete System Failure](#scenario-2-complete-system-failure)
   - [Scenario 3: Data Corruption](#scenario-3-data-corruption)
   - [Scenario 4: Ransomware Attack](#scenario-4-ransomware-attack)
   - [Scenario 5: Application Server Failure](#scenario-5-application-server-failure)
4. [Post-Recovery Procedures](#post-recovery-procedures)
5. [Testing and Validation](#testing-and-validation)
6. [Contact Information](#contact-information)

---

## Disaster Scenarios

### Covered Scenarios

1. **Database Failure** - Primary PostgreSQL server becomes unavailable
2. **Complete System Failure** - Entire infrastructure is lost (fire, flood, hardware failure)
3. **Data Corruption** - Database corruption or accidental data deletion
4. **Ransomware Attack** - Data encrypted by ransomware
5. **Application Server Failure** - API Gateway or worker services fail

### Not Covered (Escalate to Management)

- Physical security breaches
- Large-scale network outages beyond your control
- Legal or regulatory issues requiring counsel

---

## Pre-Disaster Preparation

### Before a Disaster Occurs

#### 1. Verify Backup System

```bash
# Check last backup status
ls -lht /var/backups/voiceassist/ | head -5

# Verify automated backups are running
crontab -l | grep backup

# Test backup restoration (recommended monthly)
sudo /opt/voiceassist/ha-dr/backup/verify-backup.sh
```

#### 2. Document Current Configuration

```bash
# Export current environment configuration
cd ~/VoiceAssist
docker-compose config > docker-compose.current.yml

# Document container versions
docker-compose images > container-versions.txt

# Save database schema
pg_dump -h localhost -U voiceassist -d voiceassist --schema-only > schema-backup.sql
```

#### 3. Verify Off-Site Backups

```bash
# Check S3 backups (if using AWS)
aws s3 ls s3://voiceassist-backups/ --recursive | tail -10

# Check Nextcloud backups (if using Nextcloud)
curl -u admin:password \
     "http://nextcloud:8080/remote.php/dav/files/admin/backups/voiceassist/" \
     | grep -o 'voiceassist_backup_[^<]*'
```

#### 4. Maintain Contact List

Keep updated contact list for:

- On-call engineers
- Database administrators
- Cloud provider support
- Management escalation chain

---

## Recovery Procedures

### General Recovery Steps

1. **Assess the situation** - Determine the extent of the disaster
2. **Communicate** - Notify stakeholders and team members
3. **Execute recovery** - Follow the appropriate scenario procedure
4. **Verify recovery** - Test system functionality
5. **Document** - Record what happened and lessons learned

---

### Scenario 1: Database Failure (Primary Down)

**Situation:** Primary PostgreSQL server is unavailable but replica is operational

**RTO:** 30 minutes
**RPO:** < 1 minute
**Severity:** High

#### Detection

```bash
# Check primary database health
docker-compose ps postgres

# Test database connection
psql -h localhost -p 5432 -U voiceassist -d voiceassist -c "SELECT 1;"
```

#### Recovery Steps

**Step 1: Verify Replica Status**

```bash
# Check replica is up and running
docker exec voiceassist-postgres-replica psql -U voiceassist -c "SELECT pg_is_in_recovery();"
# Expected: t (true - in recovery/standby mode)

# Check replication lag
docker exec voiceassist-postgres-replica psql -U voiceassist -c \
  "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds;"
```

**Step 2: Promote Replica to Primary**

```bash
# Promote replica to become the new primary
docker exec voiceassist-postgres-replica pg_ctl promote -D /var/lib/postgresql/data

# Wait for promotion to complete (30 seconds)
sleep 30

# Verify replica is now a primary
docker exec voiceassist-postgres-replica psql -U voiceassist -c "SELECT pg_is_in_recovery();"
# Expected: f (false - not in recovery/now primary)
```

**Step 3: Update Application Configuration**

```bash
# Update API Gateway to point to new primary
# Edit docker-compose.yml or environment variables
export DB_HOST=postgres-replica
export DB_PORT=5432

# Restart API Gateway and workers
docker-compose restart voiceassist-server voiceassist-worker
```

**Step 4: Verify Application Functionality**

```bash
# Test health endpoint
curl http://localhost:8000/health

# Test database connectivity
curl http://localhost:8000/ready

# Check application logs
docker-compose logs -f voiceassist-server | grep -i error
```

**Step 5: Restore Original Primary (when available)**

```bash
# Once original primary hardware is fixed, reconfigure it as replica
# Follow replication setup procedures in ha-dr/postgresql/
cd ~/VoiceAssist/ha-dr/postgresql/
docker-compose -f docker-compose.replication.yml up -d postgres-replica
```

**Estimated Recovery Time:** 30 minutes

---

### Scenario 2: Complete System Failure

**Situation:** Entire infrastructure is lost (server destroyed, complete hardware failure)

**RTO:** 4 hours
**RPO:** 24 hours
**Severity:** Critical

#### Detection

- Server is completely inaccessible
- All services are down
- No response from any system components

#### Recovery Steps

**Step 1: Provision New Infrastructure**

```bash
# If using cloud (AWS, GCP, Azure)
# Use Terraform to provision new infrastructure
cd ~/VoiceAssist/infrastructure/terraform/
terraform init
terraform plan -out=disaster-recovery.tfplan
terraform apply disaster-recovery.tfplan

# If using physical server
# 1. Install Ubuntu Server 22.04 LTS
# 2. Configure network and SSH access
# 3. Install Docker and Docker Compose
```

**Step 2: Clone VoiceAssist Repository**

```bash
# On new server
git clone https://github.com/your-org/VoiceAssist.git ~/VoiceAssist
cd ~/VoiceAssist
```

**Step 3: Download Latest Backup**

```bash
# Create backup directory
sudo mkdir -p /var/backups/voiceassist

# Download from S3
aws s3 cp s3://voiceassist-backups/voiceassist_backup_latest.sql.gpg \
    /var/backups/voiceassist/

# Or download from Nextcloud
curl -u admin:password \
     -o /var/backups/voiceassist/voiceassist_backup_latest.sql.gpg \
     "http://nextcloud:8080/remote.php/dav/files/admin/backups/voiceassist/voiceassist_backup_latest.sql.gpg"

# Download checksum
aws s3 cp s3://voiceassist-backups/voiceassist_backup_latest.sql.gpg.sha256 \
    /var/backups/voiceassist/
```

**Step 4: Verify Backup Integrity**

```bash
# Verify checksum
cd /var/backups/voiceassist
sha256sum -c voiceassist_backup_latest.sql.gpg.sha256
```

**Step 5: Start Infrastructure Services**

```bash
cd ~/VoiceAssist

# Copy environment file
cp .env.example .env

# Edit .env with production credentials
nano .env

# Start infrastructure services (PostgreSQL, Redis, Qdrant)
docker-compose up -d postgres redis qdrant

# Wait for services to be ready
sleep 30
docker-compose ps
```

**Step 6: Restore Database**

```bash
# Set encryption key
export BACKUP_ENCRYPTION_KEY="your-encryption-passphrase"
export POSTGRES_PASSWORD="your-db-password"

# Restore database
cd ~/VoiceAssist/ha-dr/backup/
./restore-database.sh /var/backups/voiceassist/voiceassist_backup_latest.sql.gpg
```

**Step 7: Start Application Services**

```bash
cd ~/VoiceAssist

# Build and start API Gateway and workers
docker-compose up -d --build voiceassist-server voiceassist-worker

# Wait for services to start
sleep 60
```

**Step 8: Verify System Functionality**

```bash
# Check all services are running
docker-compose ps

# Test health endpoints
curl http://localhost:8000/health
curl http://localhost:8000/ready

# Test authentication
curl -X POST http://localhost:8000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com", "password": "testpass"}'

# Check application logs
docker-compose logs -f voiceassist-server
```

**Step 9: Update DNS and Load Balancers**

```bash
# Update DNS records to point to new server
# Update load balancer configuration
# This depends on your infrastructure setup
```

**Estimated Recovery Time:** 4 hours

---

### Scenario 3: Data Corruption

**Situation:** Database corruption or accidental data deletion detected

**RTO:** 2 hours
**RPO:** 24 hours
**Severity:** High

#### Detection

```bash
# Database integrity check
docker exec postgres pg_dump -U voiceassist voiceassist --schema-only > /dev/null

# Check for corruption errors in logs
docker-compose logs postgres | grep -i "corrupt\|error"

# Verify table row counts
psql -h localhost -U voiceassist -d voiceassist -c \
  "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
```

#### Recovery Steps

**Step 1: Stop Application Services**

```bash
# Stop API Gateway and workers to prevent further writes
docker-compose stop voiceassist-server voiceassist-worker

# Verify services are stopped
docker-compose ps
```

**Step 2: Create Emergency Backup of Current State**

```bash
# Even if corrupted, backup current state for forensics
pg_dump -h localhost -U voiceassist voiceassist \
    > /tmp/emergency_backup_$(date +%Y%m%d_%H%M%S).sql
```

**Step 3: Identify Point-in-Time to Restore**

```bash
# List available backups
ls -lht /var/backups/voiceassist/

# Check backup metadata to find appropriate backup
cat /var/backups/voiceassist/voiceassist_backup_YYYYMMDD_HHMMSS.sql.gpg.metadata
```

**Step 4: Restore from Backup**

```bash
# Set environment variables
export BACKUP_ENCRYPTION_KEY="your-encryption-passphrase"
export POSTGRES_PASSWORD="your-db-password"

# Restore database
cd ~/VoiceAssist/ha-dr/backup/
./restore-database.sh /var/backups/voiceassist/voiceassist_backup_YYYYMMDD_HHMMSS.sql.gpg
```

**Step 5: Verify Data Integrity**

```bash
# Check table counts
psql -h localhost -U voiceassist -d voiceassist -c \
  "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

# Run integrity checks
psql -h localhost -U voiceassist -d voiceassist -c "VACUUM ANALYZE;"

# Query critical data
psql -h localhost -U voiceassist -d voiceassist -c "SELECT COUNT(*) FROM users;"
psql -h localhost -U voiceassist -d voiceassist -c "SELECT COUNT(*) FROM messages;"
```

**Step 6: Restart Application Services**

```bash
docker-compose up -d voiceassist-server voiceassist-worker

# Monitor logs for errors
docker-compose logs -f voiceassist-server
```

**Step 7: Test Application Functionality**

```bash
# Test critical workflows
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/users/me -H "Authorization: Bearer $TOKEN"
```

**Estimated Recovery Time:** 2 hours

---

### Scenario 4: Ransomware Attack

**Situation:** Data has been encrypted by ransomware

**RTO:** 6 hours
**RPO:** 24 hours
**Severity:** Critical

#### Detection

- Files encrypted with unusual extensions (.encrypted, .locked, etc.)
- Ransom note present in directories
- Unusual file access patterns in logs
- Database access denied or data appears encrypted

#### Recovery Steps

**Step 1: Immediate Containment**

```bash
# IMMEDIATELY disconnect from network
sudo ip link set eth0 down

# Stop all services to prevent spread
docker-compose down

# Document everything visible (take screenshots of ransom notes)
```

**Step 2: Incident Response**

1. **Notify** management and security team
2. **Contact** law enforcement (FBI Cyber Division)
3. **Preserve** evidence (do not delete anything)
4. **Document** timeline of events

**Step 3: Assess Damage**

```bash
# Check which files are encrypted
find /var/lib/docker/volumes -type f -exec file {} \; | grep -i encrypted

# Check backup integrity (verify backups are not infected)
sha256sum -c /var/backups/voiceassist/voiceassist_backup_latest.sql.gpg.sha256
```

**Step 4: Provision Clean Infrastructure**

```bash
# Build completely new infrastructure (do not reuse infected systems)
# Follow Scenario 2 (Complete System Failure) steps 1-3
```

**Step 5: Restore from Clean Backup**

```bash
# Use backup from BEFORE infection timeline
# Identify clean backup (check backup dates vs infection timeline)
ls -lt /var/backups/voiceassist/

# Restore from clean backup
cd ~/VoiceAssist/ha-dr/backup/
./restore-database.sh /var/backups/voiceassist/voiceassist_backup_YYYYMMDD_HHMMSS.sql.gpg
```

**Step 6: Security Hardening**

```bash
# Reset all passwords
# Rotate all API keys and secrets
# Update all access credentials
# Review audit logs for indicators of compromise

# Apply security patches
sudo apt update && sudo apt upgrade -y

# Run security audit
cd ~/VoiceAssist/security/audit/
./security-audit.sh
```

**Step 7: Gradual Restoration**

```bash
# Bring up services one at a time
docker-compose up -d postgres
docker-compose up -d redis
docker-compose up -d qdrant
docker-compose up -d voiceassist-server

# Monitor for suspicious activity
docker-compose logs -f
```

**Estimated Recovery Time:** 6 hours (excluding investigation time)

**Important:** Do NOT pay ransom. Contact law enforcement instead.

---

### Scenario 5: Application Server Failure

**Situation:** API Gateway or worker services fail but database is healthy

**RTO:** 15 minutes
**RPO:** 0 (no data loss)
**Severity:** Medium

#### Detection

```bash
# Check service status
docker-compose ps

# Check for container crashes
docker-compose ps -a | grep -i exit

# Check logs for errors
docker-compose logs voiceassist-server | tail -50
```

#### Recovery Steps

**Step 1: Restart Failed Services**

```bash
# Restart API Gateway
docker-compose restart voiceassist-server

# Restart workers
docker-compose restart voiceassist-worker

# Check status
docker-compose ps
```

**Step 2: If Restart Fails, Rebuild**

```bash
# Rebuild and restart
docker-compose up -d --build voiceassist-server voiceassist-worker

# Check logs
docker-compose logs -f voiceassist-server
```

**Step 3: Verify Functionality**

```bash
curl http://localhost:8000/health
curl http://localhost:8000/ready
```

**Estimated Recovery Time:** 15 minutes

---

## Post-Recovery Procedures

### After Successful Recovery

#### 1. Verify All Systems

```bash
# Run comprehensive health checks
cd ~/VoiceAssist/ha-dr/testing/
./comprehensive-health-check.sh

# Verify data integrity
./verify-data-integrity.sh

# Test critical workflows
./test-critical-workflows.sh
```

#### 2. Update Monitoring

```bash
# Check all monitoring alerts are active
# Verify metrics are flowing to Grafana/Prometheus
curl http://localhost:8000/metrics

# Check audit logs are being written
psql -h localhost -U voiceassist -d voiceassist -c \
  "SELECT COUNT(*) FROM audit_logs WHERE timestamp > NOW() - INTERVAL '1 hour';"
```

#### 3. Communication

- **Notify stakeholders** that system is restored
- **Provide timeline** of outage and recovery
- **Document lessons learned**
- **Update runbook** if new issues discovered

#### 4. Post-Mortem

Conduct post-mortem meeting within 48 hours:

1. **What happened?** - Root cause analysis
2. **Why did it happen?** - Contributing factors
3. **How was it detected?** - Monitoring effectiveness
4. **How was it resolved?** - Recovery effectiveness
5. **How can we prevent it?** - Action items

**Template:** Use `docs/templates/post-mortem-template.md`

---

## Testing and Validation

### Regular DR Drills

**Frequency:** Quarterly

**Drill Procedures:**

1. **Backup Restoration Test** (Monthly)

   ```bash
   cd ~/VoiceAssist/ha-dr/backup/
   ./verify-backup.sh
   ```

2. **Failover Test** (Quarterly)

   ```bash
   # Simulate primary failure and promote replica
   cd ~/VoiceAssist/ha-dr/testing/
   ./test-failover.sh
   ```

3. **Full DR Test** (Annually)
   - Provision new infrastructure
   - Restore from backup
   - Verify all functionality
   - Document timing and issues

### Validation Checklist

After each test or real recovery:

- [ ] All services running and healthy
- [ ] Database connectivity verified
- [ ] Authentication working
- [ ] Critical workflows tested
- [ ] Monitoring and alerting active
- [ ] Backups resuming normally
- [ ] Audit logging functional
- [ ] RTO/RPO objectives met
- [ ] Documentation updated
- [ ] Stakeholders notified

---

## Contact Information

### Emergency Contacts

| Role                | Name   | Phone   | Email   | Escalation Time |
| ------------------- | ------ | ------- | ------- | --------------- |
| On-Call Engineer    | [Name] | [Phone] | [Email] | Immediate       |
| Database Admin      | [Name] | [Phone] | [Email] | 30 minutes      |
| Infrastructure Lead | [Name] | [Phone] | [Email] | 1 hour          |
| Engineering Manager | [Name] | [Phone] | [Email] | 2 hours         |
| CTO                 | [Name] | [Phone] | [Email] | 4 hours         |

### Vendor Contacts

| Vendor             | Support    | Phone          | Website                                |
| ------------------ | ---------- | -------------- | -------------------------------------- |
| AWS Support        | Premium    | 1-xxx-xxx-xxxx | https://console.aws.amazon.com/support |
| PostgreSQL Support | [Company]  | 1-xxx-xxx-xxxx | [URL]                                  |
| Docker Support     | Enterprise | 1-xxx-xxx-xxxx | [URL]                                  |

### Internal Resources

- **Wiki:** https://wiki.company.com/voiceassist
- **Status Page:** https://status.voiceassist.com
- **Slack Channel:** #voiceassist-incidents
- **Incident Management:** https://pagerduty.com

---

## Appendix

### A. Backup Schedule

| Backup Type     | Frequency    | Retention | Location   |
| --------------- | ------------ | --------- | ---------- |
| Full Database   | Daily (2 AM) | 30 days   | Local + S3 |
| Incremental WAL | Continuous   | 7 days    | Local      |
| Configuration   | Daily        | 90 days   | Git + S3   |

### B. Recovery Scripts

All recovery scripts located in: `~/VoiceAssist/ha-dr/`

- `backup/backup-database.sh` - Manual backup
- `backup/restore-database.sh` - Manual restore
- `backup/verify-backup.sh` - Backup verification
- `backup/upload-backup.sh` - Off-site upload
- `testing/test-failover.sh` - Failover simulation
- `testing/comprehensive-health-check.sh` - Post-recovery validation

### C. Change Log

| Version | Date       | Author        | Changes          |
| ------- | ---------- | ------------- | ---------------- |
| 1.0     | 2025-11-21 | Phase 12 Team | Initial creation |

---

**Document Control:**

- **Classification:** Internal Use Only - CONFIDENTIAL
- **Distribution:** Engineering Team, Operations Team
- **Review Frequency:** Quarterly
- **Next Review:** 2026-02-21

---

**Version:** 1.0
**Last Updated:** 2025-11-21
**Phase:** Phase 12 - High Availability & Disaster Recovery

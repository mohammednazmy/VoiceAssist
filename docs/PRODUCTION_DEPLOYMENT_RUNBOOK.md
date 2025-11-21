# VoiceAssist Production Deployment Runbook

**Version:** 1.0  
**Last Updated:** 2025-11-21  
**Owner:** DevOps Team  
**Phase:** 14 - Production Deployment

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Pre-Deployment Checklist](#pre-deployment-checklist)
4. [Deployment Process](#deployment-process)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Rollback Procedures](#rollback-procedures)
7. [Monitoring and Alerts](#monitoring-and-alerts)
8. [Troubleshooting](#troubleshooting)
9. [Maintenance Windows](#maintenance-windows)
10. [Emergency Contacts](#emergency-contacts)

---

## Overview

This runbook provides step-by-step instructions for deploying VoiceAssist to production. It covers initial deployment, updates, rollbacks, and emergency procedures.

### Deployment Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Internet/Users                      │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│              DNS (your-domain.com)                   │
│              Points to: Production Server IP         │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│           Nginx Reverse Proxy (Port 80/443)         │
│           - SSL/TLS Termination                      │
│           - Load Balancing                           │
│           - Security Headers                         │
└────────────────────┬────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
┌──────────────────┐   ┌──────────────────┐
│  API Gateway     │   │  Monitoring      │
│  (Port 8000)     │   │  - Grafana :3001 │
│                  │   │  - Prometheus    │
│                  │   │  - Jaeger        │
└────────┬─────────┘   └──────────────────┘
         │
    ┌────┴────┬────────┬────────┐
    ▼         ▼        ▼        ▼
┌─────────┐ ┌──────┐ ┌────┐ ┌──────────┐
│PostgreSQL│ │Redis │ │Qdrant│ │Nextcloud │
│(Primary) │ │      │ │      │ │          │
└─────────┘ └──────┘ └────┘ └──────────┘
    │
    ▼
┌─────────┐
│PostgreSQL│
│(Replica) │
└─────────┘
```

### RTO/RPO Targets

- **RTO (Recovery Time Objective):** 30 minutes
- **RPO (Recovery Point Objective):** < 1 minute (replication), 24 hours (backups)
- **Uptime Target:** 99.9% (8.76 hours downtime/year)

---

## Prerequisites

### Infrastructure Requirements

**Server Specifications:**
- Ubuntu 22.04 LTS or later
- 32 GB RAM minimum (64 GB recommended)
- 8 CPU cores minimum (16 recommended)
- 500 GB SSD storage minimum (1 TB recommended)
- Public IP address
- Firewall configured (ports 80, 443, 22)

**Network Requirements:**
- Domain name registered and DNS access
- SSL certificate (Let's Encrypt or commercial)
- Static IP address
- Outbound internet access

**Software Prerequisites:**
- Docker 24.0+ 
- Docker Compose 2.20+
- Git
- Terraform 1.5+ (optional, for cloud deployment)
- Ansible 2.14+ (optional, for automation)
- Python 3.11+

### Access Requirements

**Required Credentials:**
- SSH access to production server (root or sudo user)
- GitHub repository access
- Domain registrar access (for DNS)
- OpenAI API key
- SMTP credentials (for emails)
- Backup storage credentials (S3 or similar)

**Service Accounts:**
- PostgreSQL admin user
- Redis password
- Qdrant API key
- Nextcloud admin credentials
- Grafana admin credentials

---

## Pre-Deployment Checklist

### 1. Infrastructure Preparation

- [ ] Production server provisioned and accessible
- [ ] SSH keys configured for passwordless access
- [ ] Firewall rules configured (ports 80, 443, 22 only)
- [ ] Domain DNS A record points to server IP
- [ ] Server hostname set correctly
- [ ] Time zone configured (UTC recommended)
- [ ] NTP service enabled and running

### 2. Software Installation

- [ ] Docker and Docker Compose installed
- [ ] Git installed
- [ ] System packages up to date (`apt update && apt upgrade`)
- [ ] Certbot installed (for Let's Encrypt SSL)
- [ ] Nginx installed
- [ ] Python 3.11+ installed

### 3. Security Hardening

- [ ] SSH configured (disable password auth, key-only)
- [ ] Fail2ban installed and configured
- [ ] UFW firewall enabled
- [ ] Automatic security updates enabled
- [ ] System logging configured
- [ ] Audit logging enabled

### 4. Secrets and Configuration

- [ ] `.env` file prepared with production values
- [ ] All passwords generated (minimum 16 characters)
- [ ] OpenAI API key obtained
- [ ] SMTP credentials configured
- [ ] Encryption keys generated
- [ ] JWT secret keys generated (64 characters)
- [ ] Database passwords set
- [ ] Redis password set

### 5. Backup Configuration

- [ ] Backup storage configured (S3 bucket or local)
- [ ] Backup encryption GPG key generated
- [ ] Backup schedule configured
- [ ] Backup restoration tested

### 6. Monitoring Setup

- [ ] Grafana admin password set
- [ ] Prometheus configured
- [ ] Alert rules configured
- [ ] PagerDuty/Slack integration configured
- [ ] Log retention policies set

---

## Deployment Process

### Step 1: Server Preparation

```bash
# 1. Connect to production server
ssh root@your-server-ip

# 2. Create application directory
mkdir -p /opt/voiceassist
cd /opt/voiceassist

# 3. Clone repository
git clone https://github.com/mohammednazmy/VoiceAssist.git .

# 4. Checkout production branch
git checkout main

# 5. Verify repository contents
ls -la
```

### Step 2: Environment Configuration

```bash
# 1. Create production .env file
cp deployment/production/configs/.env.production.template .env

# 2. Edit .env file with production values
nano .env

# CRITICAL: Update these values:
# - DOMAIN=your-domain.com
# - POSTGRES_PASSWORD (strong password)
# - REDIS_PASSWORD (strong password)
# - SECRET_KEY (64 random characters)
# - JWT_SECRET_KEY (64 random characters)
# - OPENAI_API_KEY
# - SMTP credentials
# - Admin email

# 3. Verify .env file
cat .env | grep -v "PASSWORD\|KEY\|SECRET"  # Check non-sensitive values

# 4. Set secure permissions
chmod 600 .env
chown root:root .env
```

### Step 3: SSL/TLS Configuration

```bash
# 1. Update DNS A record (do this first!)
# your-domain.com → your-server-ip

# 2. Wait for DNS propagation (check with dig or nslookup)
dig your-domain.com +short

# 3. Run SSL setup script
cd /opt/voiceassist
bash deployment/production/scripts/setup-ssl.sh \
    --domain your-domain.com \
    --email admin@your-domain.com

# This will:
# - Install Certbot
# - Configure nginx
# - Obtain Let's Encrypt certificate
# - Setup auto-renewal (cron job)
```

### Step 4: Database Initialization

```bash
# 1. Start PostgreSQL first
docker-compose up -d postgres

# 2. Wait for PostgreSQL to be ready
docker-compose exec postgres pg_isready -U voiceassist

# 3. Run database migrations
docker-compose run --rm voiceassist-server alembic upgrade head

# 4. Verify migrations
docker-compose exec postgres psql -U voiceassist -d voiceassist -c "\dt"
```

### Step 5: Service Deployment

```bash
# 1. Build and start all services
docker-compose -f docker-compose.yml \
    -f deployment/production/configs/docker-compose.prod.yml \
    up -d

# 2. Verify all services are running
docker-compose ps

# All services should show "Up" status

# 3. Check service logs
docker-compose logs -f voiceassist-server

# Press Ctrl+C to exit logs
```

### Step 6: Monitoring Setup

```bash
# 1. Start monitoring stack
docker-compose -f infrastructure/observability/docker-compose.monitoring.yml up -d

# 2. Verify monitoring services
curl http://localhost:3001/api/health  # Grafana
curl http://localhost:9090/-/healthy   # Prometheus
curl http://localhost:16686/           # Jaeger

# 3. Import Grafana dashboards
for dashboard in infrastructure/observability/grafana/dashboards/*.json; do
    curl -X POST http://admin:${GRAFANA_ADMIN_PASSWORD}@localhost:3001/api/dashboards/db \
        -H "Content-Type: application/json" \
        -d @"$dashboard"
done
```

### Step 7: Backup Configuration

```bash
# 1. Setup automated backups
cp ha-dr/backup/backup-all.sh /opt/voiceassist/
chmod +x /opt/voiceassist/backup-all.sh

# 2. Configure backup schedule (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /opt/voiceassist/backup-all.sh

# 3. Test backup immediately
/opt/voiceassist/backup-all.sh

# 4. Verify backup created
ls -lh /opt/voiceassist/backups/
```

---

## Post-Deployment Verification

### Automated Smoke Tests

```bash
# Run comprehensive smoke tests
cd /opt/voiceassist
bash deployment/production/smoke-tests/smoke-test.sh \
    --domain your-domain.com \
    --verbose

# Expected output: All tests PASSED
```

### Manual Verification Steps

**1. Health Checks**
```bash
# API Gateway health
curl https://your-domain.com/health
# Expected: {"status": "ok", "database": "ok", "redis": "ok", ...}

# Ready endpoint
curl https://your-domain.com/ready
# Expected: {"status": "ready"}

# Metrics endpoint
curl https://your-domain.com/metrics
# Expected: Prometheus metrics output
```

**2. SSL/TLS Verification**
```bash
# Test SSL certificate
openssl s_client -servername your-domain.com -connect your-domain.com:443

# Check SSL Labs (optional)
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=your-domain.com
```

**3. Database Verification**
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U voiceassist -d voiceassist

# Run queries
SELECT COUNT(*) FROM users;
SELECT version();
\q
```

**4. Monitoring Verification**
```bash
# Access Grafana
# URL: https://your-domain.com:3001
# Login: admin / <GRAFANA_ADMIN_PASSWORD>

# Check dashboards:
# - VoiceAssist Overview
# - API Performance
# - Database Performance
# - System Resources
```

**5. Functional Testing**
```bash
# Register test user
curl -X POST https://your-domain.com/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"TestPassword123!","full_name":"Test User"}'

# Login
curl -X POST https://your-domain.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"TestPassword123!"}'
# Save the access_token from response

# Test authenticated endpoint
curl -H "Authorization: Bearer <access_token>" \
    https://your-domain.com/api/auth/me
```

---

## Rollback Procedures

### Quick Rollback (Service Restart)

If the issue is with the current deployment but data is intact:

```bash
# 1. Stop services
docker-compose -f docker-compose.yml \
    -f deployment/production/configs/docker-compose.prod.yml \
    down

# 2. Checkout previous version
git log --oneline  # Find previous commit hash
git checkout <previous-commit-hash>

# 3. Rebuild and restart
docker-compose -f docker-compose.yml \
    -f deployment/production/configs/docker-compose.prod.yml \
    up -d --build

# 4. Verify rollback
bash deployment/production/smoke-tests/smoke-test.sh --domain your-domain.com
```

### Database Rollback (with Backup Restore)

If database changes need to be reverted:

```bash
# 1. Stop all services
docker-compose down

# 2. Restore database from backup
cd /opt/voiceassist
bash ha-dr/backup/restore.sh \
    --file /opt/voiceassist/backups/voiceassist_backup_YYYYMMDD.sql.gz.gpg \
    --passphrase "<GPG_PASSPHRASE>"

# 3. Start services
docker-compose -f docker-compose.yml \
    -f deployment/production/configs/docker-compose.prod.yml \
    up -d

# 4. Verify data integrity
docker-compose exec postgres psql -U voiceassist -d voiceassist -c "SELECT COUNT(*) FROM users;"
```

### Complete System Rollback

For severe issues requiring full system restore:

```bash
# Follow Disaster Recovery Runbook
# See: docs/DISASTER_RECOVERY_RUNBOOK.md
# Scenario 2: Complete System Failure
```

---

## Monitoring and Alerts

### Key Metrics to Monitor

**System Metrics:**
- CPU usage (alert if > 80% for 5 minutes)
- Memory usage (alert if > 90%)
- Disk usage (alert if > 85%)
- Network I/O

**Application Metrics:**
- Request rate (requests/second)
- Response time (P50, P95, P99)
- Error rate (alert if > 1%)
- Active connections
- Queue depth

**Database Metrics:**
- Connection count
- Query latency
- Replication lag (alert if > 10 seconds)
- Dead tuples
- Cache hit rate

**Infrastructure Metrics:**
- Container health
- Service uptime
- SSL certificate expiry (alert 7 days before)
- Backup success/failure

### Alert Configuration

Alerts are configured in:
- `infrastructure/observability/prometheus/alerts/`
- `infrastructure/observability/alertmanager/config.yml`

**Critical Alerts (PagerDuty):**
- Service down
- Database unavailable
- Replication lag > 60 seconds
- Disk usage > 90%
- Error rate > 5%

**Warning Alerts (Slack):**
- High CPU usage
- High memory usage
- Slow response times
- Backup failures
- SSL expiring soon

### Accessing Monitoring

**Grafana Dashboards:**
```
URL: https://your-domain.com:3001
Login: admin / <GRAFANA_ADMIN_PASSWORD>

Dashboards:
- VoiceAssist Overview
- API Gateway Performance
- Database Performance
- System Resources
- High Availability Status
```

**Prometheus:**
```
URL: https://your-domain.com:9090
Queries:
- rate(http_requests_total[5m])
- http_request_duration_seconds{quantile="0.95"}
- up{job="voiceassist"}
```

**Jaeger Tracing:**
```
URL: https://your-domain.com:16686
Use to trace requests through the system
```

---

## Troubleshooting

### Common Issues

#### 1. Service Won't Start

**Symptoms:** Container exits immediately or won't start

**Diagnosis:**
```bash
# Check container logs
docker-compose logs voiceassist-server

# Check container status
docker-compose ps

# Inspect container
docker inspect voiceassist-server
```

**Solutions:**
- Check `.env` file for missing/incorrect values
- Verify ports are not in use: `netstat -tulpn | grep <port>`
- Check disk space: `df -h`
- Review logs for specific error messages

#### 2. Database Connection Failed

**Symptoms:** "Cannot connect to database" errors

**Diagnosis:**
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres pg_isready -U voiceassist

# Check logs
docker-compose logs postgres
```

**Solutions:**
- Verify `DATABASE_URL` in `.env`
- Check PostgreSQL container health
- Verify credentials
- Check network connectivity: `docker network ls`

#### 3. SSL Certificate Issues

**Symptoms:** "Certificate error" or "Not secure" warnings

**Diagnosis:**
```bash
# Check certificate
openssl s_client -servername your-domain.com -connect your-domain.com:443

# Check nginx config
nginx -t

# Check Let's Encrypt logs
cat /var/log/letsencrypt/letsencrypt.log
```

**Solutions:**
- Verify DNS points to correct IP
- Re-run SSL setup script
- Check firewall allows port 80 (for renewal)
- Manually renew: `certbot renew --force-renewal`

#### 4. High Memory Usage

**Symptoms:** System slow, OOM errors

**Diagnosis:**
```bash
# Check memory usage
free -h
docker stats

# Check for memory leaks
docker-compose top
```

**Solutions:**
- Increase server memory
- Adjust container memory limits in docker-compose.prod.yml
- Restart services: `docker-compose restart`
- Check for zombie processes

#### 5. Slow API Response

**Symptoms:** High response times, timeouts

**Diagnosis:**
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://your-domain.com/health

# Check database performance
docker-compose exec postgres psql -U voiceassist -d voiceassist -c "SELECT * FROM pg_stat_activity;"

# Check load
uptime
```

**Solutions:**
- Scale up workers in docker-compose.prod.yml
- Optimize database queries
- Add database indexes
- Enable Redis caching
- Scale horizontally (add more servers)

---

## Maintenance Windows

### Scheduled Maintenance

**Recommended Schedule:**
- **Weekly:** Sunday 2:00 AM - 4:00 AM UTC
- **Monthly:** First Sunday of month, 2:00 AM - 6:00 AM UTC
- **Quarterly:** Major updates, 6-hour window

**Maintenance Activities:**
- Apply system updates
- Update Docker images
- Database maintenance (VACUUM, ANALYZE)
- Log rotation
- Certificate renewal
- Backup verification
- Failover testing

### Maintenance Procedure

```bash
# 1. Announce maintenance (24 hours notice)

# 2. Enable maintenance mode
echo "System under maintenance. Back soon!" > /var/www/html/maintenance.html
# Update nginx to serve maintenance page

# 3. Perform updates
apt update && apt upgrade -y
docker-compose pull
docker-compose up -d

# 4. Run database maintenance
docker-compose exec postgres psql -U voiceassist -d voiceassist -c "VACUUM ANALYZE;"

# 5. Verify system
bash deployment/production/smoke-tests/smoke-test.sh --domain your-domain.com

# 6. Disable maintenance mode
# Restore nginx configuration

# 7. Monitor for 1 hour
# Watch logs, metrics, and alerts
```

---

## Emergency Contacts

### On-Call Rotation

| Role | Name | Phone | Email | Hours |
|------|------|-------|-------|-------|
| Primary DevOps | [Name] | [Phone] | [Email] | 24/7 |
| Secondary DevOps | [Name] | [Phone] | [Email] | 24/7 |
| Database Admin | [Name] | [Phone] | [Email] | Business hours |
| Security Lead | [Name] | [Phone] | [Email] | 24/7 |

### Escalation Path

1. **Level 1:** On-call DevOps Engineer
2. **Level 2:** DevOps Lead + Database Admin
3. **Level 3:** CTO + Security Lead
4. **Level 4:** Executive Team

### External Support

- **Hosting Provider:** [Provider] - [Support Phone/Email]
- **Domain Registrar:** [Registrar] - [Support Phone/Email]
- **OpenAI Support:** support@openai.com
- **Database Consultant:** [Name/Company] - [Contact]

### Communication Channels

- **Status Page:** https://status.your-domain.com
- **Slack Channel:** #voiceassist-production
- **PagerDuty:** [PagerDuty service link]
- **Email:** ops@your-domain.com

---

## Appendix

### A. Useful Commands

```bash
# View all containers
docker ps -a

# View logs (last 100 lines)
docker-compose logs --tail=100 voiceassist-server

# Follow logs in real-time
docker-compose logs -f

# Restart single service
docker-compose restart voiceassist-server

# Execute command in container
docker-compose exec voiceassist-server bash

# Check disk usage
du -sh /var/lib/docker
docker system df

# Clean up Docker resources
docker system prune -a

# Database backup
docker-compose exec postgres pg_dump -U voiceassist voiceassist > backup.sql

# Database restore
cat backup.sql | docker-compose exec -T postgres psql -U voiceassist voiceassist
```

### B. Configuration Files

- **Main compose:** `docker-compose.yml`
- **Production override:** `deployment/production/configs/docker-compose.prod.yml`
- **Environment:** `/opt/voiceassist/.env`
- **Nginx:** `/etc/nginx/sites-available/voiceassist`
- **SSL certs:** `/etc/letsencrypt/live/your-domain.com/`

### C. Deployment Checklist (Quick Reference)

- [ ] Server prepared
- [ ] `.env` configured
- [ ] SSL/TLS setup
- [ ] Database initialized
- [ ] Services deployed
- [ ] Monitoring configured
- [ ] Backups enabled
- [ ] Smoke tests passed
- [ ] DNS configured
- [ ] Documentation updated

---

**Document Version:** 1.0  
**Last Review:** 2025-11-21  
**Next Review:** 2025-12-21  
**Owner:** DevOps Team


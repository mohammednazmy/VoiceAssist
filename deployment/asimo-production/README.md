# VoiceAssist Production Deployment for asimo.io

This directory contains the production deployment configuration for VoiceAssist on the asimo.io Ubuntu server.

## 🎯 Deployment Overview

- **Main Domain:** https://assist.asimo.io
- **Monitoring:** https://monitor.asimo.io
- **Backend:** FastAPI on Docker Compose
- **Reverse Proxy:** Apache with SSL/TLS (Certbot)
- **Monitoring Stack:** Prometheus + Grafana + Jaeger + Loki (Full observability)

## 📁 Directory Structure

```
deployment/asimo-production/
├── deploy-to-asimo.sh              # Main deployment script
├── docker-compose.monitoring.yml   # Full monitoring stack
├── docker-compose.prod.yml         # Production overrides
├── configs/
│   ├── prometheus.yml              # Metrics collection
│   ├── prometheus-alerts.yml       # Alert rules
│   ├── loki.yml                    # Log aggregation
│   ├── promtail.yml                # Log shipper
│   ├── alertmanager.yml            # Alert management
│   └── grafana/
│       ├── provisioning/
│       │   ├── datasources/        # Grafana datasources
│       │   └── dashboards/         # Dashboard provisioning
│       └── dashboards/
│           └── voiceassist-overview.json  # Main dashboard
└── README.md                       # This file
```

## 🚀 Quick Start

### Prerequisites

- Ubuntu 24.04 LTS (asimo.io server)
- Root or sudo access
- Docker and Docker Compose installed
- Apache2 web server installed
- DNS records for assist.asimo.io and monitor.asimo.io

### Deployment Steps

1. **Run the deployment script:**

```bash
cd ~/VoiceAssist
sudo ./deployment/asimo-production/deploy-to-asimo.sh
```

This single command will:

- ✅ Check prerequisites and install missing tools
- ✅ Create deployment directory (`/opt/voiceassist`)
- ✅ Copy project files
- ✅ Generate secure production environment configuration
- ✅ Configure Apache reverse proxy for assist.asimo.io
- ✅ Configure Apache reverse proxy for monitor.asimo.io (Grafana)
- ✅ Set up SSL/TLS certificates with Certbot
- ✅ Deploy backend services with Docker Compose
- ✅ Deploy full monitoring stack (Prometheus + Grafana + Jaeger + Loki)
- ✅ Configure log rotation
- ✅ Create systemd service
- ✅ Set up health monitoring cron job
- ✅ Run smoke tests
- ✅ Display deployment summary

2. **Configure secrets:**

After deployment, edit the production environment file:

```bash
sudo nano /opt/voiceassist/.env.production
```

Set the following:

- `OPENAI_API_KEY` - Your OpenAI API key
- `NEXTCLOUD_ADMIN_PASSWORD` - Nextcloud admin password
- `NEXTCLOUD_DB_PASSWORD` - Nextcloud database password

3. **Restart services:**

```bash
cd /opt/voiceassist
sudo docker compose -f docker-compose.yml -f deployment/asimo-production/docker-compose.prod.yml restart
```

## 📊 Accessing Services

### Main Application

- **API Gateway:** https://assist.asimo.io
- **Health Check:** https://assist.asimo.io/health
- **API Documentation:** https://assist.asimo.io/docs
- **Metrics Endpoint:** https://assist.asimo.io/metrics

### Monitoring Stack

- **Grafana Dashboards:** https://monitor.asimo.io
  - Default credentials: `admin` / `admin` (change on first login)
  - VoiceAssist Overview dashboard pre-configured

- **Prometheus:** http://localhost:9090 (SSH tunnel recommended)
- **Jaeger Tracing:** http://localhost:16686 (SSH tunnel recommended)
- **Loki Logs:** http://localhost:3100 (accessed via Grafana)
- **AlertManager:** http://localhost:9093 (SSH tunnel recommended)

### SSH Tunnels (Secure Access)

If you prefer to access monitoring tools via SSH tunnel:

```bash
ssh -L 9090:localhost:9090 \
    -L 16686:localhost:16686 \
    -L 9093:localhost:9093 \
    root@asimo.io
```

## 🔧 Management Commands

### Service Management

```bash
# Using systemd
sudo systemctl status voiceassist
sudo systemctl restart voiceassist
sudo systemctl stop voiceassist
sudo systemctl start voiceassist

# Using Docker Compose directly
cd /opt/voiceassist
sudo docker compose ps
sudo docker compose logs -f
sudo docker compose restart
sudo docker compose down
sudo docker compose up -d
```

### Monitoring Stack Management

```bash
cd /opt/voiceassist
sudo docker compose -f deployment/asimo-production/docker-compose.monitoring.yml ps
sudo docker compose -f deployment/asimo-production/docker-compose.monitoring.yml logs -f
sudo docker compose -f deployment/asimo-production/docker-compose.monitoring.yml restart
```

### Monitoring Stack Configuration

#### Jaeger (Distributed Tracing)

**Storage Type:** In-memory (development/testing)

```yaml
environment:
  - SPAN_STORAGE_TYPE=memory
  - MEMORY_MAX_TRACES=10000
```

**Key Details:**

- Stores up to 10,000 traces in memory
- No persistence across container restarts
- Suitable for development and testing environments
- For production with persistence, consider switching to BadgerDB or Cassandra

**Access:** http://localhost:16686 (via SSH tunnel recommended)

#### Loki (Log Aggregation)

**Schema Version:** v13 (TSDB - Time Series Database)

```yaml
schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
```

**Key Configuration:**

- **Storage:** Filesystem-based TSDB (Time Series Database)
- **Retention:** 31 days (744 hours)
- **Compactor:** Enabled with `delete_request_store: filesystem`
- **Index Period:** 24 hours

**Important Notes:**

- Loki v3.x requires `delete_request_store` when retention is enabled
- Deprecated fields removed: `shared_store`, `enforce_metric_name`, `max_look_back_period`
- Configuration file: `/opt/voiceassist/deployment/asimo-production/configs/loki.yml`

**Access:** http://localhost:3100 (accessed via Grafana datasource)

#### Applying Configuration Changes

After modifying monitoring configs:

```bash
# Copy updated configs to production
sudo cp ~/VoiceAssist/deployment/asimo-production/configs/loki.yml \
   /opt/voiceassist/deployment/asimo-production/configs/loki.yml

sudo cp ~/VoiceAssist/deployment/asimo-production/docker-compose.monitoring.yml \
   /opt/voiceassist/deployment/asimo-production/docker-compose.monitoring.yml

# Restart affected services
cd /opt/voiceassist
sudo docker compose -f deployment/asimo-production/docker-compose.monitoring.yml restart jaeger loki

# Or recreate containers to apply environment changes
sudo docker compose -f deployment/asimo-production/docker-compose.monitoring.yml stop jaeger loki
sudo docker compose -f deployment/asimo-production/docker-compose.monitoring.yml rm -f jaeger loki
sudo docker compose -f deployment/asimo-production/docker-compose.monitoring.yml up -d jaeger loki

# Verify containers are running
docker ps | grep -E "voiceassist-(jaeger|loki)"
```

### Health Checks

```bash
# Manual health check
/opt/voiceassist/scripts/health-check.sh

# View cron jobs
crontab -l

# Check service health
curl https://assist.asimo.io/health
curl http://localhost:8000/health
```

### Logs

```bash
# Application logs
sudo docker compose logs -f voiceassist-server

# Apache logs
sudo tail -f /var/log/apache2/assist-error.log
sudo tail -f /var/log/apache2/monitor-error.log

# System logs
sudo journalctl -u voiceassist -f
sudo journalctl -u apache2 -f
```

## 🔐 Security

### SSL/TLS Certificates

- Managed by Certbot (Let's Encrypt)
- Auto-renewal configured via systemd timer
- Check renewal status: `sudo certbot renew --dry-run`

### Firewall Configuration

Ensure the following ports are open:

```bash
sudo ufw allow 80/tcp    # HTTP (redirects to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw status
```

### Environment Variables

- Production secrets stored in `/opt/voiceassist/.env.production`
- File permissions set to `600` (root only)
- Never commit `.env.production` to git

## 📈 Monitoring & Alerts

### Prometheus Alerts

Configured alerts include:

- API down or unreachable
- High error rates (>5%)
- High response times (>1s p95)
- Database connection issues
- Redis cache down
- High CPU usage (>80%)
- High memory usage (>90%)
- Low disk space (<15%)
- HIPAA compliance alerts

### Alert Notifications

- Email notifications sent to `admin@asimo.io`
- Critical alerts trigger immediate emails
- HIPAA compliance alerts sent to compliance team
- Configure SMTP in `/opt/voiceassist/deployment/asimo-production/configs/alertmanager.yml`

### Grafana Dashboards

Pre-configured dashboards:

- **VoiceAssist Overview:** API status, request rates, response times
- Add custom dashboards via Grafana UI

## 🔄 Updates & Maintenance

### Updating VoiceAssist

```bash
# 1. Pull latest code
cd ~/VoiceAssist
git pull origin main

# 2. Backup current deployment
sudo cp -r /opt/voiceassist /opt/voiceassist.backup.$(date +%Y%m%d)

# 3. Copy updated files
sudo rsync -av --exclude '.git' --exclude 'node_modules' ~/VoiceAssist/ /opt/voiceassist/

# 4. Rebuild and restart services
cd /opt/voiceassist
sudo docker compose build
sudo docker compose -f docker-compose.yml -f deployment/asimo-production/docker-compose.prod.yml up -d

# 5. Run smoke tests
/opt/voiceassist/deployment/asimo-production/smoke-tests/smoke-test.sh
```

### Database Backups

Automated backups are recommended. Example cron job:

```bash
# Add to crontab (sudo crontab -e)
0 2 * * * docker exec voiceassist-postgres pg_dump -U voiceassist voiceassist | gzip > /var/backups/voiceassist-$(date +\%Y\%m\%d).sql.gz
```

### Log Rotation

Configured via `/etc/logrotate.d/voiceassist`:

- Apache logs: 14 days retention
- Application logs: 30 days retention
- Compressed after rotation

## 🐛 Troubleshooting

### Common Issues

#### 1. Services not starting

```bash
# Check service status
sudo docker compose ps
sudo docker compose logs

# Check disk space
df -h

# Check Docker
sudo systemctl status docker
```

#### 2. SSL certificate issues

```bash
# Test certificate renewal
sudo certbot renew --dry-run

# Check certificate status
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal
```

#### 3. Apache configuration errors

```bash
# Test configuration
sudo apache2ctl configtest

# Check enabled sites
sudo apache2ctl -S

# Reload Apache
sudo systemctl reload apache2
```

#### 4. Database connection errors

```bash
# Check PostgreSQL
sudo docker exec -it voiceassist-postgres pg_isready -U voiceassist

# View database logs
sudo docker compose logs postgres

# Connect to database
sudo docker exec -it voiceassist-postgres psql -U voiceassist
```

### Support

For issues or questions:

1. Check logs: `/var/log/apache2/assist-*.log`
2. Run health check: `/opt/voiceassist/scripts/health-check.sh`
3. Review Grafana dashboards: https://monitor.asimo.io
4. Check GitHub Issues: https://github.com/mohammednazmy/VoiceAssist/issues

## 📚 Additional Resources

- [VoiceAssist Main README](../../README.md)
- [Architecture Documentation](../../docs/UNIFIED_ARCHITECTURE.md)
- [Deployment Guide](../../docs/DEPLOYMENT_GUIDE.md)
- [HIPAA Compliance](../../docs/HIPAA_COMPLIANCE_MATRIX.md)
- [API Documentation](https://assist.asimo.io/docs)

---

**Deployed:** $(date)
**Version:** 2.0
**Environment:** Production (asimo.io)

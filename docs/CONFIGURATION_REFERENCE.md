---
title: Configuration Reference
slug: configuration-reference
summary: "**VoiceAssist V2 - Complete Configuration Guide**"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - configuration
  - reference
category: reference
component: "backend/config"
relatedPaths:
  - "services/api-gateway/app/core/config.py"
  - ".env.example"
  - "docker-compose.yml"
ai_summary: >-
  VoiceAssist V2 - Complete Configuration Guide This document provides
  comprehensive documentation for all configuration options available in
  VoiceAssist V2. Usage: ENVIRONMENT=production DEBUG=false LOG_LEVEL=INFO
  Validation Rules: - ENVIRONMENT must be one of: development, staging,
  production - D...
---

# Configuration Reference

**VoiceAssist V2 - Complete Configuration Guide**

This document provides comprehensive documentation for all configuration options available in VoiceAssist V2.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Configuration Validation](#configuration-validation)
- [Security Best Practices](#security-best-practices)
- [Configuration Examples](#configuration-examples)

## Environment Variables

### Environment Settings

| Variable      | Required | Default       | Description            | Validation                                      |
| ------------- | -------- | ------------- | ---------------------- | ----------------------------------------------- |
| `ENVIRONMENT` | Yes      | -             | Deployment environment | `development`, `staging`, `production`          |
| `DEBUG`       | No       | `false`       | Enable debug mode      | `true`, `false`                                 |
| `APP_NAME`    | No       | `VoiceAssist` | Application name       | Any string                                      |
| `APP_VERSION` | No       | `2.0.0`       | Application version    | Semantic version                                |
| `LOG_LEVEL`   | No       | `INFO`        | Logging level          | `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |

**Usage:**

```bash
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO
```

**Validation Rules:**

- `ENVIRONMENT` must be one of: development, staging, production
- `DEBUG` should be `false` in production
- `LOG_LEVEL` should be `WARNING` or higher in production

---

### Database Configuration

| Variable            | Required | Default | Description                     | Validation                    |
| ------------------- | -------- | ------- | ------------------------------- | ----------------------------- |
| `POSTGRES_HOST`     | Yes      | -       | PostgreSQL hostname             | Valid hostname or IP          |
| `POSTGRES_PORT`     | Yes      | `5432`  | PostgreSQL port                 | 1-65535                       |
| `POSTGRES_USER`     | Yes      | -       | PostgreSQL username             | Alphanumeric + underscore     |
| `POSTGRES_PASSWORD` | Yes      | -       | PostgreSQL password             | Min 16 chars, strong password |
| `POSTGRES_DB`       | Yes      | -       | Database name                   | Alphanumeric + underscore     |
| `DATABASE_URL`      | Yes      | -       | Full database connection string | Valid PostgreSQL URL          |

**Usage:**

```bash
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=voiceassist
POSTGRES_PASSWORD=secure_complex_password_min_16_chars
POSTGRES_DB=voiceassist
DATABASE_URL=postgresql://voiceassist:secure_password@postgres:5432/voiceassist
```

**Validation Rules:**

- Password must be at least 16 characters
- Password should contain uppercase, lowercase, numbers, special chars
- Use PostgreSQL 16+ with pgvector extension
- Connection string format: `postgresql://user:password@host:port/database`

**Production Recommendations:**

- Use connection pooling: Add `?pool_size=20&max_overflow=40` to DATABASE_URL
- Enable SSL: Add `?sslmode=require` for production
- Use managed PostgreSQL service (AWS RDS, Google Cloud SQL, etc.)

---

### Redis Configuration

| Variable         | Required | Default | Description                  | Validation           |
| ---------------- | -------- | ------- | ---------------------------- | -------------------- |
| `REDIS_HOST`     | Yes      | -       | Redis hostname               | Valid hostname or IP |
| `REDIS_PORT`     | Yes      | `6379`  | Redis port                   | 1-65535              |
| `REDIS_PASSWORD` | Yes      | -       | Redis password               | Min 16 chars         |
| `REDIS_URL`      | Yes      | -       | Full Redis connection string | Valid Redis URL      |
| `REDIS_DB`       | No       | `0`     | Redis database number        | 0-15                 |

**Usage:**

```bash
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=secure_redis_password_min_16_chars
REDIS_URL=redis://:secure_password@redis:6379/0
```

**Validation Rules:**

- Redis 7+ recommended
- Password must be set in production
- Connection string format: `redis://[:password@]host:port[/db]`

**Production Recommendations:**

- Use Redis Cluster for high availability
- Enable persistence (AOF + RDB)
- Set maxmemory policy: `allkeys-lru`
- Use managed Redis (AWS ElastiCache, Redis Cloud, etc.)

---

### Qdrant Vector Database

| Variable            | Required | Default             | Description      | Validation                            |
| ------------------- | -------- | ------------------- | ---------------- | ------------------------------------- |
| `QDRANT_HOST`       | Yes      | -                   | Qdrant hostname  | Valid hostname or IP                  |
| `QDRANT_PORT`       | Yes      | `6333`              | Qdrant HTTP port | 1-65535                               |
| `QDRANT_URL`        | Yes      | -                   | Full Qdrant URL  | Valid HTTP URL                        |
| `QDRANT_COLLECTION` | Yes      | `medical_knowledge` | Collection name  | Alphanumeric + underscore             |
| `QDRANT_API_KEY`    | No       | -                   | Qdrant API key   | Any string (required if auth enabled) |

**Usage:**

```bash
QDRANT_HOST=qdrant
QDRANT_PORT=6333
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=medical_knowledge
```

**Validation Rules:**

- Qdrant v1.7+ required
- Collection name must match `[a-zA-Z0-9_]+`
- Use HTTPS URL in production

**Production Recommendations:**

- Use Qdrant Cloud for managed service
- Enable authentication with API key
- Configure quantization for cost savings
- Set up replication for high availability

---

### Nextcloud Integration

| Variable                   | Required | Default | Description            | Validation           |
| -------------------------- | -------- | ------- | ---------------------- | -------------------- |
| `NEXTCLOUD_URL`            | Yes      | -       | Nextcloud instance URL | Valid HTTP/HTTPS URL |
| `NEXTCLOUD_ADMIN_USER`     | Yes      | -       | Admin username         | Any string           |
| `NEXTCLOUD_ADMIN_PASSWORD` | Yes      | -       | Admin password         | Min 12 chars         |
| `NEXTCLOUD_DB_PASSWORD`    | Yes      | -       | Nextcloud DB password  | Min 16 chars         |

**Usage:**

```bash
NEXTCLOUD_URL=https://nextcloud.example.com
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=secure_admin_password
NEXTCLOUD_DB_PASSWORD=secure_db_password
```

**Validation Rules:**

- Nextcloud 29+ recommended
- Use HTTPS in production
- Admin password should be strong

**Production Recommendations:**

- Deploy Nextcloud on separate infrastructure
- Use managed database for Nextcloud
- Enable 2FA for admin account
- Configure email for notifications

---

### OpenAI API

| Variable                 | Required | Default                  | Description             | Validation              |
| ------------------------ | -------- | ------------------------ | ----------------------- | ----------------------- |
| `OPENAI_API_KEY`         | Yes      | -                        | OpenAI API key          | Starts with `sk-`       |
| `OPENAI_MODEL`           | No       | `gpt-4`                  | GPT model to use        | Valid OpenAI model name |
| `OPENAI_EMBEDDING_MODEL` | No       | `text-embedding-3-small` | Embedding model         | Valid embedding model   |
| `OPENAI_MAX_TOKENS`      | No       | `512`                    | Max tokens per response | 1-4096                  |
| `OPENAI_TEMPERATURE`     | No       | `0.1`                    | Model temperature       | 0.0-2.0                 |

**Usage:**

```bash
OPENAI_API_KEY=sk-your-real-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_MAX_TOKENS=512
OPENAI_TEMPERATURE=0.1
```

**Validation Rules:**

- API key must start with `sk-` or `sk-proj-`
- Model must be available in your OpenAI account
- Temperature must be between 0.0 and 2.0

**Cost Management:**

- Use `gpt-4-turbo-preview` for lower costs
- Use `text-embedding-3-small` (1536 dimensions) instead of `large` (3072)
- Set reasonable `OPENAI_MAX_TOKENS` to control costs
- Monitor usage at https://platform.openai.com/usage

---

### Security Configuration

| Variable                      | Required | Default | Description             | Validation        |
| ----------------------------- | -------- | ------- | ----------------------- | ----------------- |
| `SECRET_KEY`                  | Yes      | -       | Application secret key  | Min 32 chars, hex |
| `JWT_SECRET`                  | Yes      | -       | JWT signing secret      | Min 32 chars, hex |
| `JWT_ALGORITHM`               | No       | `HS256` | JWT algorithm           | `HS256`, `RS256`  |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No       | `15`    | Access token TTL        | 5-60 minutes      |
| `REFRESH_TOKEN_EXPIRE_DAYS`   | No       | `7`     | Refresh token TTL       | 1-30 days         |
| `PASSWORD_MIN_LENGTH`         | No       | `12`    | Minimum password length | 8-128             |

**Usage:**

```bash
SECRET_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
PASSWORD_MIN_LENGTH=12
```

**Generation Commands:**

```bash
# Generate SECRET_KEY
openssl rand -hex 32

# Generate JWT_SECRET
openssl rand -hex 32
```

**Validation Rules:**

- Both secrets must be exactly 64 hex characters (32 bytes)
- Secrets must be different from each other
- Never commit secrets to version control
- Rotate secrets every 90 days in production

**HIPAA Compliance:**

- Use strong secrets (32+ bytes)
- Rotate tokens regularly
- Log all authentication events
- Implement automatic logout after inactivity

---

### Observability Configuration (Phase 8)

| Variable                 | Required | Default  | Description                | Validation            |
| ------------------------ | -------- | -------- | -------------------------- | --------------------- |
| `ENABLE_METRICS`         | No       | `true`   | Enable Prometheus metrics  | `true`, `false`       |
| `ENABLE_TRACING`         | No       | `true`   | Enable distributed tracing | `true`, `false`       |
| `JAEGER_HOST`            | No       | `jaeger` | Jaeger hostname            | Valid hostname        |
| `JAEGER_PORT`            | No       | `6831`   | Jaeger agent UDP port      | 1-65535               |
| `OTLP_ENDPOINT`          | No       | -        | OTLP collector endpoint    | Valid URL or empty    |
| `LOG_RETENTION_DAYS`     | No       | `90`     | Log retention period       | 30-365 (HIPAA: 30-90) |
| `GRAFANA_ADMIN_USER`     | No       | `admin`  | Grafana admin username     | Any string            |
| `GRAFANA_ADMIN_PASSWORD` | Yes      | -        | Grafana admin password     | Min 12 chars          |

**Usage:**

```bash
ENABLE_METRICS=true
ENABLE_TRACING=true
JAEGER_HOST=jaeger
JAEGER_PORT=6831
LOG_RETENTION_DAYS=90
GRAFANA_ADMIN_PASSWORD=secure_grafana_password
```

**Validation Rules:**

- `LOG_RETENTION_DAYS` must be 30-90 for HIPAA compliance
- Grafana password should be strong

**Production Recommendations:**

- Keep metrics and tracing enabled
- Use external OTLP collector in production
- Set up Grafana dashboards for monitoring
- Configure AlertManager for critical alerts

---

### Application Settings

| Variable                | Required | Default     | Description                  | Validation           |
| ----------------------- | -------- | ----------- | ---------------------------- | -------------------- |
| `MAX_UPLOAD_SIZE`       | No       | `104857600` | Max file upload size (bytes) | Positive integer     |
| `ENABLE_CORS`           | No       | `true`      | Enable CORS                  | `true`, `false`      |
| `ALLOWED_ORIGINS`       | No       | `*`         | CORS allowed origins         | Comma-separated URLs |
| `RATE_LIMIT_PER_MINUTE` | No       | `100`       | API rate limit               | 1-10000              |
| `VITE_SILERO_ONNX_WASM_BASE_URL` | No | _(CDN)_ | Base URL for onnxruntime-web WASM assets (frontend) | Valid HTTP/HTTPS URL or relative path |
| `VITE_SILERO_VAD_ASSET_BASE_URL` | No | _(CDN)_ | Base URL for @ricky0123/vad-web model assets (frontend) | Valid HTTP/HTTPS URL or relative path |

**Usage:**

```bash
MAX_UPLOAD_SIZE=104857600  # 100MB
ENABLE_CORS=true
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
RATE_LIMIT_PER_MINUTE=100

# Frontend: self-hosted Silero VAD assets
VITE_SILERO_ONNX_WASM_BASE_URL=/vendor/onnxruntime-web/dist/
VITE_SILERO_VAD_ASSET_BASE_URL=/vendor/silero-vad/
```

**Validation Rules:**

- `MAX_UPLOAD_SIZE` in bytes (100MB = 104857600)
- `ALLOWED_ORIGINS` should not be `*` in production
- Rate limit should be tuned based on usage patterns

---

## Configuration Validation

### Startup Validation

VoiceAssist validates all configuration on startup. The validation includes:

1. **Required Variables**: Ensures all required env vars are present
2. **Format Validation**: Validates formats (URLs, emails, hex strings)
3. **Connectivity Tests**: Tests connections to PostgreSQL, Redis, Qdrant
4. **Secret Strength**: Validates secret key strength and uniqueness
5. **HIPAA Compliance**: Checks retention policies and security settings

### Validation Errors

If validation fails, the application will:

- Log detailed error messages
- Exit with non-zero status code
- Provide guidance on how to fix the issue

Example validation error:

```
ConfigValidationError: JWT_SECRET must be exactly 64 hex characters (got 32)
Fix: Generate a new secret with: openssl rand -hex 32
```

---

## Security Best Practices

### Secret Management

1. **Never commit secrets to Git**

   ```bash
   # Add to .gitignore
   echo ".env" >> .gitignore
   ```

2. **Use environment-specific secrets**
   - Development: `.env.development`
   - Staging: `.env.staging`
   - Production: Use secret manager (AWS Secrets Manager, HashiCorp Vault)

3. **Rotate secrets regularly**
   - JWT secrets: Every 90 days
   - API keys: When team members leave
   - Database passwords: Every 180 days

4. **Use external secret managers in production**
   ```bash
   # AWS Secrets Manager example
   aws secretsmanager get-secret-value --secret-id voiceassist/prod/jwt-secret
   ```

### HIPAA Compliance Checklist

- [ ] `LOG_RETENTION_DAYS` set to 30-90 days
- [ ] Strong passwords (16+ characters) for all services
- [ ] PHI redaction enabled in logs (automatic in Phase 8)
- [ ] TLS/SSL enabled for all external connections
- [ ] Access logs enabled and monitored
- [ ] Automatic session timeout configured
- [ ] Audit logging enabled
- [ ] Backup encryption enabled

---

## Configuration Examples

### Development Environment

```bash
# .env.development
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=DEBUG

# Use Docker Compose hostnames
POSTGRES_HOST=postgres
REDIS_HOST=redis
QDRANT_HOST=qdrant
NEXTCLOUD_URL=http://nextcloud

# Simple passwords for development
POSTGRES_PASSWORD=devpass123
REDIS_PASSWORD=devpass123
JWT_SECRET=$(openssl rand -hex 32)

# Observability
ENABLE_METRICS=true
ENABLE_TRACING=true
```

### Production Environment

```bash
# .env.production
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=WARNING

# Production hostnames
POSTGRES_HOST=prod-db.rds.amazonaws.com
POSTGRES_PORT=5432
REDIS_HOST=prod-redis.elasticache.amazonaws.com
REDIS_PORT=6379
QDRANT_URL=https://prod-cluster.qdrant.tech

# Strong secrets from secret manager
SECRET_KEY=${AWS_SECRET_MANAGER:voiceassist/prod/secret-key}
JWT_SECRET=${AWS_SECRET_MANAGER:voiceassist/prod/jwt-secret}
POSTGRES_PASSWORD=${AWS_SECRET_MANAGER:voiceassist/prod/db-password}

# Production URLs
NEXTCLOUD_URL=https://files.example.com
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com

# HIPAA compliance
LOG_RETENTION_DAYS=90
ACCESS_TOKEN_EXPIRE_MINUTES=15

# Observability
ENABLE_METRICS=true
ENABLE_TRACING=true
JAEGER_HOST=prod-jaeger.example.com
```

### Docker Compose Override

For local development with custom settings:

```yaml
# docker-compose.override.yml
version: "3.8"

services:
  voiceassist-server:
    environment:
      - DEBUG=true
      - LOG_LEVEL=DEBUG
      - OPENAI_API_KEY=${OPENAI_API_KEY} # From host environment
```

---

## Troubleshooting

### Common Configuration Issues

**Issue: "Database connection failed"**

```
Solution:
1. Check POSTGRES_HOST is accessible
2. Verify POSTGRES_PASSWORD is correct
3. Ensure PostgreSQL is running: docker compose ps postgres
4. Check network connectivity: docker compose exec voiceassist-server ping postgres
```

**Issue: "OpenAI API authentication failed"**

```
Solution:
1. Verify OPENAI_API_KEY format (starts with sk-)
2. Check API key is active at https://platform.openai.com/api-keys
3. Ensure sufficient API credits
4. Check for typos in .env file
```

**Issue: "Jaeger trace export failed"**

```
Solution:
1. Check JAEGER_HOST is accessible
2. Verify JAEGER_PORT (default 6831)
3. Ensure Jaeger is running: docker compose ps jaeger
4. Check ENABLE_TRACING=true
```

---

## Configuration Testing

### Validate Configuration

```bash
# Check environment variables are set
docker compose exec voiceassist-server env | grep -E "(POSTGRES|REDIS|OPENAI)"

# Test database connection
docker compose exec voiceassist-server python -c "from app.core.database import engine; engine.connect()"

# Test Redis connection
docker compose exec voiceassist-server python -c "from app.core.redis import redis_client; redis_client.ping()"

# Verify secrets are strong
[ ${#JWT_SECRET} -eq 64 ] && echo "JWT_SECRET length OK" || echo "ERROR: JWT_SECRET must be 64 chars"
```

### Health Checks

```bash
# Check API health
curl http://localhost:8000/health

# Check readiness (all dependencies)
curl http://localhost:8000/ready

# Check metrics endpoint
curl http://localhost:8000/metrics | grep voiceassist_up
```

---

## Configuration Schema (JSON Schema)

For programmatic validation, use this JSON Schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "VoiceAssist Configuration",
  "type": "object",
  "required": [
    "POSTGRES_HOST",
    "REDIS_HOST",
    "QDRANT_HOST",
    "NEXTCLOUD_URL",
    "OPENAI_API_KEY",
    "SECRET_KEY",
    "JWT_SECRET"
  ],
  "properties": {
    "ENVIRONMENT": {
      "type": "string",
      "enum": ["development", "staging", "production"]
    },
    "DEBUG": {
      "type": "boolean"
    },
    "POSTGRES_HOST": {
      "type": "string",
      "minLength": 1
    },
    "POSTGRES_PORT": {
      "type": "integer",
      "minimum": 1,
      "maximum": 65535,
      "default": 5432
    },
    "JWT_SECRET": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "LOG_RETENTION_DAYS": {
      "type": "integer",
      "minimum": 30,
      "maximum": 365,
      "default": 90
    }
  }
}
```

---

## Additional Resources

- **Environment Setup Guide**: `docs/DEVELOPMENT_SETUP.md`
- **Security Guidelines**: `docs/SECURITY_COMPLIANCE.md`
- **Deployment Guide**: `docs/DEPLOYMENT.md`
- **Troubleshooting**: `docs/TROUBLESHOOTING.md`

---

**Document Version:** 1.0
**Last Updated:** 2025-11-21
**Maintainer:** VoiceAssist Team

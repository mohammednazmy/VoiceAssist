---
title: Security Checklist
slug: security-checklist
summary: Pre-deployment security review checklist for VoiceAssist.
status: stable
stability: production
owner: security
lastUpdated: "2025-12-08"
audience:
  - human
  - ai-agents
tags:
  - security
  - hipaa
  - checklist
category: security
component: "security"
ai_summary: >-
  Security checklist for VoiceAssist deployments. Covers authentication,
  data protection, HIPAA requirements, and common vulnerabilities.
  Use before production deployments.
---

# Security Checklist

> **Last Updated**: 2025-12-08

Pre-deployment security review checklist. Complete all items before production deployment.

---

## Authentication & Authorization

### JWT Configuration

- [ ] `JWT_SECRET_KEY` is cryptographically random (32+ bytes)
- [ ] `JWT_SECRET_KEY` is stored securely (not in code)
- [ ] Access tokens expire in ≤15 minutes
- [ ] Refresh tokens expire in ≤7 days
- [ ] Token revocation is implemented
- [ ] Refresh token rotation is enabled

### Password Security

- [ ] Passwords are hashed with bcrypt (cost factor 12+)
- [ ] Password minimum length is 8+ characters
- [ ] Password complexity requirements enforced
- [ ] Failed login rate limiting enabled
- [ ] Account lockout after 5 failed attempts

### Session Management

- [ ] Session tokens are HttpOnly cookies
- [ ] Secure flag set for cookies (HTTPS only)
- [ ] SameSite=Strict or Lax
- [ ] Session invalidation on logout
- [ ] Session invalidation on password change

---

## Data Protection

### Encryption at Rest

- [ ] Database encryption enabled (PostgreSQL TDE)
- [ ] Backup encryption enabled
- [ ] Qdrant vector data encrypted
- [ ] Redis data encrypted (if persisting)

### Encryption in Transit

- [ ] HTTPS enforced (redirect HTTP → HTTPS)
- [ ] TLS 1.2+ required
- [ ] Valid SSL certificate installed
- [ ] HSTS header enabled
- [ ] Internal service communication uses TLS

### PHI Handling

- [ ] All PHI fields identified and documented
- [ ] PHI encrypted in database
- [ ] PHI access is audit-logged
- [ ] PHI not logged in application logs
- [ ] PHI search results redacted for unauthorized users

---

## HIPAA Requirements

### Technical Safeguards

- [ ] Unique user identification (user IDs)
- [ ] Automatic logoff (session timeout)
- [ ] Audit controls (audit_logs table)
- [ ] Person or entity authentication
- [ ] Transmission security (TLS)

### Access Controls

- [ ] RBAC implemented and tested
- [ ] Minimum necessary access enforced
- [ ] Admin access requires MFA (if implemented)
- [ ] Access reviews scheduled quarterly

### Audit Controls

- [ ] All PHI access logged
- [ ] Logs include: who, what, when, from where
- [ ] Logs are tamper-evident
- [ ] Logs retained for 6+ years
- [ ] Log access is restricted

---

## API Security

### Input Validation

- [ ] All inputs validated with Pydantic
- [ ] Input length limits enforced
- [ ] SQL injection prevented (ORM/parameterized queries)
- [ ] XSS prevented (output encoding)
- [ ] CSRF protection enabled

### Rate Limiting

- [ ] Rate limiting enabled per endpoint
- [ ] Rate limiting per user/IP
- [ ] Appropriate limits for each endpoint type
- [ ] 429 responses include Retry-After header

### Error Handling

- [ ] Errors don't leak stack traces to clients
- [ ] Errors don't leak internal paths
- [ ] Generic error messages for 500 errors
- [ ] Detailed errors only in logs

---

## Infrastructure Security

### Container Security

- [ ] Base images are minimal (Alpine/Distroless)
- [ ] No secrets in Docker images
- [ ] Containers run as non-root
- [ ] Read-only filesystem where possible
- [ ] Resource limits set (CPU, memory)

### Network Security

- [ ] Database not exposed to internet
- [ ] Redis not exposed to internet
- [ ] Internal services on private network
- [ ] Firewall rules reviewed
- [ ] Unnecessary ports closed

### Secrets Management

- [ ] No secrets in code or git history
- [ ] `.env` files in `.gitignore`
- [ ] Secrets rotated regularly
- [ ] Different secrets per environment
- [ ] Secrets stored in secure vault (production)

---

## Dependency Security

- [ ] Dependencies updated to latest stable versions
- [ ] `npm audit` / `pip audit` run and resolved
- [ ] No known vulnerabilities in dependencies
- [ ] Dependabot or similar enabled
- [ ] Lockfiles committed (pnpm-lock.yaml, requirements.txt)

---

## Monitoring & Incident Response

### Logging

- [ ] Security events logged
- [ ] Failed logins logged
- [ ] Authorization failures logged
- [ ] Log aggregation configured
- [ ] Alert thresholds set

### Alerting

- [ ] Alerts for multiple failed logins
- [ ] Alerts for privilege escalation attempts
- [ ] Alerts for unusual access patterns
- [ ] On-call rotation established

### Incident Response

- [ ] Incident response plan documented
- [ ] Contact list up to date
- [ ] Breach notification process defined
- [ ] Recovery procedures tested

---

## Pre-Deployment Verification

### Automated Checks

```bash
# Backend security scan
cd services/api-gateway
pip install safety bandit
safety check
bandit -r app/

# Frontend security scan
cd apps/web-app
pnpm audit

# Dependency check
npm audit --all-workspaces
```

### Manual Review

- [ ] Code review completed
- [ ] Security-focused review for auth/PHI code
- [ ] Configuration review (env vars, secrets)
- [ ] Access control testing

---

## Compliance Documentation

For HIPAA audits, ensure you have:

- [ ] Business Associate Agreement (BAA) with cloud providers
- [ ] Risk assessment documentation
- [ ] Security policies documented
- [ ] Training records for team members
- [ ] Incident response history

---

## Quick Reference

### Critical Environment Variables

```bash
# These MUST be set and secure
JWT_SECRET_KEY=        # 32+ byte random string
DATABASE_URL=          # Use SSL: ?sslmode=require
OPENAI_API_KEY=        # Keep secret, rotate regularly
```

### Secure Defaults

```python
# Cookie settings
COOKIE_SECURE=True      # HTTPS only
COOKIE_HTTPONLY=True    # No JavaScript access
COOKIE_SAMESITE="Lax"   # CSRF protection

# CORS settings
CORS_ORIGINS=["https://yourdomain.com"]  # Specific origins only
```

---

## Related Documents

- [SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md) - Full HIPAA documentation
- [HIPAA_COMPLIANCE_MATRIX.md](HIPAA_COMPLIANCE_MATRIX.md) - Requirement mapping
- [ERROR_HANDLING.md](ERROR_HANDLING.md) - Secure error handling

---
title: Multi-Tenancy Setup Guide
slug: setup/multi-tenancy
summary: >-
  Guide for configuring and deploying VoiceAssist in multi-tenant mode with
  organization isolation, quota management, and billing integration.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-11"
audience:
  - human
  - ops
  - backend
tags:
  - multi-tenancy
  - organizations
  - setup
  - deployment
category: setup
version: 1.0.0
---

# Multi-Tenancy Setup Guide

**Last Updated:** 2025-12-11

This guide covers the setup and configuration of VoiceAssist's multi-tenancy features, enabling you to serve multiple organizations with data isolation, quota management, and organization-specific customizations.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Database Setup](#database-setup)
4. [Configuration](#configuration)
5. [Organization Management](#organization-management)
6. [Quota Configuration](#quota-configuration)
7. [Data Isolation](#data-isolation)
8. [Billing Integration](#billing-integration)
9. [Monitoring & Alerting](#monitoring--alerting)
10. [Troubleshooting](#troubleshooting)

---

## Overview

VoiceAssist's multi-tenancy model supports:

- **Organization-based isolation**: Each organization's data is logically separated
- **Role-based access control**: Owner, Admin, Member, Viewer roles per organization
- **Configurable quotas**: Per-organization limits on users, documents, storage, API calls
- **Custom settings**: Organization-specific features, branding, and preferences
- **Audit logging**: Complete audit trail for compliance
- **Cost tracking**: Per-organization cost attribution

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VoiceAssist API                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Organization │  │ Organization │  │ Organization │         │
│  │      A       │  │      B       │  │      C       │         │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤         │
│  │ Users       │  │ Users       │  │ Users       │         │
│  │ Documents   │  │ Documents   │  │ Documents   │         │
│  │ Conversations│  │ Conversations│  │ Conversations│         │
│  │ Settings    │  │ Settings    │  │ Settings    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                       │
│  Row-Level Security + organization_id Foreign Keys           │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

Before enabling multi-tenancy, ensure:

1. **Database migrations** are up to date (through migration 046)
2. **Redis** is configured for session management
3. **Admin access** to the VoiceAssist Admin Panel
4. **Backup** of existing data (recommended)

### Required Migrations

```bash
# Verify migrations are applied
cd services/api-gateway
alembic current

# Expected output should show migration 046 or higher
# 046_add_organizations.py - Creates organization tables
```

---

## Database Setup

### Run Organization Migrations

```bash
cd services/api-gateway

# Apply migrations (if not already done)
alembic upgrade head

# Verify organization tables exist
psql $DATABASE_URL -c "\dt *organization*"
```

### Database Tables

The multi-tenancy system uses these key tables:

| Table | Purpose |
|-------|---------|
| `organizations` | Organization records and settings |
| `organization_members` | User-organization membership |
| `organization_invitations` | Pending invitations |
| `organization_audit_logs` | Audit trail |
| `organization_quotas` | Quota limits and usage |

### Enable Row-Level Security (Optional but Recommended)

For additional security, enable PostgreSQL RLS:

```sql
-- Enable RLS on tenant-scoped tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_decks ENABLE ROW LEVEL SECURITY;

-- Create policy for conversations
CREATE POLICY conversation_org_policy ON conversations
    USING (organization_id = current_setting('app.current_organization_id')::uuid);
```

---

## Configuration

### Environment Variables

Add these to your `.env` or environment configuration:

```bash
# Multi-tenancy settings
MULTI_TENANCY_ENABLED=true
DEFAULT_ORGANIZATION_PLAN=starter
REQUIRE_ORGANIZATION_FOR_SIGNUP=false

# Quota defaults (per plan)
STARTER_MAX_USERS=5
STARTER_MAX_DOCUMENTS=100
STARTER_MAX_STORAGE_MB=1024
STARTER_MAX_API_CALLS=10000

PROFESSIONAL_MAX_USERS=50
PROFESSIONAL_MAX_DOCUMENTS=1000
PROFESSIONAL_MAX_STORAGE_MB=10240
PROFESSIONAL_MAX_API_CALLS=100000

ENTERPRISE_MAX_USERS=unlimited
ENTERPRISE_MAX_DOCUMENTS=unlimited
ENTERPRISE_MAX_STORAGE_MB=unlimited
ENTERPRISE_MAX_API_CALLS=unlimited

# Billing integration (optional)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
BILLING_ENABLED=false
```

### Application Configuration

Update `services/api-gateway/app/core/config.py`:

```python
class Settings(BaseSettings):
    # Multi-tenancy
    multi_tenancy_enabled: bool = True
    default_organization_plan: str = "starter"
    require_organization_for_signup: bool = False

    # Plan configurations
    plan_configs: dict = {
        "starter": {
            "max_users": 5,
            "max_documents": 100,
            "max_storage_mb": 1024,
            "max_api_calls": 10000,
            "features": ["chat", "voice_basic"]
        },
        "professional": {
            "max_users": 50,
            "max_documents": 1000,
            "max_storage_mb": 10240,
            "max_api_calls": 100000,
            "features": ["chat", "voice", "learning", "analytics"]
        },
        "enterprise": {
            "max_users": -1,  # unlimited
            "max_documents": -1,
            "max_storage_mb": -1,
            "max_api_calls": -1,
            "features": ["chat", "voice", "learning", "analytics", "sso", "custom_branding"]
        }
    }
```

---

## Organization Management

### Creating the First Organization

Via Admin Panel:
1. Navigate to Admin Panel > Organizations
2. Click "Create Organization"
3. Fill in required fields:
   - Name
   - Slug (URL-safe identifier)
   - Plan
   - Owner email

Via API:

```bash
curl -X POST http://localhost:8000/api/admin/organizations \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Medical Center Alpha",
    "slug": "medical-center-alpha",
    "plan": "professional",
    "owner_email": "admin@medicalcenter.com"
  }'
```

### Organization Lifecycle

```
┌──────────┐     ┌────────┐     ┌───────────┐     ┌──────────┐
│  Created │ ──► │ Active │ ──► │ Suspended │ ──► │ Deleted  │
└──────────┘     └────────┘     └───────────┘     └──────────┘
                      │               │
                      └───────────────┘
                       (Reactivate)
```

### Managing Members

Invite a new member:

```bash
curl -X POST http://localhost:8000/api/admin/organizations/{org_id}/members \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@medicalcenter.com",
    "role": "member"
  }'
```

### Role Permissions

| Permission | Owner | Admin | Member | Viewer |
|------------|-------|-------|--------|--------|
| View content | Yes | Yes | Yes | Yes |
| Create conversations | Yes | Yes | Yes | No |
| Upload documents | Yes | Yes | Yes | No |
| Manage members | Yes | Yes | No | No |
| Change settings | Yes | Yes | No | No |
| Billing management | Yes | No | No | No |
| Delete organization | Yes | No | No | No |

---

## Quota Configuration

### Setting Quotas

Per-organization quotas are managed through the Admin Panel or API:

```bash
curl -X PATCH http://localhost:8000/api/admin/organizations/{org_id} \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quotas": {
      "max_users": 100,
      "max_documents": 5000,
      "max_storage_mb": 51200,
      "max_api_calls_per_month": 500000
    }
  }'
```

### Quota Types

| Quota | Description | Enforcement |
|-------|-------------|-------------|
| `max_users` | Maximum organization members | Hard limit on invites |
| `max_documents` | Maximum KB documents | Blocks new uploads |
| `max_storage_mb` | Total storage in MB | Blocks uploads exceeding limit |
| `max_api_calls_per_month` | API calls per billing cycle | Returns 429 when exceeded |
| `max_concurrent_voice_sessions` | Simultaneous voice connections | Queue or reject new sessions |

### Quota Enforcement

Quotas are enforced at the API level:

```python
# Example quota check (internal implementation)
async def check_quota(org_id: str, quota_type: str, db: Session) -> bool:
    org = db.query(Organization).filter_by(id=org_id).first()
    usage = get_current_usage(org_id, quota_type, db)
    limit = org.quotas.get(f"max_{quota_type}")

    if limit == -1:  # unlimited
        return True

    return usage < limit
```

### Quota Alerts

Configure alerts in Prometheus (already set up in `phase4_alerts.yml`):

- `OrganizationQuotaNearLimit`: Triggered at 90% usage
- `OrganizationQuotaExceeded`: Triggered when quota is exceeded

---

## Data Isolation

### Query Scoping

All tenant-scoped queries automatically filter by `organization_id`:

```python
# Automatic organization scoping in queries
def get_documents(org_id: str, db: Session):
    return db.query(Document)\
        .filter(Document.organization_id == org_id)\
        .all()
```

### Cross-Tenant Prevention

The system includes multiple layers of protection:

1. **API Layer**: All requests include organization context from JWT
2. **Service Layer**: Services validate organization membership
3. **Database Layer**: Foreign key constraints and optional RLS

### Audit Trail

All sensitive operations are logged:

```python
# Automatic audit logging
await audit_log(
    organization_id=org_id,
    action="document.uploaded",
    actor_id=user_id,
    target_type="document",
    target_id=doc_id,
    metadata={"filename": file.filename}
)
```

View audit logs:

```bash
curl http://localhost:8000/api/admin/organizations/{org_id}/audit-logs \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Billing Integration

### Stripe Integration (Optional)

Enable billing by configuring Stripe:

```bash
# .env
BILLING_ENABLED=true
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Plan Pricing Configuration

```python
PLAN_PRICES = {
    "starter": {
        "monthly_price_cents": 0,  # Free
        "stripe_price_id": None
    },
    "professional": {
        "monthly_price_cents": 9900,  # $99/month
        "stripe_price_id": "price_professional_monthly"
    },
    "enterprise": {
        "monthly_price_cents": 49900,  # $499/month
        "stripe_price_id": "price_enterprise_monthly"
    }
}
```

### Webhook Setup

Configure Stripe webhook endpoint:

```bash
# Production webhook
https://yourdomain.com/api/admin/billing/webhook

# Events to listen for:
# - customer.subscription.created
# - customer.subscription.updated
# - customer.subscription.deleted
# - invoice.payment_succeeded
# - invoice.payment_failed
```

### Manual Billing (Without Stripe)

For manual billing, track usage via analytics:

```bash
# Get organization usage for billing
curl http://localhost:8000/api/admin/analytics/costs \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -G -d "start_date=2025-12-01" \
  -d "end_date=2025-12-31" \
  -d "group_by=organization"
```

---

## Monitoring & Alerting

### Key Metrics to Monitor

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `voiceassist_organization_active_total` | Active organizations by plan | N/A (gauge) |
| `voiceassist_organization_quota_usage_percent` | Quota usage % | >90% warning |
| `voiceassist_organization_tenant_isolation_checks_total{result="denied"}` | Failed isolation checks | >10/5min critical |
| `voiceassist_organization_operations_total{status="failure"}` | Failed operations | >10% failure rate |

### Grafana Dashboard

Import the multi-tenancy dashboard:

```bash
# Dashboard JSON location
infrastructure/observability/grafana/dashboards/multi-tenancy.json
```

Key panels:
- Organizations by plan distribution
- Quota usage heatmap
- API calls by organization
- Cost attribution breakdown
- Member activity trends

### Alert Configuration

Alerts are pre-configured in `infrastructure/observability/prometheus/rules/phase4_alerts.yml`:

- Quota exceeded alerts
- Tenant isolation violation alerts
- Billing event failure alerts

---

## Troubleshooting

### Common Issues

#### Issue: User Can't Access Organization

**Symptoms:** User gets 403 Forbidden when accessing organization resources

**Resolution:**
1. Verify user membership:
   ```sql
   SELECT * FROM organization_members
   WHERE user_id = 'USER_ID' AND organization_id = 'ORG_ID';
   ```
2. Check user's role has required permissions
3. Verify organization is active (not suspended)

#### Issue: Quota Not Enforcing

**Symptoms:** Users can exceed quotas

**Resolution:**
1. Check quota configuration:
   ```sql
   SELECT quotas FROM organizations WHERE id = 'ORG_ID';
   ```
2. Verify caching isn't stale:
   ```bash
   curl -X POST http://localhost:8000/api/admin/cache/invalidate \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"pattern": "org:*:quota"}'
   ```
3. Check scheduled quota refresh job is running

#### Issue: Cross-Tenant Data Leakage

**Symptoms:** Users see data from other organizations

**Resolution:**
1. **IMMEDIATE**: Suspend affected organizations
2. Check audit logs for access patterns
3. Verify all queries include organization_id filter
4. Enable PostgreSQL RLS if not already active
5. Review recent code changes for missing tenant scoping

### Debug Mode

Enable detailed organization logging:

```bash
# .env
LOG_LEVEL=DEBUG
ORG_DEBUG_LOGGING=true
```

This logs:
- All organization context resolution
- Quota check results
- Tenant isolation decisions

### Support Commands

```bash
# List all organizations
curl http://localhost:8000/api/admin/organizations \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Get organization health
curl http://localhost:8000/api/admin/organizations/{org_id}/health \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Force quota recalculation
curl -X POST http://localhost:8000/api/admin/organizations/{org_id}/recalculate-quotas \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Security Considerations

### HIPAA Compliance

Multi-tenancy maintains HIPAA compliance through:

1. **Data Segregation**: Logical separation by organization_id
2. **Access Controls**: Role-based permissions per organization
3. **Audit Logging**: Complete activity trail
4. **Encryption**: Data encrypted at rest and in transit

### Security Best Practices

1. **Regular Audits**: Review audit logs monthly
2. **Access Reviews**: Quarterly review of organization memberships
3. **Quota Monitoring**: Alert on unusual usage patterns
4. **Incident Response**: Document cross-tenant incident procedures

### Compliance Checklist

- [ ] Enable audit logging for all organizations
- [ ] Configure quota alerts
- [ ] Set up billing integration or manual tracking
- [ ] Document organization provisioning procedures
- [ ] Train support staff on multi-tenant troubleshooting
- [ ] Configure backup schedules per organization tier

---

## Migration from Single-Tenant

If migrating existing data to multi-tenant mode:

### Step 1: Create Default Organization

```bash
curl -X POST http://localhost:8000/api/admin/organizations \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "name": "Default Organization",
    "slug": "default",
    "plan": "professional"
  }'
```

### Step 2: Associate Existing Data

```sql
-- Associate existing users with default organization
INSERT INTO organization_members (user_id, organization_id, role)
SELECT id, 'DEFAULT_ORG_ID', 'member' FROM users;

-- Update existing data with organization_id
UPDATE conversations SET organization_id = 'DEFAULT_ORG_ID' WHERE organization_id IS NULL;
UPDATE kb_documents SET organization_id = 'DEFAULT_ORG_ID' WHERE organization_id IS NULL;
```

### Step 3: Enable Multi-Tenancy

```bash
# .env
MULTI_TENANCY_ENABLED=true
```

### Step 4: Verify Migration

```bash
# Check for orphaned data
SELECT COUNT(*) FROM conversations WHERE organization_id IS NULL;
SELECT COUNT(*) FROM kb_documents WHERE organization_id IS NULL;

# Should return 0 for both
```

---

## Related Documentation

- [API Reference - Organizations API](api-reference/phase4-apis.md#organizations-api)
- [Security & Compliance](SECURITY_COMPLIANCE.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Monitoring & Observability](OBSERVABILITY.md)

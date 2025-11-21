# Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Deployment Architecture](#deployment-architecture)
3. [Environment Setup](#environment-setup)
4. [Pre-Deployment Checklist](#pre-deployment-checklist)
5. [Deployment Steps](#deployment-steps)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Rollback Procedures](#rollback-procedures)
8. [Blue-Green Deployment](#blue-green-deployment)
9. [Database Migrations](#database-migrations)
10. [Troubleshooting](#troubleshooting)

## Overview

This guide covers deployment procedures for VoiceAssist V2 across all environments. It includes step-by-step instructions, verification steps, and rollback procedures.

### Deployment Philosophy

- **Zero Downtime**: All deployments use rolling updates
- **Automated Testing**: Health checks verify each stage
- **Progressive Rollout**: Deploy to dev → staging → production
- **Fast Rollback**: Ability to rollback within minutes
- **Observability**: Full monitoring and logging throughout

### Deployment Types

| Type | Trigger | Approval | Rollback |
|------|---------|----------|----------|
| **Hotfix** | Emergency | Immediate | Automated |
| **Feature** | Scheduled | Team lead | Manual |
| **Infrastructure** | Change window | DevOps + Manager | Manual |
| **Security** | As needed | Security team | Automated |

## Deployment Architecture

### Infrastructure Layers

```
┌────────────────────────────────────────────────────────────┐
│                      CDN / CloudFront                       │
│                   (Static content, caching)                 │
└────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────────────────────────────────────┐
│                  Application Load Balancer                  │
│           (SSL termination, health checks, WAF)            │
└────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────────────────────────────────────┐
│                     EKS Cluster (K8s)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ API Gateway  │  │Voice Service │  │  Admin Panel │    │
│  │   (3 pods)   │  │   (3 pods)   │  │   (2 pods)   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Storage    │  │  Analytics   │  │ Notification │    │
│  │   Service    │  │   Service    │  │   Service    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└────────────────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌──────▼──────┐
│   PostgreSQL   │  │  Redis Cluster  │  │   Qdrant    │
│  (Multi-AZ)    │  │   (Replicated)  │  │  (Vector)   │
└────────────────┘  └─────────────────┘  └─────────────┘
```

### Deployment Flow

```
Developer → Git Push → GitHub Actions → Build → Test
                                           ↓
                                        Package
                                           ↓
                                     Push to ECR
                                           ↓
                        ┌──────────────────┴────────────────┐
                        │                                   │
                   Deploy to Dev                    Deploy to Staging
                   (Automatic)                        (Automatic)
                        │                                   │
                   Smoke Tests                        Integration Tests
                        │                                   │
                        └──────────────────┬────────────────┘
                                           │
                                   Manual Approval
                                           │
                                   Deploy to Production
                                           │
                                   Health Checks
                                           │
                                   Monitor & Alert
```

## Environment Setup

### Development Environment

**Purpose**: Rapid development and testing

**Configuration:**
```yaml
environment: dev
replicas: 1
resources:
  cpu: 500m
  memory: 512Mi
database: Single instance
redis: Single node
monitoring: Basic
```

**Access:**
```bash
# Configure kubectl
aws eks update-kubeconfig \
  --name voiceassist-dev-cluster \
  --region us-east-1

# Verify access
kubectl get nodes
kubectl get pods -n voiceassist
```

### Staging Environment

**Purpose**: Pre-production testing and validation

**Configuration:**
```yaml
environment: staging
replicas: 2
resources:
  cpu: 1000m
  memory: 1Gi
database: Multi-AZ
redis: Replication enabled
monitoring: Full stack
```

**Access:**
```bash
# Configure kubectl
aws eks update-kubeconfig \
  --name voiceassist-staging-cluster \
  --region us-east-1

# Verify access
kubectl get nodes
kubectl get pods -n voiceassist
```

### Production Environment

**Purpose**: Live system serving end users

**Configuration:**
```yaml
environment: production
replicas: 3
resources:
  cpu: 2000m
  memory: 2Gi
database: Multi-AZ with read replicas
redis: Cluster mode with automatic failover
monitoring: Full stack with alerting
```

**Access:**
```bash
# Configure kubectl
aws eks update-kubeconfig \
  --name voiceassist-prod-cluster \
  --region us-east-1

# Verify access
kubectl get nodes
kubectl get pods -n voiceassist
```

## Pre-Deployment Checklist

### Code Review

- [ ] All code reviewed and approved
- [ ] No unresolved comments
- [ ] CHANGELOG.md updated
- [ ] Version number bumped

### Testing

- [ ] All unit tests passing (>80% coverage)
- [ ] Integration tests passing
- [ ] Security scans clean
- [ ] Performance tests acceptable

### Database

- [ ] Migration scripts reviewed
- [ ] Backup completed
- [ ] Migration tested in staging
- [ ] Rollback scripts prepared

### Infrastructure

- [ ] Terraform plan reviewed
- [ ] No unexpected resource changes
- [ ] Cost impact assessed
- [ ] Capacity planning completed

### Documentation

- [ ] README updated
- [ ] API documentation current
- [ ] Runbooks updated
- [ ] Known issues documented

### Team Coordination

- [ ] Deployment window scheduled
- [ ] Team notified
- [ ] On-call engineer available
- [ ] Stakeholders informed

### Monitoring

- [ ] Dashboards prepared
- [ ] Alerts configured
- [ ] Runbooks accessible
- [ ] Incident response plan ready

## Deployment Steps

### Step 1: Pre-Deployment Tasks

```bash
# 1. Verify current state
kubectl get deployments -n voiceassist
kubectl get pods -n voiceassist

# 2. Check resource availability
kubectl top nodes
kubectl top pods -n voiceassist

# 3. Backup databases
./scripts/backup-database.sh production

# 4. Tag release
git tag -a v2.0.0 -m "Release v2.0.0"
git push origin v2.0.0

# 5. Verify CI/CD pipeline
gh workflow view build-deploy.yml
```

### Step 2: Deploy to Development

```bash
# Automatic deployment on merge to develop branch
# Or manual trigger:

# 1. Trigger deployment
gh workflow run build-deploy.yml \
  --ref develop \
  -f environment=dev

# 2. Monitor deployment
kubectl rollout status deployment/api-gateway -n voiceassist

# 3. Verify pods
kubectl get pods -n voiceassist

# 4. Run smoke tests
./scripts/smoke-tests.sh dev

# 5. Check logs
kubectl logs -l app=api-gateway -n voiceassist --tail=50
```

### Step 3: Deploy to Staging

```bash
# Automatic deployment on merge to main branch
# Or manual trigger:

# 1. Trigger deployment
gh workflow run build-deploy.yml \
  --ref main \
  -f environment=staging

# 2. Monitor deployment
kubectl rollout status deployment/api-gateway -n voiceassist

# 3. Run integration tests
./scripts/integration-tests.sh staging

# 4. Verify all services
kubectl get all -n voiceassist

# 5. Check metrics
open https://grafana.staging.voiceassist.example.com
```

### Step 4: Deploy to Production

```bash
# Requires manual approval

# 1. Verify staging is healthy
./scripts/verify-environment.sh staging

# 2. Request approval
gh workflow run build-deploy.yml \
  --ref main \
  -f environment=production

# 3. Wait for approval
# Approvers will review and approve in GitHub

# 4. Monitor deployment
watch kubectl get pods -n voiceassist

# 5. Track rollout
kubectl rollout status deployment/api-gateway -n voiceassist

# 6. Verify health
curl https://api.voiceassist.example.com/health

# 7. Check all services
kubectl get all -n voiceassist
```

### Step 5: Database Migrations

```bash
# Run migrations using Kubernetes job

# 1. Create migration job
kubectl apply -f k8s/migrations/migrate-v2.0.0.yaml

# 2. Monitor migration
kubectl logs -f job/migrate-v2-0-0 -n voiceassist

# 3. Verify migration
kubectl get job migrate-v2-0-0 -n voiceassist

# 4. Check database
psql -h $DB_HOST -U $DB_USER -d voiceassist -c "\d+"

# 5. Clean up job
kubectl delete job migrate-v2-0-0 -n voiceassist
```

## Post-Deployment Verification

### Health Checks

```bash
# 1. Application health
curl https://api.voiceassist.example.com/health

# Expected response:
# {
#   "status": "healthy",
#   "version": "2.0.0",
#   "timestamp": "2025-11-21T10:00:00Z"
# }

# 2. Database connectivity
curl https://api.voiceassist.example.com/health/db

# 3. Redis connectivity
curl https://api.voiceassist.example.com/health/redis

# 4. All dependencies
curl https://api.voiceassist.example.com/health/detailed
```

### Smoke Tests

```bash
# Run automated smoke tests
./scripts/smoke-tests.sh production

# Tests include:
# - User authentication
# - Voice recording upload
# - Transcription generation
# - AI processing
# - Storage operations
# - Notification delivery
```

### Metrics Verification

**Response Time:**
```bash
# Check P95 response time
curl -G https://prometheus.voiceassist.example.com/api/v1/query \
  --data-urlencode 'query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))'
```

**Error Rate:**
```bash
# Check error rate (should be < 1%)
curl -G https://prometheus.voiceassist.example.com/api/v1/query \
  --data-urlencode 'query=rate(http_requests_total{status=~"5.."}[5m])'
```

**Resource Usage:**
```bash
# CPU usage
kubectl top pods -n voiceassist

# Memory usage
kubectl top pods -n voiceassist --sort-by=memory
```

### Functional Verification

**Critical User Flows:**

1. **User Registration**
   ```bash
   curl -X POST https://api.voiceassist.example.com/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"SecurePass123!"}'
   ```

2. **Voice Upload**
   ```bash
   curl -X POST https://api.voiceassist.example.com/api/v1/recordings \
     -H "Authorization: Bearer $TOKEN" \
     -F "file=@test-recording.wav"
   ```

3. **Transcription Retrieval**
   ```bash
   curl https://api.voiceassist.example.com/api/v1/recordings/123/transcript \
     -H "Authorization: Bearer $TOKEN"
   ```

## Rollback Procedures

### Automatic Rollback

Deployment automatically rolls back if:
- Health checks fail after 3 attempts
- Error rate exceeds 5%
- Pod crash loop detected
- Readiness probe timeout

### Manual Rollback

**Quick Rollback (Kubernetes):**
```bash
# 1. Check rollout history
kubectl rollout history deployment/api-gateway -n voiceassist

# 2. Rollback to previous version
kubectl rollout undo deployment/api-gateway -n voiceassist

# 3. Monitor rollback
kubectl rollout status deployment/api-gateway -n voiceassist

# 4. Verify pods
kubectl get pods -n voiceassist

# 5. Check health
curl https://api.voiceassist.example.com/health
```

**Rollback to Specific Version:**
```bash
# 1. List revisions
kubectl rollout history deployment/api-gateway -n voiceassist

# 2. View specific revision
kubectl rollout history deployment/api-gateway -n voiceassist --revision=5

# 3. Rollback to revision
kubectl rollout undo deployment/api-gateway -n voiceassist --to-revision=5

# 4. Verify
kubectl rollout status deployment/api-gateway -n voiceassist
```

**Re-deploy Previous Image:**
```bash
# 1. Get previous image tag
PREVIOUS_TAG=$(kubectl get deployment api-gateway -n voiceassist -o jsonpath='{.metadata.annotations.previous-image}')

# 2. Update deployment
kubectl set image deployment/api-gateway \
  api-gateway=$ECR_REGISTRY/voiceassist-api:$PREVIOUS_TAG \
  -n voiceassist

# 3. Monitor
kubectl rollout status deployment/api-gateway -n voiceassist
```

### Database Rollback

```bash
# 1. Stop application traffic
kubectl scale deployment/api-gateway --replicas=0 -n voiceassist

# 2. Restore database from backup
./scripts/restore-database.sh production <backup-timestamp>

# 3. Run rollback migrations
kubectl apply -f k8s/migrations/rollback-v2.0.0.yaml
kubectl logs -f job/rollback-v2-0-0 -n voiceassist

# 4. Restart application
kubectl scale deployment/api-gateway --replicas=3 -n voiceassist

# 5. Verify
curl https://api.voiceassist.example.com/health
```

## Blue-Green Deployment

### Overview

Blue-green deployment maintains two identical environments (blue and green). Traffic switches from blue to green when new version is ready.

### Setup

```yaml
# blue-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway-blue
  namespace: voiceassist
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
      version: blue
  template:
    metadata:
      labels:
        app: api-gateway
        version: blue
    spec:
      containers:
      - name: api-gateway
        image: $ECR_REGISTRY/voiceassist-api:v1.9.0

---
# green-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway-green
  namespace: voiceassist
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
      version: green
  template:
    metadata:
      labels:
        app: api-gateway
        version: green
    spec:
      containers:
      - name: api-gateway
        image: $ECR_REGISTRY/voiceassist-api:v2.0.0
```

### Deployment Process

```bash
# 1. Deploy green environment
kubectl apply -f k8s/green-deployment.yaml

# 2. Wait for green to be ready
kubectl wait --for=condition=available deployment/api-gateway-green -n voiceassist

# 3. Test green environment
curl -H "Host: api.voiceassist.example.com" http://<green-lb-ip>/health

# 4. Switch traffic to green
kubectl patch service api-gateway -n voiceassist -p '{"spec":{"selector":{"version":"green"}}}'

# 5. Monitor green environment
kubectl logs -f deployment/api-gateway-green -n voiceassist

# 6. If successful, scale down blue
kubectl scale deployment/api-gateway-blue --replicas=0 -n voiceassist

# 7. If issues, switch back to blue
kubectl patch service api-gateway -n voiceassist -p '{"spec":{"selector":{"version":"blue"}}}'
```

## Database Migrations

### Migration Strategy

1. **Backward Compatible**: New code works with old schema
2. **Deploy Code**: Roll out application changes
3. **Run Migration**: Apply schema changes
4. **Clean Up**: Remove backward compatibility code

### Migration Workflow

```bash
# 1. Generate migration
alembic revision --autogenerate -m "Add user preferences table"

# 2. Review migration
cat alembic/versions/xxx_add_user_preferences.py

# 3. Test migration locally
alembic upgrade head

# 4. Test rollback
alembic downgrade -1

# 5. Deploy to staging
kubectl apply -f k8s/migrations/staging-migration.yaml

# 6. Verify in staging
psql -h $STAGING_DB_HOST -U $DB_USER -d voiceassist -c "\d user_preferences"

# 7. Deploy to production
kubectl apply -f k8s/migrations/production-migration.yaml

# 8. Monitor migration
kubectl logs -f job/migrate-production -n voiceassist
```

### Migration Best Practices

1. **Always test migrations in staging first**
2. **Backup database before migration**
3. **Make migrations reversible**
4. **Avoid large data migrations during peak hours**
5. **Use separate migration job, not startup script**
6. **Monitor migration progress**
7. **Have rollback plan ready**

### Example Migration Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate-v2-0-0
  namespace: voiceassist
spec:
  template:
    spec:
      containers:
      - name: migrate
        image: $ECR_REGISTRY/voiceassist-api:v2.0.0
        command: ["alembic", "upgrade", "head"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
      restartPolicy: Never
  backoffLimit: 3
```

## Troubleshooting

### Deployment Stuck

**Issue:** Deployment not progressing
```bash
# Check deployment status
kubectl describe deployment api-gateway -n voiceassist

# Check pod status
kubectl get pods -n voiceassist

# View pod events
kubectl describe pod <pod-name> -n voiceassist

# Check logs
kubectl logs <pod-name> -n voiceassist
```

**Common causes:**
- Insufficient resources
- Image pull errors
- Configuration errors
- Health check failures

### Pod Crashes

**Issue:** Pods in CrashLoopBackOff
```bash
# View pod logs
kubectl logs <pod-name> -n voiceassist --previous

# Check resource limits
kubectl describe pod <pod-name> -n voiceassist

# Inspect events
kubectl get events -n voiceassist --sort-by='.lastTimestamp'
```

### Database Connection Issues

**Issue:** Cannot connect to database
```bash
# Test connectivity from pod
kubectl exec -it <pod-name> -n voiceassist -- psql -h $DB_HOST -U $DB_USER -d voiceassist

# Check security groups
aws ec2 describe-security-groups --group-ids <rds-sg-id>

# Verify credentials
kubectl get secret db-credentials -n voiceassist -o yaml
```

### High Error Rate

**Issue:** Increased errors after deployment
```bash
# Check error logs
kubectl logs -l app=api-gateway -n voiceassist | grep ERROR

# View metrics
open https://grafana.voiceassist.example.com

# Rollback immediately
kubectl rollout undo deployment/api-gateway -n voiceassist
```

### Performance Degradation

**Issue:** Slow response times
```bash
# Check resource usage
kubectl top pods -n voiceassist

# Scale up if needed
kubectl scale deployment/api-gateway --replicas=5 -n voiceassist

# Check database performance
aws rds describe-db-instances --db-instance-identifier voiceassist-prod

# Review traces
open https://jaeger.voiceassist.example.com
```

---

**Last Updated**: 2025-11-21
**Version**: 2.0
**Maintainer**: DevOps Team

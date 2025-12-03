# VoiceAssist Deployment Scripts - Quick Reference

## TL;DR - Most Common Commands

### First Time Setup

```bash
# 1. Setup AWS infrastructure
./scripts/init/setup-aws-resources.sh -e prod

# 2. Bootstrap Kubernetes
./scripts/init/bootstrap-k8s.sh -e prod

# 3. Update secrets in AWS Secrets Manager (use AWS Console or CLI)
```

### Deploy New Version

```bash
# Dev
./scripts/deploy/deploy.sh -e dev -v v1.2.3

# Staging
./scripts/deploy/deploy.sh -e staging -v v1.2.3

# Production (always with verbose)
./scripts/deploy/deploy.sh -e prod -v v1.2.3 --verbose
```

### Rollback

```bash
# Quick rollback (auto-detects previous version)
./scripts/deploy/rollback.sh -e staging

# Rollback to specific version
./scripts/deploy/rollback.sh -e prod -v v1.2.2
```

### Health Check

```bash
# Quick check
./scripts/monitoring/health-check.sh -e prod

# Detailed check
./scripts/monitoring/health-check.sh -e prod --verbose
```

### Scale

```bash
# Update HPA limits
./scripts/k8s/scale.sh -e prod -m 3 -M 10

# Manual scale specific deployment
./scripts/k8s/scale.sh -e staging -d voiceassist-backend -r 5
```

## Script Locations

```
scripts/
├── deploy/
│   ├── deploy.sh              # Main deployment
│   ├── rollback.sh            # Rollback
│   ├── pre-deploy-checks.sh   # Pre-checks
│   ├── backup.sh              # Backups
│   └── migrate.sh             # DB migrations
├── k8s/
│   ├── deploy-to-k8s.sh       # K8s deployment
│   └── scale.sh               # Scaling
├── monitoring/
│   └── health-check.sh        # Health checks
└── init/
    ├── setup-aws-resources.sh # AWS setup
    └── bootstrap-k8s.sh       # K8s bootstrap
```

## Common Flags

All scripts support:

- `-d, --dry-run` - Preview without executing
- `-V, --verbose` - Detailed output
- `-h, --help` - Show help

## Deployment Workflow

```
┌─────────────────────────────────────────────┐
│ 1. Pre-Deployment Checks                    │
│    ./scripts/deploy/pre-deploy-checks.sh    │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 2. Create Backup                            │
│    (Automatic in deploy.sh)                 │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 3. Build & Push Docker Images               │
│    (Automatic in deploy.sh)                 │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 4. Deploy to Kubernetes                     │
│    (Automatic in deploy.sh)                 │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 5. Run Database Migrations                  │
│    (Automatic in deploy.sh)                 │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 6. Smoke Tests & Health Checks              │
│    (Automatic in deploy.sh)                 │
└─────────────────────────────────────────────┘
```

## Emergency Procedures

### Application Down

```bash
# 1. Check status
./scripts/monitoring/health-check.sh -e prod --verbose

# 2. Check logs
kubectl logs -n voiceassist-prod -l app=voiceassist-backend --tail=100

# 3. Rollback if needed
./scripts/deploy/rollback.sh -e prod
```

### Database Issues

```bash
# 1. Check database connectivity
./scripts/deploy/pre-deploy-checks.sh -e prod

# 2. Rollback migrations if needed
./scripts/deploy/migrate.sh -e prod -D down --steps 1
```

### Scale Up Quickly

```bash
# Immediate scale up
./scripts/k8s/scale.sh -e prod -d voiceassist-backend -r 10
```

## Environment Mappings

| Environment | EKS Cluster             | Namespace           |
| ----------- | ----------------------- | ------------------- |
| dev         | voiceassist-eks-dev     | voiceassist-dev     |
| staging     | voiceassist-eks-staging | voiceassist-staging |
| prod        | voiceassist-eks-prod    | voiceassist-prod    |

## Required AWS Resources

### ECR Repositories

- voiceassist-backend
- voiceassist-worker
- voiceassist-frontend

### S3 Buckets

- voiceassist-terraform-state-{account-id}
- voiceassist-backups-{account-id}

### DynamoDB Tables

- voiceassist-terraform-locks

### Secrets Manager

- voiceassist/{env}/database
- voiceassist/{env}/redis
- voiceassist/{env}/jwt-secret
- voiceassist/{env}/openai-api-key
- voiceassist/{env}/smtp

## Troubleshooting One-Liners

```bash
# Check pod status
kubectl get pods -n voiceassist-prod

# Get pod logs
kubectl logs -n voiceassist-prod -l app=voiceassist-backend --tail=50

# Describe failing pod
kubectl describe pod -n voiceassist-prod <pod-name>

# Check deployment status
kubectl get deployments -n voiceassist-prod

# Check service endpoints
kubectl get endpoints -n voiceassist-prod

# Check ingress
kubectl get ingress -n voiceassist-prod

# View recent events
kubectl get events -n voiceassist-prod --sort-by='.lastTimestamp'

# Port forward to service
kubectl port-forward -n voiceassist-prod svc/voiceassist-backend 8000:80

# Execute command in pod
kubectl exec -it -n voiceassist-prod <pod-name> -- /bin/bash

# View HPA status
kubectl get hpa -n voiceassist-prod

# View metrics
kubectl top pods -n voiceassist-prod
```

## Pre-Deployment Checklist

- [ ] All tests passing in CI/CD
- [ ] Code reviewed and approved
- [ ] Database migrations tested
- [ ] Secrets updated in Secrets Manager
- [ ] Docker images built and pushed to ECR
- [ ] Pre-deployment checks passed
- [ ] Stakeholders notified
- [ ] Rollback plan ready
- [ ] Monitoring dashboards open
- [ ] On-call engineer available

## Post-Deployment Checklist

- [ ] Health checks passed
- [ ] All pods running and ready
- [ ] Application accessible via ingress
- [ ] Database migrations applied successfully
- [ ] Smoke tests passed
- [ ] Monitoring metrics normal
- [ ] No error logs
- [ ] Performance acceptable
- [ ] Notifications sent
- [ ] Deployment documented

## Testing in Lower Environments

Always follow this progression:

```
Dev → Staging → Production
```

1. Deploy to dev
2. Run integration tests
3. Deploy to staging
4. Run full test suite
5. Load testing (if applicable)
6. Deploy to production
7. Monitor closely

## Dry-Run Everything First

```bash
# Always dry-run production deployments first
./scripts/deploy/deploy.sh -e prod -v v1.2.3 --dry-run --verbose

# Review the output carefully
# Then run for real
./scripts/deploy/deploy.sh -e prod -v v1.2.3 --verbose
```

## Log Locations

```
logs/
├── deploy/          # Deployment logs
├── rollback/        # Rollback logs
├── checks/          # Pre-deployment checks
├── backup/          # Backup logs
├── migration/       # Migration logs
├── k8s-deploy/      # K8s deployment logs
├── scaling/         # Scaling logs
├── health-check/    # Health check logs
└── init/           # Initialization logs
```

## Key Files

```
infrastructure/k8s/overlays/
├── dev/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── hpa.yaml
├── staging/
└── prod/
```

## Backup Locations

- S3: `s3://voiceassist-backups-{account-id}/{env}/`
- RDS Snapshots: `voiceassist-db-{env}-{version}-{timestamp}`
- ElastiCache Snapshots: `voiceassist-redis-{env}-{version}-{timestamp}`

## Useful Aliases (Optional)

Add to your `.bashrc` or `.zshrc`:

```bash
# VoiceAssist deployment shortcuts
alias va-deploy-dev='./scripts/deploy/deploy.sh -e dev -v'
alias va-deploy-staging='./scripts/deploy/deploy.sh -e staging -v'
alias va-deploy-prod='./scripts/deploy/deploy.sh -e prod -v'
alias va-health='./scripts/monitoring/health-check.sh -e'
alias va-rollback='./scripts/deploy/rollback.sh -e'
alias va-scale='./scripts/k8s/scale.sh -e'

# Kubernetes shortcuts
alias va-pods='kubectl get pods -n'
alias va-logs='kubectl logs -n'
alias va-describe='kubectl describe pod -n'
```

## Support & Documentation

- Full documentation: `scripts/README.md`
- Each script has built-in help: `<script> --help`
- Logs are always written to `logs/` directory
- AWS documentation: https://docs.aws.amazon.com/
- Kubernetes documentation: https://kubernetes.io/docs/

## Script Features

All scripts include:

- Comprehensive error handling
- Color-coded output (red=error, green=success, yellow=warning, blue=info)
- Detailed logging to files
- Dry-run mode for safety
- Verbose mode for debugging
- Help text with examples
- Proper exit codes
- Idempotent operations (where possible)

## Version Naming Convention

Use semantic versioning:

- `v1.0.0` - Major.Minor.Patch
- `v1.2.3-rc1` - Release candidate
- `v1.2.3-beta` - Beta release
- Never use `latest` in production

## Contact

For questions or issues with deployment scripts:

1. Check logs in `logs/` directory
2. Run with `--verbose` flag
3. Review error messages
4. Consult `scripts/README.md`

# VoiceAssist Deployment Scripts

Comprehensive deployment automation scripts for VoiceAssist Phase 9.

## Directory Structure

```
scripts/
├── deploy/                 # Deployment orchestration scripts
│   ├── deploy.sh          # Main deployment orchestrator
│   ├── rollback.sh        # Rollback deployments
│   ├── pre-deploy-checks.sh  # Pre-deployment validation
│   ├── backup.sh          # Backup before deployment
│   └── migrate.sh         # Database migrations
├── k8s/                   # Kubernetes deployment scripts
│   ├── deploy-to-k8s.sh   # K8s deployment manager
│   └── scale.sh           # Scaling deployments
├── monitoring/            # Monitoring and health checks
│   └── health-check.sh    # Comprehensive health checks
├── init/                  # Initialization scripts
│   ├── setup-aws-resources.sh  # AWS resource setup
│   └── bootstrap-k8s.sh   # K8s cluster bootstrap
└── README.md             # This file
```

## Quick Start

### 1. Initialize AWS Resources (First Time Setup)

```bash
# Set up ECR, S3, DynamoDB, Secrets Manager, IAM roles
./scripts/init/setup-aws-resources.sh -e dev
./scripts/init/setup-aws-resources.sh -e staging
./scripts/init/setup-aws-resources.sh -e prod
```

### 2. Bootstrap Kubernetes Cluster (Per Environment)

```bash
# Install metrics-server, ingress-nginx, cert-manager, Prometheus
./scripts/init/bootstrap-k8s.sh -e dev
./scripts/init/bootstrap-k8s.sh -e staging
./scripts/init/bootstrap-k8s.sh -e prod --verbose
```

### 3. Deploy Application

```bash
# Deploy to development
./scripts/deploy/deploy.sh -e dev -v v1.0.0

# Deploy to staging
./scripts/deploy/deploy.sh -e staging -v v1.0.0 --verbose

# Deploy to production (with all safety checks)
./scripts/deploy/deploy.sh -e prod -v v1.0.0
```

## Script Documentation

### Deployment Scripts (`scripts/deploy/`)

#### deploy.sh - Main Deployment Orchestrator

Complete end-to-end deployment automation.

**Usage:**
```bash
./scripts/deploy/deploy.sh -e <environment> -v <version> [options]
```

**Options:**
- `-e, --environment ENV` - Target environment (dev/staging/prod) [required]
- `-v, --version TAG` - Version tag to deploy [required]
- `-d, --dry-run` - Perform dry-run without actual deployment
- `-V, --verbose` - Enable verbose output
- `-s, --skip-tests` - Skip smoke tests after deployment
- `-h, --help` - Show help message

**Examples:**
```bash
# Deploy v1.2.3 to staging
./scripts/deploy/deploy.sh -e staging -v v1.2.3

# Dry-run deployment to production
./scripts/deploy/deploy.sh -e prod -v v1.2.3 --dry-run --verbose

# Deploy to dev without smoke tests
./scripts/deploy/deploy.sh -e dev -v latest --skip-tests
```

**What it does:**
1. Validates environment and dependencies
2. Runs pre-deployment checks
3. Creates backup of current state
4. Builds and pushes Docker images to ECR
5. Deploys to Kubernetes cluster
6. Runs database migrations
7. Performs smoke tests
8. Sends notifications (Slack if configured)
9. Records deployment metadata

**Environment Variables:**
- `AWS_REGION` - AWS region (default: us-east-1)
- `SLACK_WEBHOOK_URL` - Slack webhook for notifications

---

#### rollback.sh - Rollback Deployments

Safely rollback deployments to previous version.

**Usage:**
```bash
./scripts/deploy/rollback.sh -e <environment> [options]
```

**Options:**
- `-e, --environment ENV` - Target environment [required]
- `-v, --version TAG` - Version to rollback to (auto-detects if not specified)
- `-d, --dry-run` - Perform dry-run
- `-V, --verbose` - Enable verbose output
- `-m, --skip-migrations` - Skip database migration rollback
- `-h, --help` - Show help message

**Examples:**
```bash
# Rollback to previous successful deployment
./scripts/deploy/rollback.sh -e staging

# Rollback to specific version
./scripts/deploy/rollback.sh -e prod -v v1.2.2

# Dry-run rollback
./scripts/deploy/rollback.sh -e dev --dry-run
```

**What it does:**
1. Gets current and target versions
2. Confirms rollback (especially for production)
3. Rolls back Kubernetes deployments
4. Rolls back database migrations (optional)
5. Verifies rollback success
6. Sends alert notifications

---

#### pre-deploy-checks.sh - Pre-Deployment Validation

Comprehensive pre-deployment environment validation.

**Usage:**
```bash
./scripts/deploy/pre-deploy-checks.sh -e <environment> [options]
```

**Checks performed:**
- AWS credentials validity
- EKS cluster access
- Database connectivity
- Redis connectivity
- AWS Secrets Manager secrets
- ECR repositories
- Docker daemon
- Kubernetes resources
- Disk space

**Exit codes:**
- 0: All checks passed
- 1: One or more checks failed

---

#### backup.sh - Backup Before Deployment

Creates comprehensive backups before deployment.

**Usage:**
```bash
./scripts/deploy/backup.sh -e <environment> -v <version> [options]
```

**Options:**
- `-e, --environment ENV` - Target environment [required]
- `-v, --version TAG` - Version tag for backup naming [required]
- `-t, --type TYPE` - Backup type: all, db, k8s, redis (default: all)
- `-d, --dry-run` - Perform dry-run
- `-V, --verbose` - Enable verbose output

**Examples:**
```bash
# Full backup
./scripts/deploy/backup.sh -e staging -v v1.2.3

# Database only
./scripts/deploy/backup.sh -e prod -v v1.2.3 --type db

# Kubernetes configs only
./scripts/deploy/backup.sh -e dev -v latest --type k8s
```

**What it backs up:**
- RDS database snapshots
- Kubernetes configurations (deployments, services, secrets, etc.)
- Redis data (ElastiCache snapshots or RDB dumps)
- Backup metadata

**Storage:**
- Backups stored in S3 bucket: `voiceassist-backups-<account-id>`
- Organized by environment and timestamp
- Lifecycle policies for cost optimization

---

#### migrate.sh - Database Migration Runner

Runs Alembic database migrations with safety checks.

**Usage:**
```bash
./scripts/deploy/migrate.sh -e <environment> [options]
```

**Options:**
- `-e, --environment ENV` - Target environment [required]
- `-D, --direction DIR` - Migration direction: up, down (default: up)
- `-s, --steps N` - Number of migration steps
- `-d, --dry-run` - Preview migrations without applying
- `-b, --backup` - Create backup before migration
- `-V, --verbose` - Enable verbose output

**Examples:**
```bash
# Run all pending migrations
./scripts/deploy/migrate.sh -e staging -D up

# Run migrations with backup
./scripts/deploy/migrate.sh -e prod -D up --backup

# Rollback one migration
./scripts/deploy/migrate.sh -e dev -D down --steps 1

# Preview migrations
./scripts/deploy/migrate.sh -e staging -D up --dry-run
```

---

### Kubernetes Scripts (`scripts/k8s/`)

#### deploy-to-k8s.sh - Kubernetes Deployment

Deploys application to Kubernetes cluster.

**Usage:**
```bash
./scripts/k8s/deploy-to-k8s.sh -e <environment> -v <version> [options]
```

**Options:**
- `-e, --environment ENV` - Target environment [required]
- `-v, --version TAG` - Version tag [required]
- `-w, --wait-timeout SEC` - Rollout wait timeout (default: 300)
- `-d, --dry-run` - Perform dry-run
- `-V, --verbose` - Enable verbose output

**What it deploys:**
1. ConfigMaps
2. Secrets
3. Services
4. Deployments
5. Ingress
6. HorizontalPodAutoscaler

**Examples:**
```bash
# Deploy v1.2.3
./scripts/k8s/deploy-to-k8s.sh -e staging -v v1.2.3

# Deploy with extended timeout
./scripts/k8s/deploy-to-k8s.sh -e prod -v v1.2.3 --wait-timeout 600

# Dry-run deployment
./scripts/k8s/deploy-to-k8s.sh -e dev -v latest --dry-run
```

---

#### scale.sh - Scaling Deployments

Scale deployments manually or update HPA configurations.

**Usage:**
```bash
./scripts/k8s/scale.sh -e <environment> [options]
```

**Options:**
- `-e, --environment ENV` - Target environment [required]
- `-d, --deployment NAME` - Specific deployment to scale (optional)
- `-r, --replicas N` - Number of replicas for manual scaling
- `-m, --min N` - HPA minimum replicas
- `-M, --max N` - HPA maximum replicas
- `-D, --dry-run` - Perform dry-run
- `-V, --verbose` - Enable verbose output

**Examples:**
```bash
# Scale backend to 5 replicas
./scripts/k8s/scale.sh -e staging -d voiceassist-backend -r 5

# Update HPA for all deployments
./scripts/k8s/scale.sh -e prod -m 3 -M 10

# Update HPA for specific deployment
./scripts/k8s/scale.sh -e staging -d voiceassist-worker -m 2 -M 8
```

---

### Monitoring Scripts (`scripts/monitoring/`)

#### health-check.sh - Health Check

Comprehensive health checks on deployed application.

**Usage:**
```bash
./scripts/monitoring/health-check.sh -e <environment> [options]
```

**Checks performed:**
- /health endpoint
- /ready endpoint
- Database connectivity
- Redis connectivity
- Pod health and readiness
- Deployment availability
- Services configuration
- Ingress configuration
- HPA configuration
- Prometheus metrics

**Examples:**
```bash
# Run health checks
./scripts/monitoring/health-check.sh -e staging

# Verbose health checks
./scripts/monitoring/health-check.sh -e prod --verbose

# With custom timeout
./scripts/monitoring/health-check.sh -e dev --timeout 60
```

**Exit codes:**
- 0: All checks passed
- 1: One or more critical checks failed

---

### Initialization Scripts (`scripts/init/`)

#### setup-aws-resources.sh - AWS Resource Setup

Sets up required AWS resources (run once per account).

**Usage:**
```bash
./scripts/init/setup-aws-resources.sh -e <environment> [options]
```

**Creates:**
- ECR repositories (backend, worker, frontend)
- S3 bucket for Terraform state
- S3 bucket for backups
- DynamoDB table for Terraform locks
- AWS Secrets Manager secrets structure
- IAM roles (EKS cluster role, node group role)

**Examples:**
```bash
# Setup for dev environment
./scripts/init/setup-aws-resources.sh -e dev

# Setup for prod with verbose output
./scripts/init/setup-aws-resources.sh -e prod --verbose

# Dry-run setup
./scripts/init/setup-aws-resources.sh -e staging --dry-run
```

**Note:** After running, update Secrets Manager with actual credentials.

---

#### bootstrap-k8s.sh - Kubernetes Cluster Bootstrap

Installs essential Kubernetes components (run once per cluster).

**Usage:**
```bash
./scripts/init/bootstrap-k8s.sh -e <environment> [options]
```

**Installs:**
- metrics-server (for HPA)
- ingress-nginx (for ingress)
- cert-manager (for SSL certificates)
- Prometheus operator (for monitoring)
- Creates namespaces
- Applies RBAC policies
- Applies network policies (production)

**Options:**
- `-s, --skip COMPONENT` - Skip component installation (comma-separated)

**Examples:**
```bash
# Full bootstrap
./scripts/init/bootstrap-k8s.sh -e dev

# Bootstrap with verbose output
./scripts/init/bootstrap-k8s.sh -e prod --verbose

# Skip specific components
./scripts/init/bootstrap-k8s.sh -e staging --skip metrics-server,cert-manager
```

---

## Common Workflows

### Initial Setup (New Environment)

```bash
# 1. Setup AWS resources
./scripts/init/setup-aws-resources.sh -e prod --verbose

# 2. Update AWS Secrets Manager with actual credentials
# Use AWS Console or AWS CLI to update secrets

# 3. Bootstrap Kubernetes cluster
./scripts/init/bootstrap-k8s.sh -e prod --verbose

# 4. Verify setup
./scripts/deploy/pre-deploy-checks.sh -e prod --verbose
```

### Regular Deployment

```bash
# 1. Run pre-deployment checks
./scripts/deploy/pre-deploy-checks.sh -e staging

# 2. Deploy application
./scripts/deploy/deploy.sh -e staging -v v1.2.3

# 3. Verify deployment
./scripts/monitoring/health-check.sh -e staging --verbose
```

### Emergency Rollback

```bash
# 1. Rollback deployment
./scripts/deploy/rollback.sh -e prod

# 2. Verify rollback
./scripts/monitoring/health-check.sh -e prod

# 3. Check logs for issues
kubectl logs -n voiceassist-prod -l app=voiceassist-backend --tail=100
```

### Scaling Operations

```bash
# Scale up for high traffic
./scripts/k8s/scale.sh -e prod -m 5 -M 20

# Scale down for cost savings
./scripts/k8s/scale.sh -e dev -m 1 -M 3

# Manual scaling for specific service
./scripts/k8s/scale.sh -e staging -d voiceassist-worker -r 5
```

## Environment Variables

### AWS Configuration
- `AWS_REGION` - AWS region (default: us-east-1)
- `AWS_ACCOUNT_ID` - AWS account ID (auto-detected)
- `AWS_PROFILE` - AWS CLI profile to use

### S3 Buckets
- `S3_BACKUP_BUCKET` - S3 bucket for backups (default: voiceassist-backups)

### Notifications
- `SLACK_WEBHOOK_URL` - Slack webhook URL for deployment notifications

### Database
- Database credentials stored in AWS Secrets Manager:
  - `voiceassist/<env>/database`

### Redis
- Redis credentials stored in AWS Secrets Manager:
  - `voiceassist/<env>/redis`

## Logging

All scripts log to:
```
logs/
├── deploy/          # Deployment logs
├── rollback/        # Rollback logs
├── checks/          # Pre-deployment check logs
├── backup/          # Backup logs
├── migration/       # Migration logs
├── k8s-deploy/      # K8s deployment logs
├── scaling/         # Scaling logs
├── health-check/    # Health check logs
└── init/           # Initialization logs
```

Logs include:
- Timestamp
- Log level (INFO, SUCCESS, WARNING, ERROR)
- Detailed operation information
- Command outputs
- Error messages with context

## Best Practices

### Pre-Deployment
1. Always run pre-deployment checks first
2. Test in dev/staging before production
3. Use `--dry-run` flag to preview changes
4. Create backups before major changes

### Deployment
1. Use semantic versioning for tags
2. Tag Docker images with git commit SHA
3. Never deploy `latest` to production
4. Always monitor deployment progress
5. Run health checks after deployment

### Rollback
1. Keep deployment records for reference
2. Test rollback procedures regularly
3. Always verify after rollback
4. Document rollback reasons

### Security
1. Never commit secrets to git
2. Use AWS Secrets Manager for credentials
3. Rotate secrets regularly
4. Review IAM policies periodically
5. Enable audit logging

### Monitoring
1. Set up Slack notifications
2. Monitor Prometheus metrics
3. Check logs regularly
4. Set up alerts for failures

## Troubleshooting

### Common Issues

**Issue: AWS credentials not configured**
```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_REGION="us-east-1"
```

**Issue: kubectl not configured**
```bash
# Update kubeconfig
aws eks update-kubeconfig --region us-east-1 --name voiceassist-eks-prod
```

**Issue: Docker image build fails**
```bash
# Check Docker daemon
docker info

# Check Dockerfile
docker build -t test .
```

**Issue: Deployment stuck**
```bash
# Check pod status
kubectl get pods -n voiceassist-prod

# Check pod logs
kubectl logs -n voiceassist-prod <pod-name>

# Describe pod for events
kubectl describe pod -n voiceassist-prod <pod-name>
```

**Issue: Health checks fail after deployment**
```bash
# Check pod readiness
kubectl get pods -n voiceassist-prod

# Check service endpoints
kubectl get endpoints -n voiceassist-prod

# Check ingress
kubectl get ingress -n voiceassist-prod
```

## Support

For issues or questions:
1. Check logs in `logs/` directory
2. Review error messages carefully
3. Consult Kubernetes documentation
4. Check AWS service status
5. Review this README

## Contributing

When adding new scripts:
1. Follow existing naming conventions
2. Include comprehensive help text
3. Add error handling
4. Support `--dry-run` and `--verbose` flags
5. Add logging
6. Update this README

## License

Internal VoiceAssist project scripts.

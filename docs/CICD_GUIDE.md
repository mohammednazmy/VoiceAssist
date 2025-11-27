---
title: "Cicd Guide"
slug: "cicd-guide"
summary: "1. [Overview](#overview)"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["frontend"]
tags: ["cicd", "guide"]
category: operations
---

# CI/CD Pipeline Guide

## Table of Contents

1. [Overview](#overview)
2. [GitHub Actions Workflows](#github-actions-workflows)
3. [CI Pipeline](#ci-pipeline)
4. [CD Pipeline](#cd-pipeline)
5. [Terraform Automation](#terraform-automation)
6. [Required Secrets](#required-secrets)
7. [Deployment Process](#deployment-process)
8. [Rollback Procedures](#rollback-procedures)
9. [Monitoring Deployments](#monitoring-deployments)
10. [Troubleshooting](#troubleshooting)

## Overview

VoiceAssist uses GitHub Actions for continuous integration and continuous deployment. The CI/CD pipeline ensures code quality, security, and reliable deployments.

### Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Repository                         │
│  (main, develop, feature branches)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴──────────────┐
                │                            │
        ┌───────▼────────┐          ┌───────▼────────┐
        │  Pull Request  │          │   Push/Merge   │
        │   Workflows    │          │   Workflows    │
        └───────┬────────┘          └───────┬────────┘
                │                            │
    ┌───────────┴──────────┐     ┌──────────┴───────────┐
    │                      │     │                      │
┌───▼────┐  ┌──────────┐  │  ┌──▼─────┐  ┌──────────┐ │
│  Lint  │  │   Test   │  │  │ Build  │  │  Deploy  │ │
│        │  │          │  │  │        │  │          │ │
└────────┘  └──────────┘  │  └────────┘  └──────────┘ │
                          │                            │
┌────────┐  ┌──────────┐  │  ┌────────┐  ┌──────────┐ │
│Security│  │Terraform │  │  │ Docker │  │    K8s   │ │
│  Scan  │  │   Plan   │  │  │  Push  │  │  Deploy  │ │
└────────┘  └──────────┘  │  └────────┘  └──────────┘ │
                          │                            │
        Quality Gates     │      Deployment            │
        └──────────────────┴────────────────────────────┘
```

### Workflow Triggers

| Workflow            | Trigger               | Purpose                        |
| ------------------- | --------------------- | ------------------------------ |
| **CI Pipeline**     | PR to main/develop    | Code quality and tests         |
| **Security Scan**   | PR/Push               | Vulnerability scanning         |
| **Terraform Plan**  | PR with infra changes | Preview infrastructure changes |
| **Terraform Apply** | Merge to main         | Apply infrastructure changes   |
| **Build & Deploy**  | Tag/Manual            | Build and deploy application   |

## GitHub Actions Workflows

### Workflow Files

```
.github/workflows/
├── ci.yml                    # CI pipeline (lint, test)
├── security-scan.yml         # Security scanning
├── terraform-plan.yml        # Terraform planning
├── terraform-apply.yml       # Terraform apply
└── build-deploy.yml          # Build and deploy
```

## CI Pipeline

### Workflow: `ci.yml`

Runs on every PR and push to main/develop branches.

**Jobs:**

1. **Lint** - Code formatting and style checks
2. **Unit Tests** - Fast, isolated tests
3. **Integration Tests** - Tests with external dependencies
4. **Contract Tests** - API contract validation with Pact

### Lint Job

```yaml
lint:
  name: Lint (black, flake8, isort)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: "3.11"
    - name: Install pre-commit
      run: pip install pre-commit
    - name: Run pre-commit hooks
      run: pre-commit run --all-files --show-diff-on-failure
```

**Checks:**

- Code formatting (black)
- Import sorting (isort)
- Style guide (flake8)
- Type hints (mypy)
- Security (bandit)
- Terraform formatting

### Unit Tests Job

```yaml
unit-tests:
  name: Unit Tests (Python ${{ matrix.python-version }})
  runs-on: ubuntu-latest
  strategy:
    matrix:
      python-version: ["3.11", "3.12"]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: ${{ matrix.python-version }}
    - name: Install dependencies
      run: pip install -r requirements.txt
    - name: Run unit tests
      run: |
        pytest tests/unit/ \
          --cov=app \
          --cov-report=xml \
          --junitxml=junit.xml \
          -v -n auto
```

**Coverage Requirements:**

- Minimum 80% code coverage
- Critical modules require 90%+
- Coverage report uploaded to Codecov

### Integration Tests Job

```yaml
integration-tests:
  name: Integration Tests
  runs-on: ubuntu-latest
  services:
    postgres:
      image: pgvector/pgvector:pg16
      env:
        POSTGRES_PASSWORD: test_password
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
    redis:
      image: redis:7-alpine
      options: >-
        --health-cmd "redis-cli ping"
    qdrant:
      image: qdrant/qdrant:v1.7.4
  steps:
    - name: Run integration tests
      run: pytest tests/integration/ -v
```

**Test Services:**

- PostgreSQL with pgvector extension
- Redis cache
- Qdrant vector database

### Contract Tests Job

```yaml
contract-tests:
  name: Contract Tests (Pact)
  runs-on: ubuntu-latest
  services:
    pact-broker:
      image: pactfoundation/pact-broker:latest
      env:
        PACT_BROKER_DATABASE_URL: postgresql://...
  steps:
    - name: Run contract tests
      run: pytest tests/contract/ -v
    - name: Publish pacts
      run: pact-broker publish
```

**Contract Testing:**

- Consumer-driven contracts
- API versioning validation
- Backward compatibility checks

## CD Pipeline

### Workflow: `build-deploy.yml`

Triggered by tags or manual workflow dispatch.

**Jobs:**

1. **Build** - Build Docker images
2. **Push** - Push to container registry
3. **Deploy Dev** - Deploy to development
4. **Deploy Staging** - Deploy to staging (auto)
5. **Deploy Production** - Deploy to production (manual approval)

### Build Job

```yaml
build:
  name: Build Docker Images
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Login to ECR
      uses: aws-actions/amazon-ecr-login@v2

    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: ./services/api-gateway
        push: true
        tags: |
          ${{ secrets.ECR_REGISTRY }}/voiceassist-api:${{ github.sha }}
          ${{ secrets.ECR_REGISTRY }}/voiceassist-api:latest
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

**Build Optimizations:**

- Layer caching with GitHub Actions cache
- Multi-stage builds for smaller images
- BuildKit for parallel builds

### Deploy Jobs

```yaml
deploy-staging:
  name: Deploy to Staging
  needs: [build]
  runs-on: ubuntu-latest
  environment:
    name: staging
    url: https://staging.voiceassist.example.com
  steps:
    - name: Configure kubectl
      run: |
        aws eks update-kubeconfig \
          --name voiceassist-staging-cluster \
          --region us-east-1

    - name: Deploy to K8s
      run: |
        kubectl set image deployment/api-gateway \
          api-gateway=${{ secrets.ECR_REGISTRY }}/voiceassist-api:${{ github.sha }} \
          -n voiceassist
        kubectl rollout status deployment/api-gateway -n voiceassist

deploy-production:
  name: Deploy to Production
  needs: [deploy-staging]
  runs-on: ubuntu-latest
  environment:
    name: production
    url: https://voiceassist.example.com
  steps:
    # Same as staging but with manual approval
    - name: Wait for approval
      uses: trstringer/manual-approval@v1
      with:
        secret: ${{ github.TOKEN }}
        approvers: devops-team
```

**Deployment Strategy:**

- Rolling update with zero downtime
- Automated rollback on failure
- Health checks before traffic routing

## Terraform Automation

### Workflow: `terraform-plan.yml`

Triggered by PRs that modify Terraform files.

**Jobs:**

1. **Format Check** - Validate Terraform formatting
2. **Validate** - Validate configuration syntax
3. **Plan** - Generate execution plans for all environments
4. **Security Scan** - Scan with Checkov and tfsec
5. **Cost Estimation** - Calculate cost impact with Infracost

### Terraform Plan Job

```yaml
terraform-plan-production:
  name: Terraform Plan (Production)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Setup Terraform
      uses: hashicorp/setup-terraform@v3
      with:
        terraform_version: 1.6.0

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1

    - name: Terraform Init
      run: |
        cd infrastructure/terraform
        terraform init \
          -backend-config="key=voiceassist/production/terraform.tfstate"

    - name: Terraform Plan
      run: |
        cd infrastructure/terraform
        terraform plan \
          -var-file="environments/production.tfvars" \
          -out=production-plan.tfplan

    - name: Comment on PR
      uses: actions/github-script@v7
      with:
        script: |
          const fs = require('fs');
          const plan = fs.readFileSync('infrastructure/terraform/production-plan.txt', 'utf8');
          github.rest.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: `#### Terraform Plan (Production)\n\`\`\`hcl\n${plan}\n\`\`\``
          });
```

### Terraform Apply Job

Triggered when PR is merged to main.

```yaml
terraform-apply:
  name: Apply Terraform Changes
  runs-on: ubuntu-latest
  environment: production
  steps:
    - name: Terraform Apply
      run: |
        cd infrastructure/terraform
        terraform apply \
          -var-file="environments/production.tfvars" \
          -auto-approve

    - name: Update outputs
      run: |
        terraform output -json > outputs.json
        aws s3 cp outputs.json s3://voiceassist-config/terraform-outputs.json
```

**Safety Measures:**

- Manual approval required for production
- Plan artifacts saved for 30 days
- State backup before apply
- Automatic rollback on failure

## Required Secrets

### GitHub Repository Secrets

Navigate to: `Settings` > `Secrets and variables` > `Actions`

**AWS Credentials:**

```
AWS_ACCESS_KEY_ID          # AWS access key for Terraform/deployment
AWS_SECRET_ACCESS_KEY      # AWS secret key
AWS_REGION                 # Default: us-east-1
```

**Container Registry:**

```
ECR_REGISTRY               # ECR registry URL (e.g., 123456789.dkr.ecr.us-east-1.amazonaws.com)
DOCKER_USERNAME            # Optional: Docker Hub username
DOCKER_PASSWORD            # Optional: Docker Hub token
```

**Code Quality:**

```
CODECOV_TOKEN              # Codecov integration token
SONAR_TOKEN                # Optional: SonarQube token
```

**Infrastructure:**

```
INFRACOST_API_KEY          # Cost estimation API key
TF_API_TOKEN               # Optional: Terraform Cloud token
```

**Notifications:**

```
SLACK_WEBHOOK_URL          # Slack notifications webhook
PAGERDUTY_INTEGRATION_KEY  # PagerDuty alerts
```

### Environment-Specific Variables

**Development:**

```
DEV_CLUSTER_NAME           # EKS cluster name
DEV_NAMESPACE              # Kubernetes namespace
```

**Staging:**

```
STAGING_CLUSTER_NAME
STAGING_NAMESPACE
STAGING_URL
```

**Production:**

```
PROD_CLUSTER_NAME
PROD_NAMESPACE
PROD_URL
PROD_BACKUP_BUCKET
```

## Deployment Process

### Manual Deployment

1. **Create release tag:**

   ```bash
   git tag -a v2.0.0 -m "Release version 2.0.0"
   git push origin v2.0.0
   ```

2. **Trigger workflow:**
   - Navigate to Actions tab
   - Select "Build and Deploy" workflow
   - Click "Run workflow"
   - Select environment
   - Confirm

3. **Monitor deployment:**
   - Watch workflow progress in Actions tab
   - Check deployment logs
   - Verify health checks pass

4. **Verify deployment:**

   ```bash
   # Check pod status
   kubectl get pods -n voiceassist

   # Check service health
   curl https://api.voiceassist.example.com/health

   # View recent logs
   kubectl logs -n voiceassist deployment/api-gateway --tail=100
   ```

### Automated Deployment

**Development:**

- Automatic on push to `develop` branch
- Deploys to dev environment
- No approval required

**Staging:**

- Automatic on merge to `main`
- Deploys to staging environment
- Runs smoke tests automatically

**Production:**

- Manual approval required
- Deploy after staging validation
- Change window: Non-peak hours

### Deployment Checklist

**Pre-Deployment:**

- [ ] All tests passing
- [ ] Code review approved
- [ ] Database migrations tested
- [ ] Rollback plan prepared
- [ ] Team notified

**During Deployment:**

- [ ] Monitor application logs
- [ ] Watch error rates
- [ ] Check response times
- [ ] Verify health endpoints

**Post-Deployment:**

- [ ] Run smoke tests
- [ ] Verify critical features
- [ ] Check metrics/dashboards
- [ ] Update documentation
- [ ] Close deployment ticket

## Rollback Procedures

### Automatic Rollback

Deployments automatically roll back if:

- Health checks fail
- Readiness probes timeout
- Pod crashes during rollout

### Manual Rollback

**Kubernetes Rollback:**

```bash
# View deployment history
kubectl rollout history deployment/api-gateway -n voiceassist

# Rollback to previous version
kubectl rollout undo deployment/api-gateway -n voiceassist

# Rollback to specific revision
kubectl rollout undo deployment/api-gateway -n voiceassist --to-revision=5

# Check rollback status
kubectl rollout status deployment/api-gateway -n voiceassist
```

**GitHub Actions Rollback:**

```bash
# Re-run previous successful deployment
# 1. Go to Actions tab
# 2. Find last successful deployment
# 3. Click "Re-run jobs"
# 4. Select environment
```

**Terraform Rollback:**

```bash
# Revert Git commit
git revert <commit-hash>
git push origin main

# Or restore from state backup
terraform state pull > backup.tfstate
# Edit if needed
terraform state push backup.tfstate
```

### Emergency Rollback

In case of critical issues:

1. **Stop incoming traffic:**

   ```bash
   kubectl scale deployment/api-gateway --replicas=0 -n voiceassist
   ```

2. **Deploy previous version:**

   ```bash
   kubectl set image deployment/api-gateway \
     api-gateway=<previous-image-tag> \
     -n voiceassist
   ```

3. **Scale up:**

   ```bash
   kubectl scale deployment/api-gateway --replicas=3 -n voiceassist
   ```

4. **Verify:**
   ```bash
   kubectl get pods -n voiceassist
   curl https://api.voiceassist.example.com/health
   ```

## Monitoring Deployments

### GitHub Actions Monitoring

**Workflow Status:**

- Green check: Success
- Red X: Failure
- Yellow circle: In progress

**Deployment Status:**

```bash
# Using GitHub CLI
gh run list --workflow=build-deploy.yml

# View specific run
gh run view <run-id>

# View logs
gh run view <run-id> --log
```

### Application Monitoring

**Kubernetes:**

```bash
# Watch deployment
kubectl get deployments -n voiceassist -w

# Watch pods
kubectl get pods -n voiceassist -w

# View events
kubectl get events -n voiceassist --sort-by='.lastTimestamp'

# Check logs
kubectl logs -f deployment/api-gateway -n voiceassist
```

**Metrics:**

- Grafana dashboards: Monitor request rates, errors, latency
- Prometheus alerts: Automated alerting on issues
- Jaeger tracing: Distributed request tracing

### Notification Channels

**Slack Integration:**

```yaml
- name: Notify Slack
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: "Deployment to production completed"
    webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
  if: always()
```

**Email Notifications:**

- Configure in GitHub repository settings
- Notify on workflow failure
- Daily deployment summary

## Troubleshooting

### CI Pipeline Issues

**Issue: Tests failing randomly**

```
Error: flaky test failures
```

**Solutions:**

```bash
# Run tests locally
pytest tests/unit/ -v --reruns 3

# Check for race conditions
pytest tests/integration/ --durations=10

# Review test isolation
pytest tests/ --collect-only
```

**Issue: Build timeout**

```
Error: Job timeout after 6 hours
```

**Solutions:**

```yaml
# Increase timeout in workflow
jobs:
  build:
    timeout-minutes: 60

# Use build cache
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

### Deployment Issues

**Issue: Pod not starting**

```
Error: ImagePullBackOff
```

**Solutions:**

```bash
# Check image exists
aws ecr describe-images --repository-name voiceassist-api

# Verify credentials
kubectl get secret ecr-credentials -n voiceassist -o yaml

# Check pod events
kubectl describe pod <pod-name> -n voiceassist
```

**Issue: Deployment stuck**

```
Error: Deployment does not have minimum availability
```

**Solutions:**

```bash
# Check pod status
kubectl get pods -n voiceassist

# View pod logs
kubectl logs <pod-name> -n voiceassist

# Check resource limits
kubectl describe pod <pod-name> -n voiceassist

# Rollback if necessary
kubectl rollout undo deployment/api-gateway -n voiceassist
```

### Terraform Issues

**Issue: Plan shows unexpected changes**

```
Error: Changes detected in production
```

**Solutions:**

```bash
# Review plan carefully
terraform plan -var-file="environments/production.tfvars" | less

# Check state drift
terraform refresh

# Compare with previous state
terraform state pull | jq . > current-state.json
```

**Issue: Apply fails**

```
Error: Error creating resource
```

**Solutions:**

```bash
# Enable debug logging
TF_LOG=DEBUG terraform apply

# Check AWS limits
aws service-quotas list-service-quotas --service-code eks

# Import existing resource
terraform import module.eks.aws_eks_cluster.main <cluster-name>
```

### Getting Help

1. **Check workflow logs:**
   - Actions tab in GitHub
   - Download logs for offline review

2. **Review documentation:**
   - [GitHub Actions Docs](https://docs.github.com/en/actions)
   - [Terraform Docs](https://www.terraform.io/docs)
   - [Kubernetes Docs](https://kubernetes.io/docs)

3. **Contact team:**
   - Create issue in repository
   - Slack #devops channel
   - PagerDuty for emergencies

---

**Last Updated**: 2025-11-21
**Version**: 2.0
**Maintainer**: DevOps Team

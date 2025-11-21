# GitHub Actions Workflows

This directory contains comprehensive CI/CD workflows for VoiceAssist Phase 9.

## Workflows Overview

### 1. CI Pipeline (`ci.yml`)

**Triggers:**
- Push to `main` and `develop` branches
- Pull requests to `main` and `develop`

**Jobs:**
- **Lint**: Runs pre-commit hooks (black, flake8, isort) for code quality
- **Unit Tests**: Executes pytest unit tests on Python 3.11 and 3.12 with coverage
- **Integration Tests**: Runs integration tests with PostgreSQL, Redis, and Qdrant services
- **Contract Tests**: Executes Pact contract tests and publishes to Pact Broker
- **CI Summary**: Aggregates results and comments on PRs

**Features:**
- Coverage reporting to Codecov
- Test result artifacts
- Dependency caching for faster builds
- Matrix strategy for multiple Python versions
- PR commenting with results

### 2. Security Scanning (`security-scan.yml`)

**Triggers:**
- Push to `main` and `develop`
- Pull requests
- Scheduled daily at 2 AM UTC
- Manual workflow dispatch

**Jobs:**
- **Bandit**: Python security linter for common security issues
- **Safety**: Checks dependencies for known vulnerabilities
- **Trivy**: Container image vulnerability scanning
- **Secret Scan**: Gitleaks for detecting secrets in code
- **Snyk**: Additional security scanning (scheduled/manual only)
- **OWASP Dependency Check**: Comprehensive dependency analysis (scheduled/manual only)

**Features:**
- Fails on high-severity issues
- Uploads SARIF results to GitHub Security
- Creates GitHub issues for critical findings
- Detailed security reports as artifacts

### 3. Build and Deploy (`build-deploy.yml`)

**Triggers:**
- Push to `main` (production deployment)
- Push to `develop` (staging deployment)
- Manual workflow dispatch with environment selection

**Jobs:**
- **Build API**: Builds and pushes API Gateway Docker image to ECR
- **Build Worker**: Builds and pushes Worker Docker image to ECR
- **Deploy Staging**: Deploys to staging EKS cluster (develop branch)
- **Deploy Production**: Deploys to production EKS with blue-green strategy (main branch)
- **Post-Deployment Tests**: Runs E2E tests after staging deployment

**Features:**
- Multi-stage Docker builds with layer caching
- ECR image tagging (branch, SHA, latest)
- SBOM generation for supply chain security
- Blue-green deployment for production
- Automatic rollback on failure
- Slack notifications
- GitHub release creation
- Deployment backups

### 4. Terraform Plan (`terraform-plan.yml`)

**Triggers:**
- Pull requests that modify `infrastructure/terraform/**`

**Jobs:**
- **Terraform Format**: Checks Terraform formatting
- **Terraform Validate**: Validates syntax for staging and production
- **Terraform Plan Staging**: Generates plan for staging environment
- **Terraform Plan Production**: Generates plan for production environment
- **Cost Estimation**: Uses Infracost to estimate infrastructure costs
- **Security Scan**: Runs Checkov and tfsec for infrastructure security

**Features:**
- PR comments with plan details
- Cost estimation in PR comments
- Security scanning with SARIF upload
- Plan artifacts for review
- Validates both environments

### 5. Terraform Apply (`terraform-apply.yml`)

**Triggers:**
- Manual workflow dispatch (staging or production)
- Push to `main` for infrastructure changes (auto-applies to production)

**Jobs:**
- **Determine Environment**: Decides target environment
- **Terraform Apply Staging**: Applies changes to staging
- **Terraform Apply Production**: Applies changes to production with safeguards
- **Verify Infrastructure**: Post-apply verification tests
- **Rollback**: Manual rollback capability (on failure)

**Features:**
- State backup before production changes
- Destructive change detection
- Manual approval for production
- Post-apply verification
- Slack notifications
- Deployment summaries
- Git tagging for releases

## Status Badges

Add these badges to your main README.md:

```markdown
[![CI Pipeline](https://github.com/YOUR_USERNAME/VoiceAssist/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/VoiceAssist/actions/workflows/ci.yml)
[![Security Scan](https://github.com/YOUR_USERNAME/VoiceAssist/actions/workflows/security-scan.yml/badge.svg)](https://github.com/YOUR_USERNAME/VoiceAssist/actions/workflows/security-scan.yml)
[![Build and Deploy](https://github.com/YOUR_USERNAME/VoiceAssist/actions/workflows/build-deploy.yml/badge.svg)](https://github.com/YOUR_USERNAME/VoiceAssist/actions/workflows/build-deploy.yml)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/VoiceAssist/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/VoiceAssist)
```

## Required Secrets

Configure these secrets in your GitHub repository settings:

### AWS Credentials
- `AWS_ACCESS_KEY_ID`: AWS access key for ECR and EKS
- `AWS_SECRET_ACCESS_KEY`: AWS secret key

### Code Coverage
- `CODECOV_TOKEN`: Token for uploading coverage to Codecov

### Security Tools
- `SNYK_TOKEN`: Snyk API token for vulnerability scanning (optional)
- `GITLEAKS_LICENSE`: Gitleaks Pro license (optional)
- `INFRACOST_API_KEY`: Infracost API key for cost estimation

### Notifications
- `SLACK_WEBHOOK_URL`: Slack webhook for deployment notifications

### GitHub Token
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

## Environment Configuration

### Staging Environment
- **Name**: `staging`
- **URL**: `https://staging.voiceassist.example.com`
- **Protection Rules**: None (auto-deploy)
- **Secrets**: Same as repository secrets

### Production Environment
- **Name**: `production`
- **URL**: `https://voiceassist.example.com`
- **Protection Rules**:
  - Required reviewers (1-2 approvers)
  - Deployment delay (optional)
  - Branch restrictions (main only)
- **Secrets**: Production-specific credentials

### Staging Infrastructure
- **Name**: `staging-infrastructure`
- **Protection Rules**: Optional approval

### Production Infrastructure
- **Name**: `production-infrastructure`
- **Protection Rules**: Required approval

## Workflow Best Practices

### For Developers

1. **Before Committing:**
   ```bash
   # Run pre-commit hooks locally
   pre-commit run --all-files
   ```

2. **Before Opening PR:**
   - Ensure all tests pass locally
   - Check code coverage is adequate (>80%)
   - Review security scan results

3. **During PR Review:**
   - Review CI pipeline results in PR comments
   - Check Terraform plans if infrastructure changes are included
   - Verify cost estimates are reasonable

4. **After PR Approval:**
   - Merge to `develop` for staging deployment
   - Test in staging environment
   - Create PR from `develop` to `main` for production

### For DevOps/SREs

1. **Monitoring Deployments:**
   - Watch Slack notifications
   - Review deployment logs
   - Check CloudWatch metrics

2. **Infrastructure Changes:**
   - Always review Terraform plans before approval
   - Check for destructive changes
   - Verify cost estimates
   - Apply to staging first

3. **Incident Response:**
   - Use workflow artifacts for rollback
   - Check state backups
   - Review security scan alerts

## Maintenance

### Updating Workflows

1. Test workflow changes in a feature branch first
2. Use workflow dispatch for testing
3. Document any new secrets or configurations
4. Update this README

### Dependency Updates

- GitHub Actions: Use Dependabot
- Python packages: Regular safety scans
- Terraform modules: Version pinning
- Docker base images: Trivy scanning

## Troubleshooting

### Common Issues

**CI Pipeline Failures:**
- Check pre-commit hook configuration
- Verify test database connectivity
- Review test logs in artifacts

**Security Scan Failures:**
- Review Bandit findings (may be false positives)
- Update vulnerable dependencies
- Check Trivy reports for container issues

**Deployment Failures:**
- Verify AWS credentials
- Check ECR repository exists
- Review EKS cluster status
- Check Kubernetes pod logs

**Terraform Issues:**
- Verify state lock is released
- Check AWS credentials and permissions
- Review plan for errors
- Validate tfvars files

### Getting Help

- Check workflow logs in GitHub Actions tab
- Review artifacts for detailed reports
- Consult team documentation
- Reach out in #devops Slack channel

## Related Documentation

- [VoiceAssist Architecture](../../docs/architecture/)
- [Deployment Guide](../../docs/deployment/)
- [Security Guidelines](../../docs/security/)
- [Contributing Guide](../../CONTRIBUTING.md)

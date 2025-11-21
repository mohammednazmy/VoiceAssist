# GitHub Actions Setup Guide

This guide will help you configure GitHub Actions CI/CD workflows for VoiceAssist Phase 9.

## Prerequisites

- GitHub repository with admin access
- AWS account with ECR and EKS
- Terraform Cloud or S3 backend for state management
- Codecov account (optional but recommended)
- Slack workspace (optional for notifications)

## Step-by-Step Setup

### 1. Configure GitHub Secrets

Navigate to your repository settings: `Settings > Secrets and variables > Actions`

#### Required Secrets

**AWS Credentials:**
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

Generate IAM credentials with these policies:
- AmazonEC2ContainerRegistryFullAccess
- AmazonEKSClusterPolicy
- AmazonEKSServicePolicy
- Custom policy for Terraform state access

**GitHub Token:**
- `GITHUB_TOKEN` is automatically provided - no setup needed

#### Optional Secrets

**Code Coverage:**
```
CODECOV_TOKEN
```
Get from: https://codecov.io/

**Security Tools:**
```
SNYK_TOKEN              # From https://snyk.io/
GITLEAKS_LICENSE        # Optional, for Gitleaks Pro
INFRACOST_API_KEY       # From https://www.infracost.io/
```

**Notifications:**
```
SLACK_WEBHOOK_URL
```
Create webhook in Slack: Apps > Incoming Webhooks

### 2. Configure GitHub Environments

Create four environments in `Settings > Environments`:

#### staging
- **Protection rules**: None (auto-deploy)
- **Environment secrets**: None needed (inherits from repository)
- **Reviewers**: Optional

#### production
- **Protection rules**:
  - Required reviewers: Add 1-2 team members
  - Wait timer: 5 minutes (optional)
  - Deployment branches: `main` only
- **Environment secrets**: Production-specific secrets if needed
- **Reviewers**: DevOps/SRE team members

#### staging-infrastructure
- **Protection rules**: Optional approval
- **Deployment branches**: Any branch

#### production-infrastructure
- **Protection rules**:
  - Required reviewers: Add 1-2 infrastructure team members
  - Deployment branches: `main` only

### 3. Setup AWS Resources

#### Create ECR Repositories

```bash
# API Gateway repository
aws ecr create-repository \
  --repository-name voiceassist-api-gateway \
  --region us-east-1

# Worker repository
aws ecr create-repository \
  --repository-name voiceassist-worker \
  --region us-east-1
```

#### Configure EKS Clusters

```bash
# Staging cluster
aws eks create-cluster \
  --name voiceassist-cluster-staging \
  --region us-east-1 \
  --role-arn arn:aws:iam::ACCOUNT_ID:role/eks-cluster-role

# Production cluster
aws eks create-cluster \
  --name voiceassist-cluster-production \
  --region us-east-1 \
  --role-arn arn:aws:iam::ACCOUNT_ID:role/eks-cluster-role
```

#### Setup Terraform Backend

**Option 1: S3 Backend**

```bash
# Create S3 bucket for state
aws s3 mb s3://voiceassist-terraform-state

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket voiceassist-terraform-state \
  --versioning-configuration Status=Enabled

# Create DynamoDB table for locking
aws dynamodb create-table \
  --table-name voiceassist-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

Update `infrastructure/terraform/backend.tf`:
```hcl
terraform {
  backend "s3" {
    bucket         = "voiceassist-terraform-state"
    key            = "voiceassist/${var.environment}/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "voiceassist-terraform-locks"
    encrypt        = true
  }
}
```

**Option 2: Terraform Cloud**

1. Create workspace on Terraform Cloud
2. Update `infrastructure/terraform/backend.tf`:
```hcl
terraform {
  cloud {
    organization = "your-org"
    workspaces {
      tags = ["voiceassist"]
    }
  }
}
```

### 4. Configure Codecov

1. Sign up at https://codecov.io/ with your GitHub account
2. Add VoiceAssist repository
3. Copy the upload token
4. Add as `CODECOV_TOKEN` secret in GitHub

### 5. Setup Slack Notifications

1. Create Slack app or use Incoming Webhooks
2. Add webhook to your channel
3. Copy webhook URL
4. Add as `SLACK_WEBHOOK_URL` secret in GitHub

### 6. Enable GitHub Security Features

#### Enable Dependabot
- Go to `Settings > Security & analysis`
- Enable "Dependabot alerts"
- Enable "Dependabot security updates"
- The `.github/dependabot.yml` file is already configured

#### Enable Code Scanning
- Go to `Settings > Security & analysis`
- Enable "Code scanning"
- GitHub will use workflows that upload SARIF results

#### Enable Secret Scanning
- Go to `Settings > Security & analysis`
- Enable "Secret scanning"
- Enable "Push protection"

### 7. Configure Branch Protection Rules

#### For `main` branch:
```
Settings > Branches > Add rule

Branch name pattern: main

☑ Require a pull request before merging
  ☑ Require approvals (2)
  ☑ Dismiss stale pull request approvals when new commits are pushed
  ☑ Require review from Code Owners

☑ Require status checks to pass before merging
  ☑ Require branches to be up to date before merging
  Required status checks:
    - lint
    - unit-tests
    - integration-tests
    - contract-tests
    - security-summary

☑ Require conversation resolution before merging
☑ Require signed commits (optional but recommended)
☑ Include administrators
```

#### For `develop` branch:
```
Branch name pattern: develop

☑ Require a pull request before merging
  ☑ Require approvals (1)

☑ Require status checks to pass before merging
  Required status checks:
    - lint
    - unit-tests
```

### 8. Create Kubernetes Namespaces

```bash
# Staging namespace
kubectl create namespace voiceassist-staging

# Production namespace
kubectl create namespace voiceassist-production
```

### 9. Deploy Initial Infrastructure

```bash
# Initialize Terraform
cd infrastructure/terraform
terraform init

# Create staging environment
terraform workspace new staging
terraform plan -var-file="environments/staging.tfvars"
terraform apply -var-file="environments/staging.tfvars"

# Create production environment
terraform workspace new production
terraform plan -var-file="environments/production.tfvars"
terraform apply -var-file="environments/production.tfvars"
```

### 10. Test Workflows

#### Test CI Pipeline
```bash
# Create a test branch
git checkout -b test/ci-setup

# Make a small change
echo "# Test" >> README.md

# Commit and push
git add README.md
git commit -m "test: verify CI pipeline"
git push origin test/ci-setup

# Create PR and verify all checks pass
```

#### Test Security Scan
- The security scan will run automatically
- Check Actions tab for results
- Review any findings

#### Test Terraform Plan
```bash
# Make a small infrastructure change
git checkout -b test/terraform-plan

# Edit infrastructure/terraform/variables.tf
# Add a comment or make a small change

git add infrastructure/
git commit -m "test: verify terraform plan"
git push origin test/terraform-plan

# Create PR and verify plan appears in comments
```

### 11. Setup Monitoring (Optional)

#### CloudWatch Dashboards
```bash
# Create dashboard for monitoring deployments
aws cloudwatch put-dashboard \
  --dashboard-name VoiceAssist-CI-CD \
  --dashboard-body file://dashboards/cicd-dashboard.json
```

#### Setup Alerts
```bash
# Create SNS topic for alerts
aws sns create-topic --name voiceassist-deployment-alerts

# Subscribe email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:voiceassist-deployment-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com
```

## Verification Checklist

After setup, verify:

- [ ] All required secrets are configured
- [ ] All four environments are created with proper protection rules
- [ ] ECR repositories exist and are accessible
- [ ] EKS clusters are running
- [ ] Terraform backend is configured
- [ ] Branch protection rules are in place
- [ ] Dependabot is enabled
- [ ] Security scanning is enabled
- [ ] Test PR triggers all workflows successfully
- [ ] Codecov receives coverage reports
- [ ] Slack notifications are working
- [ ] Kubernetes namespaces exist

## Troubleshooting

### Common Issues

**Issue: AWS credentials not working**
- Verify IAM user has required permissions
- Check access key is active
- Ensure secrets are named exactly as shown

**Issue: Terraform state lock errors**
- Check DynamoDB table exists
- Verify table name matches backend config
- Release locks manually if needed:
  ```bash
  terraform force-unlock LOCK_ID
  ```

**Issue: Docker build fails**
- Check Dockerfile syntax
- Verify base images are accessible
- Check if ECR repository exists

**Issue: Kubernetes deployment fails**
- Verify EKS cluster is accessible
- Check kubectl context is correct
- Verify namespace exists
- Check RBAC permissions

**Issue: Coverage upload fails**
- Verify CODECOV_TOKEN is correct
- Check Codecov service status
- Review workflow logs for errors

### Getting Help

- Check workflow logs in Actions tab
- Review this documentation
- Check individual workflow README files
- Consult team documentation
- Reach out in #devops Slack channel

## Next Steps

After successful setup:

1. **Monitor First Deployment**: Watch the first production deployment carefully
2. **Document Custom Configurations**: Add any project-specific configurations to this guide
3. **Train Team**: Ensure all team members understand the CI/CD process
4. **Setup Monitoring**: Configure proper monitoring and alerting
5. **Regular Reviews**: Schedule regular reviews of workflow performance
6. **Optimize**: Look for opportunities to speed up workflows

## Maintenance

### Regular Tasks

**Weekly:**
- Review Dependabot PRs
- Check security scan results
- Monitor workflow performance

**Monthly:**
- Review and update workflows
- Audit AWS costs (ECR, CloudWatch)
- Review access controls

**Quarterly:**
- Update GitHub Actions versions
- Review and update secrets
- Disaster recovery testing

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [AWS EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [Terraform Best Practices](https://www.terraform-best-practices.com/)
- [VoiceAssist Architecture Docs](../../docs/architecture/)

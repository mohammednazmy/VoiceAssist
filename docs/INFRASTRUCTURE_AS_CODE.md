---
title: Infrastructure As Code
slug: infrastructure-as-code
summary: "1. [Overview](#overview)"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - devops
  - sre
  - ai-agents
tags:
  - infrastructure
  - code
category: deployment
component: "infra"
relatedPaths:
  - "infrastructure/terraform"
  - "infrastructure/ansible"
  - "docker-compose.yml"
ai_summary: >-
  1. Overview 2. Architecture 3. Components 4. Getting Started 5. Prerequisites
  6. Common Workflows 7. Related Documentation 8. Troubleshooting VoiceAssist V2
  uses a comprehensive Infrastructure as Code (IaC) approach to manage all
  infrastructure components. This approach provides: - Version Contro...
---

# Infrastructure as Code Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Components](#components)
4. [Getting Started](#getting-started)
5. [Prerequisites](#prerequisites)
6. [Common Workflows](#common-workflows)
7. [Related Documentation](#related-documentation)
8. [Troubleshooting](#troubleshooting)

## Overview

VoiceAssist V2 uses a comprehensive Infrastructure as Code (IaC) approach to manage all infrastructure components. This approach provides:

- **Version Control**: All infrastructure changes are tracked in Git
- **Reproducibility**: Environments can be created and destroyed consistently
- **Automation**: CI/CD pipelines automate infrastructure deployment
- **HIPAA Compliance**: Security controls are codified and enforced
- **Cost Management**: Infrastructure costs are predictable and optimized

### IaC Stack

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Actions CI/CD                     │
│  (Orchestration, Testing, Security Scanning, Deployment)    │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴──────────────┐
                │                            │
        ┌───────▼────────┐          ┌───────▼────────┐
        │   Terraform    │          │    Ansible     │
        │  (Provision)   │          │  (Configure)   │
        └───────┬────────┘          └───────┬────────┘
                │                            │
    ┌───────────┴──────────┐     ┌──────────┴───────────┐
    │                      │     │                      │
┌───▼────┐  ┌──────────┐  │  ┌──▼─────┐  ┌──────────┐ │
│  VPC   │  │   EKS    │  │  │ Common │  │ Security │ │
│        │  │          │  │  │        │  │          │ │
└────────┘  └──────────┘  │  └────────┘  └──────────┘ │
                          │                            │
┌────────┐  ┌──────────┐  │  ┌────────┐  ┌──────────┐ │
│  RDS   │  │  Redis   │  │  │ Docker │  │   K8s    │ │
│        │  │          │  │  │        │  │          │ │
└────────┘  └──────────┘  │  └────────┘  └──────────┘ │
                          │                            │
┌────────┐  ┌──────────┐  │  ┌────────┐               │
│  IAM   │  │ Security │  │  │Monitor │               │
│        │  │  Groups  │  │  │        │               │
└────────┘  └──────────┘  │  └────────┘               │
                          │                            │
        AWS Resources     │    Server Configuration    │
        └──────────────────┴────────────────────────────┘
```

## Architecture

### High-Level Architecture

VoiceAssist infrastructure is organized into three layers:

1. **Cloud Infrastructure Layer** (Terraform)
   - Network: VPC, subnets, routing, NAT gateways
   - Compute: EKS cluster, node groups
   - Data: RDS PostgreSQL, ElastiCache Redis
   - Security: IAM roles, security groups, KMS encryption
   - Monitoring: CloudWatch logs, VPC flow logs

2. **Configuration Layer** (Ansible)
   - OS hardening and security configuration
   - Docker installation and configuration
   - Kubernetes tools setup
   - Monitoring agents installation
   - HIPAA compliance settings

3. **Application Layer** (Kubernetes/Docker Compose)
   - Microservices deployment
   - Service mesh configuration
   - Application secrets management
   - Application monitoring

### Environment Structure

```
voiceassist/
├── development (dev)
│   ├── Single AZ deployment
│   ├── Reduced capacity
│   └── Cost-optimized settings
│
├── staging
│   ├── Multi-AZ deployment
│   ├── Production-like capacity
│   └── Full security controls
│
└── production
    ├── Multi-AZ high availability
    ├── Auto-scaling enabled
    └── Maximum security & compliance
```

## Components

### Terraform Modules

The infrastructure is organized into reusable Terraform modules:

| Module              | Purpose                | Key Resources                                        |
| ------------------- | ---------------------- | ---------------------------------------------------- |
| **VPC**             | Network infrastructure | VPC, subnets, NAT gateways, route tables, flow logs  |
| **EKS**             | Kubernetes cluster     | EKS cluster, node groups, IRSA, add-ons              |
| **RDS**             | PostgreSQL database    | RDS instance, subnet group, parameter group, backups |
| **ElastiCache**     | Redis cache            | Redis cluster, replication group, subnet group       |
| **IAM**             | Access control         | Service roles, policies, IRSA roles                  |
| **Security Groups** | Network security       | Security groups for EKS, RDS, Redis, ALB             |

### Ansible Roles

Server configuration is organized into Ansible roles:

| Role           | Purpose            | Key Tasks                                            |
| -------------- | ------------------ | ---------------------------------------------------- |
| **common**     | Base system setup  | Package updates, timezone, NTP, users                |
| **security**   | Security hardening | Firewall, fail2ban, SSH hardening, audit logs        |
| **docker**     | Container runtime  | Docker installation, daemon config, user permissions |
| **kubernetes** | K8s tools          | kubectl, helm, kubeconfig setup                      |
| **monitoring** | Observability      | Prometheus node exporter, log forwarding             |

### CI/CD Pipelines

GitHub Actions workflows automate the entire deployment lifecycle:

| Workflow            | Trigger       | Purpose                        |
| ------------------- | ------------- | ------------------------------ |
| **CI Pipeline**     | PR/Push       | Lint, test, security scan code |
| **Terraform Plan**  | PR to main    | Preview infrastructure changes |
| **Terraform Apply** | Merge to main | Apply infrastructure changes   |
| **Security Scan**   | PR/Push       | Scan for vulnerabilities       |
| **Build & Deploy**  | Tag/Manual    | Build images and deploy to K8s |

## Getting Started

### Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/voiceassist.git
   cd voiceassist
   ```

2. **Set up prerequisites** (see [Prerequisites](#prerequisites))

3. **Configure AWS credentials**

   ```bash
   export AWS_ACCESS_KEY_ID="your-access-key"
   export AWS_SECRET_ACCESS_KEY="your-secret-key"
   export AWS_REGION="us-east-1"
   ```

4. **Initialize Terraform**

   ```bash
   cd infrastructure/terraform
   terraform init
   ```

5. **Plan infrastructure**

   ```bash
   terraform plan -var-file="environments/dev.tfvars"
   ```

6. **Apply infrastructure**

   ```bash
   terraform apply -var-file="environments/dev.tfvars"
   ```

7. **Configure servers with Ansible**
   ```bash
   cd infrastructure/ansible
   ansible-playbook -i inventories/dev site.yml
   ```

### Environment-Specific Deployment

See detailed guides for each tool:

- [Terraform Guide](./TERRAFORM_GUIDE.md)
- [Ansible Guide](./ANSIBLE_GUIDE.md)
- [CI/CD Guide](./CICD_GUIDE.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)

## Prerequisites

### Required Tools

| Tool      | Version  | Purpose                       |
| --------- | -------- | ----------------------------- |
| Terraform | >= 1.6.0 | Infrastructure provisioning   |
| Ansible   | >= 2.15  | Server configuration          |
| AWS CLI   | >= 2.13  | AWS resource management       |
| kubectl   | >= 1.28  | Kubernetes management         |
| helm      | >= 3.12  | Kubernetes package management |
| Docker    | >= 24.0  | Container runtime             |

### Installation

**macOS (using Homebrew)**

```bash
brew install terraform ansible awscli kubectl helm docker
```

**Linux (Ubuntu/Debian)**

```bash
# Terraform
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform

# Ansible
sudo apt install ansible

# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### AWS Account Setup

1. **Create IAM user with required permissions**

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ec2:*",
           "eks:*",
           "rds:*",
           "elasticache:*",
           "iam:*",
           "s3:*",
           "dynamodb:*",
           "secretsmanager:*",
           "kms:*",
           "logs:*",
           "cloudwatch:*"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

2. **Configure AWS CLI**

   ```bash
   aws configure
   ```

3. **Create S3 bucket for Terraform state**

   ```bash
   aws s3 mb s3://voiceassist-terraform-state
   aws s3api put-bucket-versioning \
     --bucket voiceassist-terraform-state \
     --versioning-configuration Status=Enabled
   ```

4. **Create DynamoDB table for state locking**
   ```bash
   aws dynamodb create-table \
     --table-name voiceassist-terraform-locks \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
   ```

### GitHub Setup

1. **Configure repository secrets**

   Navigate to: `Settings` > `Secrets and variables` > `Actions`

   Required secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `INFRACOST_API_KEY` (optional, for cost estimation)
   - `CODECOV_TOKEN` (optional, for code coverage)

2. **Enable GitHub Actions**

   Ensure GitHub Actions is enabled in repository settings.

## Common Workflows

### Creating a New Environment

```bash
# 1. Create Terraform variables file
cp infrastructure/terraform/environments/dev.tfvars infrastructure/terraform/environments/newenv.tfvars

# 2. Edit variables for new environment
vim infrastructure/terraform/environments/newenv.tfvars

# 3. Create Ansible inventory
mkdir -p infrastructure/ansible/inventories/newenv
vim infrastructure/ansible/inventories/newenv/hosts.yml

# 4. Plan infrastructure
cd infrastructure/terraform
terraform workspace new newenv
terraform plan -var-file="environments/newenv.tfvars"

# 5. Apply infrastructure
terraform apply -var-file="environments/newenv.tfvars"

# 6. Configure servers
cd ../ansible
ansible-playbook -i inventories/newenv site.yml
```

### Updating Infrastructure

```bash
# 1. Make changes to Terraform code
vim infrastructure/terraform/main.tf

# 2. Format code
terraform fmt -recursive

# 3. Validate changes
terraform validate

# 4. Plan changes
terraform plan -var-file="environments/production.tfvars"

# 5. Apply changes (after review)
terraform apply -var-file="environments/production.tfvars"
```

### Rolling Back Changes

```bash
# Option 1: Revert Git commit and reapply
git revert <commit-hash>
terraform apply -var-file="environments/production.tfvars"

# Option 2: Use Terraform state to restore previous version
terraform state pull > backup.tfstate
# Make manual corrections
terraform state push backup.tfstate
```

### Destroying Infrastructure

```bash
# Development environment
terraform destroy -var-file="environments/dev.tfvars"

# Production environment (requires confirmation)
terraform destroy -var-file="environments/production.tfvars"
```

## Related Documentation

- [Terraform Guide](./TERRAFORM_GUIDE.md) - Detailed Terraform documentation
- [Ansible Guide](./ANSIBLE_GUIDE.md) - Detailed Ansible documentation
- [CI/CD Guide](./CICD_GUIDE.md) - CI/CD pipeline documentation
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Deployment procedures
- [Architecture](./ARCHITECTURE_V2.md) - System architecture documentation
- [Security](./SECURITY.md) - Security controls and compliance

## Troubleshooting

### Terraform Issues

**Issue: State file locked**

```
Error: Error acquiring the state lock
```

**Solution:**

```bash
# Check DynamoDB for lock
aws dynamodb get-item \
  --table-name voiceassist-terraform-locks \
  --key '{"LockID":{"S":"voiceassist/production/terraform.tfstate"}}'

# Force unlock (use with caution)
terraform force-unlock <lock-id>
```

**Issue: Provider authentication failed**

```
Error: error configuring Terraform AWS Provider: no valid credential sources
```

**Solution:**

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Re-configure if needed
aws configure
```

### Ansible Issues

**Issue: SSH connection failed**

```
fatal: [host]: UNREACHABLE! => {"msg": "Failed to connect to the host"}
```

**Solution:**

```bash
# Test SSH connectivity
ssh -i ~/.ssh/id_rsa ubuntu@<host-ip>

# Verify SSH key permissions
chmod 600 ~/.ssh/id_rsa

# Check Ansible inventory
ansible-inventory -i inventories/dev --list
```

**Issue: Permission denied**

```
fatal: [host]: FAILED! => {"msg": "Missing sudo password"}
```

**Solution:**

```bash
# Use --ask-become-pass flag
ansible-playbook -i inventories/dev site.yml --ask-become-pass

# Or configure passwordless sudo on target hosts
```

### CI/CD Issues

**Issue: Workflow fails with permission error**

```
Error: The workflow is not permitted to access the repository
```

**Solution:**

1. Check GitHub Actions permissions: `Settings` > `Actions` > `General`
2. Enable "Read and write permissions"
3. Re-run workflow

**Issue: AWS credentials invalid in Actions**

```
Error: The security token included in the request is invalid
```

**Solution:**

1. Verify secrets: `Settings` > `Secrets and variables` > `Actions`
2. Update `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
3. Ensure IAM user has required permissions

### Getting Help

1. **Check logs**

   ```bash
   # Terraform logs
   TF_LOG=DEBUG terraform apply

   # Ansible logs
   ansible-playbook -vvv site.yml

   # GitHub Actions logs
   # Available in Actions tab of repository
   ```

2. **Review documentation**
   - [Terraform Documentation](https://www.terraform.io/docs)
   - [Ansible Documentation](https://docs.ansible.com)
   - [AWS Documentation](https://docs.aws.amazon.com)

3. **Contact team**
   - Create issue in GitHub repository
   - Contact DevOps team via Slack

## Best Practices

1. **Always use workspaces for different environments**
2. **Store sensitive data in AWS Secrets Manager**
3. **Use remote state backend (S3) for collaboration**
4. **Enable state locking with DynamoDB**
5. **Tag all resources consistently**
6. **Use pre-commit hooks for code quality**
7. **Review Terraform plans before applying**
8. **Test infrastructure changes in dev/staging first**
9. **Document all infrastructure changes in commit messages**
10. **Use version constraints for providers and modules**

---

**Last Updated**: 2025-11-21
**Version**: 2.0
**Maintainer**: DevOps Team

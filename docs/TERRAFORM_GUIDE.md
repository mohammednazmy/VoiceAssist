---
title: Terraform Guide
slug: terraform-guide
summary: "1. [Overview](#overview)"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - frontend
  - ai-agents
tags:
  - terraform
  - guide
category: deployment
ai_summary: >-
  1. Overview 2. Directory Structure 3. Module Documentation 4. Variables
  Reference 5. Outputs Reference 6. State Management 7. Multi-Environment Setup
  8. Best Practices 9. Common Operations 10. Troubleshooting VoiceAssist uses
  Terraform to provision and manage all AWS infrastructure. The configura...
---

# Terraform Guide

## Table of Contents

1. [Overview](#overview)
2. [Directory Structure](#directory-structure)
3. [Module Documentation](#module-documentation)
4. [Variables Reference](#variables-reference)
5. [Outputs Reference](#outputs-reference)
6. [State Management](#state-management)
7. [Multi-Environment Setup](#multi-environment-setup)
8. [Best Practices](#best-practices)
9. [Common Operations](#common-operations)
10. [Troubleshooting](#troubleshooting)

## Overview

VoiceAssist uses Terraform to provision and manage all AWS infrastructure. The configuration is modular, reusable, and follows AWS best practices for HIPAA compliance.

### Key Features

- **Modular Architecture**: Reusable modules for VPC, EKS, RDS, etc.
- **Multi-Environment**: Separate state and configuration for dev/staging/prod
- **HIPAA Compliant**: Encryption at rest and in transit, audit logging
- **High Availability**: Multi-AZ deployment with automatic failover
- **Auto-Scaling**: Dynamic scaling based on demand
- **Cost Optimized**: Right-sized resources with auto-scaling

### Terraform Version

```hcl
terraform {
  required_version = ">= 1.6.0"
}
```

## Directory Structure

```
infrastructure/terraform/
├── main.tf                      # Main configuration orchestrating modules
├── providers.tf                 # Provider configurations (AWS, K8s, Helm)
├── variables.tf                 # Global variable definitions
├── outputs.tf                   # Output definitions
├── terraform.tfvars.example     # Example variables file
├── backend.tf                   # Remote state configuration
│
├── environments/                # Environment-specific variables
│   ├── dev.tfvars              # Development environment
│   ├── staging.tfvars          # Staging environment
│   └── production.tfvars       # Production environment
│
└── modules/                     # Reusable Terraform modules
    ├── vpc/                    # VPC and networking
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    │
    ├── eks/                    # EKS cluster
    │   ├── main.tf
    │   ├── variables.tf
    │   ├── outputs.tf
    │   └── user_data.sh
    │
    ├── rds/                    # PostgreSQL database
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    │
    ├── elasticache/            # Redis cache
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    │
    ├── iam/                    # IAM roles and policies
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    │
    └── security-groups/        # Security groups
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

## Module Documentation

### VPC Module

Creates a complete VPC with public, private, and database subnets across multiple availability zones.

**Resources Created:**

- VPC with DNS support and hostnames enabled
- 3 public subnets (internet-facing)
- 3 private subnets (application tier)
- 3 database subnets (data tier)
- Internet Gateway
- NAT Gateways (1 or 3, depending on environment)
- Route tables and associations
- VPC Flow Logs to CloudWatch

**Usage Example:**

```hcl
module "vpc" {
  source = "./modules/vpc"

  name_prefix            = "voiceassist-prod"
  vpc_cidr               = "10.0.0.0/16"
  availability_zones     = ["us-east-1a", "us-east-1b", "us-east-1c"]
  public_subnet_cidrs    = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnet_cidrs   = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
  database_subnet_cidrs  = ["10.0.20.0/24", "10.0.21.0/24", "10.0.22.0/24"]
  enable_nat_gateway     = true
  single_nat_gateway     = false  # Use 3 NAT gateways for HA
  enable_flow_logs       = true
  flow_logs_retention    = 90

  tags = {
    Environment = "production"
    HIPAA       = "true"
  }
}
```

**Key Outputs:**

- `vpc_id`: VPC identifier
- `public_subnet_ids`: List of public subnet IDs
- `private_subnet_ids`: List of private subnet IDs
- `database_subnet_ids`: List of database subnet IDs

### EKS Module

Creates a production-ready EKS cluster with managed node groups.

**Resources Created:**

- EKS Cluster with encryption enabled
- Managed Node Group with auto-scaling
- IRSA (IAM Roles for Service Accounts) enabled
- CloudWatch log groups for cluster logs
- Cluster security group
- Node security group
- OIDC provider for IRSA

**Usage Example:**

```hcl
module "eks" {
  source = "./modules/eks"

  name_prefix               = "voiceassist-prod"
  cluster_version           = "1.28"
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  cluster_security_group_id = module.security_groups.eks_cluster_sg_id
  node_security_group_id    = module.security_groups.eks_node_sg_id

  node_instance_types  = ["t3.large", "t3.xlarge"]
  node_desired_size    = 3
  node_min_size        = 2
  node_max_size        = 10

  enable_irsa               = true
  enable_cluster_encryption = true
  log_retention_days        = 90

  tags = {
    Environment = "production"
  }
}
```

**Key Outputs:**

- `cluster_id`: EKS cluster ID
- `cluster_endpoint`: EKS cluster API endpoint
- `cluster_name`: EKS cluster name
- `cluster_certificate_authority_data`: CA certificate for cluster

### RDS Module

Creates a highly available PostgreSQL database with encryption and automated backups.

**Resources Created:**

- RDS PostgreSQL instance
- DB subnet group
- DB parameter group (optimized for VoiceAssist)
- Automated backups with PITR
- Enhanced monitoring
- Performance Insights
- CloudWatch log exports
- KMS encryption key

**Usage Example:**

```hcl
module "rds" {
  source = "./modules/rds"

  name_prefix             = "voiceassist-prod"
  vpc_id                  = module.vpc.vpc_id
  database_subnet_ids     = module.vpc.database_subnet_ids
  security_group_id       = module.security_groups.rds_sg_id

  instance_class          = "db.r6g.xlarge"
  allocated_storage       = 100
  max_allocated_storage   = 500
  engine_version          = "16.1"

  backup_retention_period = 90
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  multi_az                = true
  storage_encrypted       = true
  deletion_protection     = true

  enable_performance_insights        = true
  performance_insights_retention     = 90
  enable_cloudwatch_logs             = true
  log_retention_days                 = 90

  tags = {
    Environment = "production"
  }
}
```

**Key Outputs:**

- `db_instance_id`: Database instance identifier
- `db_instance_address`: Database endpoint address
- `db_instance_port`: Database port
- `db_instance_arn`: Database ARN

### ElastiCache Module

Creates a Redis cluster with replication and automatic failover.

**Resources Created:**

- ElastiCache Redis replication group
- Cache subnet group
- Redis parameter group
- Automatic failover configuration
- At-rest encryption
- In-transit encryption
- Automated backups

**Usage Example:**

```hcl
module "elasticache" {
  source = "./modules/elasticache"

  name_prefix          = "voiceassist-prod"
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  security_group_id    = module.security_groups.redis_sg_id

  node_type            = "cache.r6g.large"
  num_cache_nodes      = 2
  engine_version       = "7.0"

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  snapshot_retention_limit   = 90
  snapshot_window            = "03:00-04:00"
  maintenance_window         = "sun:04:00-sun:05:00"

  automatic_failover_enabled = true

  tags = {
    Environment = "production"
  }
}
```

**Key Outputs:**

- `redis_cluster_id`: Redis cluster identifier
- `redis_endpoint_address`: Primary endpoint address
- `redis_endpoint_port`: Redis port
- `redis_reader_endpoint_address`: Reader endpoint for read replicas

### IAM Module

Creates IAM roles and policies for EKS and application services.

**Resources Created:**

- EKS cluster role
- EKS node group role
- IRSA roles for application pods
- Service-specific policies
- Trust relationships

**Usage Example:**

```hcl
module "iam" {
  source = "./modules/iam"

  name_prefix  = "voiceassist-prod"
  environment  = "production"

  tags = {
    Environment = "production"
  }
}
```

**Key Outputs:**

- `eks_cluster_role_arn`: EKS cluster IAM role ARN
- `eks_node_role_arn`: EKS node IAM role ARN
- `eks_node_role_name`: EKS node IAM role name

### Security Groups Module

Creates security groups with least-privilege access rules.

**Resources Created:**

- EKS cluster security group
- EKS node security group
- RDS security group
- Redis security group
- ALB security group

**Usage Example:**

```hcl
module "security_groups" {
  source = "./modules/security-groups"

  name_prefix          = "voiceassist-prod"
  vpc_id               = module.vpc.vpc_id
  vpc_cidr             = "10.0.0.0/16"
  allowed_cidr_blocks  = ["10.0.0.0/16"]

  tags = {
    Environment = "production"
  }
}
```

**Key Outputs:**

- `eks_cluster_sg_id`: EKS cluster security group ID
- `eks_node_sg_id`: EKS node security group ID
- `rds_sg_id`: RDS security group ID
- `redis_sg_id`: Redis security group ID

## Variables Reference

### Environment Variables

| Variable       | Type   | Default     | Description                               |
| -------------- | ------ | ----------- | ----------------------------------------- |
| `environment`  | string | -           | Environment name (dev/staging/production) |
| `aws_region`   | string | us-east-1   | AWS region                                |
| `project_name` | string | voiceassist | Project name for resource naming          |

### Network Variables

| Variable                | Type         | Default                              | Description           |
| ----------------------- | ------------ | ------------------------------------ | --------------------- |
| `vpc_cidr`              | string       | 10.0.0.0/16                          | VPC CIDR block        |
| `availability_zones`    | list(string) | [us-east-1a, us-east-1b, us-east-1c] | AZs for resources     |
| `public_subnet_cidrs`   | list(string) | [10.0.1.0/24, ...]                   | Public subnet CIDRs   |
| `private_subnet_cidrs`  | list(string) | [10.0.10.0/24, ...]                  | Private subnet CIDRs  |
| `database_subnet_cidrs` | list(string) | [10.0.20.0/24, ...]                  | Database subnet CIDRs |

### EKS Variables

| Variable                  | Type         | Default               | Description             |
| ------------------------- | ------------ | --------------------- | ----------------------- |
| `eks_cluster_version`     | string       | 1.28                  | Kubernetes version      |
| `eks_node_instance_types` | list(string) | [t3.large, t3.xlarge] | Node instance types     |
| `eks_node_desired_size`   | number       | 3                     | Desired number of nodes |
| `eks_node_min_size`       | number       | 2                     | Minimum number of nodes |
| `eks_node_max_size`       | number       | 10                    | Maximum number of nodes |

### RDS Variables

| Variable                    | Type   | Default     | Description                       |
| --------------------------- | ------ | ----------- | --------------------------------- |
| `rds_instance_class`        | string | db.t3.large | RDS instance type                 |
| `rds_allocated_storage`     | number | 100         | Allocated storage (GB)            |
| `rds_max_allocated_storage` | number | 500         | Max storage for autoscaling (GB)  |
| `rds_engine_version`        | string | 16.1        | PostgreSQL version                |
| `rds_backup_retention_days` | number | 90          | Backup retention (HIPAA: 90 days) |
| `rds_multi_az`              | bool   | true        | Enable multi-AZ deployment        |

### Redis Variables

| Variable                | Type   | Default         | Description           |
| ----------------------- | ------ | --------------- | --------------------- |
| `redis_node_type`       | string | cache.t3.medium | ElastiCache node type |
| `redis_num_cache_nodes` | number | 2               | Number of cache nodes |
| `redis_engine_version`  | string | 7.0             | Redis version         |

### Security Variables

| Variable                       | Type         | Default     | Description                                   |
| ------------------------------ | ------------ | ----------- | --------------------------------------------- |
| `enable_encryption_at_rest`    | bool         | true        | Enable encryption at rest (HIPAA required)    |
| `enable_encryption_in_transit` | bool         | true        | Enable encryption in transit (HIPAA required) |
| `allowed_cidr_blocks`          | list(string) | [0.0.0.0/0] | Allowed CIDR blocks                           |
| `enable_deletion_protection`   | bool         | true        | Enable deletion protection                    |

### Monitoring Variables

| Variable                 | Type   | Default | Description                            |
| ------------------------ | ------ | ------- | -------------------------------------- |
| `enable_cloudwatch_logs` | bool   | true    | Enable CloudWatch logs                 |
| `log_retention_days`     | number | 90      | Log retention (HIPAA: 90 days minimum) |

## Outputs Reference

### VPC Outputs

```hcl
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}
```

### EKS Outputs

```hcl
output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}
```

### Database Outputs

```hcl
output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.db_instance_address
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.elasticache.redis_endpoint_address
}
```

## State Management

### S3 Backend Configuration

VoiceAssist uses S3 for remote state storage with DynamoDB for state locking.

**Backend Configuration** (`backend.tf`):

```hcl
terraform {
  backend "s3" {
    bucket         = "voiceassist-terraform-state"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "voiceassist-terraform-locks"

    # Optional: Enable versioning for state file recovery
    versioning     = true
  }
}
```

### Setting Up State Backend

```bash
# Create S3 bucket
aws s3 mb s3://voiceassist-terraform-state --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket voiceassist-terraform-state \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket voiceassist-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket voiceassist-terraform-state \
  --public-access-block-configuration \
    BlockPublicAcls=true,\
    IgnorePublicAcls=true,\
    BlockPublicPolicy=true,\
    RestrictPublicBuckets=true

# Create DynamoDB table for locking
aws dynamodb create-table \
  --table-name voiceassist-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### Migrating to Remote State

```bash
# Initialize with remote backend
terraform init -migrate-state

# Verify state migration
terraform state list
```

## Multi-Environment Setup

### Using Workspaces

```bash
# Create workspaces for each environment
terraform workspace new dev
terraform workspace new staging
terraform workspace new production

# List workspaces
terraform workspace list

# Switch workspace
terraform workspace select production

# Show current workspace
terraform workspace show
```

### Environment-Specific Variables

Create separate `.tfvars` files for each environment:

**`environments/dev.tfvars`**

```hcl
environment = "dev"
aws_region  = "us-east-1"

# Reduced capacity for dev
eks_node_desired_size = 1
eks_node_min_size     = 1
eks_node_max_size     = 3

# Smaller instances
rds_instance_class = "db.t3.medium"
redis_node_type    = "cache.t3.micro"

# Single AZ for cost savings
rds_multi_az = false

# Shorter retention for dev
rds_backup_retention_days = 7
log_retention_days        = 7
```

**`environments/production.tfvars`**

```hcl
environment = "production"
aws_region  = "us-east-1"

# Full capacity for production
eks_node_desired_size = 3
eks_node_min_size     = 2
eks_node_max_size     = 10

# Production-grade instances
rds_instance_class = "db.r6g.xlarge"
redis_node_type    = "cache.r6g.large"

# Multi-AZ for HA
rds_multi_az = true

# HIPAA-compliant retention
rds_backup_retention_days = 90
log_retention_days        = 90

# Enable protection
enable_deletion_protection = true
```

### Applying Environment-Specific Configuration

```bash
# Development
terraform workspace select dev
terraform plan -var-file="environments/dev.tfvars"
terraform apply -var-file="environments/dev.tfvars"

# Staging
terraform workspace select staging
terraform plan -var-file="environments/staging.tfvars"
terraform apply -var-file="environments/staging.tfvars"

# Production
terraform workspace select production
terraform plan -var-file="environments/production.tfvars"
terraform apply -var-file="environments/production.tfvars"
```

## Best Practices

### 1. Code Organization

- Use modules for reusable components
- Keep modules focused and single-purpose
- Document module inputs and outputs
- Use semantic versioning for modules

### 2. Variable Management

- Use `.tfvars` files for environment-specific values
- Never commit sensitive values to Git
- Use AWS Secrets Manager for secrets
- Provide sensible defaults for optional variables

### 3. State Management

- Always use remote state for team collaboration
- Enable state locking with DynamoDB
- Enable S3 versioning for state recovery
- Never manually edit state files

### 4. Security

- Enable encryption at rest and in transit
- Use least-privilege IAM policies
- Enable audit logging (CloudTrail, VPC Flow Logs)
- Tag resources for compliance tracking

### 5. Testing

- Always run `terraform plan` before `apply`
- Test infrastructure changes in dev first
- Use `terraform validate` to catch errors early
- Review plan output carefully

### 6. Version Control

- Pin provider versions
- Use version constraints for modules
- Commit `.terraform.lock.hcl` to Git
- Document breaking changes

### 7. Cost Optimization

- Right-size resources based on usage
- Use spot instances for non-critical workloads
- Enable auto-scaling
- Review and optimize regularly

## Common Operations

### Initialize Terraform

```bash
cd infrastructure/terraform

# Initialize with backend
terraform init

# Initialize with backend configuration
terraform init \
  -backend-config="key=voiceassist/production/terraform.tfstate"

# Upgrade providers
terraform init -upgrade
```

### Format and Validate

```bash
# Format all .tf files
terraform fmt -recursive

# Check formatting
terraform fmt -check -recursive

# Validate configuration
terraform validate
```

### Plan Changes

```bash
# Basic plan
terraform plan -var-file="environments/production.tfvars"

# Save plan to file
terraform plan \
  -var-file="environments/production.tfvars" \
  -out=production.tfplan

# Plan with specific target
terraform plan \
  -var-file="environments/production.tfvars" \
  -target=module.rds
```

### Apply Changes

```bash
# Apply with saved plan
terraform apply production.tfplan

# Apply with auto-approve (use with caution)
terraform apply \
  -var-file="environments/production.tfvars" \
  -auto-approve

# Apply specific resource
terraform apply \
  -var-file="environments/production.tfvars" \
  -target=module.eks
```

### Destroy Resources

```bash
# Destroy all resources
terraform destroy -var-file="environments/dev.tfvars"

# Destroy specific resource
terraform destroy \
  -var-file="environments/dev.tfvars" \
  -target=module.elasticache

# Destroy with auto-approve (use with extreme caution)
terraform destroy \
  -var-file="environments/dev.tfvars" \
  -auto-approve
```

### Import Existing Resources

```bash
# Import VPC
terraform import \
  -var-file="environments/production.tfvars" \
  module.vpc.aws_vpc.main \
  vpc-0123456789abcdef

# Import EKS cluster
terraform import \
  -var-file="environments/production.tfvars" \
  module.eks.aws_eks_cluster.main \
  voiceassist-prod-cluster
```

### State Operations

```bash
# List all resources
terraform state list

# Show specific resource
terraform state show module.rds.aws_db_instance.main

# Move resource
terraform state mv \
  module.old_module.aws_instance.example \
  module.new_module.aws_instance.example

# Remove resource from state
terraform state rm module.example.aws_instance.old

# Pull state
terraform state pull > state-backup.json

# Push state (use with extreme caution)
terraform state push state-backup.json
```

### Output Values

```bash
# Show all outputs
terraform output

# Show specific output
terraform output eks_cluster_endpoint

# Output in JSON format
terraform output -json > outputs.json
```

### Refresh State

```bash
# Refresh state from AWS
terraform refresh -var-file="environments/production.tfvars"
```

## Troubleshooting

### Common Issues

#### Issue: State Lock Error

**Error:**

```
Error: Error acquiring the state lock
```

**Solution:**

```bash
# Check who has the lock
aws dynamodb get-item \
  --table-name voiceassist-terraform-locks \
  --key '{"LockID":{"S":"voiceassist-terraform-state/production/terraform.tfstate-md5"}}'

# Force unlock (only if you're sure no one is using it)
terraform force-unlock <lock-id>
```

#### Issue: Provider Authentication Failed

**Error:**

```
Error: error configuring Terraform AWS Provider
```

**Solution:**

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Set credentials explicitly
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"
```

#### Issue: Module Not Found

**Error:**

```
Error: Module not installed
```

**Solution:**

```bash
# Reinitialize to download modules
terraform init -upgrade
```

#### Issue: Resource Already Exists

**Error:**

```
Error: resource already exists
```

**Solution:**

```bash
# Import existing resource
terraform import module.example.aws_instance.main i-1234567890abcdef

# Or remove from state and re-create
terraform state rm module.example.aws_instance.main
terraform apply
```

#### Issue: Dependency Cycle

**Error:**

```
Error: Cycle: module.a, module.b
```

**Solution:**

- Review resource dependencies
- Remove circular references
- Use `depends_on` explicitly if needed

### Debugging

```bash
# Enable debug logging
export TF_LOG=DEBUG
terraform apply

# Save logs to file
export TF_LOG=DEBUG
export TF_LOG_PATH=./terraform-debug.log
terraform apply

# Disable logging
unset TF_LOG
unset TF_LOG_PATH
```

### Getting Help

1. **Review Terraform Documentation**
   - [Terraform CLI Commands](https://www.terraform.io/cli/commands)
   - [AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

2. **Check VoiceAssist Documentation**
   - [Infrastructure as Code Guide](./INFRASTRUCTURE_AS_CODE.md)
   - [Deployment Guide](./DEPLOYMENT_GUIDE.md)

3. **Contact Team**
   - Create issue in GitHub repository
   - Contact DevOps team

---

**Last Updated**: 2025-11-21
**Version**: 2.0
**Maintainer**: DevOps Team

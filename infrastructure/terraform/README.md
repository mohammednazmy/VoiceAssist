# VoiceAssist Terraform Configuration

Infrastructure as Code for VoiceAssist V2 using Terraform.

## Quick Start

### Prerequisites

- Terraform >= 1.6.0
- AWS CLI configured with appropriate credentials
- S3 bucket for state storage
- DynamoDB table for state locking

### Initialize

```bash
# Initialize Terraform
terraform init

# Or with specific backend configuration
terraform init -backend-config="key=voiceassist/dev/terraform.tfstate"
```

### Plan Changes

```bash
# Development
terraform plan -var-file="environments/dev.tfvars"

# Staging
terraform plan -var-file="environments/staging.tfvars"

# Production
terraform plan -var-file="environments/production.tfvars"
```

### Apply Changes

```bash
# Development
terraform apply -var-file="environments/dev.tfvars"

# Production (with auto-approve for CI/CD)
terraform apply -var-file="environments/production.tfvars" -auto-approve
```

## Directory Structure

```
terraform/
├── main.tf                      # Main configuration
├── providers.tf                 # Provider setup
├── variables.tf                 # Variable definitions
├── outputs.tf                   # Output definitions
├── backend.tf                   # State backend configuration
│
├── environments/                # Environment-specific variables
│   ├── dev.tfvars              # Development
│   ├── staging.tfvars          # Staging
│   └── production.tfvars       # Production
│
└── modules/                     # Reusable modules
    ├── vpc/                    # Network infrastructure
    ├── eks/                    # Kubernetes cluster
    ├── rds/                    # PostgreSQL database
    ├── elasticache/            # Redis cache
    ├── iam/                    # IAM roles and policies
    └── security-groups/        # Security groups
```

## Modules

### VPC Module

Creates complete network infrastructure with public, private, and database subnets.

**Usage:**

```hcl
module "vpc" {
  source = "./modules/vpc"

  name_prefix           = "voiceassist-prod"
  vpc_cidr              = "10.0.0.0/16"
  availability_zones    = ["us-east-1a", "us-east-1b", "us-east-1c"]
  enable_nat_gateway    = true
  enable_flow_logs      = true
}
```

**Outputs:**

- `vpc_id` - VPC identifier
- `public_subnet_ids` - Public subnet IDs
- `private_subnet_ids` - Private subnet IDs
- `database_subnet_ids` - Database subnet IDs

### EKS Module

Creates production-ready Kubernetes cluster.

**Usage:**

```hcl
module "eks" {
  source = "./modules/eks"

  name_prefix        = "voiceassist-prod"
  cluster_version    = "1.28"
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  node_desired_size  = 3
  node_min_size      = 2
  node_max_size      = 10
}
```

**Outputs:**

- `cluster_id` - EKS cluster ID
- `cluster_endpoint` - Cluster API endpoint
- `cluster_name` - Cluster name

### RDS Module

Creates PostgreSQL database with encryption and backups.

**Usage:**

```hcl
module "rds" {
  source = "./modules/rds"

  name_prefix          = "voiceassist-prod"
  vpc_id               = module.vpc.vpc_id
  database_subnet_ids  = module.vpc.database_subnet_ids

  instance_class       = "db.r6g.xlarge"
  multi_az             = true
  storage_encrypted    = true
}
```

**Outputs:**

- `db_instance_address` - Database endpoint
- `db_instance_port` - Database port

### ElastiCache Module

Creates Redis cluster with replication.

**Usage:**

```hcl
module "elasticache" {
  source = "./modules/elasticache"

  name_prefix         = "voiceassist-prod"
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids

  node_type           = "cache.r6g.large"
  num_cache_nodes     = 2
}
```

**Outputs:**

- `redis_endpoint_address` - Redis primary endpoint
- `redis_endpoint_port` - Redis port

## Environment Configuration

### Development

Optimized for cost with single AZ deployment:

```hcl
environment = "dev"

eks_node_desired_size = 1
eks_node_min_size     = 1
eks_node_max_size     = 3

rds_instance_class = "db.t3.medium"
rds_multi_az       = false

redis_node_type    = "cache.t3.micro"
```

### Staging

Production-like with full features:

```hcl
environment = "staging"

eks_node_desired_size = 2
eks_node_min_size     = 2
eks_node_max_size     = 6

rds_instance_class = "db.r6g.large"
rds_multi_az       = true

redis_node_type    = "cache.r6g.medium"
```

### Production

Full scale with high availability:

```hcl
environment = "production"

eks_node_desired_size = 3
eks_node_min_size     = 2
eks_node_max_size     = 10

rds_instance_class = "db.r6g.xlarge"
rds_multi_az       = true

redis_node_type    = "cache.r6g.large"

enable_deletion_protection = true
```

## Common Commands

### Initialize and Validate

```bash
# Initialize
terraform init

# Validate configuration
terraform validate

# Format code
terraform fmt -recursive
```

### Plan and Apply

```bash
# Plan with variable file
terraform plan -var-file="environments/production.tfvars"

# Save plan to file
terraform plan -var-file="environments/production.tfvars" -out=production.tfplan

# Apply saved plan
terraform apply production.tfplan

# Apply with auto-approve
terraform apply -var-file="environments/production.tfvars" -auto-approve
```

### State Management

```bash
# List resources
terraform state list

# Show resource details
terraform state show module.eks.aws_eks_cluster.main

# Pull state
terraform state pull > state-backup.json

# Refresh state
terraform refresh -var-file="environments/production.tfvars"
```

### Workspaces

```bash
# Create workspace
terraform workspace new production

# List workspaces
terraform workspace list

# Switch workspace
terraform workspace select production

# Show current workspace
terraform workspace show
```

### Outputs

```bash
# Show all outputs
terraform output

# Show specific output
terraform output eks_cluster_endpoint

# Output as JSON
terraform output -json > outputs.json
```

### Destroy

```bash
# Destroy all resources
terraform destroy -var-file="environments/dev.tfvars"

# Destroy specific resource
terraform destroy -target=module.elasticache -var-file="environments/dev.tfvars"
```

## Examples

### Deploy New Environment

```bash
# 1. Create workspace
terraform workspace new staging

# 2. Initialize
terraform init

# 3. Plan
terraform plan -var-file="environments/staging.tfvars"

# 4. Apply
terraform apply -var-file="environments/staging.tfvars"

# 5. Get outputs
terraform output -json > staging-outputs.json
```

### Update EKS Node Size

```bash
# Edit environment file
vim environments/production.tfvars
# Update: eks_node_desired_size = 5

# Plan changes
terraform plan -var-file="environments/production.tfvars"

# Apply if looks good
terraform apply -var-file="environments/production.tfvars"
```

### Import Existing Resource

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

### Rotate RDS Password

```bash
# Taint secret resource
terraform taint random_password.rds_password

# Apply to rotate
terraform apply -var-file="environments/production.tfvars"

# Update application secrets
kubectl delete secret db-credentials -n voiceassist
kubectl create secret generic db-credentials \
  --from-literal=password=$(terraform output -raw rds_password) \
  -n voiceassist
```

## Troubleshooting

### State Lock

If state is locked:

```bash
# Check lock in DynamoDB
aws dynamodb get-item \
  --table-name voiceassist-terraform-locks \
  --key '{"LockID":{"S":"voiceassist-terraform-state/production/terraform.tfstate-md5"}}'

# Force unlock (use with caution)
terraform force-unlock <lock-id>
```

### Authentication Failed

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Configure AWS CLI
aws configure

# Use specific profile
export AWS_PROFILE=voiceassist-admin
```

### Resource Already Exists

```bash
# Import existing resource
terraform import <resource-address> <resource-id>

# Or remove from state and recreate
terraform state rm <resource-address>
terraform apply
```

## Best Practices

1. **Always run `terraform plan` before `apply`**
2. **Use workspaces for different environments**
3. **Store sensitive values in AWS Secrets Manager**
4. **Enable remote state with S3 backend**
5. **Use version constraints for providers**
6. **Tag all resources consistently**
7. **Test changes in dev/staging first**
8. **Review plan output carefully**
9. **Keep modules small and focused**
10. **Document variables and outputs**

## Additional Resources

- [Terraform Documentation](https://www.terraform.io/docs)
- [AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [VoiceAssist Terraform Guide](../../docs/TERRAFORM_GUIDE.md)
- [Infrastructure as Code Guide](../../docs/INFRASTRUCTURE_AS_CODE.md)

## Support

For issues or questions:

- Create GitHub issue
- Contact DevOps team
- Check [Troubleshooting Guide](../../docs/TERRAFORM_GUIDE.md#troubleshooting)

---

**Last Updated**: 2025-11-21
**Maintainer**: DevOps Team

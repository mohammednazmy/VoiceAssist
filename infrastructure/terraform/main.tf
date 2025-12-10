# VoiceAssist V2 - Main Terraform Configuration
# Phase 9: Infrastructure as Code
#
# Orchestrates all infrastructure modules

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "Terraform"
      HIPAA       = "true"
    }
  )
}

# ===================================
# VPC Module
# ===================================

module "vpc" {
  source = "./modules/vpc"

  name_prefix           = local.name_prefix
  vpc_cidr              = var.vpc_cidr
  availability_zones    = var.availability_zones
  public_subnet_cidrs   = var.public_subnet_cidrs
  private_subnet_cidrs  = var.private_subnet_cidrs
  database_subnet_cidrs = var.database_subnet_cidrs
  enable_nat_gateway    = true
  single_nat_gateway    = var.environment == "dev" ? true : false
  enable_dns_hostnames  = true
  enable_dns_support    = true
  enable_flow_logs      = true
  flow_logs_retention   = var.log_retention_days

  tags = local.common_tags
}

# ===================================
# Security Groups Module
# ===================================

module "security_groups" {
  source = "./modules/security-groups"

  name_prefix         = local.name_prefix
  vpc_id              = module.vpc.vpc_id
  vpc_cidr            = var.vpc_cidr
  allowed_cidr_blocks = var.allowed_cidr_blocks

  tags = local.common_tags
}

# ===================================
# IAM Module
# ===================================

module "iam" {
  source = "./modules/iam"

  name_prefix = local.name_prefix
  environment = var.environment

  tags = local.common_tags
}

# ===================================
# EKS Module
# ===================================

module "eks" {
  source = "./modules/eks"

  name_prefix               = local.name_prefix
  cluster_version           = var.eks_cluster_version
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  cluster_security_group_id = module.security_groups.eks_cluster_sg_id
  node_security_group_id    = module.security_groups.eks_node_sg_id

  node_instance_types = var.eks_node_instance_types
  node_desired_size   = var.eks_node_desired_size
  node_min_size       = var.eks_node_min_size
  node_max_size       = var.eks_node_max_size

  enable_irsa               = true
  enable_cluster_encryption = var.enable_encryption_at_rest
  log_retention_days        = var.log_retention_days

  tags = local.common_tags
}

# ===================================
# RDS Module
# ===================================

module "rds" {
  source = "./modules/rds"

  name_prefix         = local.name_prefix
  vpc_id              = module.vpc.vpc_id
  database_subnet_ids = module.vpc.database_subnet_ids
  security_group_id   = module.security_groups.rds_sg_id

  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  engine_version        = var.rds_engine_version

  backup_retention_period = var.rds_backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  multi_az            = var.rds_multi_az
  storage_encrypted   = var.enable_encryption_at_rest
  deletion_protection = var.enable_deletion_protection

  enable_performance_insights    = true
  performance_insights_retention = var.log_retention_days

  enable_cloudwatch_logs = var.enable_cloudwatch_logs
  log_retention_days     = var.log_retention_days

  tags = local.common_tags
}

# ===================================
# ElastiCache Module (Redis)
# ===================================

module "elasticache" {
  source = "./modules/elasticache"

  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_id  = module.security_groups.redis_sg_id

  node_type       = var.redis_node_type
  num_cache_nodes = var.redis_num_cache_nodes
  engine_version  = var.redis_engine_version

  at_rest_encryption_enabled = var.enable_encryption_at_rest
  transit_encryption_enabled = var.enable_encryption_in_transit

  snapshot_retention_limit = var.rds_backup_retention_days
  snapshot_window          = "03:00-04:00"
  maintenance_window       = "sun:04:00-sun:05:00"

  automatic_failover_enabled = var.environment != "dev"

  tags = local.common_tags
}

# ===================================
# Secrets Manager for Database Credentials
# ===================================

resource "random_password" "rds_password" {
  length  = 32
  special = true
}

resource "random_password" "redis_auth_token" {
  length  = 64
  special = false # Redis AUTH tokens can't have special chars
}

resource "aws_secretsmanager_secret" "rds_credentials" {
  name                    = "${local.name_prefix}-rds-credentials"
  description             = "RDS PostgreSQL credentials for VoiceAssist"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = aws_secretsmanager_secret.rds_credentials.id
  secret_string = jsonencode({
    username = "voiceassist_admin"
    password = random_password.rds_password.result
    host     = module.rds.db_instance_address
    port     = module.rds.db_instance_port
    database = "voiceassist"
  })
}

resource "aws_secretsmanager_secret" "redis_auth" {
  name                    = "${local.name_prefix}-redis-auth"
  description             = "Redis AUTH token for VoiceAssist"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id = aws_secretsmanager_secret.redis_auth.id
  secret_string = jsonencode({
    auth_token = random_password.redis_auth_token.result
    host       = module.elasticache.redis_endpoint_address
    port       = module.elasticache.redis_endpoint_port
  })
}

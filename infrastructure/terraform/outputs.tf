# VoiceAssist V2 - Terraform Outputs
# Phase 9: Infrastructure as Code
#
# Output values for use by other systems

# ===================================
# VPC Outputs
# ===================================

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = module.vpc.vpc_cidr
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "database_subnet_ids" {
  description = "Database subnet IDs"
  value       = module.vpc.database_subnet_ids
}

# ===================================
# EKS Outputs
# ===================================

output "eks_cluster_id" {
  description = "EKS cluster ID"
  value       = module.eks.cluster_id
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_version" {
  description = "EKS cluster Kubernetes version"
  value       = module.eks.cluster_version
}

output "eks_oidc_provider_arn" {
  description = "ARN of the OIDC Provider for EKS"
  value       = module.eks.oidc_provider_arn
}

output "eks_node_group_id" {
  description = "EKS node group ID"
  value       = module.eks.node_group_id
}

# ===================================
# RDS Outputs
# ===================================

output "rds_instance_id" {
  description = "RDS instance ID"
  value       = module.rds.db_instance_id
}

output "rds_instance_address" {
  description = "RDS instance address"
  value       = module.rds.db_instance_address
  sensitive   = true
}

output "rds_instance_port" {
  description = "RDS instance port"
  value       = module.rds.db_instance_port
}

output "rds_instance_endpoint" {
  description = "RDS instance endpoint"
  value       = module.rds.db_instance_endpoint
  sensitive   = true
}

output "rds_credentials_secret_arn" {
  description = "ARN of Secrets Manager secret containing RDS credentials"
  value       = aws_secretsmanager_secret.rds_credentials.arn
}

# ===================================
# ElastiCache Outputs
# ===================================

output "redis_endpoint_address" {
  description = "Redis endpoint address"
  value       = module.elasticache.redis_endpoint_address
  sensitive   = true
}

output "redis_endpoint_port" {
  description = "Redis endpoint port"
  value       = module.elasticache.redis_endpoint_port
}

output "redis_configuration_endpoint" {
  description = "Redis configuration endpoint (for cluster mode)"
  value       = module.elasticache.redis_configuration_endpoint
  sensitive   = true
}

output "redis_auth_secret_arn" {
  description = "ARN of Secrets Manager secret containing Redis AUTH token"
  value       = aws_secretsmanager_secret.redis_auth.arn
}

# ===================================
# Security Group Outputs
# ===================================

output "eks_cluster_sg_id" {
  description = "EKS cluster security group ID"
  value       = module.security_groups.eks_cluster_sg_id
}

output "eks_node_sg_id" {
  description = "EKS node security group ID"
  value       = module.security_groups.eks_node_sg_id
}

output "rds_sg_id" {
  description = "RDS security group ID"
  value       = module.security_groups.rds_sg_id
}

output "redis_sg_id" {
  description = "Redis security group ID"
  value       = module.security_groups.redis_sg_id
}

# ===================================
# Kubeconfig Command
# ===================================

output "configure_kubectl" {
  description = "Command to configure kubectl"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

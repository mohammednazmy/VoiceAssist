# VoiceAssist V2 - Terraform Variables
# Phase 9: Infrastructure as Code
#
# Global variables for VoiceAssist infrastructure

# ===================================
# Environment Configuration
# ===================================

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "voiceassist"
}

# ===================================
# Network Configuration
# ===================================

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets"
  type        = list(string)
  default     = ["10.0.20.0/24", "10.0.21.0/24", "10.0.22.0/24"]
}

# ===================================
# EKS Configuration
# ===================================

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.28"
}

variable "eks_node_instance_types" {
  description = "EC2 instance types for EKS nodes"
  type        = list(string)
  default     = ["t3.large", "t3.xlarge"]
}

variable "eks_node_desired_size" {
  description = "Desired number of EKS worker nodes"
  type        = number
  default     = 3
}

variable "eks_node_min_size" {
  description = "Minimum number of EKS worker nodes"
  type        = number
  default     = 2
}

variable "eks_node_max_size" {
  description = "Maximum number of EKS worker nodes"
  type        = number
  default     = 10
}

# ===================================
# RDS Configuration
# ===================================

variable "rds_instance_class" {
  description = "RDS instance type"
  type        = string
  default     = "db.t3.large"
}

variable "rds_allocated_storage" {
  description = "Allocated storage for RDS (GB)"
  type        = number
  default     = 100
}

variable "rds_max_allocated_storage" {
  description = "Maximum storage for RDS autoscaling (GB)"
  type        = number
  default     = 500
}

variable "rds_engine_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "16.1"
}

variable "rds_backup_retention_days" {
  description = "Number of days to retain RDS backups (HIPAA: 90 days)"
  type        = number
  default     = 90
}

variable "rds_multi_az" {
  description = "Enable multi-AZ deployment for RDS"
  type        = bool
  default     = true
}

# ===================================
# ElastiCache Configuration
# ===================================

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.medium"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 2
}

variable "redis_engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

# ===================================
# Security Configuration
# ===================================

variable "enable_encryption_at_rest" {
  description = "Enable encryption at rest for all data stores (HIPAA required)"
  type        = bool
  default     = true
}

variable "enable_encryption_in_transit" {
  description = "Enable encryption in transit (HIPAA required)"
  type        = bool
  default     = true
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access resources"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection for critical resources"
  type        = bool
  default     = true
}

# ===================================
# Monitoring Configuration
# ===================================

variable "enable_cloudwatch_logs" {
  description = "Enable CloudWatch logs for all services"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention days (HIPAA: 90 days minimum)"
  type        = number
  default     = 90
}

# ===================================
# Tags
# ===================================

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}

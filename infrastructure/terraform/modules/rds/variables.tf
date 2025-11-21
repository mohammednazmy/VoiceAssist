# Variables for RDS Module

variable "name_prefix" {
  description = "Prefix for naming RDS resources"
  type        = string
  validation {
    condition     = length(var.name_prefix) <= 32
    error_message = "Name prefix must be 32 characters or less."
  }
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "tags" {
  description = "Common tags to apply to all RDS resources"
  type        = map(string)
  default     = {}
}

# Network Configuration
variable "subnet_ids" {
  description = "List of subnet IDs for the DB subnet group"
  type        = list(string)
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnets are required for high availability."
  }
}

variable "security_group_id" {
  description = "Security group ID for the RDS instance"
  type        = string
}

# Engine Configuration
variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.4"
  validation {
    condition     = can(regex("^1[3-9]\\.[0-9]+$", var.engine_version))
    error_message = "Engine version must be PostgreSQL 13 or higher."
  }
}

variable "instance_class" {
  description = "The instance type of the RDS instance"
  type        = string
  default     = "db.r6g.xlarge"
}

variable "parameter_group_family" {
  description = "The family of the DB parameter group"
  type        = string
  default     = "postgres15"
}

# Database Configuration
variable "database_name" {
  description = "The name of the database to create when the DB instance is created"
  type        = string
  default     = "voiceassist"
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.database_name))
    error_message = "Database name must start with a letter and contain only alphanumeric characters and underscores."
  }
}

variable "master_username" {
  description = "Username for the master DB user"
  type        = string
  default     = "voiceassist_admin"
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.master_username))
    error_message = "Master username must start with a letter and contain only alphanumeric characters and underscores."
  }
}

variable "database_port" {
  description = "The port on which the DB accepts connections"
  type        = number
  default     = 5432
  validation {
    condition     = var.database_port > 0 && var.database_port <= 65535
    error_message = "Database port must be between 1 and 65535."
  }
}

variable "max_connections" {
  description = "Maximum number of database connections"
  type        = string
  default     = "1000"
}

variable "log_min_duration_statement" {
  description = "Minimum duration in milliseconds to log a statement (-1 disables, 0 logs all)"
  type        = string
  default     = "1000"
}

# Storage Configuration
variable "allocated_storage" {
  description = "The allocated storage in gigabytes"
  type        = number
  default     = 100
  validation {
    condition     = var.allocated_storage >= 20
    error_message = "Allocated storage must be at least 20 GB."
  }
}

variable "max_allocated_storage" {
  description = "Upper limit for automatic storage scaling (0 to disable)"
  type        = number
  default     = 1000
  validation {
    condition     = var.max_allocated_storage == 0 || var.max_allocated_storage >= var.allocated_storage
    error_message = "Max allocated storage must be 0 or greater than allocated storage."
  }
}

variable "storage_type" {
  description = "One of 'standard' (magnetic), 'gp2' (general purpose SSD), 'gp3' (general purpose SSD), 'io1' (provisioned IOPS SSD), or 'io2' (provisioned IOPS SSD)"
  type        = string
  default     = "gp3"
  validation {
    condition     = contains(["standard", "gp2", "gp3", "io1", "io2"], var.storage_type)
    error_message = "Storage type must be one of: standard, gp2, gp3, io1, io2."
  }
}

variable "iops" {
  description = "The amount of provisioned IOPS (only for io1 and io2 storage types)"
  type        = number
  default     = null
}

variable "storage_throughput" {
  description = "Storage throughput value for the DB instance (only for gp3 storage type)"
  type        = number
  default     = 125
  validation {
    condition     = var.storage_throughput == null || (var.storage_throughput >= 125 && var.storage_throughput <= 1000)
    error_message = "Storage throughput must be between 125 and 1000 MB/s."
  }
}

# High Availability Configuration
variable "multi_az" {
  description = "Specifies if the RDS instance is multi-AZ"
  type        = bool
  default     = true
}

# Backup Configuration
variable "backup_retention_period" {
  description = "The days to retain backups (0-35)"
  type        = number
  default     = 30
  validation {
    condition     = var.backup_retention_period >= 0 && var.backup_retention_period <= 35
    error_message = "Backup retention period must be between 0 and 35 days."
  }
}

variable "backup_window" {
  description = "The daily time range during which automated backups are created (UTC)"
  type        = string
  default     = "03:00-04:00"
  validation {
    condition     = can(regex("^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$", var.backup_window))
    error_message = "Backup window must be in the format HH:MM-HH:MM."
  }
}

variable "maintenance_window" {
  description = "The window to perform maintenance (UTC)"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "delete_automated_backups" {
  description = "Specifies whether to remove automated backups immediately after the DB instance is deleted"
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "Determines whether a final DB snapshot is created before the DB instance is deleted"
  type        = bool
  default     = false
}

# Monitoring Configuration
variable "enabled_cloudwatch_logs_exports" {
  description = "List of log types to enable for exporting to CloudWatch logs"
  type        = list(string)
  default     = ["postgresql", "upgrade"]
  validation {
    condition = alltrue([
      for log_type in var.enabled_cloudwatch_logs_exports :
      contains(["postgresql", "upgrade"], log_type)
    ])
    error_message = "Invalid log type. Must be one of: postgresql, upgrade."
  }
}

variable "monitoring_interval" {
  description = "The interval, in seconds, between points when Enhanced Monitoring metrics are collected (0, 1, 5, 10, 15, 30, 60)"
  type        = number
  default     = 60
  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "Monitoring interval must be one of: 0, 1, 5, 10, 15, 30, 60."
  }
}

# Performance Insights
variable "performance_insights_enabled" {
  description = "Specifies whether Performance Insights are enabled"
  type        = bool
  default     = true
}

variable "performance_insights_retention_period" {
  description = "Amount of time in days to retain Performance Insights data (7, 731 [2 years], or a multiple of 31)"
  type        = number
  default     = 7
  validation {
    condition     = var.performance_insights_retention_period == 7 || var.performance_insights_retention_period == 731 || (var.performance_insights_retention_period % 31 == 0 && var.performance_insights_retention_period > 0)
    error_message = "Performance Insights retention period must be 7, 731, or a multiple of 31."
  }
}

# Security Configuration
variable "deletion_protection" {
  description = "If the DB instance should have deletion protection enabled"
  type        = bool
  default     = true
}

variable "auto_minor_version_upgrade" {
  description = "Indicates that minor engine upgrades will be applied automatically to the DB instance during the maintenance window"
  type        = bool
  default     = true
}

variable "ca_cert_identifier" {
  description = "The identifier of the CA certificate for the DB instance"
  type        = string
  default     = "rds-ca-rsa2048-g1"
}

# KMS Configuration
variable "kms_deletion_window" {
  description = "Duration in days before the KMS key is deleted after destruction"
  type        = number
  default     = 30
  validation {
    condition     = var.kms_deletion_window >= 7 && var.kms_deletion_window <= 30
    error_message = "KMS deletion window must be between 7 and 30 days."
  }
}

# Secrets Manager Configuration
variable "secret_recovery_window" {
  description = "Number of days to retain the secret before permanent deletion"
  type        = number
  default     = 30
  validation {
    condition     = var.secret_recovery_window >= 7 && var.secret_recovery_window <= 30
    error_message = "Secret recovery window must be between 7 and 30 days."
  }
}

# CloudWatch Alarms Configuration
variable "create_cloudwatch_alarms" {
  description = "Whether to create CloudWatch alarms for the RDS instance"
  type        = bool
  default     = true
}

variable "alarm_actions" {
  description = "List of ARNs to notify when alarms trigger"
  type        = list(string)
  default     = []
}

variable "cpu_utilization_threshold" {
  description = "The maximum percentage of CPU utilization"
  type        = number
  default     = 80
  validation {
    condition     = var.cpu_utilization_threshold > 0 && var.cpu_utilization_threshold <= 100
    error_message = "CPU utilization threshold must be between 1 and 100."
  }
}

variable "freeable_memory_threshold" {
  description = "The minimum amount of available random access memory in bytes"
  type        = number
  default     = 1000000000 # 1GB
  validation {
    condition     = var.freeable_memory_threshold > 0
    error_message = "Freeable memory threshold must be greater than 0."
  }
}

variable "free_storage_space_threshold" {
  description = "The minimum amount of available storage space in bytes"
  type        = number
  default     = 10000000000 # 10GB
  validation {
    condition     = var.free_storage_space_threshold > 0
    error_message = "Free storage space threshold must be greater than 0."
  }
}

variable "database_connections_threshold" {
  description = "The maximum number of database connections"
  type        = number
  default     = 900
  validation {
    condition     = var.database_connections_threshold > 0
    error_message = "Database connections threshold must be greater than 0."
  }
}

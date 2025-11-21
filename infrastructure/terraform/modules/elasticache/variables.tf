# Variables for ElastiCache Module

variable "name_prefix" {
  description = "Prefix for naming ElastiCache resources"
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
  description = "Common tags to apply to all ElastiCache resources"
  type        = map(string)
  default     = {}
}

# Network Configuration
variable "subnet_ids" {
  description = "List of subnet IDs for the ElastiCache subnet group"
  type        = list(string)
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnets are required for high availability."
  }
}

variable "security_group_id" {
  description = "Security group ID for the ElastiCache cluster"
  type        = string
}

# Engine Configuration
variable "engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
  validation {
    condition     = can(regex("^[6-7]\\.[0-9]$", var.engine_version))
    error_message = "Engine version must be Redis 6.0 or higher."
  }
}

variable "node_type" {
  description = "The compute and memory capacity of the nodes"
  type        = string
  default     = "cache.r7g.large"
}

variable "port" {
  description = "The port number on which the cache accepts connections"
  type        = number
  default     = 6379
  validation {
    condition     = var.port > 0 && var.port <= 65535
    error_message = "Port must be between 1 and 65535."
  }
}

variable "parameter_group_family" {
  description = "The family of the ElastiCache parameter group"
  type        = string
  default     = "redis7"
}

# Cluster Configuration
variable "cluster_mode_enabled" {
  description = "Enable cluster mode (sharding) for the Redis cluster"
  type        = bool
  default     = true
}

variable "num_cache_clusters" {
  description = "Number of cache clusters (primary + replicas) when cluster mode is disabled"
  type        = number
  default     = 3
  validation {
    condition     = var.num_cache_clusters >= 2 && var.num_cache_clusters <= 6
    error_message = "Number of cache clusters must be between 2 and 6."
  }
}

variable "num_node_groups" {
  description = "Number of node groups (shards) for the Redis cluster when cluster mode is enabled"
  type        = number
  default     = 3
  validation {
    condition     = var.num_node_groups >= 1 && var.num_node_groups <= 500
    error_message = "Number of node groups must be between 1 and 500."
  }
}

variable "replicas_per_node_group" {
  description = "Number of replica nodes in each node group when cluster mode is enabled"
  type        = number
  default     = 2
  validation {
    condition     = var.replicas_per_node_group >= 0 && var.replicas_per_node_group <= 5
    error_message = "Replicas per node group must be between 0 and 5."
  }
}

# High Availability Configuration
variable "automatic_failover_enabled" {
  description = "Specifies whether a read-only replica will be automatically promoted to primary if the existing primary fails"
  type        = bool
  default     = true
}

variable "multi_az_enabled" {
  description = "Specifies whether to enable Multi-AZ Support"
  type        = bool
  default     = true
}

# Memory Management
variable "maxmemory_policy" {
  description = "How Redis will select what to remove when maxmemory is reached"
  type        = string
  default     = "allkeys-lru"
  validation {
    condition = contains([
      "volatile-lru", "allkeys-lru", "volatile-lfu", "allkeys-lfu",
      "volatile-random", "allkeys-random", "volatile-ttl", "noeviction"
    ], var.maxmemory_policy)
    error_message = "Invalid maxmemory policy. Must be one of: volatile-lru, allkeys-lru, volatile-lfu, allkeys-lfu, volatile-random, allkeys-random, volatile-ttl, noeviction."
  }
}

# Maintenance and Backup Configuration
variable "maintenance_window" {
  description = "Specifies the weekly time range for system maintenance (format: ddd:hh24:mi-ddd:hh24:mi)"
  type        = string
  default     = "sun:05:00-sun:06:00"
}

variable "snapshot_window" {
  description = "The daily time range during which automated backups are created (format: hh24:mi-hh24:mi)"
  type        = string
  default     = "03:00-04:00"
  validation {
    condition     = can(regex("^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$", var.snapshot_window))
    error_message = "Snapshot window must be in the format HH:MM-HH:MM."
  }
}

variable "snapshot_retention_limit" {
  description = "Number of days for which ElastiCache will retain automatic cache cluster snapshots"
  type        = number
  default     = 7
  validation {
    condition     = var.snapshot_retention_limit >= 0 && var.snapshot_retention_limit <= 35
    error_message = "Snapshot retention limit must be between 0 and 35 days."
  }
}

variable "create_final_snapshot" {
  description = "Whether to create a final snapshot before deleting the cluster"
  type        = bool
  default     = true
}

variable "auto_minor_version_upgrade" {
  description = "Specifies whether minor version engine upgrades will be applied automatically to the cluster during the maintenance window"
  type        = bool
  default     = true
}

# Logging Configuration
variable "log_retention_days" {
  description = "Number of days to retain ElastiCache logs in CloudWatch"
  type        = number
  default     = 90
  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "Log retention days must be a valid CloudWatch Logs retention period."
  }
}

# Notification Configuration
variable "notification_topic_arn" {
  description = "ARN of an SNS topic to send ElastiCache notifications to"
  type        = string
  default     = null
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

# Change Management
variable "apply_immediately" {
  description = "Specifies whether any modifications are applied immediately, or during the next maintenance window"
  type        = bool
  default     = false
}

# CloudWatch Alarms Configuration
variable "create_cloudwatch_alarms" {
  description = "Whether to create CloudWatch alarms for the ElastiCache cluster"
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
  default     = 75
  validation {
    condition     = var.cpu_utilization_threshold > 0 && var.cpu_utilization_threshold <= 100
    error_message = "CPU utilization threshold must be between 1 and 100."
  }
}

variable "memory_utilization_threshold" {
  description = "The maximum percentage of memory utilization"
  type        = number
  default     = 80
  validation {
    condition     = var.memory_utilization_threshold > 0 && var.memory_utilization_threshold <= 100
    error_message = "Memory utilization threshold must be between 1 and 100."
  }
}

variable "evictions_threshold" {
  description = "The maximum number of evictions"
  type        = number
  default     = 1000
  validation {
    condition     = var.evictions_threshold >= 0
    error_message = "Evictions threshold must be non-negative."
  }
}

variable "replication_lag_threshold" {
  description = "The maximum replication lag in seconds"
  type        = number
  default     = 30
  validation {
    condition     = var.replication_lag_threshold >= 0
    error_message = "Replication lag threshold must be non-negative."
  }
}

variable "connection_count_threshold" {
  description = "The maximum number of concurrent connections"
  type        = number
  default     = 10000
  validation {
    condition     = var.connection_count_threshold > 0
    error_message = "Connection count threshold must be positive."
  }
}

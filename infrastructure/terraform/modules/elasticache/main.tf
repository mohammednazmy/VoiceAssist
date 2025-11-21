# ElastiCache Module for VoiceAssist - Redis Cluster
# This module creates a highly available Redis cluster with encryption and automatic failover

# KMS Key for ElastiCache Encryption
resource "aws_kms_key" "elasticache" {
  description             = "KMS key for ElastiCache encryption - ${var.environment}"
  deletion_window_in_days = var.kms_deletion_window
  enable_key_rotation     = true

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-elasticache-kms"
      Type = "ElastiCache-Encryption"
    }
  )
}

resource "aws_kms_alias" "elasticache" {
  name          = "alias/${var.name_prefix}-elasticache"
  target_key_id = aws_kms_key.elasticache.key_id
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.name_prefix}-redis-subnet-group"
  description = "Subnet group for VoiceAssist Redis cluster - ${var.environment}"
  subnet_ids  = var.subnet_ids

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-subnet-group"
      Type = "ElastiCache-Subnet-Group"
    }
  )
}

# ElastiCache Parameter Group
resource "aws_elasticache_parameter_group" "main" {
  name        = "${var.name_prefix}-redis-params"
  family      = var.parameter_group_family
  description = "Custom parameter group for VoiceAssist Redis - ${var.environment}"

  # Memory management
  parameter {
    name  = "maxmemory-policy"
    value = var.maxmemory_policy
  }

  # Enable notifications for keyspace events (useful for caching patterns)
  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"
  }

  # Timeout for idle connections (5 minutes)
  parameter {
    name  = "timeout"
    value = "300"
  }

  # TCP keepalive
  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  # Slow log threshold (microseconds)
  parameter {
    name  = "slowlog-log-slower-than"
    value = "10000"
  }

  # Slow log max length
  parameter {
    name  = "slowlog-max-len"
    value = "128"
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-parameter-group"
      Type = "ElastiCache-Parameter-Group"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Generate random AUTH token for Redis
resource "random_password" "auth_token" {
  length  = 64
  special = true
  # Redis AUTH tokens must only contain printable ASCII characters
  override_special = "!&#$^<>-"
}

# Store AUTH token in Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth_token" {
  name_prefix             = "${var.name_prefix}-redis-auth-token-"
  description             = "AUTH token for VoiceAssist Redis cluster - ${var.environment}"
  kms_key_id              = aws_kms_key.elasticache.id
  recovery_window_in_days = var.secret_recovery_window

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-auth-token"
      Type = "ElastiCache-Secret"
    }
  )
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  secret_id = aws_secretsmanager_secret.redis_auth_token.id
  secret_string = jsonencode({
    auth_token             = random_password.auth_token.result
    primary_endpoint       = var.cluster_mode_enabled ? aws_elasticache_replication_group.main.configuration_endpoint_address : aws_elasticache_replication_group.main.primary_endpoint_address
    reader_endpoint        = var.cluster_mode_enabled ? null : aws_elasticache_replication_group.main.reader_endpoint_address
    port                   = var.port
    engine                 = "redis"
    cluster_mode_enabled   = var.cluster_mode_enabled
  })

  depends_on = [
    aws_elasticache_replication_group.main
  ]
}

# ElastiCache Replication Group (Redis Cluster)
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.name_prefix}-redis"
  replication_group_description = "VoiceAssist Redis cluster - ${var.environment}"
  engine                     = "redis"
  engine_version             = var.engine_version
  node_type                  = var.node_type
  port                       = var.port

  # Number of cache clusters (primary + read replicas)
  num_cache_clusters         = var.cluster_mode_enabled ? null : var.num_cache_clusters

  # Cluster mode configuration
  cluster_mode {
    num_node_groups         = var.cluster_mode_enabled ? var.num_node_groups : 0
    replicas_per_node_group = var.cluster_mode_enabled ? var.replicas_per_node_group : 0
  }

  # Parameter group
  parameter_group_name = aws_elasticache_parameter_group.main.name

  # Network configuration
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.security_group_id]

  # High availability
  automatic_failover_enabled = var.automatic_failover_enabled
  multi_az_enabled           = var.multi_az_enabled

  # Encryption
  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.elasticache.arn
  transit_encryption_enabled = true
  auth_token                 = random_password.auth_token.result

  # Maintenance and backup
  maintenance_window         = var.maintenance_window
  snapshot_window            = var.snapshot_window
  snapshot_retention_limit   = var.snapshot_retention_limit
  final_snapshot_identifier  = var.create_final_snapshot ? "${var.name_prefix}-redis-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  # Auto minor version upgrade
  auto_minor_version_upgrade = var.auto_minor_version_upgrade

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.engine_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }

  # Notification configuration
  notification_topic_arn = var.notification_topic_arn

  # Apply changes immediately (set to false for production to apply during maintenance window)
  apply_immediately = var.apply_immediately

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-cluster"
      Type = "ElastiCache-Replication-Group"
    }
  )

  lifecycle {
    create_before_destroy = true
    ignore_changes = [
      # Ignore auth token changes as it's randomly generated
      auth_token,
      # Ignore snapshot identifier as it contains timestamp
      final_snapshot_identifier
    ]
  }

  depends_on = [
    aws_elasticache_subnet_group.main,
    aws_elasticache_parameter_group.main,
    aws_cloudwatch_log_group.slow_log,
    aws_cloudwatch_log_group.engine_log
  ]
}

# CloudWatch Log Groups for Redis logs
resource "aws_cloudwatch_log_group" "slow_log" {
  name              = "/aws/elasticache/${var.name_prefix}-redis/slow-log"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.elasticache.arn

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-slow-log"
      Type = "ElastiCache-Logs"
    }
  )
}

resource "aws_cloudwatch_log_group" "engine_log" {
  name              = "/aws/elasticache/${var.name_prefix}-redis/engine-log"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.elasticache.arn

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-engine-log"
      Type = "ElastiCache-Logs"
    }
  )
}

# CloudWatch alarms for monitoring
resource "aws_cloudwatch_metric_alarm" "cache_cpu" {
  count = var.create_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-redis-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = var.cpu_utilization_threshold
  alarm_description   = "This metric monitors Redis CPU utilization"
  alarm_actions       = var.alarm_actions

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-cpu-alarm"
    }
  )
}

resource "aws_cloudwatch_metric_alarm" "cache_memory" {
  count = var.create_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-redis-memory-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = var.memory_utilization_threshold
  alarm_description   = "This metric monitors Redis memory utilization"
  alarm_actions       = var.alarm_actions

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-memory-alarm"
    }
  )
}

resource "aws_cloudwatch_metric_alarm" "evictions" {
  count = var.create_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-redis-evictions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = var.evictions_threshold
  alarm_description   = "This metric monitors Redis evictions"
  alarm_actions       = var.alarm_actions

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-evictions-alarm"
    }
  )
}

resource "aws_cloudwatch_metric_alarm" "replication_lag" {
  count = var.create_cloudwatch_alarms && var.num_cache_clusters > 1 ? 1 : 0

  alarm_name          = "${var.name_prefix}-redis-replication-lag"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ReplicationLag"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = var.replication_lag_threshold
  alarm_description   = "This metric monitors Redis replication lag"
  alarm_actions       = var.alarm_actions

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-replication-lag-alarm"
    }
  )
}

resource "aws_cloudwatch_metric_alarm" "connection_count" {
  count = var.create_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-redis-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = var.connection_count_threshold
  alarm_description   = "This metric monitors Redis current connections"
  alarm_actions       = var.alarm_actions

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-connections-alarm"
    }
  )
}

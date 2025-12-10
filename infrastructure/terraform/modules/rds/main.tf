# RDS Module for VoiceAssist - PostgreSQL with pgvector
# This module creates a highly available PostgreSQL RDS instance with HIPAA-compliant features

# KMS Key for RDS Encryption
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS encryption - ${var.environment}"
  deletion_window_in_days = var.kms_deletion_window
  enable_key_rotation     = true

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-rds-kms"
      Type = "RDS-Encryption"
    }
  )
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.name_prefix}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name_prefix = "${var.name_prefix}-db-"
  description = "Database subnet group for VoiceAssist - ${var.environment}"
  subnet_ids  = var.subnet_ids

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-subnet-group"
      Type = "RDS-Subnet-Group"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# DB Parameter Group with pgvector extension
resource "aws_db_parameter_group" "main" {
  name_prefix = "${var.name_prefix}-db-params-"
  family      = var.parameter_group_family
  description = "Custom parameter group for VoiceAssist PostgreSQL - ${var.environment}"

  # Enable pgvector extension
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,pgaudit,pgvector"
  }

  # Performance tuning parameters
  parameter {
    name  = "max_connections"
    value = var.max_connections
  }

  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/10240}"
  }

  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory/4096}"
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "2097152" # 2GB in KB
  }

  parameter {
    name  = "checkpoint_completion_target"
    value = "0.9"
  }

  parameter {
    name  = "wal_buffers"
    value = "16384" # 16MB in 8KB blocks
  }

  parameter {
    name  = "default_statistics_target"
    value = "100"
  }

  parameter {
    name  = "random_page_cost"
    value = "1.1"
  }

  parameter {
    name  = "effective_io_concurrency"
    value = "200"
  }

  parameter {
    name  = "work_mem"
    value = "10485" # ~10MB in KB
  }

  parameter {
    name  = "min_wal_size"
    value = "2048" # 2GB in MB
  }

  parameter {
    name  = "max_wal_size"
    value = "8192" # 8GB in MB
  }

  # Logging parameters for compliance
  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_duration"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = var.log_min_duration_statement
  }

  # Enable pgaudit for compliance
  parameter {
    name  = "pgaudit.log"
    value = "all"
  }

  parameter {
    name  = "pgaudit.log_catalog"
    value = "1"
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-parameter-group"
      Type = "RDS-Parameter-Group"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Random password for master user
resource "random_password" "master_password" {
  length  = 32
  special = true
  # Exclude characters that might cause issues
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Store master password in Secrets Manager
resource "aws_secretsmanager_secret" "db_master_password" {
  name_prefix             = "${var.name_prefix}-db-master-password-"
  description             = "Master password for VoiceAssist RDS instance - ${var.environment}"
  kms_key_id              = aws_kms_key.rds.id
  recovery_window_in_days = var.secret_recovery_window

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-master-password"
      Type = "RDS-Secret"
    }
  )
}

resource "aws_secretsmanager_secret_version" "db_master_password" {
  secret_id = aws_secretsmanager_secret.db_master_password.id
  secret_string = jsonencode({
    username = var.master_username
    password = random_password.master_password.result
    engine   = "postgres"
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = var.database_name
  })
}

# RDS Instance
resource "aws_db_instance" "main" {
  identifier_prefix = "${var.name_prefix}-db-"

  # Engine configuration
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  # Database configuration
  db_name  = var.database_name
  username = var.master_username
  password = random_password.master_password.result
  port     = var.database_port

  # Storage configuration
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = var.storage_type
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn
  iops                  = var.storage_type == "io1" || var.storage_type == "io2" ? var.iops : null
  storage_throughput    = var.storage_type == "gp3" ? var.storage_throughput : null

  # High availability configuration
  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.security_group_id]
  publicly_accessible    = false

  # Parameter and option groups
  parameter_group_name = aws_db_parameter_group.main.name

  # Backup configuration
  backup_retention_period   = var.backup_retention_period
  backup_window             = var.backup_window
  maintenance_window        = var.maintenance_window
  delete_automated_backups  = var.delete_automated_backups
  copy_tags_to_snapshot     = true
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name_prefix}-db-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  # Monitoring and logging
  enabled_cloudwatch_logs_exports = var.enabled_cloudwatch_logs_exports
  monitoring_interval             = var.monitoring_interval
  monitoring_role_arn             = var.monitoring_interval > 0 ? aws_iam_role.rds_monitoring[0].arn : null

  # Performance Insights
  performance_insights_enabled          = var.performance_insights_enabled
  performance_insights_kms_key_id       = var.performance_insights_enabled ? aws_kms_key.rds.arn : null
  performance_insights_retention_period = var.performance_insights_enabled ? var.performance_insights_retention_period : null

  # Deletion protection
  deletion_protection = var.deletion_protection

  # Auto minor version upgrade
  auto_minor_version_upgrade = var.auto_minor_version_upgrade

  # CA certificate
  ca_cert_identifier = var.ca_cert_identifier

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-instance"
      Type = "RDS-Instance"
    }
  )

  lifecycle {
    create_before_destroy = true
    ignore_changes = [
      # Ignore password changes as it's randomly generated
      password,
      # Ignore snapshot identifier as it contains timestamp
      final_snapshot_identifier
    ]
  }

  depends_on = [
    aws_db_parameter_group.main,
    aws_db_subnet_group.main
  ]
}

# IAM role for enhanced monitoring
resource "aws_iam_role" "rds_monitoring" {
  count = var.monitoring_interval > 0 ? 1 : 0

  name_prefix = "${var.name_prefix}-rds-monitoring-"
  description = "IAM role for RDS enhanced monitoring - ${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-rds-monitoring-role"
      Type = "RDS-Monitoring"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  count = var.monitoring_interval > 0 ? 1 : 0

  role       = aws_iam_role.rds_monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# CloudWatch alarms for monitoring
resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  count = var.create_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-db-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.cpu_utilization_threshold
  alarm_description   = "This metric monitors RDS CPU utilization"
  alarm_actions       = var.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-cpu-alarm"
    }
  )
}

resource "aws_cloudwatch_metric_alarm" "database_memory" {
  count = var.create_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-db-memory-freeable"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.freeable_memory_threshold
  alarm_description   = "This metric monitors RDS freeable memory"
  alarm_actions       = var.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-memory-alarm"
    }
  )
}

resource "aws_cloudwatch_metric_alarm" "database_storage" {
  count = var.create_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-db-storage-space"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.free_storage_space_threshold
  alarm_description   = "This metric monitors RDS free storage space"
  alarm_actions       = var.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-storage-alarm"
    }
  )
}

resource "aws_cloudwatch_metric_alarm" "database_connections" {
  count = var.create_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-db-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.database_connections_threshold
  alarm_description   = "This metric monitors RDS database connections"
  alarm_actions       = var.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-connections-alarm"
    }
  )
}

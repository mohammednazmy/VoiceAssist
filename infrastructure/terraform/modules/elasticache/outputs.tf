# Outputs for ElastiCache Module

# Replication Group Information
output "redis_replication_group_id" {
  description = "The ID of the ElastiCache Replication Group"
  value       = aws_elasticache_replication_group.main.id
}

output "redis_replication_group_arn" {
  description = "The ARN of the ElastiCache Replication Group"
  value       = aws_elasticache_replication_group.main.arn
}

output "redis_cluster_enabled" {
  description = "Indicates if cluster mode is enabled"
  value       = aws_elasticache_replication_group.main.cluster_enabled
}

# Endpoint Information
output "redis_primary_endpoint_address" {
  description = "The address of the endpoint for the primary node in the replication group"
  value       = var.cluster_mode_enabled ? null : aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_reader_endpoint_address" {
  description = "The address of the endpoint for the reader node in the replication group"
  value       = var.cluster_mode_enabled ? null : aws_elasticache_replication_group.main.reader_endpoint_address
}

output "redis_configuration_endpoint_address" {
  description = "The configuration endpoint address to allow host discovery (cluster mode only)"
  value       = var.cluster_mode_enabled ? aws_elasticache_replication_group.main.configuration_endpoint_address : null
}

output "redis_endpoint_address" {
  description = "The primary endpoint address (configuration endpoint for cluster mode, primary endpoint otherwise)"
  value       = var.cluster_mode_enabled ? aws_elasticache_replication_group.main.configuration_endpoint_address : aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_endpoint_port" {
  description = "The port number on which the Redis cluster accepts connections"
  value       = var.port
}

output "redis_member_clusters" {
  description = "The identifiers of all the nodes that are part of this replication group"
  value       = aws_elasticache_replication_group.main.member_clusters
}

# Subnet Group
output "redis_subnet_group_name" {
  description = "The name of the cache subnet group"
  value       = aws_elasticache_subnet_group.main.name
}

# Parameter Group
output "redis_parameter_group_id" {
  description = "The ElastiCache parameter group name"
  value       = aws_elasticache_parameter_group.main.id
}

# KMS
output "kms_key_id" {
  description = "The globally unique identifier for the KMS key"
  value       = aws_kms_key.elasticache.id
}

output "kms_key_arn" {
  description = "The Amazon Resource Name (ARN) of the KMS key"
  value       = aws_kms_key.elasticache.arn
}

# Secrets Manager
output "redis_auth_token_secret_arn" {
  description = "The ARN of the secret containing the Redis AUTH token"
  value       = aws_secretsmanager_secret.redis_auth_token.arn
}

output "redis_auth_token_secret_id" {
  description = "The ID of the secret containing the Redis AUTH token"
  value       = aws_secretsmanager_secret.redis_auth_token.id
}

# CloudWatch Logs
output "slow_log_group_name" {
  description = "The name of the CloudWatch log group for slow logs"
  value       = aws_cloudwatch_log_group.slow_log.name
}

output "slow_log_group_arn" {
  description = "The ARN of the CloudWatch log group for slow logs"
  value       = aws_cloudwatch_log_group.slow_log.arn
}

output "engine_log_group_name" {
  description = "The name of the CloudWatch log group for engine logs"
  value       = aws_cloudwatch_log_group.engine_log.name
}

output "engine_log_group_arn" {
  description = "The ARN of the CloudWatch log group for engine logs"
  value       = aws_cloudwatch_log_group.engine_log.arn
}

# CloudWatch Alarms
output "cloudwatch_alarm_cpu_id" {
  description = "The ID of the CPU utilization CloudWatch alarm"
  value       = var.create_cloudwatch_alarms ? aws_cloudwatch_metric_alarm.cache_cpu[0].id : null
}

output "cloudwatch_alarm_memory_id" {
  description = "The ID of the memory utilization CloudWatch alarm"
  value       = var.create_cloudwatch_alarms ? aws_cloudwatch_metric_alarm.cache_memory[0].id : null
}

output "cloudwatch_alarm_evictions_id" {
  description = "The ID of the evictions CloudWatch alarm"
  value       = var.create_cloudwatch_alarms ? aws_cloudwatch_metric_alarm.evictions[0].id : null
}

output "cloudwatch_alarm_replication_lag_id" {
  description = "The ID of the replication lag CloudWatch alarm"
  value       = var.create_cloudwatch_alarms && var.num_cache_clusters > 1 ? aws_cloudwatch_metric_alarm.replication_lag[0].id : null
}

output "cloudwatch_alarm_connections_id" {
  description = "The ID of the connection count CloudWatch alarm"
  value       = var.create_cloudwatch_alarms ? aws_cloudwatch_metric_alarm.connection_count[0].id : null
}

# Connection String (for application configuration)
output "redis_connection_string" {
  description = "Redis connection string (rediss:// for TLS connection)"
  value       = "rediss://${var.cluster_mode_enabled ? aws_elasticache_replication_group.main.configuration_endpoint_address : aws_elasticache_replication_group.main.primary_endpoint_address}:${var.port}"
  sensitive   = true
}

# Engine Version
output "redis_engine_version_actual" {
  description = "The running version of the cache engine"
  value       = aws_elasticache_replication_group.main.engine_version_actual
}

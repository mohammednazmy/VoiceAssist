# Outputs for IAM Module

# EKS Cluster Role
output "cluster_role_arn" {
  description = "ARN of the EKS cluster IAM role"
  value       = aws_iam_role.eks_cluster.arn
}

output "cluster_role_name" {
  description = "Name of the EKS cluster IAM role"
  value       = aws_iam_role.eks_cluster.name
}

# EKS Node Role
output "node_role_arn" {
  description = "ARN of the EKS node group IAM role"
  value       = aws_iam_role.eks_node.arn
}

output "node_role_name" {
  description = "Name of the EKS node group IAM role"
  value       = aws_iam_role.eks_node.name
}

output "node_instance_profile_name" {
  description = "Name of the IAM instance profile for EKS nodes"
  value       = aws_iam_role.eks_node.name
}

# Service Account Roles
output "service_account_role_arns" {
  description = "Map of service account names to their IAM role ARNs"
  value = {
    for sa_name, role in aws_iam_role.service_account : sa_name => role.arn
  }
}

output "service_account_role_names" {
  description = "Map of service account names to their IAM role names"
  value = {
    for sa_name, role in aws_iam_role.service_account : sa_name => role.name
  }
}

# Custom Policies
output "s3_policy_arn" {
  description = "ARN of the S3 access policy (if created)"
  value       = var.create_s3_policy ? aws_iam_policy.s3_access[0].arn : null
}

output "secrets_policy_arn" {
  description = "ARN of the Secrets Manager access policy (if created)"
  value       = var.create_secrets_policy ? aws_iam_policy.secrets_access[0].arn : null
}

output "kms_policy_arn" {
  description = "ARN of the KMS access policy (if created)"
  value       = var.create_kms_policy ? aws_iam_policy.kms_access[0].arn : null
}

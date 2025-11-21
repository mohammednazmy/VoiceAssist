# Variables for IAM Module

variable "name_prefix" {
  description = "Prefix for naming IAM resources"
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
  description = "Common tags to apply to all IAM resources"
  type        = map(string)
  default     = {}
}

# OIDC Provider Configuration for IRSA
variable "oidc_provider_arn" {
  description = "ARN of the OIDC provider for EKS cluster (used for IRSA)"
  type        = string
  default     = ""
}

# Service Accounts Configuration
variable "service_accounts" {
  description = "Map of service accounts to create IAM roles for with IRSA"
  type = map(object({
    namespace            = string
    service_account_name = string
    policy_arns          = list(string)
  }))
  default = {}
}

# Optional Policy Creation Flags
variable "create_s3_policy" {
  description = "Whether to create S3 access policy"
  type        = bool
  default     = false
}

variable "create_secrets_policy" {
  description = "Whether to create Secrets Manager access policy"
  type        = bool
  default     = false
}

variable "create_kms_policy" {
  description = "Whether to create KMS access policy"
  type        = bool
  default     = false
}

variable "kms_key_arns" {
  description = "List of KMS key ARNs for the KMS access policy"
  type        = list(string)
  default     = ["*"]
}

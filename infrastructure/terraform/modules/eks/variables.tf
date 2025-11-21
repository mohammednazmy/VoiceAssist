# Variables for EKS Module

variable "name_prefix" {
  description = "Prefix for naming EKS resources"
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
  description = "Common tags to apply to all EKS resources"
  type        = map(string)
  default     = {}
}

# Cluster Configuration
variable "cluster_version" {
  description = "Kubernetes version to use for the EKS cluster"
  type        = string
  default     = "1.28"
  validation {
    condition     = can(regex("^1\\.(2[7-9]|[3-9][0-9])$", var.cluster_version))
    error_message = "Cluster version must be 1.27 or higher."
  }
}

variable "cluster_role_arn" {
  description = "ARN of the IAM role for the EKS cluster"
  type        = string
}

variable "node_role_arn" {
  description = "ARN of the IAM role for the EKS node group"
  type        = string
}

# Network Configuration
variable "subnet_ids" {
  description = "List of subnet IDs for the EKS cluster"
  type        = list(string)
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnets are required for high availability."
  }
}

variable "node_subnet_ids" {
  description = "List of subnet IDs for the EKS node group (typically private subnets)"
  type        = list(string)
  validation {
    condition     = length(var.node_subnet_ids) >= 2
    error_message = "At least 2 subnets are required for high availability."
  }
}

variable "cluster_security_group_id" {
  description = "Security group ID for the EKS cluster"
  type        = string
}

variable "node_security_group_id" {
  description = "Security group ID for the EKS node group"
  type        = string
}

# Cluster Endpoint Access
variable "endpoint_private_access" {
  description = "Enable private API server endpoint"
  type        = bool
  default     = true
}

variable "endpoint_public_access" {
  description = "Enable public API server endpoint"
  type        = bool
  default     = false
}

variable "public_access_cidrs" {
  description = "List of CIDR blocks that can access the public API server endpoint"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# Logging Configuration
variable "enabled_cluster_log_types" {
  description = "List of control plane logging types to enable"
  type        = list(string)
  default     = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  validation {
    condition = alltrue([
      for log_type in var.enabled_cluster_log_types :
      contains(["api", "audit", "authenticator", "controllerManager", "scheduler"], log_type)
    ])
    error_message = "Invalid log type. Must be one of: api, audit, authenticator, controllerManager, scheduler."
  }
}

variable "cluster_log_retention_days" {
  description = "Number of days to retain cluster logs"
  type        = number
  default     = 90
  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.cluster_log_retention_days)
    error_message = "Log retention days must be a valid CloudWatch Logs retention period."
  }
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

# Node Group Configuration
variable "node_instance_types" {
  description = "List of instance types for the EKS node group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_capacity_type" {
  description = "Type of capacity associated with the EKS node group (ON_DEMAND or SPOT)"
  type        = string
  default     = "ON_DEMAND"
  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.node_capacity_type)
    error_message = "Node capacity type must be either ON_DEMAND or SPOT."
  }
}

variable "node_desired_size" {
  description = "Desired number of nodes in the node group"
  type        = number
  default     = 3
  validation {
    condition     = var.node_desired_size >= 1
    error_message = "Node desired size must be at least 1."
  }
}

variable "node_min_size" {
  description = "Minimum number of nodes in the node group"
  type        = number
  default     = 2
  validation {
    condition     = var.node_min_size >= 1
    error_message = "Node minimum size must be at least 1."
  }
}

variable "node_max_size" {
  description = "Maximum number of nodes in the node group"
  type        = number
  default     = 10
  validation {
    condition     = var.node_max_size >= 1
    error_message = "Node maximum size must be at least 1."
  }
}

variable "node_max_unavailable_percentage" {
  description = "Maximum percentage of nodes unavailable during updates"
  type        = number
  default     = 33
  validation {
    condition     = var.node_max_unavailable_percentage > 0 && var.node_max_unavailable_percentage <= 100
    error_message = "Node max unavailable percentage must be between 1 and 100."
  }
}

variable "node_disk_size" {
  description = "Disk size in GiB for nodes"
  type        = number
  default     = 100
  validation {
    condition     = var.node_disk_size >= 20
    error_message = "Node disk size must be at least 20 GiB."
  }
}

variable "node_disk_type" {
  description = "Disk type for nodes (gp2, gp3, io1, io2)"
  type        = string
  default     = "gp3"
  validation {
    condition     = contains(["gp2", "gp3", "io1", "io2"], var.node_disk_type)
    error_message = "Node disk type must be one of: gp2, gp3, io1, io2."
  }
}

variable "node_labels" {
  description = "Key-value map of Kubernetes labels to apply to nodes"
  type        = map(string)
  default     = {}
}

variable "node_taints" {
  description = "List of Kubernetes taints to apply to nodes"
  type = list(object({
    key    = string
    value  = string
    effect = string
  }))
  default = []
}

variable "bootstrap_extra_args" {
  description = "Additional arguments to pass to the bootstrap script"
  type        = string
  default     = ""
}

# EKS Add-ons Configuration
variable "enable_vpc_cni_addon" {
  description = "Enable VPC CNI add-on"
  type        = bool
  default     = true
}

variable "vpc_cni_addon_version" {
  description = "Version of the VPC CNI add-on"
  type        = string
  default     = null
}

variable "vpc_cni_service_account_role_arn" {
  description = "ARN of the IAM role for VPC CNI service account"
  type        = string
  default     = null
}

variable "enable_kube_proxy_addon" {
  description = "Enable kube-proxy add-on"
  type        = bool
  default     = true
}

variable "kube_proxy_addon_version" {
  description = "Version of the kube-proxy add-on"
  type        = string
  default     = null
}

variable "enable_coredns_addon" {
  description = "Enable CoreDNS add-on"
  type        = bool
  default     = true
}

variable "coredns_addon_version" {
  description = "Version of the CoreDNS add-on"
  type        = string
  default     = null
}

variable "enable_ebs_csi_addon" {
  description = "Enable EBS CSI driver add-on"
  type        = bool
  default     = true
}

variable "ebs_csi_addon_version" {
  description = "Version of the EBS CSI driver add-on"
  type        = string
  default     = null
}

variable "ebs_csi_service_account_role_arn" {
  description = "ARN of the IAM role for EBS CSI driver service account"
  type        = string
  default     = null
}

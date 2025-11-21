# IAM Module for VoiceAssist - EKS and Service Account Roles
# This module creates IAM roles for EKS cluster, node groups, and service accounts (IRSA)

# EKS Cluster IAM Role
resource "aws_iam_role" "eks_cluster" {
  name_prefix = "${var.name_prefix}-eks-cluster-"
  description = "IAM role for EKS cluster - ${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-eks-cluster-role"
      Type = "EKS-Cluster"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Attach required policies to EKS cluster role
resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster.name
}

# Optional: Attach VPC resource controller policy for security group management
resource "aws_iam_role_policy_attachment" "eks_vpc_resource_controller" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  role       = aws_iam_role.eks_cluster.name
}

# EKS Node Group IAM Role
resource "aws_iam_role" "eks_node" {
  name_prefix = "${var.name_prefix}-eks-node-"
  description = "IAM role for EKS node group - ${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-eks-node-role"
      Type = "EKS-Node"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Attach required policies to EKS node role
resource "aws_iam_role_policy_attachment" "eks_node_worker_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_node.name
}

resource "aws_iam_role_policy_attachment" "eks_node_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_node.name
}

resource "aws_iam_role_policy_attachment" "eks_node_ecr_read_only" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_node.name
}

# Optional: CloudWatch agent policy for container insights
resource "aws_iam_role_policy_attachment" "eks_node_cloudwatch_policy" {
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
  role       = aws_iam_role.eks_node.name
}

# Optional: SSM policy for node management
resource "aws_iam_role_policy_attachment" "eks_node_ssm_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  role       = aws_iam_role.eks_node.name
}

# Service Account IAM Role for Application Pods (IRSA - IAM Roles for Service Accounts)
resource "aws_iam_role" "service_account" {
  for_each = var.service_accounts

  name_prefix = "${var.name_prefix}-${each.key}-sa-"
  description = "IAM role for service account ${each.key} - ${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = var.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${replace(var.oidc_provider_arn, "/^(.*provider/)/", "")}:sub" = "system:serviceaccount:${each.value.namespace}:${each.value.service_account_name}"
            "${replace(var.oidc_provider_arn, "/^(.*provider/)/", "")}:aud" = "sts.amazonaws.com"
          }
        }
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name        = "${var.name_prefix}-${each.key}-sa-role"
      Type        = "Service-Account"
      ServiceName = each.key
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Attach custom policies to service account roles
resource "aws_iam_role_policy_attachment" "service_account_policies" {
  for_each = {
    for pair in flatten([
      for sa_name, sa_config in var.service_accounts : [
        for policy_arn in sa_config.policy_arns : {
          key        = "${sa_name}-${policy_arn}"
          sa_name    = sa_name
          policy_arn = policy_arn
        }
      ]
    ]) : pair.key => pair
  }

  role       = aws_iam_role.service_account[each.value.sa_name].name
  policy_arn = each.value.policy_arn
}

# Custom IAM Policy for S3 Access (Example for file storage)
resource "aws_iam_policy" "s3_access" {
  count = var.create_s3_policy ? 1 : 0

  name_prefix = "${var.name_prefix}-s3-access-"
  description = "S3 access policy for VoiceAssist application"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.name_prefix}-*/*",
          "arn:aws:s3:::${var.name_prefix}-*"
        ]
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-s3-access-policy"
    }
  )
}

# Custom IAM Policy for Secrets Manager Access
resource "aws_iam_policy" "secrets_access" {
  count = var.create_secrets_policy ? 1 : 0

  name_prefix = "${var.name_prefix}-secrets-access-"
  description = "Secrets Manager access policy for VoiceAssist application"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:*:*:secret:${var.name_prefix}-*"
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-secrets-access-policy"
    }
  )
}

# Custom IAM Policy for KMS Access
resource "aws_iam_policy" "kms_access" {
  count = var.create_kms_policy ? 1 : 0

  name_prefix = "${var.name_prefix}-kms-access-"
  description = "KMS access policy for VoiceAssist application"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:GenerateDataKey"
        ]
        Resource = var.kms_key_arns
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-kms-access-policy"
    }
  )
}

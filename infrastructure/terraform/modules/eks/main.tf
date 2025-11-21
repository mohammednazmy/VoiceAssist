# EKS Module for VoiceAssist - Kubernetes Cluster
# This module creates an EKS cluster with encryption, logging, and IRSA support

# KMS Key for EKS Cluster Encryption
resource "aws_kms_key" "eks" {
  description             = "KMS key for EKS cluster encryption - ${var.environment}"
  deletion_window_in_days = var.kms_deletion_window
  enable_key_rotation     = true

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-eks-kms"
      Type = "EKS-Encryption"
    }
  )
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${var.name_prefix}-eks"
  target_key_id = aws_kms_key.eks.key_id
}

# CloudWatch Log Group for EKS Cluster Logs
resource "aws_cloudwatch_log_group" "eks_cluster" {
  name              = "/aws/eks/${var.name_prefix}-cluster/cluster"
  retention_in_days = var.cluster_log_retention_days
  kms_key_id        = aws_kms_key.eks.arn

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-eks-cluster-logs"
      Type = "EKS-Logs"
    }
  )
}

# EKS Cluster
resource "aws_eks_cluster" "main" {
  name     = "${var.name_prefix}-cluster"
  role_arn = var.cluster_role_arn
  version  = var.cluster_version

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = var.endpoint_private_access
    endpoint_public_access  = var.endpoint_public_access
    public_access_cidrs     = var.public_access_cidrs
    security_group_ids      = [var.cluster_security_group_id]
  }

  encryption_config {
    provider {
      key_arn = aws_kms_key.eks.arn
    }
    resources = ["secrets"]
  }

  enabled_cluster_log_types = var.enabled_cluster_log_types

  depends_on = [
    aws_cloudwatch_log_group.eks_cluster
  ]

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-eks-cluster"
      Type = "EKS-Cluster"
    }
  )

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [
      # Ignore changes to version to prevent unintended upgrades
      # version
    ]
  }
}

# OIDC Provider for IRSA (IAM Roles for Service Accounts)
data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-eks-oidc"
      Type = "EKS-OIDC"
    }
  )
}

# Launch Template for Node Group
resource "aws_launch_template" "eks_nodes" {
  name_prefix = "${var.name_prefix}-eks-node-"
  description = "Launch template for EKS nodes - ${var.environment}"

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = var.node_disk_size
      volume_type           = var.node_disk_type
      encrypted             = true
      kms_key_id            = aws_kms_key.eks.arn
      delete_on_termination = true
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  monitoring {
    enabled = true
  }

  network_interfaces {
    associate_public_ip_address = false
    delete_on_termination       = true
    security_groups             = [var.node_security_group_id]
  }

  tag_specifications {
    resource_type = "instance"

    tags = merge(
      var.tags,
      {
        Name = "${var.name_prefix}-eks-node"
        Type = "EKS-Node"
      }
    )
  }

  tag_specifications {
    resource_type = "volume"

    tags = merge(
      var.tags,
      {
        Name = "${var.name_prefix}-eks-node-volume"
        Type = "EKS-Node-Volume"
      }
    )
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    cluster_name        = aws_eks_cluster.main.name
    cluster_endpoint    = aws_eks_cluster.main.endpoint
    cluster_ca          = aws_eks_cluster.main.certificate_authority[0].data
    bootstrap_extra_args = var.bootstrap_extra_args
  }))

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-eks-node-template"
      Type = "EKS-Node-Template"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# EKS Node Group
resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.name_prefix}-node-group"
  node_role_arn   = var.node_role_arn
  subnet_ids      = var.node_subnet_ids
  version         = var.cluster_version

  scaling_config {
    desired_size = var.node_desired_size
    max_size     = var.node_max_size
    min_size     = var.node_min_size
  }

  update_config {
    max_unavailable_percentage = var.node_max_unavailable_percentage
  }

  launch_template {
    id      = aws_launch_template.eks_nodes.id
    version = "$Latest"
  }

  instance_types = var.node_instance_types
  capacity_type  = var.node_capacity_type
  disk_size      = var.node_disk_size

  labels = merge(
    var.node_labels,
    {
      environment = var.environment
      managed_by  = "terraform"
    }
  )

  dynamic "taint" {
    for_each = var.node_taints
    content {
      key    = taint.value.key
      value  = taint.value.value
      effect = taint.value.effect
    }
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-eks-node-group"
      Type = "EKS-Node-Group"
    }
  )

  lifecycle {
    create_before_destroy = true
    ignore_changes = [
      scaling_config[0].desired_size,
      # version
    ]
  }

  depends_on = [
    aws_eks_cluster.main
  ]
}

# EKS Add-ons
resource "aws_eks_addon" "vpc_cni" {
  count = var.enable_vpc_cni_addon ? 1 : 0

  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "vpc-cni"
  addon_version            = var.vpc_cni_addon_version
  resolve_conflicts        = "OVERWRITE"
  service_account_role_arn = var.vpc_cni_service_account_role_arn

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-vpc-cni-addon"
    }
  )

  depends_on = [
    aws_eks_node_group.main
  ]
}

resource "aws_eks_addon" "kube_proxy" {
  count = var.enable_kube_proxy_addon ? 1 : 0

  cluster_name      = aws_eks_cluster.main.name
  addon_name        = "kube-proxy"
  addon_version     = var.kube_proxy_addon_version
  resolve_conflicts = "OVERWRITE"

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-kube-proxy-addon"
    }
  )

  depends_on = [
    aws_eks_node_group.main
  ]
}

resource "aws_eks_addon" "coredns" {
  count = var.enable_coredns_addon ? 1 : 0

  cluster_name      = aws_eks_cluster.main.name
  addon_name        = "coredns"
  addon_version     = var.coredns_addon_version
  resolve_conflicts = "OVERWRITE"

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-coredns-addon"
    }
  )

  depends_on = [
    aws_eks_node_group.main
  ]
}

resource "aws_eks_addon" "ebs_csi_driver" {
  count = var.enable_ebs_csi_addon ? 1 : 0

  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "aws-ebs-csi-driver"
  addon_version            = var.ebs_csi_addon_version
  resolve_conflicts        = "OVERWRITE"
  service_account_role_arn = var.ebs_csi_service_account_role_arn

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-ebs-csi-addon"
    }
  )

  depends_on = [
    aws_eks_node_group.main
  ]
}

# Security Group Rule to allow nodes to communicate with cluster API
resource "aws_security_group_rule" "cluster_to_node" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = var.cluster_security_group_id
  security_group_id        = var.node_security_group_id
  description              = "Allow cluster API to communicate with nodes"
}

resource "aws_security_group_rule" "node_to_cluster" {
  type                     = "egress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = var.cluster_security_group_id
  security_group_id        = var.node_security_group_id
  description              = "Allow nodes to communicate with cluster API"
}

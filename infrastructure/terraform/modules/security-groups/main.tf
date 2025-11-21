# VoiceAssist V2 - Security Groups Terraform Module
# Creates security groups for EKS, RDS, and Redis

# EKS Cluster Security Group
resource "aws_security_group" "eks_cluster" {
  name_prefix = "${var.name_prefix}-eks-cluster-"
  description = "Security group for EKS cluster control plane"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-eks-cluster-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# EKS Cluster - Allow HTTPS from nodes
resource "aws_security_group_rule" "eks_cluster_ingress_nodes" {
  description              = "Allow pods to communicate with the cluster API Server"
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.eks_cluster.id
  source_security_group_id = aws_security_group.eks_node.id
}

# EKS Cluster - Allow all egress
resource "aws_security_group_rule" "eks_cluster_egress" {
  description       = "Allow cluster egress access to the Internet"
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.eks_cluster.id
}

# EKS Node Security Group
resource "aws_security_group" "eks_node" {
  name_prefix = "${var.name_prefix}-eks-node-"
  description = "Security group for EKS worker nodes"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name                                        = "${var.name_prefix}-eks-node-sg"
      "kubernetes.io/cluster/${var.name_prefix}" = "owned"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# EKS Node - Allow node to node communication
resource "aws_security_group_rule" "eks_node_ingress_self" {
  description              = "Allow nodes to communicate with each other"
  type                     = "ingress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "-1"
  security_group_id        = aws_security_group.eks_node.id
  source_security_group_id = aws_security_group.eks_node.id
}

# EKS Node - Allow cluster to node communication
resource "aws_security_group_rule" "eks_node_ingress_cluster" {
  description              = "Allow worker Kubelets and pods to receive communication from the cluster control plane"
  type                     = "ingress"
  from_port                = 1025
  to_port                  = 65535
  protocol                 = "tcp"
  security_group_id        = aws_security_group.eks_node.id
  source_security_group_id = aws_security_group.eks_cluster.id
}

# EKS Node - Allow HTTPS from cluster
resource "aws_security_group_rule" "eks_node_ingress_cluster_https" {
  description              = "Allow pods running extension API servers on port 443 to receive communication from cluster control plane"
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.eks_node.id
  source_security_group_id = aws_security_group.eks_cluster.id
}

# EKS Node - Allow all egress
resource "aws_security_group_rule" "eks_node_egress" {
  description       = "Allow nodes all egress to the Internet"
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.eks_node.id
}

# RDS Security Group
resource "aws_security_group" "rds" {
  name_prefix = "${var.name_prefix}-rds-"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-rds-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# RDS - Allow PostgreSQL from EKS nodes
resource "aws_security_group_rule" "rds_ingress_eks_nodes" {
  description              = "Allow PostgreSQL traffic from EKS nodes"
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.eks_node.id
}

# RDS - Allow PostgreSQL from VPC (for debugging)
resource "aws_security_group_rule" "rds_ingress_vpc" {
  description       = "Allow PostgreSQL traffic from within VPC"
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = [var.vpc_cidr]
  security_group_id = aws_security_group.rds.id
}

# Redis Security Group
resource "aws_security_group" "redis" {
  name_prefix = "${var.name_prefix}-redis-"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Redis - Allow Redis from EKS nodes
resource "aws_security_group_rule" "redis_ingress_eks_nodes" {
  description              = "Allow Redis traffic from EKS nodes"
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = aws_security_group.redis.id
  source_security_group_id = aws_security_group.eks_node.id
}

# Redis - Allow Redis from VPC (for debugging)
resource "aws_security_group_rule" "redis_ingress_vpc" {
  description       = "Allow Redis traffic from within VPC"
  type              = "ingress"
  from_port         = 6379
  to_port           = 6379
  protocol          = "tcp"
  cidr_blocks       = [var.vpc_cidr]
  security_group_id = aws_security_group.redis.id
}

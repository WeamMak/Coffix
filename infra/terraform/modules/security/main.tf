locals {
  node_security_group_ids = merge(
    { control_plane = aws_security_group.control_plane.id },
    { for environment, group in aws_security_group.worker : environment => group.id },
  )
  node_services = {
    kubelet       = { port = 10250, protocol = "tcp" }
    cilium_vxlan  = { port = 8472, protocol = "udp" }
    cilium_health = { port = 4240, protocol = "tcp" }
  }
  node_connections = {
    for connection in setproduct(keys(local.node_security_group_ids), keys(local.node_security_group_ids), keys(local.node_services)) :
    join("-", connection) => {
      source      = connection[0]
      destination = connection[1]
      service     = local.node_services[connection[2]]
    }
  }
  node_dns_connections = {
    for connection in setproduct(keys(local.node_security_group_ids), ["tcp", "udp"]) :
    join("-", connection) => { node = connection[0], protocol = connection[1] }
  }
}

resource "aws_security_group" "control_plane" {
  name        = "coffix-shared-control-plane"
  description = "Private cluster API and node traffic; SSM-only administration"
  vpc_id      = var.vpc_id
}

resource "aws_security_group" "worker" {
  for_each = toset(["dev", "prod"])

  name        = "coffix-${each.key}-worker"
  description = "${each.key} worker traffic from the ALB and cluster nodes only"
  vpc_id      = var.vpc_id
  tags        = { environment = each.key }
}

resource "aws_security_group" "alb" {
  name        = "coffix-shared-alb"
  description = "Public HTTPS ingress and HTTP redirect for both environments"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "alb_public" {
  for_each = toset(["80", "443"])

  security_group_id = aws_security_group.alb.id
  description       = each.key == "443" ? "Public HTTPS" : "Public HTTP redirected to HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.key)
  to_port           = tonumber(each.key)
}

resource "aws_vpc_security_group_ingress_rule" "worker_ingress" {
  for_each = aws_security_group.worker

  security_group_id            = each.value.id
  referenced_security_group_id = aws_security_group.alb.id
  description                  = "HTTPS ingress NodePort from the shared ALB only"
  ip_protocol                  = "tcp"
  from_port                    = 32080
  to_port                      = 32080
}

resource "aws_vpc_security_group_egress_rule" "alb_ingress" {
  for_each = aws_security_group.worker

  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = each.value.id
  description                  = "Reencrypted HTTPS and target health checks on ${each.key} workers"
  ip_protocol                  = "tcp"
  from_port                    = 32080
  to_port                      = 32080
}

resource "aws_vpc_security_group_ingress_rule" "api" {
  for_each = local.node_security_group_ids

  security_group_id            = aws_security_group.control_plane.id
  referenced_security_group_id = each.value
  description                  = "Private Kubernetes API from ${each.key} nodes"
  ip_protocol                  = "tcp"
  from_port                    = 6443
  to_port                      = 6443
}

resource "aws_vpc_security_group_egress_rule" "api" {
  for_each = local.node_security_group_ids

  security_group_id            = each.value
  referenced_security_group_id = aws_security_group.control_plane.id
  description                  = "Private Kubernetes API on the control plane"
  ip_protocol                  = "tcp"
  from_port                    = 6443
  to_port                      = 6443
}

resource "aws_vpc_security_group_ingress_rule" "node" {
  for_each = local.node_connections

  security_group_id            = local.node_security_group_ids[each.value.destination]
  referenced_security_group_id = local.node_security_group_ids[each.value.source]
  description                  = "Required cluster traffic: ${each.key}"
  ip_protocol                  = each.value.service.protocol
  from_port                    = each.value.service.port
  to_port                      = each.value.service.port
}

resource "aws_vpc_security_group_egress_rule" "node" {
  for_each = local.node_connections

  security_group_id            = local.node_security_group_ids[each.value.source]
  referenced_security_group_id = local.node_security_group_ids[each.value.destination]
  description                  = "Required cluster traffic: ${each.key}"
  ip_protocol                  = each.value.service.protocol
  from_port                    = each.value.service.port
  to_port                      = each.value.service.port
}

# AWS APIs, registries and external providers do not share a stable CIDR set.
# This exception permits HTTPS only; it does not expose a node listener.
#trivy:ignore:aws-vpc-no-public-egress-sgr
resource "aws_vpc_security_group_egress_rule" "node_https" {
  for_each = local.node_security_group_ids

  security_group_id = each.value
  description       = "HTTPS for SSM, registries, AWS APIs and approved providers"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "node_dns" {
  for_each = local.node_dns_connections

  security_group_id = local.node_security_group_ids[each.value.node]
  description       = "DNS to the VPC resolver only"
  cidr_ipv4         = "${cidrhost(var.vpc_cidr, 2)}/32"
  ip_protocol       = each.value.protocol
  from_port         = 53
  to_port           = 53
}

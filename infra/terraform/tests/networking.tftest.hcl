mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = { names = ["us-east-1a", "us-east-1b", "us-east-1c"] }
  }
}

run "public_subnets_route_directly_without_nat" {
  command = plan
  module {
    source = "./modules/vpc"
  }
  variables {
    aws_account_id     = "123456789012"
    aws_region         = "us-east-1"
    availability_zones = ["us-east-1a", "us-east-1b"]
  }
  override_resource {
    target          = aws_vpc.main
    values          = { id = "vpc-12345678" }
    override_during = plan
  }
  override_resource {
    target          = aws_internet_gateway.main
    values          = { id = "igw-12345678" }
    override_during = plan
  }
  override_resource {
    target          = aws_route_table.public
    values          = { id = "rtb-12345678" }
    override_during = plan
  }
  assert {
    condition = (
      length(aws_subnet.public) == 2 &&
      aws_subnet.public["us-east-1a"].cidr_block == "10.42.0.0/24" &&
      aws_subnet.public["us-east-1b"].cidr_block == "10.42.1.0/24" &&
      alltrue([for subnet in aws_subnet.public : !subnet.map_public_ip_on_launch && subnet.vpc_id == "vpc-12345678"]) &&
      output.vpc_id == "vpc-12345678" &&
      toset(keys(output.public_subnet_ids)) == toset(["us-east-1a", "us-east-1b"])
    )
    error_message = "Two deterministic public subnets must expose AZ-keyed coordinates; nodes receive public addresses explicitly in task 38."
  }
  assert {
    condition = (
      aws_route.public_egress.destination_cidr_block == "0.0.0.0/0" &&
      aws_route.public_egress.gateway_id == "igw-12345678" &&
      aws_route.public_egress.nat_gateway_id == null &&
      alltrue([for association in aws_route_table_association.public : association.route_table_id == "rtb-12345678"]) &&
      aws_vpc_endpoint.s3.vpc_endpoint_type == "Gateway" &&
      aws_vpc_endpoint.s3.route_table_ids == toset(["rtb-12345678"])
    )
    error_message = "Use direct Internet Gateway routes and the S3 gateway endpoint, with no NAT forwarding."
  }
  assert {
    condition = (
      length(aws_default_security_group.main.ingress) == 0 &&
      length(aws_default_security_group.main.egress) == 0 &&
      aws_flow_log.network.traffic_type == "ALL" &&
      aws_flow_log.network.max_aggregation_interval == 600 &&
      aws_cloudwatch_log_group.flow.retention_in_days == 14 &&
      aws_cloudwatch_log_group.flow.kms_key_id == null
    )
    error_message = "The default SG must deny traffic; retain bounded CloudWatch-managed encrypted flow logs without another customer key."
  }
  assert {
    condition = (
      toset(jsondecode(aws_iam_role_policy.flow.policy).Statement[0].Action) == toset(["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]) &&
      jsondecode(aws_iam_role_policy.flow.policy).Statement[0].Resource == "arn:aws:logs:us-east-1:123456789012:log-group:/coffix/shared/vpc-flow:*" &&
      jsondecode(aws_iam_role.flow.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "123456789012"
    )
    error_message = "Flow delivery may write only its precreated log group, with service trust restricted to this account."
  }
}

run "cluster_rules_restrict_public_and_internal_access" {
  command = plan
  module {
    source = "./modules/security"
  }
  variables {
    vpc_id   = "vpc-12345678"
    vpc_cidr = "10.42.0.0/16"
  }
  override_resource {
    target          = aws_security_group.control_plane
    values          = { id = "sg-control-plane" }
    override_during = plan
  }
  override_resource {
    target          = aws_security_group.worker["dev"]
    values          = { id = "sg-dev-worker" }
    override_during = plan
  }
  override_resource {
    target          = aws_security_group.worker["prod"]
    values          = { id = "sg-prod-worker" }
    override_during = plan
  }
  override_resource {
    target          = aws_security_group.alb
    values          = { id = "sg-alb" }
    override_during = plan
  }
  assert {
    condition = (
      length(aws_vpc_security_group_ingress_rule.alb_public) == 2 &&
      alltrue([for rule in aws_vpc_security_group_ingress_rule.alb_public : rule.security_group_id == "sg-alb" && rule.cidr_ipv4 == "0.0.0.0/0" && rule.ip_protocol == "tcp" && contains([80, 443], rule.from_port) && rule.from_port == rule.to_port]) &&
      alltrue([for environment, rule in aws_vpc_security_group_ingress_rule.worker_ingress : rule.security_group_id == "sg-${environment}-worker" && rule.referenced_security_group_id == "sg-alb" && rule.cidr_ipv4 == null && rule.from_port == 32080 && rule.to_port == 32080 && rule.ip_protocol == "tcp"]) &&
      alltrue([for environment, rule in aws_vpc_security_group_egress_rule.alb_ingress : rule.security_group_id == "sg-alb" && rule.referenced_security_group_id == "sg-${environment}-worker" && rule.cidr_ipv4 == null && rule.from_port == 32080 && rule.to_port == 32080 && rule.ip_protocol == "tcp"])
    )
    error_message = "Only ALB HTTP/HTTPS may be public; ALB egress and worker ingress must match the HTTPS NodePort."
  }
  assert {
    condition = (
      length(aws_vpc_security_group_ingress_rule.api) == 3 &&
      alltrue([for node, rule in aws_vpc_security_group_ingress_rule.api : rule.security_group_id == "sg-control-plane" && rule.referenced_security_group_id == local.node_security_group_ids[node] && rule.cidr_ipv4 == null && rule.from_port == 6443 && rule.to_port == 6443 && rule.ip_protocol == "tcp"]) &&
      alltrue([for node, rule in aws_vpc_security_group_egress_rule.api : rule.security_group_id == local.node_security_group_ids[node] && rule.referenced_security_group_id == "sg-control-plane" && rule.cidr_ipv4 == null && rule.from_port == 6443 && rule.to_port == 6443 && rule.ip_protocol == "tcp"])
    )
    error_message = "Only cluster SGs may reach the Kubernetes API, with explicit node egress and no public administration."
  }
  assert {
    condition = (
      length(aws_vpc_security_group_ingress_rule.node) == 27 &&
      length(aws_vpc_security_group_egress_rule.node) == 27 &&
      toset([for rule in aws_vpc_security_group_ingress_rule.node : "${rule.ip_protocol}:${rule.from_port}"]) == toset(["tcp:10250", "udp:8472", "tcp:4240"]) &&
      alltrue([for key, rule in aws_vpc_security_group_ingress_rule.node : rule.cidr_ipv4 == null && rule.from_port == rule.to_port && contains(values(local.node_security_group_ids), rule.security_group_id) && contains(values(local.node_security_group_ids), rule.referenced_security_group_id) && rule.security_group_id == aws_vpc_security_group_egress_rule.node[key].referenced_security_group_id && rule.referenced_security_group_id == aws_vpc_security_group_egress_rule.node[key].security_group_id && rule.from_port == aws_vpc_security_group_egress_rule.node[key].from_port && rule.ip_protocol == aws_vpc_security_group_egress_rule.node[key].ip_protocol])
    )
    error_message = "Node SGs may exchange only kubelet, Cilium VXLAN and health traffic with matching ingress/egress."
  }
  assert {
    condition = (
      length(aws_vpc_security_group_egress_rule.node_https) == 3 &&
      alltrue([for rule in aws_vpc_security_group_egress_rule.node_https : rule.cidr_ipv4 == "0.0.0.0/0" && rule.from_port == 443 && rule.to_port == 443 && rule.ip_protocol == "tcp"]) &&
      length(aws_vpc_security_group_egress_rule.node_dns) == 6 &&
      alltrue([for rule in aws_vpc_security_group_egress_rule.node_dns : rule.cidr_ipv4 == "10.42.0.2/32" && rule.from_port == 53 && rule.to_port == 53 && contains(["tcp", "udp"], rule.ip_protocol)])
    )
    error_message = "Node internet egress is HTTPS only; DNS targets only the exact VPC resolver."
  }
  assert {
    condition = (
      output.control_plane_security_group_id == "sg-control-plane" &&
      output.worker_security_group_ids == { dev = "sg-dev-worker", prod = "sg-prod-worker" } &&
      output.alb_security_group_id == "sg-alb"
    )
    error_message = "Shared security must export distinct control-plane, environment worker and ALB SGs."
  }
}

run "shared_root_defaults_to_two_azs_and_exports_cluster_coordinates" {
  command = plan
  module {
    source = "./environments/shared"
  }
  variables {
    aws_account_id = "123456789012"
    aws_region     = "us-east-1"
    owner          = "test-owner"
    cost_center    = "test"
  }
  override_module {
    target = module.network
    outputs = {
      vpc_id            = "vpc-12345678"
      public_subnet_ids = { "us-east-1a" = "subnet-11111111", "us-east-1b" = "subnet-22222222" }
    }
  }
  override_module {
    target = module.security
    outputs = {
      control_plane_security_group_id = "sg-control-plane"
      worker_security_group_ids       = { dev = "sg-dev-worker", prod = "sg-prod-worker" }
      alb_security_group_id           = "sg-alb"
    }
  }
  assert {
    condition = (
      local.availability_zones == tolist(["us-east-1a", "us-east-1b"]) &&
      one(data.aws_availability_zones.available.filter).name == "opt-in-status" &&
      one(data.aws_availability_zones.available.filter).values == toset(["opt-in-not-required"]) &&
      output.network.vpc_id == "vpc-12345678" &&
      toset(keys(output.network.public_subnet_ids)) == toset(["us-east-1a", "us-east-1b"]) &&
      output.cluster_security.control_plane_security_group_id == "sg-control-plane" &&
      output.cluster_security.worker_security_group_ids == { dev = "sg-dev-worker", prod = "sg-prod-worker" } &&
      output.cluster_security.alb_security_group_id == "sg-alb"
    )
    error_message = "The shared root must select two AZs by default and expose public networking and cluster SG coordinates."
  }
}

run "reject_local_or_other_region_zone" {
  command = plan
  module {
    source = "./environments/shared"
  }
  variables {
    aws_account_id     = "123456789012"
    aws_region         = "us-east-1"
    owner              = "test-owner"
    cost_center        = "test"
    availability_zones = ["us-east-1a", "us-east-1-bos-1a"]
  }
  expect_failures = [var.availability_zones]
}

run "reject_single_az_network" {
  command = plan
  module {
    source = "./modules/vpc"
  }
  variables {
    aws_account_id     = "123456789012"
    aws_region         = "us-east-1"
    availability_zones = ["us-east-1a"]
  }
  expect_failures = [var.availability_zones]
}

run "reject_duplicate_azs" {
  command = plan
  module {
    source = "./modules/vpc"
  }
  variables {
    aws_account_id     = "123456789012"
    aws_region         = "us-east-1"
    availability_zones = ["us-east-1a", "us-east-1a"]
  }
  expect_failures = [var.availability_zones]
}

run "reject_nonprivate_vpc_cidr" {
  command = plan
  module {
    source = "./modules/vpc"
  }
  variables {
    aws_account_id     = "123456789012"
    aws_region         = "us-east-1"
    availability_zones = ["us-east-1a", "us-east-1b"]
    cidr_block         = "203.0.113.0/24"
  }
  expect_failures = [var.cidr_block]
}

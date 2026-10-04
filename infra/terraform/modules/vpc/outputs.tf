output "public_subnet_ids" {
  description = "Public cluster and load-balancer subnets by Availability Zone."
  value       = { for zone, subnet in aws_subnet.public : zone => subnet.id }
}

output "vpc_id" {
  description = "Shared Coffix VPC ID."
  value       = aws_vpc.main.id
}

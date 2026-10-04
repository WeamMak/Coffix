output "alb_security_group_id" {
  description = "Shared ALB security group with public HTTP/HTTPS and worker-only egress."
  value       = aws_security_group.alb.id
}

output "control_plane_security_group_id" {
  description = "Control-plane security group restricted to cluster nodes and SSM."
  value       = aws_security_group.control_plane.id
}

output "worker_security_group_ids" {
  description = "Distinct dev/prod worker security groups for the matching node groups."
  value       = { for environment, group in aws_security_group.worker : environment => group.id }
}

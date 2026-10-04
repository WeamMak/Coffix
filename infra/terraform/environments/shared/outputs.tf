output "default_tags" {
  description = "Required default tags for every AWS resource in this root."
  value       = local.default_tags
}

output "network" {
  description = "Non-secret public networking handoff for subsequent cluster tasks."
  value = {
    vpc_id            = module.network.vpc_id
    public_subnet_ids = module.network.public_subnet_ids
  }
}

output "cluster_security" {
  description = "Shared cluster and ALB security groups; attach workers only to their environment group."
  value = {
    alb_security_group_id           = module.security.alb_security_group_id
    control_plane_security_group_id = module.security.control_plane_security_group_id
    worker_security_group_ids       = module.security.worker_security_group_ids
  }
}

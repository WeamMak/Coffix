output "default_tags" {
  description = "Required default tags for every AWS resource in this root."
  value       = local.default_tags
}


output "data_foundations" {
  description = "Non-secret prod storage and credential references for Task 40; no database endpoints or secret values."
  value = {
    secret_arns    = module.secrets.secret_arns
    media_bucket   = module.media.bucket_name
    media_prefix   = module.media.prefix
    backup_bucket  = module.backup_storage.bucket_name
    backup_prefix  = module.backup_storage.prefix
    retention_days = module.backup_storage.retention_days
  }
}

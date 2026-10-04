output "bucket_arn" {
  description = "Private PostgreSQL backup bucket ARN for environment-specific IAM."
  value       = aws_s3_bucket.main.arn
}

output "bucket_name" {
  description = "Private bucket for the environment's PostgreSQL base backups and WAL."
  value       = aws_s3_bucket.main.id
}

output "prefix" {
  description = "Object-store destination prefix; Barman manages its base-backup and WAL layout."
  value       = "${var.environment}/postgresql/"
}

output "retention_days" {
  description = "Logical recovery-window days for Task 40's Barman policy, not S3 current-object expiration."
  value       = var.environment == "prod" ? 30 : 7
}

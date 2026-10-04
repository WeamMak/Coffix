output "bucket_arn" {
  description = "Private media bucket ARN for environment-specific IAM."
  value       = aws_s3_bucket.media.arn
}

output "bucket_name" {
  description = "MEDIA_S3_BUCKET value."
  value       = aws_s3_bucket.media.id
}

output "prefix" {
  description = "MEDIA_S3_PREFIX value within the environment-specific bucket."
  value       = "${var.environment}/"
}

output "backend_config" {
  description = "Non-secret partial backend configuration; each root fixes its own key, encryption and locking."
  value = {
    bucket              = aws_s3_bucket.state.id
    region              = var.aws_region
    kms_key_id          = aws_kms_key.state.arn
    allowed_account_ids = [var.aws_account_id]
  }
}

output "github_role_arns" {
  description = "Environment/action-specific GitHub OIDC role ARNs; no credentials are output."
  value       = { for name, role in aws_iam_role.github : name => role.arn }
}

output "default_tags" {
  description = "Required default tags for every AWS resource in this root."
  value       = local.default_tags
}

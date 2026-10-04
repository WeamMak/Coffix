output "secret_arns" {
  description = "Environment-specific application, PostgreSQL and Redis references; never secret values."
  value       = { for name, secret in aws_secretsmanager_secret.main : name => secret.arn }
}

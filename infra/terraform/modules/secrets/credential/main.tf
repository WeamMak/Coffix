# A narrow credential boundary also lets tests replace the AWS ephemeral calls:
# Terraform 1.15 cannot mock ephemeral resources. Never use a data source here.
ephemeral "aws_secretsmanager_random_password" "main" {
  password_length            = 64
  exclude_punctuation        = true
  include_space              = false
  require_each_included_type = true
}

resource "aws_secretsmanager_secret_version" "main" {
  secret_id = var.secret_id
  secret_string_wo = jsonencode(merge(var.metadata, {
    password = ephemeral.aws_secretsmanager_random_password.main.random_password
  }))
  secret_string_wo_version = var.password_version
}

# Values are consumed from Secrets Manager by Task 40, never read back into
# Terraform. Only increasing password_version replaces the stored JSON value.

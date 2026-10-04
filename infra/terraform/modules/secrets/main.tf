locals {
  descriptions = {
    application = "Runtime JWT and enabled provider configuration; Task 40 initializes the JSON value."
    postgresql  = "PostgreSQL runtime username, password and database; Task 40 creates restricted grants."
    redis       = "Redis application username and password; Task 40 configures the authenticated server."
  }
}

resource "aws_secretsmanager_secret" "main" {
  for_each = local.descriptions

  name                    = "/coffix/${var.environment}/${each.key}"
  description             = each.value
  kms_key_id              = "alias/aws/secretsmanager"
  recovery_window_in_days = var.environment == "prod" ? 30 : 7
  lifecycle {
    prevent_destroy = true
  }
}

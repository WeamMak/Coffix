provider "aws" {
  region                      = "us-east-1"
  access_key                  = "synthetic-test-access-key"
  secret_key                  = "synthetic-test-secret-key"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
}

variables {
  aws_account_id     = "123456789012"
  aws_region         = "us-east-1"
  cost_center        = "platform"
  owner              = "platform@example.invalid"
  availability_zones = ["us-east-1a", "us-east-1b"]
}

run "shared_provider_conventions" {
  command = plan
  module {
    source = "./environments/shared"
  }
  override_data {
    target = data.aws_availability_zones.available
    values = { names = ["us-east-1a", "us-east-1b"] }
  }
  assert {
    condition = output.default_tags == tomap({
      project     = "coffix"
      environment = "shared"
      owner       = "platform@example.invalid"
      managed-by  = "terraform"
      cost-center = "platform"
    })
    error_message = "All five default tags must identify the project, exact environment, owner and cost center."
  }
}

run "dev_provider_conventions" {
  command = plan
  module {
    source = "./environments/dev"
  }
  override_module {
    target  = module.postgresql_credential
    outputs = {}
  }
  override_module {
    target  = module.redis_credential
    outputs = {}
  }
  assert {
    condition = output.default_tags == tomap({
      project     = "coffix"
      environment = "dev"
      owner       = "platform@example.invalid"
      managed-by  = "terraform"
      cost-center = "platform"
    })
    error_message = "All five default tags must identify the project, exact environment, owner and cost center."
  }
  assert {
    condition = (
      toset(keys(output.data_foundations)) == toset(["secret_arns", "media_bucket", "media_prefix", "backup_bucket", "backup_prefix", "retention_days"]) &&
      toset(keys(output.data_foundations.secret_arns)) == toset(["application", "postgresql", "redis"]) &&
      output.data_foundations.media_prefix == "dev/" &&
      output.data_foundations.backup_prefix == "dev/postgresql/" &&
      output.data_foundations.retention_days == 7
    )
    error_message = "Root outputs must contain only scoped references and the environment's recovery-window metadata."
  }
}

run "prod_provider_conventions" {
  command = plan
  module {
    source = "./environments/prod"
  }
  override_module {
    target  = module.postgresql_credential
    outputs = {}
  }
  override_module {
    target  = module.redis_credential
    outputs = {}
  }
  assert {
    condition = output.default_tags == tomap({
      project     = "coffix"
      environment = "prod"
      owner       = "platform@example.invalid"
      managed-by  = "terraform"
      cost-center = "platform"
    })
    error_message = "All five default tags must identify the project, exact environment, owner and cost center."
  }
  assert {
    condition = (
      toset(keys(output.data_foundations)) == toset(["secret_arns", "media_bucket", "media_prefix", "backup_bucket", "backup_prefix", "retention_days"]) &&
      toset(keys(output.data_foundations.secret_arns)) == toset(["application", "postgresql", "redis"]) &&
      output.data_foundations.media_prefix == "prod/" &&
      output.data_foundations.backup_prefix == "prod/postgresql/" &&
      output.data_foundations.retention_days == 30
    )
    error_message = "Root outputs must contain only scoped references and the environment's recovery-window metadata."
  }
}

run "shared_reject_invalid_account" {
  command = plan
  module {
    source = "./environments/shared"
  }
  override_data {
    target = data.aws_availability_zones.available
    values = { names = ["us-east-1a", "us-east-1b"] }
  }
  variables {
    aws_account_id = "unapproved"
  }
  expect_failures = [var.aws_account_id]
}

run "dev_reject_invalid_account" {
  command = plan
  module {
    source = "./environments/dev"
  }
  override_module {
    target  = module.postgresql_credential
    outputs = {}
  }
  override_module {
    target  = module.redis_credential
    outputs = {}
  }
  variables {
    aws_account_id = "unapproved"
  }
  expect_failures = [var.aws_account_id]
}

run "prod_reject_invalid_account" {
  command = plan
  module {
    source = "./environments/prod"
  }
  override_module {
    target  = module.postgresql_credential
    outputs = {}
  }
  override_module {
    target  = module.redis_credential
    outputs = {}
  }
  variables {
    aws_account_id = "unapproved"
  }
  expect_failures = [var.aws_account_id]
}

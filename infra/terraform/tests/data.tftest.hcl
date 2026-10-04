# Offline plans use the locked provider schema without credentials, metadata
# discovery or AWS calls. Credential modules with ephemeral calls are tested
# through their static write-only contracts and overridden in root tests.
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "synthetic-test-access-key"
  secret_key                  = "synthetic-test-secret-key"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
}

run "production_backup_store_is_private_encrypted_and_retained" {
  command = plan
  module {
    source = "./modules/backup_storage"
  }
  variables {
    environment    = "prod"
    aws_account_id = "123456789012"
  }
  assert {
    condition = (
      aws_s3_bucket.main.bucket == "coffix-backups-prod-123456789012" &&
      !aws_s3_bucket.main.force_destroy &&
      aws_s3_bucket_public_access_block.main.block_public_acls &&
      aws_s3_bucket_public_access_block.main.block_public_policy &&
      aws_s3_bucket_public_access_block.main.ignore_public_acls &&
      aws_s3_bucket_public_access_block.main.restrict_public_buckets &&
      one(aws_s3_bucket_ownership_controls.main.rule).object_ownership == "BucketOwnerEnforced" &&
      aws_s3_bucket_versioning.main.versioning_configuration[0].status == "Enabled" &&
      one(aws_s3_bucket_server_side_encryption_configuration.main.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    )
    error_message = "PostgreSQL backup storage must be private, versioned, encrypted and protected from force deletion."
  }
  assert {
    condition = (
      jsondecode(aws_s3_bucket_policy.main.policy).Statement[0].Effect == "Deny" &&
      jsondecode(aws_s3_bucket_policy.main.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false" &&
      toset(jsondecode(aws_s3_bucket_policy.main.policy).Statement[0].Resource) == toset(["arn:aws:s3:::coffix-backups-prod-123456789012", "arn:aws:s3:::coffix-backups-prod-123456789012/*"]) &&
      jsondecode(aws_s3_bucket_policy.main.policy).Statement[1].Condition.StringNotEquals["s3:x-amz-server-side-encryption"] == "AES256" &&
      alltrue([for statement in jsondecode(aws_s3_bucket_policy.main.policy).Statement : statement.Effect == "Deny"])
    )
    error_message = "The backup bucket must deny plaintext transport and unsupported encryption without granting public access."
  }
  assert {
    condition = (
      output.prefix == "prod/postgresql/" &&
      output.retention_days == 30 &&
      one(aws_s3_bucket_lifecycle_configuration.main.rule).abort_incomplete_multipart_upload[0].days_after_initiation == 1 &&
      one(aws_s3_bucket_lifecycle_configuration.main.rule).noncurrent_version_expiration[0].noncurrent_days == 90 &&
      alltrue([for rule in aws_s3_bucket_lifecycle_configuration.main.rule : length(rule.expiration) == 0 && length(rule.transition) == 0])
    )
    error_message = "Barman owns 30-day logical retention; S3 must not age-expire or transition live base-backup/WAL chains."
  }
}

run "development_backup_store_is_separate_with_seven_day_recovery_window" {
  command = plan
  module {
    source = "./modules/backup_storage"
  }
  variables {
    environment    = "dev"
    aws_account_id = "123456789012"
  }
  assert {
    condition = (
      aws_s3_bucket.main.bucket == "coffix-backups-dev-123456789012" &&
      output.prefix == "dev/postgresql/" &&
      output.retention_days == 7 &&
      one(aws_s3_bucket_lifecycle_configuration.main.rule).noncurrent_version_expiration[0].noncurrent_days == 30 &&
      alltrue([for rule in aws_s3_bucket_lifecycle_configuration.main.rule : length(rule.expiration) == 0])
    )
    error_message = "Development needs a separate retained store and seven-day Barman policy without current-object expiration."
  }
}

run "media_is_private_encrypted_versioned_and_origin_restricted" {
  command = plan
  module {
    source = "./modules/media"
  }
  variables {
    environment     = "prod"
    aws_account_id  = "123456789012"
    allowed_origins = ["https://admin.example.invalid"]
  }
  assert {
    condition = (
      aws_s3_bucket.media.bucket == "coffix-media-prod-123456789012" &&
      !aws_s3_bucket.media.force_destroy &&
      aws_s3_bucket_public_access_block.media.block_public_acls &&
      aws_s3_bucket_public_access_block.media.block_public_policy &&
      aws_s3_bucket_public_access_block.media.ignore_public_acls &&
      aws_s3_bucket_public_access_block.media.restrict_public_buckets &&
      one(aws_s3_bucket_ownership_controls.media.rule).object_ownership == "BucketOwnerEnforced" &&
      aws_s3_bucket_versioning.media.versioning_configuration[0].status == "Enabled" &&
      one(aws_s3_bucket_server_side_encryption_configuration.media.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "AES256" &&
      one(aws_s3_bucket_cors_configuration.media[0].cors_rule).allowed_origins == toset(["https://admin.example.invalid"]) &&
      one(aws_s3_bucket_cors_configuration.media[0].cors_rule).allowed_methods == toset(["GET", "PUT", "HEAD"])
    )
    error_message = "Media must be private, encrypted, versioned and restricted to approved browser origins."
  }
  assert {
    condition = (
      one(aws_s3_bucket_lifecycle_configuration.media.rule).abort_incomplete_multipart_upload[0].days_after_initiation == 1 &&
      one(aws_s3_bucket_lifecycle_configuration.media.rule).noncurrent_version_expiration[0].noncurrent_days == 90 &&
      length(one(aws_s3_bucket_lifecycle_configuration.media.rule).expiration) == 0 &&
      output.prefix == "prod/" &&
      jsondecode(aws_s3_bucket_policy.media.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false" &&
      alltrue([for statement in jsondecode(aws_s3_bucket_policy.media.policy).Statement : statement.Effect == "Deny"])
    )
    error_message = "Retain current media and require TLS; lifecycle only cleans incomplete uploads and old versions."
  }
}

run "development_media_disables_unapproved_browser_origins" {
  command = plan
  module {
    source = "./modules/media"
  }
  variables {
    environment    = "dev"
    aws_account_id = "123456789012"
  }
  assert {
    condition = (
      length(aws_s3_bucket_cors_configuration.media) == 0 &&
      output.prefix == "dev/" &&
      one(aws_s3_bucket_lifecycle_configuration.media.rule).noncurrent_version_expiration[0].noncurrent_days == 30 &&
      aws_s3_bucket.media.bucket == "coffix-media-dev-123456789012"
    )
    error_message = "Development media must remain separate, with bounded version retention and CORS off until approved."
  }
}

run "production_has_exactly_three_recoverable_managed_key_secrets" {
  command = plan
  module {
    source = "./modules/secrets"
  }
  variables {
    environment = "prod"
  }
  assert {
    condition = (
      toset(keys(aws_secretsmanager_secret.main)) == toset(["application", "postgresql", "redis"]) &&
      toset(keys(output.secret_arns)) == toset(["application", "postgresql", "redis"]) &&
      alltrue([
        for name, secret in aws_secretsmanager_secret.main :
        secret.name == "/coffix/prod/${name}" &&
        secret.recovery_window_in_days == 30 &&
        secret.kms_key_id == "alias/aws/secretsmanager"
      ])
    )
    error_message = "Production must have exactly three isolated secret paths with AWS-managed encryption and a 30-day recovery window."
  }
}

run "development_has_distinct_secret_paths" {
  command = plan
  module {
    source = "./modules/secrets"
  }
  variables {
    environment = "dev"
  }
  assert {
    condition = (
      length(aws_secretsmanager_secret.main) == 3 &&
      alltrue([
        for name, secret in aws_secretsmanager_secret.main :
        secret.name == "/coffix/dev/${name}" &&
        secret.recovery_window_in_days == 7 &&
        secret.kms_key_id == "alias/aws/secretsmanager"
      ])
    )
    error_message = "Development's three credentials must remain in dev-only paths with a nonzero recovery window."
  }
}

run "reject_wildcard_media_origin" {
  command = plan
  module {
    source = "./modules/media"
  }
  variables {
    environment     = "dev"
    aws_account_id  = "123456789012"
    allowed_origins = ["https://*.example.invalid"]
  }
  expect_failures = [var.allowed_origins]
}

run "reject_plaintext_media_origin" {
  command = plan
  module {
    source = "./modules/media"
  }
  variables {
    environment     = "dev"
    aws_account_id  = "123456789012"
    allowed_origins = ["http://admin.example.invalid"]
  }
  expect_failures = [var.allowed_origins]
}

run "reject_invalid_backup_environment" {
  command = plan
  module {
    source = "./modules/backup_storage"
  }
  variables {
    environment    = "shared"
    aws_account_id = "123456789012"
  }
  expect_failures = [var.environment]
}

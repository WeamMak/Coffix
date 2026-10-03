mock_provider "aws" {
  mock_resource "aws_iam_openid_connect_provider" {
    override_during = plan
    defaults        = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_kms_key" {
    override_during = plan
    defaults        = { arn = "arn:aws:kms:eu-west-1:123456789012:key/00000000-0000-0000-0000-000000000001" }
  }
}

variables {
  aws_account_id    = "123456789012"
  aws_region        = "eu-west-1"
  cost_center       = "platform"
  github_repository = "WeamMak/Coffix"
  owner             = "platform@example.invalid"
  state_bucket_name = "coffix-test-state-123456789012"
}

run "encrypted_private_versioned_state" {
  command = plan
  module {
    source = "./bootstrap"
  }

  assert {
    condition     = one(aws_s3_bucket_server_side_encryption_configuration.state.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "aws:kms"
    error_message = "State must use KMS encryption."
  }
  assert {
    condition = length(jsondecode(aws_s3_bucket_policy.state.policy).Statement) == 3 && try(
      jsondecode(aws_s3_bucket_policy.state.policy).Statement[1].Effect == "Deny" &&
      jsondecode(aws_s3_bucket_policy.state.policy).Statement[1].Condition.StringNotEquals["s3:x-amz-server-side-encryption"] == "aws:kms" &&
      jsondecode(aws_s3_bucket_policy.state.policy).Statement[2].Effect == "Deny" &&
      jsondecode(aws_s3_bucket_policy.state.policy).Statement[2].Condition.StringNotEquals["s3:x-amz-server-side-encryption-aws-kms-key-id"] == "arn:aws:kms:eu-west-1:123456789012:key/00000000-0000-0000-0000-000000000001", false
    )
    error_message = "State writes must not override the required KMS encryption algorithm or key."
  }
  assert {
    condition = output.default_tags == tomap({
      project     = "coffix"
      environment = "shared"
      owner       = "platform@example.invalid"
      managed-by  = "terraform"
      cost-center = "platform"
    })
    error_message = "Bootstrap must use the required shared environment tags."
  }

  assert {
    condition     = aws_kms_key.state.enable_key_rotation && aws_kms_key.state.deletion_window_in_days == 30
    error_message = "State encryption key must rotate and allow a 30-day recovery window."
  }
  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.state.block_public_acls,
      aws_s3_bucket_public_access_block.state.block_public_policy,
      aws_s3_bucket_public_access_block.state.ignore_public_acls,
      aws_s3_bucket_public_access_block.state.restrict_public_buckets,
    ])
    error_message = "All state bucket public access controls must be enabled."
  }
  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled" && !aws_s3_bucket.state.force_destroy
    error_message = "State versions must survive accidental deletion and bucket destruction must not purge data."
  }
}

run "isolated_oidc_permissions" {
  command = plan
  module {
    source = "./bootstrap"
  }

  assert {
    condition = alltrue([for name, role in aws_iam_role.github :
      jsondecode(role.assume_role_policy).Statement[0].Principal.Federated == "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" &&
      jsondecode(role.assume_role_policy).Statement[0].Action == "sts:AssumeRoleWithWebIdentity" &&
      jsondecode(role.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com" &&
      jsondecode(role.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == (
        endswith(name, "-plan") ? "repo:WeamMak/Coffix:ref:refs/heads/main" : "repo:WeamMak/Coffix:environment:terraform-${trimsuffix(name, "-deploy")}-deploy"
      )
    ]) && length(aws_iam_role.github) == 6
    error_message = "Exactly six roles must restrict web identity to the audience, repository and main branch or matching deployment environment."
  }
  assert {
    condition = alltrue([for name, policy in aws_iam_role_policy.state :
      jsondecode(policy.policy).Statement[1].Resource == "arn:aws:s3:::coffix-test-state-123456789012/coffix/${trimsuffix(trimsuffix(name, "-plan"), "-deploy")}/terraform.tfstate" &&
      toset(jsondecode(policy.policy).Statement[1].Action) == (endswith(name, "-plan") ? toset(["s3:GetObject"]) : toset(["s3:GetObject", "s3:PutObject"])) &&
      toset(jsondecode(policy.policy).Statement[2].Action) == toset(["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]) &&
      endswith(jsondecode(policy.policy).Statement[2].Resource, "/terraform.tfstate.tflock")
    ])
    error_message = "Plan roles may only read their state; deploy roles may update it; deletion is limited to lock files."
  }
  assert {
    condition = alltrue([for name, policy in aws_iam_role_policy.state :
      jsondecode(policy.policy).Statement[0].Condition.StringEquals["s3:prefix"] == "coffix/${trimsuffix(trimsuffix(name, "-plan"), "-deploy")}/terraform.tfstate" &&
      jsondecode(policy.policy).Statement[3].Condition.StringEquals["kms:ViaService"] == "s3.eu-west-1.amazonaws.com" &&
      length(jsondecode(policy.policy).Statement) == 4
    ])
    error_message = "Listing must be scoped by state key and KMS usage by S3; no speculative infrastructure permissions are allowed."
  }
  assert {
    condition = alltrue([for name, policy in aws_iam_role_policy.state :
      jsondecode(policy.policy).Statement[3].Resource == "arn:aws:kms:eu-west-1:123456789012:key/00000000-0000-0000-0000-000000000001" &&
      toset(jsondecode(policy.policy).Statement[3].Condition.StringEquals["kms:EncryptionContext:aws:s3:arn"]) == toset([
        "arn:aws:s3:::coffix-test-state-123456789012/coffix/${trimsuffix(trimsuffix(name, "-plan"), "-deploy")}/terraform.tfstate",
        "arn:aws:s3:::coffix-test-state-123456789012/coffix/${trimsuffix(trimsuffix(name, "-plan"), "-deploy")}/terraform.tfstate.tflock",
      ])
    ])
    error_message = "KMS access must use the state key and only the role's state/lock object encryption contexts."
  }
  assert {
    condition     = jsondecode(aws_s3_bucket_policy.state.policy).Statement[0].Effect == "Deny" && jsondecode(aws_s3_bucket_policy.state.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false"
    error_message = "Unencrypted transport to state must be denied."
  }
}

run "reject_wildcard_repository" {
  command = plan
  module {
    source = "./bootstrap"
  }
  variables {
    github_repository = "WeamMak/*"
  }
  expect_failures = [var.github_repository]
}

run "reject_unidentified_owner" {
  command = plan
  module {
    source = "./bootstrap"
  }
  variables {
    owner = " "
  }
  expect_failures = [var.owner]
}

locals {
  default_tags = tomap({
    project     = "coffix"
    environment = "shared"
    owner       = var.owner
    managed-by  = "terraform"
    cost-center = var.cost_center
  })
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = local.default_tags
  }
}

resource "aws_kms_key" "state" {
  description             = "Coffix Terraform state encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "state" {
  name          = "alias/coffix-terraform-state"
  target_key_id = aws_kms_key.state.key_id
}

resource "aws_s3_bucket" "state" {
  bucket        = var.state_bucket_name
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = ["arn:aws:s3:::${var.state_bucket_name}", "arn:aws:s3:::${var.state_bucket_name}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
      }, {
      Sid       = "DenyIncorrectEncryption"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:PutObject"
      Resource  = "arn:aws:s3:::${var.state_bucket_name}/*"
      Condition = { StringNotEquals = { "s3:x-amz-server-side-encryption" = "aws:kms" } }
      }, {
      Sid       = "DenyIncorrectEncryptionKey"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:PutObject"
      Resource  = "arn:aws:s3:::${var.state_bucket_name}/*"
      Condition = { StringNotEquals = { "s3:x-amz-server-side-encryption-aws-kms-key-id" = aws_kms_key.state.arn } }
    }]
  })
}

locals {
  github_roles = merge([
    for environment in ["shared", "dev", "prod"] : {
      for action in ["plan", "deploy"] : "${environment}-${action}" => {
        environment = environment
        action      = action
        state_key   = "coffix/${environment}/terraform.tfstate"
        subject = action == "plan" ? (
          "repo:${var.github_repository}:ref:refs/heads/main"
        ) : "repo:${var.github_repository}:environment:terraform-${environment}-deploy"
      }
    }
  ]...)
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "github" {
  for_each = local.github_roles

  name                 = "coffix-${each.key}"
  description          = "GitHub Terraform ${each.value.action} for ${each.value.environment}"
  max_session_duration = 3600
  tags                 = { environment = each.value.environment }
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = each.value.subject
        }
      }
    }]
  })
}

# Permissions cover only this task's resources. Add reviewed, scoped service
# permissions when subsequent tasks introduce those resources; never attach
# AdministratorAccess or account-wide ReadOnlyAccess (which can expose secrets).
resource "aws_iam_role_policy" "state" {
  for_each = local.github_roles

  name = "environment-state"
  role = aws_iam_role.github[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "ListState"
        Effect    = "Allow"
        Action    = ["s3:ListBucket"]
        Resource  = "arn:aws:s3:::${var.state_bucket_name}"
        Condition = { StringEquals = { "s3:prefix" = each.value.state_key } }
      },
      {
        Sid      = "StateObject"
        Effect   = "Allow"
        Action   = each.value.action == "plan" ? ["s3:GetObject"] : ["s3:GetObject", "s3:PutObject"]
        Resource = "arn:aws:s3:::${var.state_bucket_name}/${each.value.state_key}"
      },
      {
        Sid      = "StateLock"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::${var.state_bucket_name}/${each.value.state_key}.tflock"
      },
      {
        Sid      = "StateEncryption"
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"]
        Resource = aws_kms_key.state.arn
        Condition = {
          StringEquals = {
            "kms:ViaService" = "s3.${var.aws_region}.amazonaws.com"
            "kms:EncryptionContext:aws:s3:arn" = [
              "arn:aws:s3:::${var.state_bucket_name}/${each.value.state_key}",
              "arn:aws:s3:::${var.state_bucket_name}/${each.value.state_key}.tflock",
            ]
          }
        }
      },
    ]
  })
}

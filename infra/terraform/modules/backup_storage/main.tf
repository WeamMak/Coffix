locals {
  bucket_name = "coffix-backups-${var.environment}-${var.aws_account_id}"
  bucket_arn  = "arn:aws:s3:::${local.bucket_name}"
}

resource "aws_s3_bucket" "main" {
  bucket        = local.bucket_name
  force_destroy = false
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "main" {
  bucket                  = aws_s3_bucket.main.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "main" {
  bucket = aws_s3_bucket.main.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id
  versioning_configuration {
    status = "Enabled"
  }
}

# AWS-managed SSE-S3 avoids another monthly key charge. TLS and bucket privacy
# are enforced below; Task 40 grants only the matching backup prefix access.
#trivy:ignore:AVD-AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "main" {
  bucket = aws_s3_bucket.main.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.bucket_arn, "${local.bucket_arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "DenyExplicitUnsupportedEncryption"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${local.bucket_arn}/*"
        Condition = {
          Null            = { "s3:x-amz-server-side-encryption" = "false" }
          StringNotEquals = { "s3:x-amz-server-side-encryption" = "AES256" }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_lifecycle_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  rule {
    id     = "incomplete-uploads-and-noncurrent-versions"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
    noncurrent_version_expiration {
      noncurrent_days = var.environment == "prod" ? 90 : 30
    }
  }

  # Never expire current base backups or WAL by object age. Task 40's Barman
  # policy owns logical retention and deletes only complete recovery chains.
  depends_on = [aws_s3_bucket_versioning.main]
}

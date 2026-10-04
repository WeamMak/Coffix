locals {
  bucket_name = "coffix-media-${var.environment}-${var.aws_account_id}"
  bucket_arn  = "arn:aws:s3:::${local.bucket_name}"
}

resource "aws_s3_bucket" "media" {
  bucket        = local.bucket_name
  force_destroy = false
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Spec 23.3 allows AWS-managed encryption; the existing S3 adapter explicitly
# signs AES256 uploads. SSE-S3 keeps that contract without changing application
# behavior in this infrastructure task. Public access and TLS remain enforced.
#trivy:ignore:AVD-AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
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

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    id     = "incomplete-uploads-and-old-versions"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
    noncurrent_version_expiration {
      noncurrent_days = var.environment == "prod" ? 90 : 30
    }
  }
  depends_on = [aws_s3_bucket_versioning.media]
}

resource "aws_s3_bucket_cors_configuration" "media" {
  count = length(var.allowed_origins) > 0 ? 1 : 0

  bucket = aws_s3_bucket.media.id
  cors_rule {
    allowed_origins = sort(tolist(var.allowed_origins))
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_headers = ["Content-Type", "x-amz-server-side-encryption"]
    expose_headers  = ["ETag"]
    max_age_seconds = 300
  }
}

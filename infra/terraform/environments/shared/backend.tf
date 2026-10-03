# Supply approved bucket, region, KMS key and account ID via -backend-config.
# Use only the default workspace; isolation is provided by separate roots/keys.
terraform {
  backend "s3" {
    key          = "coffix/shared/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

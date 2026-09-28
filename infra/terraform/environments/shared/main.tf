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

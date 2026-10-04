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

data "aws_availability_zones" "available" {
  state = "available"
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  availability_zones = length(var.availability_zones) > 0 ? var.availability_zones : slice(sort(data.aws_availability_zones.available.names), 0, 2)
}

module "network" {
  source = "../../modules/vpc"

  aws_account_id     = var.aws_account_id
  aws_region         = var.aws_region
  availability_zones = local.availability_zones
  cidr_block         = var.vpc_cidr
}

module "security" {
  source = "../../modules/security"

  vpc_id   = module.network.vpc_id
  vpc_cidr = var.vpc_cidr
}

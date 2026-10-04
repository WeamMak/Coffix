locals {
  default_tags = tomap({
    project     = "coffix"
    environment = "prod"
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


module "secrets" {
  source = "../../modules/secrets"

  environment = "prod"
}

module "postgresql_credential" {
  source = "../../modules/secrets/credential"

  secret_id        = module.secrets.secret_arns.postgresql
  password_version = var.postgresql_password_version
  metadata = {
    database = "coffix_prod"
    username = "coffix_prod"
  }
}

module "redis_credential" {
  source = "../../modules/secrets/credential"

  secret_id        = module.secrets.secret_arns.redis
  password_version = var.redis_password_version
  metadata = {
    username = "coffix_prod"
  }
}

module "media" {
  source = "../../modules/media"

  environment     = "prod"
  aws_account_id  = var.aws_account_id
  allowed_origins = var.media_allowed_origins
}

module "backup_storage" {
  source = "../../modules/backup_storage"

  environment    = "prod"
  aws_account_id = var.aws_account_id
}

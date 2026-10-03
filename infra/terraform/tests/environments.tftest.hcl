mock_provider "aws" {}

variables {
  aws_account_id = "123456789012"
  aws_region     = "eu-west-1"
  cost_center    = "platform"
  owner          = "platform@example.invalid"
}

run "shared_provider_conventions" {
  command = plan
  module {
    source = "./environments/shared"
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
}

run "prod_provider_conventions" {
  command = plan
  module {
    source = "./environments/prod"
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
}

run "shared_reject_invalid_account" {
  command = plan
  module {
    source = "./environments/shared"
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
  variables {
    aws_account_id = "unapproved"
  }
  expect_failures = [var.aws_account_id]
}

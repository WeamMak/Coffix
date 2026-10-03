variable "aws_account_id" {
  description = "Approved AWS account; provider operations are restricted to this account."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Use a 12-digit AWS account ID."
  }
}

variable "aws_region" {
  description = "Approved AWS region for the state bucket and encryption key."
  type        = string
  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]+$", var.aws_region))
    error_message = "Use a standard AWS region, such as eu-west-1."
  }
}

variable "cost_center" {
  description = "Approved billing cost center tag."
  type        = string
  validation {
    condition     = length(trimspace(var.cost_center)) > 0
    error_message = "Cost center must not be empty."
  }
}

variable "github_repository" {
  description = "Exact GitHub OIDC repository identity: owner/repo or owner@ID/repo@ID when immutable subjects are enabled."
  type        = string
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+(@[0-9]+)?/[A-Za-z0-9_.-]+(@[0-9]+)?$", var.github_repository))
    error_message = "Use an exact owner/repository identity without wildcards or subject suffixes."
  }
}

variable "owner" {
  description = "Accountable infrastructure and billing-alert owner tag."
  type        = string
  validation {
    condition     = length(trimspace(var.owner)) > 0
    error_message = "An accountable owner is required."
  }
}

variable "state_bucket_name" {
  description = "Approved globally unique S3 bucket name, prefixed with coffix-."
  type        = string
  validation {
    condition     = can(regex("^coffix-[a-z0-9-]{1,55}[a-z0-9]$", var.state_bucket_name))
    error_message = "Use a globally unique coffix- bucket name, at most 63 lowercase letters, digits and hyphens."
  }
}

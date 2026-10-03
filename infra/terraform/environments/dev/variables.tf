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

variable "owner" {
  description = "Accountable infrastructure and billing-alert owner tag."
  type        = string
  validation {
    condition     = length(trimspace(var.owner)) > 0
    error_message = "An accountable owner is required."
  }
}

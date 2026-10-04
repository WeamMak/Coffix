variable "aws_account_id" {
  description = "Approved AWS account; provider operations are restricted to this account."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Use a 12-digit AWS account ID."
  }
}

variable "aws_region" {
  description = "Approved region for deployment resources; the existing backend region is configured separately."
  type        = string
  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]+$", var.aws_region))
    error_message = "Use a standard AWS region, such as us-east-1."
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


variable "media_allowed_origins" {
  description = "Exact approved HTTPS staff dashboard origins; empty until DNS approval."
  type        = set(string)
  default     = []
}

variable "postgresql_password_version" {
  description = "Increment for a coordinated PostgreSQL runtime credential rotation; Task 40 must update the database role and workloads."
  type        = number
  default     = 1
  validation {
    condition     = var.postgresql_password_version >= 1 && floor(var.postgresql_password_version) == var.postgresql_password_version
    error_message = "Password version must be a positive integer."
  }
}

variable "redis_password_version" {
  description = "Increment for a coordinated Redis credential rotation; Task 40 must update the server and consuming workloads."
  type        = number
  default     = 1
  validation {
    condition     = var.redis_password_version >= 1 && floor(var.redis_password_version) == var.redis_password_version
    error_message = "Password version must be a positive integer."
  }
}

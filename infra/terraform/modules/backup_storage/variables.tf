variable "aws_account_id" {
  description = "Account ID used for the globally unique PostgreSQL backup bucket name."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Use a 12-digit AWS account ID."
  }
}

variable "environment" {
  description = "Environment owning this private PostgreSQL base-backup and WAL store."
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be dev or prod."
  }
}

variable "environment" {
  description = "Environment owning the three Secrets Manager paths."
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be dev or prod."
  }
}

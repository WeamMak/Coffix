variable "allowed_origins" {
  description = "Exact approved HTTPS staff browser origins. Empty disables browser CORS until DNS is approved."
  type        = set(string)
  default     = []
  validation {
    condition = alltrue([
      for origin in var.allowed_origins :
      can(regex("^https://[a-zA-Z0-9.-]+(:[0-9]+)?$", origin)) && !strcontains(origin, "*")
    ])
    error_message = "Media origins must be exact HTTPS origins without wildcards, paths or trailing slashes."
  }
}

variable "aws_account_id" {
  description = "Account ID used for the globally unique media bucket name."
  type        = string
}

variable "environment" {
  description = "Environment owning this private bucket and object prefix."
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be dev or prod."
  }
}

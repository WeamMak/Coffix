variable "metadata" {
  description = "Non-secret username/database fields in the credential JSON."
  type        = map(string)
  validation {
    condition     = !contains(keys(var.metadata), "password")
    error_message = "Credential metadata must not supply a generated password field."
  }
}

variable "password_version" {
  description = "Operator-controlled version that triggers a stored credential rotation."
  type        = number
  validation {
    condition     = var.password_version >= 1 && floor(var.password_version) == var.password_version
    error_message = "Password version must be a positive integer."
  }
}

variable "secret_id" {
  description = "Environment-specific Secrets Manager credential ARN."
  type        = string
}

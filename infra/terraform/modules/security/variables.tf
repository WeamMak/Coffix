variable "vpc_cidr" {
  description = "Shared VPC CIDR used to identify its DNS resolver."
  type        = string
  validation {
    condition     = can(cidrnetmask(var.vpc_cidr)) && can(regex("^10\\.[0-9]+\\.0\\.0/16$", var.vpc_cidr))
    error_message = "Use the shared RFC1918 10.x.0.0/16 VPC CIDR."
  }
}

variable "vpc_id" {
  description = "Shared Coffix VPC."
  type        = string
}

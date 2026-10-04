variable "availability_zones" {
  description = "Two or three approved AZ names, in stable public subnet allocation order."
  type        = list(string)
  validation {
    condition     = length(var.availability_zones) >= 2 && length(var.availability_zones) <= 3 && length(distinct(var.availability_zones)) == length(var.availability_zones)
    error_message = "Select two or three distinct Availability Zones."
  }
}

variable "aws_account_id" {
  description = "Account owning the VPC and flow logs."
  type        = string
}

variable "aws_region" {
  description = "Workload region for the S3 endpoint and flow logs."
  type        = string
}

variable "cidr_block" {
  description = "RFC1918 /16 network divided into public subnets with restricted node access."
  type        = string
  default     = "10.42.0.0/16"
  validation {
    condition     = can(cidrnetmask(var.cidr_block)) && can(regex("^10\\.[0-9]+\\.0\\.0/16$", var.cidr_block))
    error_message = "Use an RFC1918 10.x.0.0/16 network."
  }
}

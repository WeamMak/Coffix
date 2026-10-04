variable "aws_account_id" {
  description = "Approved AWS account; provider operations are restricted to this account."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Use a 12-digit AWS account ID."
  }
}

variable "aws_region" {
  description = "Approved workload region; the existing state backend remains independently configured."
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


variable "availability_zones" {
  description = "Approved regional AZs in stable allocation order; defaults to the first two available regular AZs."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for zone in var.availability_zones : contains(data.aws_availability_zones.available.names, zone)])
    error_message = "Select available regular Availability Zones in the workload region; Local Zones are not supported."
  }
}

variable "vpc_cidr" {
  description = "Approved non-overlapping shared VPC /16."
  type        = string
  default     = "10.42.0.0/16"
}

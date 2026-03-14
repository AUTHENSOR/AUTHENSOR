# -----------------------------------------------------------------------------
# AWS Authensor Deployment — Variables
# -----------------------------------------------------------------------------

# --- General ---

variable "project_name" {
  description = "Name prefix for all resources"
  type        = string
  default     = "authensor"
}

variable "environment" {
  description = "Deployment environment (staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

# --- Networking ---

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of AZs (at least 2 for RDS Multi-AZ and ALB)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# --- Container ---

variable "container_image" {
  description = "Docker image for the control plane (e.g. ghcr.io/authensor/control-plane:latest)"
  type        = string
}

variable "container_port" {
  description = "Port the control plane listens on"
  type        = number
  default     = 3000
}

variable "cpu" {
  description = "Fargate CPU units (256 = 0.25 vCPU)"
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate memory in MiB"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Number of Fargate tasks"
  type        = number
  default     = 2
}

# --- Database ---

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "authensor"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "authensor"
}

variable "db_password" {
  description = "PostgreSQL master password. Use a strong random value."
  type        = string
  sensitive   = true
}

variable "db_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = true
}

variable "db_deletion_protection" {
  description = "Enable RDS deletion protection"
  type        = bool
  default     = true
}

# --- Authensor Config ---

variable "bootstrap_admin_token" {
  description = "One-time admin bootstrap token. Remove after first deploy."
  type        = string
  sensitive   = true
  default     = ""
}

variable "aegis_enabled" {
  description = "Enable Aegis content safety scanner"
  type        = bool
  default     = true
}

variable "sentinel_enabled" {
  description = "Enable Sentinel real-time monitoring"
  type        = bool
  default     = true
}

variable "webhook_url" {
  description = "Approval webhook URL"
  type        = string
  default     = ""
}

variable "webhook_secret" {
  description = "Approval webhook shared secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "allow_fallback_policy" {
  description = "Allow fallback policy when none is configured. Must be false in production."
  type        = bool
  default     = false
}

# --- TLS ---

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS on the ALB. Leave empty for HTTP-only (not recommended)."
  type        = string
  default     = ""
}

# --- Tags ---

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}

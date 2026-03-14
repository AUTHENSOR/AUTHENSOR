# -----------------------------------------------------------------------------
# GCP Authensor Deployment — Variables
# -----------------------------------------------------------------------------

# --- General ---

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

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

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

# --- Container ---

variable "container_image" {
  description = "Docker image for the control plane (e.g. gcr.io/PROJECT/authensor-control-plane:latest)"
  type        = string
}

variable "container_port" {
  description = "Port the control plane listens on"
  type        = number
  default     = 3000
}

variable "cpu" {
  description = "Cloud Run CPU allocation (e.g. '1' or '2')"
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Cloud Run memory allocation (e.g. '512Mi', '1Gi')"
  type        = string
  default     = "512Mi"
}

variable "min_instances" {
  description = "Minimum number of Cloud Run instances (0 = scale to zero)"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

# --- Database ---

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "authensor"
}

variable "db_username" {
  description = "PostgreSQL username"
  type        = string
  default     = "authensor"
}

variable "db_password" {
  description = "PostgreSQL password. Use a strong random value."
  type        = string
  sensitive   = true
}

variable "db_disk_size" {
  description = "Cloud SQL disk size in GB"
  type        = number
  default     = 10
}

variable "db_availability_type" {
  description = "Cloud SQL availability type (ZONAL or REGIONAL for HA)"
  type        = string
  default     = "REGIONAL"
}

variable "db_deletion_protection" {
  description = "Enable Cloud SQL deletion protection"
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

# --- Networking ---

variable "allow_unauthenticated" {
  description = "Allow unauthenticated access to Cloud Run (true = public API)"
  type        = bool
  default     = true
}

# --- Labels ---

variable "labels" {
  description = "Additional labels for all resources"
  type        = map(string)
  default     = {}
}

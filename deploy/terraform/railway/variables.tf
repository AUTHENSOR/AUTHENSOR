# -----------------------------------------------------------------------------
# Railway Authensor Deployment — Variables
# -----------------------------------------------------------------------------

variable "project_name" {
  description = "Railway project name"
  type        = string
  default     = "authensor"
}

variable "environment" {
  description = "Railway environment name"
  type        = string
  default     = "production"
}

variable "railway_token" {
  description = "Railway API token (from https://railway.app/account/tokens)"
  type        = string
  sensitive   = true
}

# --- Source ---

variable "repo_url" {
  description = "GitHub repository URL (e.g. https://github.com/authensor/authensor)"
  type        = string
  default     = ""
}

variable "branch" {
  description = "Git branch to deploy"
  type        = string
  default     = "main"
}

variable "docker_image" {
  description = "Docker image to deploy (alternative to repo_url). If set, repo_url is ignored."
  type        = string
  default     = ""
}

# --- Database ---

variable "postgres_plugin" {
  description = "Use Railway's managed PostgreSQL plugin"
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

# --- Scaling ---

variable "num_replicas" {
  description = "Number of replicas (Railway Pro plan required for >1)"
  type        = number
  default     = 1
}

# --- Networking ---

variable "custom_domain" {
  description = "Custom domain to attach (optional, e.g. api.authensor.dev)"
  type        = string
  default     = ""
}

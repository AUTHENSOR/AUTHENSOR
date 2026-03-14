# modules/database — Shared PostgreSQL configuration
# Constructs connection strings and provides migration helpers.

variable "db_host" {
  description = "PostgreSQL host"
  type        = string
}

variable "db_port" {
  description = "PostgreSQL port"
  type        = number
  default     = 5432
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "authensor"
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "authensor"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "db_ssl_mode" {
  description = "PostgreSQL SSL mode (disable, require, verify-ca, verify-full)"
  type        = string
  default     = "require"
}

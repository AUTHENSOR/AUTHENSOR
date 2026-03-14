output "database_url" {
  description = "Full PostgreSQL connection string (contains password — sensitive)"
  value       = local.database_url
  sensitive   = true
}

output "database_url_redacted" {
  description = "Connection string with password masked — safe for logs"
  value       = local.database_url_redacted
}

output "db_host" {
  description = "Database host"
  value       = var.db_host
}

output "db_port" {
  description = "Database port"
  value       = var.db_port
}

output "db_name" {
  description = "Database name"
  value       = var.db_name
}

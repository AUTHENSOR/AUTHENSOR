# =============================================================================
# Railway Authensor Deployment — Outputs
# =============================================================================

output "project_id" {
  description = "Railway project ID"
  value       = railway_project.main.id
}

output "service_id" {
  description = "Control plane Railway service ID"
  value       = railway_service.control_plane.id
}

output "service_url" {
  description = "Railway-provisioned service URL"
  value       = "https://${railway_service.control_plane.default_domain}"
}

output "custom_domain" {
  description = "Custom domain (if configured)"
  value       = var.custom_domain != "" ? "https://${var.custom_domain}" : null
}

output "postgres_plugin_id" {
  description = "Railway PostgreSQL plugin ID"
  value       = var.postgres_plugin ? railway_plugin.postgres[0].id : null
}

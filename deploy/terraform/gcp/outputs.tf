# =============================================================================
# GCP Authensor Deployment — Outputs
# =============================================================================

output "cloud_run_url" {
  description = "Auto-provisioned Cloud Run HTTPS URL"
  value       = google_cloud_run_v2_service.control_plane.uri
}

output "cloud_run_service_name" {
  description = "Cloud Run service name"
  value       = google_cloud_run_v2_service.control_plane.name
}

output "cloud_sql_instance_name" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.main.name
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL connection name (for Cloud SQL Proxy)"
  value       = google_sql_database_instance.main.connection_name
}

output "cloud_sql_private_ip" {
  description = "Cloud SQL private IP address"
  value       = google_sql_database_instance.main.private_ip_address
}

output "database_url_redacted" {
  description = "Database connection string (password masked)"
  value       = module.database.database_url_redacted
}

output "service_account_email" {
  description = "Cloud Run service account email"
  value       = google_service_account.cloud_run.email
}

output "vpc_id" {
  description = "VPC network ID"
  value       = google_compute_network.main.id
}

output "load_balancer_backend_service" {
  description = "Backend service ID for custom domain HTTPS LB setup"
  value       = google_compute_backend_service.control_plane.id
}

# =============================================================================
# GCP Authensor Deployment
# =============================================================================
# Deploys the Authensor control plane on Cloud Run with Cloud SQL PostgreSQL,
# VPC connector for private database access, and optional load balancer.
#
# Usage:
#   terraform init
#   terraform plan -var-file="production.tfvars"
#   terraform apply -var-file="production.tfvars"
# =============================================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  labels = merge(
    {
      project     = var.project_name
      environment = var.environment
      managed-by  = "terraform"
    },
    var.labels,
  )
}

# =============================================================================
# Enable Required APIs
# =============================================================================

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "vpcaccess.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# =============================================================================
# VPC & Private Service Access
# =============================================================================

resource "google_compute_network" "main" {
  name                    = "${local.name_prefix}-vpc"
  auto_create_subnetworks = false

  depends_on = [google_project_service.apis]
}

resource "google_compute_subnetwork" "main" {
  name          = "${local.name_prefix}-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.main.id

  private_ip_google_access = true
}

# Private IP range for Cloud SQL
resource "google_compute_global_address" "private_ip" {
  name          = "${local.name_prefix}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip.name]
}

# VPC Connector for Cloud Run to reach Cloud SQL over private network
resource "google_vpc_access_connector" "main" {
  name          = "${local.name_prefix}-vpc-cx"
  region        = var.region
  network       = google_compute_network.main.name
  ip_cidr_range = "10.8.0.0/28"

  min_instances = 2
  max_instances = 3

  depends_on = [google_project_service.apis]
}

# =============================================================================
# Cloud SQL — PostgreSQL
# =============================================================================

resource "google_sql_database_instance" "main" {
  name             = "${local.name_prefix}-postgres"
  database_version = "POSTGRES_16"
  region           = var.region

  deletion_protection = var.db_deletion_protection

  settings {
    tier              = var.db_tier
    availability_type = var.db_availability_type
    disk_size         = var.db_disk_size
    disk_autoresize   = true
    disk_type         = "PD_SSD"

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.main.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 7
      }
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 4
      update_track = "stable"
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    user_labels = local.labels
  }

  depends_on = [google_service_networking_connection.private_vpc]
}

resource "google_sql_database" "authensor" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "authensor" {
  name     = var.db_username
  instance = google_sql_database_instance.main.name
  password = var.db_password
}

# =============================================================================
# Database Module — Connection String
# =============================================================================

module "database" {
  source = "../modules/database"

  db_host     = google_sql_database_instance.main.private_ip_address
  db_port     = 5432
  db_name     = var.db_name
  db_username = var.db_username
  db_password = var.db_password
  db_ssl_mode = "require"
}

# =============================================================================
# Cloud Run Service Account (least privilege)
# =============================================================================

resource "google_service_account" "cloud_run" {
  account_id   = "${local.name_prefix}-run"
  display_name = "Authensor Cloud Run service account"
}

# Cloud SQL Client role for the service account
resource "google_project_iam_member" "cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# =============================================================================
# Cloud Run — Control Plane
# =============================================================================

resource "google_cloud_run_v2_service" "control_plane" {
  name     = "${local.name_prefix}-control-plane"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    service_account = google_service_account.cloud_run.email

    containers {
      image = var.container_image

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      # --- Environment Variables ---
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = tostring(var.container_port)
      }
      env {
        name  = "DATABASE_URL"
        value = module.database.database_url
      }
      env {
        name  = "AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN"
        value = var.bootstrap_admin_token
      }
      env {
        name  = "AUTHENSOR_AEGIS_ENABLED"
        value = tostring(var.aegis_enabled)
      }
      env {
        name  = "AUTHENSOR_SENTINEL_ENABLED"
        value = tostring(var.sentinel_enabled)
      }
      env {
        name  = "AUTHENSOR_ALLOW_FALLBACK_POLICY"
        value = tostring(var.allow_fallback_policy)
      }
      env {
        name  = "AUTHENSOR_APPROVAL_WEBHOOK_URL"
        value = var.webhook_url
      }
      env {
        name  = "AUTHENSOR_APPROVAL_WEBHOOK_SECRET"
        value = var.webhook_secret
      }

      # Health check: Cloud Run uses startup and liveness probes
      startup_probe {
        http_get {
          path = "/health"
          port = var.container_port
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 10
        timeout_seconds       = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = var.container_port
        }
        period_seconds    = 15
        failure_threshold = 3
        timeout_seconds   = 5
      }
    }
  }

  labels = local.labels

  depends_on = [
    google_project_service.apis,
    google_sql_database.authensor,
    google_sql_user.authensor,
  ]
}

# =============================================================================
# IAM — Allow unauthenticated access (public API)
# =============================================================================

resource "google_cloud_run_v2_service_iam_member" "public" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.control_plane.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# =============================================================================
# Global Load Balancer (optional, for custom domains)
# =============================================================================
# Cloud Run provides an auto-provisioned HTTPS URL. A global HTTPS load
# balancer is needed only when using a custom domain with managed TLS.

resource "google_compute_region_network_endpoint_group" "cloud_run" {
  name                  = "${local.name_prefix}-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.control_plane.name
  }
}

resource "google_compute_backend_service" "control_plane" {
  name                  = "${local.name_prefix}-backend"
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.cloud_run.id
  }
}

resource "google_compute_url_map" "control_plane" {
  name            = "${local.name_prefix}-url-map"
  default_service = google_compute_backend_service.control_plane.id
}

# NOTE: To add HTTPS with a custom domain, create:
#   - google_compute_managed_ssl_certificate
#   - google_compute_target_https_proxy
#   - google_compute_global_forwarding_rule
# See: https://cloud.google.com/load-balancing/docs/https/setting-up-https-serverless

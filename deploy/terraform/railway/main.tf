# =============================================================================
# Railway Authensor Deployment
# =============================================================================
# Deploys the Authensor control plane on Railway with a managed PostgreSQL
# database. Railway handles TLS, load balancing, and health checks.
#
# Prerequisites:
#   - Railway account with a Pro or Team plan (for production workloads)
#   - Railway API token: https://railway.app/account/tokens
#   - Terraform Railway provider: https://registry.terraform.io/providers/terraform-community-providers/railway
#
# Usage:
#   terraform init
#   terraform plan -var="railway_token=YOUR_TOKEN" -var-file="production.tfvars"
#   terraform apply -var="railway_token=YOUR_TOKEN" -var-file="production.tfvars"
#
# Note: The Railway Terraform provider is community-maintained. For simple
# deployments, using railway.toml + the Railway CLI may be more practical.
# This module provides a Terraform-native alternative for teams that manage
# all infrastructure as code.
# =============================================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.4"
    }
  }
}

provider "railway" {
  token = var.railway_token
}

# =============================================================================
# Railway Project
# =============================================================================

resource "railway_project" "main" {
  name = "${var.project_name}-${var.environment}"
}

# =============================================================================
# PostgreSQL Plugin
# =============================================================================

resource "railway_plugin" "postgres" {
  count = var.postgres_plugin ? 1 : 0

  project_id = railway_project.main.id
  name       = "PostgreSQL"
}

# =============================================================================
# Control Plane Service
# =============================================================================

resource "railway_service" "control_plane" {
  project_id = railway_project.main.id
  name       = "control-plane"

  # Source — deploy from GitHub repo or Docker image
  source_repo   = var.docker_image == "" ? var.repo_url : null
  source_repo_branch = var.docker_image == "" ? var.branch : null
  source_image  = var.docker_image != "" ? var.docker_image : null

  # Build configuration (matches railway.toml)
  build_command = var.docker_image == "" ? "corepack enable && corepack pnpm install && corepack pnpm run build" : null
  start_command = "node packages/control-plane/dist/server.js"

  # Health check
  healthcheck_path    = "/health"
  healthcheck_timeout = 30

  num_replicas = var.num_replicas
}

# =============================================================================
# Environment Variables
# =============================================================================

resource "railway_variable" "node_env" {
  environment_id = railway_project.main.default_environment_id
  service_id     = railway_service.control_plane.id
  name           = "NODE_ENV"
  value          = "production"
}

resource "railway_variable" "port" {
  environment_id = railway_project.main.default_environment_id
  service_id     = railway_service.control_plane.id
  name           = "PORT"
  value          = "3000"
}

# DATABASE_URL is auto-injected by Railway when a PostgreSQL plugin is linked.
# This variable is only needed for external databases.
resource "railway_variable" "database_url" {
  count = var.postgres_plugin ? 0 : 1

  environment_id = railway_project.main.default_environment_id
  service_id     = railway_service.control_plane.id
  name           = "DATABASE_URL"
  value          = "REPLACE_WITH_EXTERNAL_DATABASE_URL"
}

resource "railway_variable" "bootstrap_token" {
  count = var.bootstrap_admin_token != "" ? 1 : 0

  environment_id = railway_project.main.default_environment_id
  service_id     = railway_service.control_plane.id
  name           = "AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN"
  value          = var.bootstrap_admin_token
}

resource "railway_variable" "aegis" {
  environment_id = railway_project.main.default_environment_id
  service_id     = railway_service.control_plane.id
  name           = "AUTHENSOR_AEGIS_ENABLED"
  value          = tostring(var.aegis_enabled)
}

resource "railway_variable" "sentinel" {
  environment_id = railway_project.main.default_environment_id
  service_id     = railway_service.control_plane.id
  name           = "AUTHENSOR_SENTINEL_ENABLED"
  value          = tostring(var.sentinel_enabled)
}

resource "railway_variable" "fallback_policy" {
  environment_id = railway_project.main.default_environment_id
  service_id     = railway_service.control_plane.id
  name           = "AUTHENSOR_ALLOW_FALLBACK_POLICY"
  value          = tostring(var.allow_fallback_policy)
}

resource "railway_variable" "webhook_url" {
  count = var.webhook_url != "" ? 1 : 0

  environment_id = railway_project.main.default_environment_id
  service_id     = railway_service.control_plane.id
  name           = "AUTHENSOR_APPROVAL_WEBHOOK_URL"
  value          = var.webhook_url
}

resource "railway_variable" "webhook_secret" {
  count = var.webhook_secret != "" ? 1 : 0

  environment_id = railway_project.main.default_environment_id
  service_id     = railway_service.control_plane.id
  name           = "AUTHENSOR_APPROVAL_WEBHOOK_SECRET"
  value          = var.webhook_secret
}

# =============================================================================
# Custom Domain (optional)
# =============================================================================

resource "railway_custom_domain" "api" {
  count = var.custom_domain != "" ? 1 : 0

  environment_id = railway_project.main.default_environment_id
  service_id     = railway_service.control_plane.id
  domain         = var.custom_domain
}

# modules/database — Connection string construction and migration helpers
#
# This module does not create any cloud resources. It provides a uniform
# interface for building DATABASE_URL strings consumed by the control plane
# and for running migrations as a null_resource provisioner.

terraform {
  required_version = ">= 1.5"
}

locals {
  # Standard PostgreSQL connection string used by the control plane.
  # The sslmode parameter is appended for production deployments.
  database_url = format(
    "postgres://%s:%s@%s:%d/%s?sslmode=%s",
    var.db_username,
    urlencode(var.db_password),
    var.db_host,
    var.db_port,
    var.db_name,
    var.db_ssl_mode,
  )

  # Connection string without password — safe for logging and outputs.
  database_url_redacted = format(
    "postgres://%s:****@%s:%d/%s?sslmode=%s",
    var.db_username,
    var.db_host,
    var.db_port,
    var.db_name,
    var.db_ssl_mode,
  )
}

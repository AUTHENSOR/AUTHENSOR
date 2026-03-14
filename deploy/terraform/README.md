# Authensor Terraform Deployment

Terraform modules for deploying the Authensor control plane to AWS, GCP, or Railway.

Each module provisions the control plane container, a managed PostgreSQL database,
networking, and health checks. All modules follow security best practices:
encryption at rest, private networking for databases, IAM least privilege, and
TLS termination at the load balancer.

## Prerequisites

- [Terraform >= 1.5](https://developer.hashicorp.com/terraform/install)
- A container image of the control plane (built from `packages/control-plane/Dockerfile`)
- Cloud provider credentials configured

## Quick Start

### 1. Build and Push the Container Image

```bash
# From the repository root
docker build -t authensor-control-plane -f packages/control-plane/Dockerfile .

# Tag and push to your registry
docker tag authensor-control-plane ghcr.io/YOUR_ORG/authensor-control-plane:latest
docker push ghcr.io/YOUR_ORG/authensor-control-plane:latest
```

### 2. Choose a Provider

## AWS (ECS Fargate + RDS)

**What gets created:**
- VPC with public and private subnets across 2 AZs
- RDS PostgreSQL 16 (Multi-AZ, encrypted, automated backups)
- ECS Fargate cluster and service (2 tasks by default)
- Application Load Balancer with health checks
- CloudWatch log group
- IAM roles with least-privilege policies
- NAT Gateway for outbound internet from private subnets

```bash
cd deploy/terraform/aws
terraform init
```

Create a `production.tfvars` file:

```hcl
aws_region      = "us-east-1"
container_image = "ghcr.io/YOUR_ORG/authensor-control-plane:latest"
db_password     = "REPLACE_WITH_STRONG_PASSWORD"
certificate_arn = "arn:aws:acm:us-east-1:123456789:certificate/abc-123"  # optional

# First deploy only — remove after bootstrapping
bootstrap_admin_token = "REPLACE_WITH_RANDOM_TOKEN"

# Optional
aegis_enabled    = true
sentinel_enabled = true
```

```bash
terraform plan -var-file="production.tfvars"
terraform apply -var-file="production.tfvars"

# Output: ALB DNS name to point your domain at
terraform output alb_url
```

**Cost estimate:** ~$50-80/month (db.t4g.micro, 2 Fargate tasks, NAT Gateway)

---

## GCP (Cloud Run + Cloud SQL)

**What gets created:**
- VPC with private service access for Cloud SQL
- Cloud SQL PostgreSQL 16 (Regional HA, encrypted, PITR backups)
- VPC Access Connector for private database connectivity
- Cloud Run v2 service with autoscaling
- Dedicated service account with Cloud SQL Client role
- Global backend service (ready for custom domain HTTPS LB)

```bash
cd deploy/terraform/gcp
terraform init
```

Create a `production.tfvars` file:

```hcl
project_id      = "your-gcp-project-id"
region          = "us-central1"
container_image = "gcr.io/your-project/authensor-control-plane:latest"
db_password     = "REPLACE_WITH_STRONG_PASSWORD"

# First deploy only
bootstrap_admin_token = "REPLACE_WITH_RANDOM_TOKEN"
```

```bash
terraform plan -var-file="production.tfvars"
terraform apply -var-file="production.tfvars"

# Output: Cloud Run auto-provisioned HTTPS URL
terraform output cloud_run_url
```

**Cost estimate:** ~$15-30/month (db-f1-micro, Cloud Run pay-per-request)

---

## Railway

**What gets created:**
- Railway project with a control plane service
- Managed PostgreSQL plugin (auto-injected DATABASE_URL)
- Environment variables
- Optional custom domain

Railway is the simplest deployment path. The community Terraform provider
offers IaC management, but the Railway CLI or dashboard may be more practical
for small teams.

```bash
cd deploy/terraform/railway
terraform init
```

Create a `production.tfvars` file:

```hcl
railway_token = "REPLACE_WITH_RAILWAY_TOKEN"
repo_url      = "https://github.com/YOUR_ORG/authensor"
branch        = "main"

# First deploy only
bootstrap_admin_token = "REPLACE_WITH_RANDOM_TOKEN"
```

```bash
terraform plan -var="railway_token=YOUR_TOKEN" -var-file="production.tfvars"
terraform apply -var="railway_token=YOUR_TOKEN" -var-file="production.tfvars"

terraform output service_url
```

**Cost estimate:** ~$5-20/month (usage-based pricing)

---

## Shared Database Module

The `modules/database/` module is used internally by the AWS and GCP modules
to construct PostgreSQL connection strings. You can also use it standalone:

```hcl
module "database" {
  source = "./modules/database"

  db_host     = "your-db-host.example.com"
  db_port     = 5432
  db_name     = "authensor"
  db_username = "authensor"
  db_password = var.db_password
  db_ssl_mode = "require"
}

# Use the output
# module.database.database_url      — full connection string (sensitive)
# module.database.database_url_redacted — safe for logging
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `PORT` | No | `3000` | HTTP listen port |
| `NODE_ENV` | No | `production` | Node environment |
| `AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN` | First run | — | Auto-creates admin API key |
| `AUTHENSOR_AEGIS_ENABLED` | No | `false` | Content safety scanning |
| `AUTHENSOR_SENTINEL_ENABLED` | No | `false` | Real-time monitoring |
| `AUTHENSOR_ALLOW_FALLBACK_POLICY` | No | `false` | Allow missing policy (dangerous) |
| `AUTHENSOR_APPROVAL_WEBHOOK_URL` | No | — | Webhook for approval requests |
| `AUTHENSOR_APPROVAL_WEBHOOK_SECRET` | No | — | Webhook auth secret |

See `.env.example` in the repository root for the complete list.

## Post-Deploy Checklist

1. **Bootstrap admin key:** Set `AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN` on first deploy.
   The admin API key will be printed to stdout. Save it securely, then remove
   the bootstrap token from your tfvars.

2. **Upload a policy:** The control plane fails closed by default (no policy = deny all).
   ```bash
   curl -X POST https://YOUR_URL/policies \
     -H "Authorization: Bearer YOUR_ADMIN_KEY" \
     -H "Content-Type: application/json" \
     -d @your-policy.json
   ```

3. **Health check:** Verify the deployment is healthy.
   ```bash
   curl https://YOUR_URL/health
   # {"status":"ok"}
   ```

4. **Run database migrations:** Migrations run automatically on startup. Check
   logs if the health check fails.

5. **Enable HTTPS:** AWS requires an ACM certificate. GCP Cloud Run has
   auto-provisioned HTTPS. Railway handles TLS automatically.

## State Management

For production deployments, store Terraform state remotely:

```hcl
# Add to the provider module's main.tf
terraform {
  backend "s3" {
    bucket = "your-terraform-state"
    key    = "authensor/production.tfstate"
    region = "us-east-1"
  }
}
```

## Security Notes

- **Database passwords** are marked `sensitive` in Terraform and will not appear in plan output.
- **Private networking**: Databases are placed in private subnets (AWS) or use private IP with VPC peering (GCP). They are not accessible from the public internet.
- **Encryption at rest**: RDS uses AWS-managed encryption. Cloud SQL uses Google-managed encryption. Both are enabled by default.
- **IAM least privilege**: ECS task roles and GCP service accounts have only the permissions needed to connect to the database and write logs.
- **TLS in transit**: ALB terminates TLS (AWS). Cloud Run auto-provisions HTTPS (GCP). Railway handles TLS automatically.
- **Fail-closed**: `AUTHENSOR_ALLOW_FALLBACK_POLICY` defaults to `false`. Without a policy, all action evaluations are denied.

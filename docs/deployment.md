<!-- Moved out of the top-level README so it stays readable.     The README renders as the AUTHENSOR account profile. -->## Self-Hosting vs. Hosted

Everything is open source. Self-host it all, or use the managed version:

| | Self-Hosted (Free) | Sponsored Tier |
|---|---|---|
| Policy engine | Yes | Yes |
| Control plane | Yes | Yes, managed |
| Aegis content safety | Yes | Yes |
| Sentinel monitoring | Yes | Yes, with dashboards |
| Receipts & audit trail | Yes | Yes, with retention SLA |
| Approval workflows | Yes | Yes, with SMS/email gateway |
| OpenTelemetry export | Yes | Yes, pre-configured |
| Support | Community | Priority |
| Compliance reports | DIY | Automated |
| Advanced detection rules | Community | Sponsor-exclusive |
| Monthly threat briefings | - | Sponsor-exclusive |

## Deployment

### Docker Compose (simplest)

```bash
docker compose up -d
```

### Helm (Kubernetes)

```bash
helm install authensor deploy/helm/authensor \
  --set postgresql.auth.password=your-password \
  --set controlPlane.env.AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN=your-token
```

### Terraform

Modules available for AWS (ECS + RDS), GCP (Cloud Run + Cloud SQL), and Railway:

```bash
cd deploy/terraform/aws
terraform init && terraform apply
```

### One-line install (CLI only)

```bash
curl -fsSL https://raw.githubusercontent.com/authensor/authensor/main/install.sh | sh
```

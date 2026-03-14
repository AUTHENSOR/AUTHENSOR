# =============================================================================
# AWS Authensor Deployment — Outputs
# =============================================================================

output "alb_dns_name" {
  description = "ALB DNS name — point your CNAME/alias record here"
  value       = aws_lb.main.dns_name
}

output "alb_url" {
  description = "Full URL for the control plane"
  value       = var.certificate_arn != "" ? "https://${aws_lb.main.dns_name}" : "http://${aws_lb.main.dns_name}"
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.control_plane.name
}

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

output "database_url_redacted" {
  description = "Database connection string (password masked)"
  value       = module.database.database_url_redacted
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (for additional services)"
  value       = aws_subnet.private[*].id
}

output "ecs_security_group_id" {
  description = "ECS tasks security group ID"
  value       = aws_security_group.ecs.id
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.control_plane.name
}

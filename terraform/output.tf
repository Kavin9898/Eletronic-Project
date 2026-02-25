output "public_ip" {
  description = "Public IP of EC2 instance"
  value       = aws_instance.app_server.public_ip
}

output "instance_id" {
  description = "EC2 Instance ID"
  value       = aws_instance.app_server.id
}

output "rds_endpoint" {
  description = "RDS Endpoint"
  value       = aws_db_instance.mysql_db.endpoint
}

# CloudWatch encrypts log data at rest with its managed service encryption.
# A separate customer-managed key adds recurring cost without changing the
# accepted flow-log boundary; retention and delivery permissions remain bounded.
#trivy:ignore:AVD-AWS-0017
resource "aws_cloudwatch_log_group" "flow" {
  name              = "/coffix/shared/vpc-flow"
  retention_in_days = 14
}

resource "aws_iam_role" "flow" {
  name = "coffix-shared-vpc-flow"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = var.aws_account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:vpc-flow-log/*" }
      }
    }]
  })
}

resource "aws_iam_role_policy" "flow" {
  name = "write-flow-log-streams"
  role = aws_iam_role.flow.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
        Resource = "${local.flow_log_arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["logs:DescribeLogGroups"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_flow_log" "network" {
  vpc_id                   = aws_vpc.main.id
  traffic_type             = "ALL"
  max_aggregation_interval = 600
  log_destination_type     = "cloud-watch-logs"
  log_destination          = aws_cloudwatch_log_group.flow.arn
  iam_role_arn             = aws_iam_role.flow.arn
  depends_on               = [aws_iam_role_policy.flow]
}

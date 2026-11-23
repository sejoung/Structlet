import { Activity, Archive, ArrowLeftRight, Boxes, Brain, BrickWall, Container, Database, Earth, FolderOpen, Globe, HardDrive, Inbox, Key, KeyRound, Lambda, Layers, Lock, Mail, MemoryStick, Radio, ScrollText, Search, Server, Signpost, Sparkles, Split, Table2, UserCheck, Warehouse, Waves, Waypoints, Webhook, Workflow } from 'lucide';
import { define, type Row } from './types.ts';

const ROWS: Row[] = [
  ['aws.ec2', 'Amazon EC2', 'Amazon EC2', Server, 'compute', 'instance vm 인스턴스'],
  ['aws.ecs', 'Amazon ECS', 'Amazon ECS', Container, 'compute', 'container docker'],
  ['aws.eks', 'Amazon EKS', 'Amazon EKS', Boxes, 'compute', 'kubernetes k8s'],
  ['aws.fargate', 'AWS Fargate', 'AWS Fargate', Layers, 'compute', 'container serverless'],
  ['aws.lambda', 'AWS Lambda', 'AWS Lambda', Lambda, 'compute', 'function serverless 함수'],
  ['aws.s3', 'Amazon S3', 'Amazon S3', Archive, 'storage', 'bucket object 버킷'],
  ['aws.ebs', 'Amazon EBS', 'Amazon EBS', HardDrive, 'storage', 'volume block'],
  ['aws.efs', 'Amazon EFS', 'Amazon EFS', FolderOpen, 'storage', 'file nfs'],
  ['aws.rds', 'Amazon RDS', 'Amazon RDS', Database, 'data', 'database mysql postgres'],
  ['aws.aurora', 'Amazon Aurora', 'Amazon Aurora', Database, 'data', 'database'],
  ['aws.dynamodb', 'Amazon DynamoDB', 'Amazon DynamoDB', Table2, 'data', 'nosql key value'],
  ['aws.elasticache', 'Amazon ElastiCache', 'Amazon ElastiCache', MemoryStick, 'data', 'redis cache'],
  ['aws.sqs', 'Amazon SQS', 'Amazon SQS', Inbox, 'integration', 'queue 큐'],
  ['aws.sns', 'Amazon SNS', 'Amazon SNS', Radio, 'integration', 'topic notification'],
  ['aws.eventbridge', 'Amazon EventBridge', 'Amazon EventBridge', Waypoints, 'integration', 'event bus'],
  ['aws.kinesis', 'Amazon Kinesis', 'Amazon Kinesis', Waves, 'analytics', 'stream'],
  ['aws.stepfunctions', 'AWS Step Functions', 'AWS Step Functions', Workflow, 'integration', 'workflow state machine'],
  ['aws.apigateway', 'Amazon API Gateway', 'Amazon API Gateway', Webhook, 'network', 'api rest'],
  ['aws.cloudfront', 'Amazon CloudFront', 'Amazon CloudFront', Globe, 'network', 'cdn'],
  ['aws.route53', 'Amazon Route 53', 'Amazon Route 53', Signpost, 'network', 'dns'],
  ['aws.elb', 'Elastic Load Balancing', 'Elastic Load Balancing', Split, 'network', 'alb nlb load balancer 로드밸런서'],
  ['aws.natgateway', 'NAT gateway', 'NAT 게이트웨이', ArrowLeftRight, 'network', 'nat'],
  ['aws.igw', 'Internet gateway', '인터넷 게이트웨이', Earth, 'network', 'igw internet'],
  ['aws.iam', 'AWS IAM', 'AWS IAM', KeyRound, 'security', 'identity role policy'],
  ['aws.cognito', 'Amazon Cognito', 'Amazon Cognito', UserCheck, 'security', 'auth user pool'],
  ['aws.secretsmanager', 'AWS Secrets Manager', 'AWS Secrets Manager', Lock, 'security', 'secrets'],
  ['aws.kms', 'AWS KMS', 'AWS KMS', Key, 'security', 'key encryption'],
  ['aws.waf', 'AWS WAF', 'AWS WAF', BrickWall, 'security', 'firewall'],
  ['aws.cloudwatch', 'Amazon CloudWatch', 'Amazon CloudWatch', Activity, 'operations', 'monitoring logs metrics'],
  ['aws.cloudtrail', 'AWS CloudTrail', 'AWS CloudTrail', ScrollText, 'operations', 'audit'],
  ['aws.ses', 'Amazon SES', 'Amazon SES', Mail, 'integration', 'email'],
  ['aws.opensearch', 'Amazon OpenSearch Service', 'Amazon OpenSearch Service', Search, 'analytics', 'search elasticsearch'],
  ['aws.redshift', 'Amazon Redshift', 'Amazon Redshift', Warehouse, 'analytics', 'warehouse'],
  ['aws.sagemaker', 'Amazon SageMaker', 'Amazon SageMaker', Brain, 'analytics', 'ml'],
  ['aws.bedrock', 'Amazon Bedrock', 'Amazon Bedrock', Sparkles, 'analytics', 'ai genai llm'],
];


export const AWS_SERVICES = define('aws', ROWS);

import { expect, it } from 'vitest';
import { compileDraft } from '../../../src/adapters/draft/compile';
import { importInto } from '../../../src/adapters/draft/import';
import { parseStructlet, serializeStructlet } from '../../../src/adapters/format/structlet-format';
import { emptyDocument } from '../../../src/domain';

const base = emptyDocument('settings', 'Settings');

it('attaches Terraform service and networking settings to their owners', async () => {
  const r = (type: string, name: string, values: Record<string, unknown>, sensitive_values?: Record<string, unknown>) => ({
    type, name, address: `${type}.${name}`, values, sensitive_values,
  });
  const resources = [
    r('aws_vpc', 'main', { id: 'vpc-1', cidr_block: '10.10.0.0/16', enable_dns_support: true, enable_dns_hostnames: false }),
    r('aws_subnet', 'main', { id: 'subnet-1', vpc_id: 'vpc-1', cidr_block: '10.10.1.0/24', availability_zone: 'us-east-1a', tags: { tier: 'private' } }),
    r('aws_route_table', 'private', { id: 'rtb-1', vpc_id: 'vpc-1', route: [{ cidr_block: '0.0.0.0/0', nat_gateway_id: 'nat-1' }] }),
    r('aws_route_table_association', 'private', { route_table_id: 'rtb-1', subnet_id: 'subnet-1' }),
    r('aws_vpc_endpoint', 's3', { id: 'vpce-1', vpc_id: 'vpc-1', route_table_ids: ['rtb-1'], vpc_endpoint_type: 'Gateway' }),
    r('aws_cloudfront_distribution', 'site', { enabled: true, is_ipv6_enabled: false, aliases: ['example.test'],
      restrictions: [{ geo_restriction: [{ restriction_type: 'whitelist', locations: ['KR'] }] }],
      origin: [{ origin_id: 'bucket', domain_name: 'origin.example.test', origin_access_control_id: 'oac-1',
        custom_header: [{ name: 'key', value: 'SYNTHETIC_EXCLUDED' }] }],
      viewer_certificate: [{ cloudfront_default_certificate: false, acm_certificate_arn: 'arn:aws:acm:abc' }],
      ordered_cache_behavior: [{ path_pattern: '/assets/*', function_association: [{ function_arn: 'arn:aws:cloudfront:fn', event_type: 'viewer-request' }] }],
    }),
    r('aws_cloudfront_origin_access_control', 'site', { id: 'oac-1', signing_behavior: 'always', signing_protocol: 'sigv4' }),
    r('aws_cloudfront_function', 'fn', { arn: 'arn:aws:cloudfront:fn', runtime: 'cloudfront-js-2.0', publish: false }),
    r('aws_acm_certificate', 'site', { arn: 'arn:aws:acm:abc', domain_name: 'example.test', subject_alternative_names: ['www.example.test'],
      validation_method: 'DNS', domain_validation_options: [{ resource_record_name: '_example.test', resource_record_type: 'CNAME', resource_record_value: '_validation.example.test' }],
    }),
    r('aws_lb', 'alb', { arn: 'arn:aws:elb:alb', internal: false, subnets: ['subnet-1'] }),
    r('aws_lb_listener', 'https', { arn: 'arn:aws:elb:listener', load_balancer_arn: 'arn:aws:elb:alb', port: 443, ssl_policy: 'example-policy', default_action: [{ target_group_arn: 'arn:aws:elb:target' }] }),
    r('aws_lb_target_group', 'target', { arn: 'arn:aws:elb:target', target_type: 'ip', health_check: [{ path: '/health' }] }),
    r('aws_lb_listener_certificate', 'additional', { listener_arn: 'arn:aws:elb:listener', certificate_arn: 'arn:aws:acm:abc' }),
    r('aws_eks_cluster', 'eks', { name: 'example', version: '1.34', vpc_config: [{ endpoint_public_access: false, endpoint_private_access: true }] }),
    r('aws_eks_access_policy_association', 'admin', { cluster_name: 'example', principal_arn: 'arn:aws:iam:role', access_scope: [{ type: 'namespace', namespaces: ['staging'] }] }),
    r('aws_eks_addon', 'dns', { cluster_name: 'example', addon_name: 'coredns', addon_version: 'v1.12.1' }),
    r('aws_eks_pod_identity_association', 'pods', { cluster_name: 'example', namespace: 'staging', service_account: 'worker', role_arn: 'arn:aws:iam:pods' }),
    r('aws_cloudwatch_log_group', 'eks', { name: '/aws/eks/example/cluster', retention_in_days: 14 }),
    r('aws_eks_node_group', 'workers', { scaling_config: [{ min_size: 1, max_size: 8, desired_size: 2 }],
      capacity_type: 'SPOT', release_version: '1.34.1', labels: { tier: 'worker' } }),
    r('aws_instance', 'ssm', { ami: 'ami-1', associate_public_ip_address: false, metadata_options: [{ http_tokens: 'required' }],
      root_block_device: [{ volume_type: 'gp3', encrypted: true }], user_data: 'SYNTHETIC_EXCLUDED' }),
    r('helm_release', 'argo', { name: 'argo-cd', chart: 'argo-cd', version: '8.0.0', values: [
      'server:\n  replicas: 2\n  ingress:\n    enabled: true\n    hostname: example.test\nconfigs:\n  secret:\n    password: SYNTHETIC_EXCLUDED',
    ] }),
    r('aws_db_instance', 'db', { engine: 'postgres', engine_version: '16', publicly_accessible: false, backup_retention_period: 7,
      password: 'SYNTHETIC_EXCLUDED', master_user_secret: [{ secret_arn: 'arn:aws:secretsmanager:example' }], maintenance_window: 'SYNTHETIC_EXCLUDED',
    }, { maintenance_window: true }),
    r('aws_msk_cluster', 'msk', { kafka_version: '3.8.x', number_of_broker_nodes: 3, configuration_info: [{ arn: 'arn:aws:kafka:settings' }] }),
    r('aws_msk_configuration', 'settings', { arn: 'arn:aws:kafka:settings', server_properties: 'min.insync.replicas=2\nsasl.jaas.config=SYNTHETIC_EXCLUDED' }),
    r('aws_s3_bucket', 'data', { id: 'bucket', bucket: 'bucket' }),
    r('aws_s3_bucket_public_access_block', 'data', { bucket: 'bucket', restrict_public_buckets: true }),
    r('aws_ecr_repository', 'app', { name: 'app', image_tag_mutability: 'IMMUTABLE' }),
    r('aws_ecr_lifecycle_policy', 'app', { repository: 'app', policy: '{"rules":[{"rulePriority":1}]}' }),
    r('aws_cloudtrail', 'trail', { enable_log_file_validation: true, is_multi_region_trail: true }),
    r('aws_cloudwatch_event_rule', 'signal', { name: 'signal', event_pattern: '{"source":["example.app"]}' }),
    r('aws_cloudwatch_event_target', 'target', { rule: 'signal', arn: 'arn:aws:events:other-region:target', input_transformer: [{ input_paths: { id: '$.id' } }] }),
    r('aws_sns_topic', 'notifications', { arn: 'arn:aws:sns:notifications' }),
    r('aws_sns_topic_subscription', 'queue', { topic_arn: 'arn:aws:sns:notifications', protocol: 'sqs', endpoint: 'arn:aws:sqs:queue' }),
  ];
  const result = await importInto(base, JSON.stringify({
    terraform_version: '1.9.0',
    planned_values: { root_module: { resources } },
    configuration: {
      provider_config: { aws: { name: 'aws', version_constraint: '~> 6.0' } },
      root_module: {
        module_calls: { network: { source: 'example/network/aws', version_constraint: '~> 3.0' } },
        resources: [{ address: 'aws_instance.ssm', expressions: { ami: { references: ['data.aws_ssm_parameter.ami.value'] } } }],
      },
    },
  }));
  expect(result.ok, result.ok ? '' : result.errors.join(', ')).toBe(true);
  if (!result.ok) return;
  const { document } = result;
  const scope = (id: string, kind: string) => [...document.nodes, ...document.containers].find((box) => box.id === id)
    ?.infrastructure?.resourceSettings?.find((setting) => setting.kind === kind)?.values;

  expect(scope('tf-aws_vpc.main', 'aws_vpc')).toMatchObject({ cidr_block: '10.10.0.0/16', enable_dns_hostnames: false });
  expect(scope('tf-aws_vpc.main', 'aws_route_table')).toMatchObject({ route: [{ nat_gateway_id: 'nat-1' }] });
  expect(scope('tf-aws_subnet.main', 'aws_route_table_association')).toMatchObject({ route_table_id: 'rtb-1' });
  expect(scope('tf-aws_vpc_endpoint.s3', 'aws_vpc_endpoint')).toMatchObject({ route_table_ids: ['rtb-1'] });
  expect(scope('tf-aws_cloudfront_distribution.site', 'aws_cloudfront_origin_access_control')).toMatchObject({ signing_protocol: 'sigv4' });
  expect(scope('tf-aws_cloudfront_distribution.site', 'aws_cloudfront_distribution')).toMatchObject({ enabled: true, is_ipv6_enabled: false, aliases: ['example.test'] });
  expect(document.nodes.find((node) => node.id === 'tf-aws_cloudfront_distribution.site')?.infrastructure?.cloudFront?.cacheBehaviors)
    .toMatchObject([{ pathPattern: '/assets/*', functionAssociations: [{ functionArn: 'arn:aws:cloudfront:fn', eventType: 'viewer-request' }] }]);
  expect(scope('tf-aws_cloudfront_function.fn', 'CloudFront Function association')).toMatchObject({ path_pattern: '/assets/*', event_type: 'viewer-request' });
  expect(scope('tf-aws_cloudfront_function.fn', 'aws_cloudfront_function')).toMatchObject({ runtime: 'cloudfront-js-2.0', publish: false });
  expect(scope('tf-aws_acm_certificate.site', 'aws_acm_certificate')).toMatchObject({ validation_method: 'DNS', domain_validation_options: [{ resource_record_type: 'CNAME' }] });
  expect(scope('tf-aws_lb.alb', 'aws_lb_target_group')).toMatchObject({ target_type: 'ip', health_check: [{ path: '/health' }] });
  expect(scope('tf-aws_lb.alb', 'aws_lb_listener_certificate')).toMatchObject({ certificate_arn: 'arn:aws:acm:abc' });
  expect(scope('tf-aws_eks_cluster.eks', 'aws_eks_access_policy_association')).toMatchObject({ access_scope: [{ namespaces: ['staging'] }] });
  expect(scope('tf-aws_eks_cluster.eks', 'aws_eks_pod_identity_association')).toMatchObject({ service_account: 'worker' });
  expect(scope('tf-aws_eks_cluster.eks', 'aws_cloudwatch_log_group')).toMatchObject({ retention_in_days: 14 });
  expect(scope('tf-aws_eks_node_group.workers', 'aws_eks_node_group')).toMatchObject({ capacity_type: 'SPOT', scaling_config: [{ min_size: 1 }] });
  expect(scope('tf-aws_instance.ssm', 'Terraform references')).toMatchObject({ expression_references: ['data.aws_ssm_parameter.ami.value'] });
  expect(scope('tf-helm_release.argo', 'helm_release')).toMatchObject({ values: [{ server: { replicas: 2, ingress: { enabled: true } } }] });
  expect(scope('tf-aws_db_instance.db', 'aws_db_instance')).toMatchObject({ publicly_accessible: false, backup_retention_period: 7 });
  expect(scope('tf-aws_msk_cluster.msk', 'aws_msk_configuration')).toMatchObject({ server_properties: { 'min.insync.replicas': '2' } });
  expect(scope('tf-aws_s3_bucket.data', 'aws_s3_bucket_public_access_block')).toMatchObject({ restrict_public_buckets: true });
  expect(scope('tf-aws_ecr_repository.app', 'aws_ecr_lifecycle_policy')).toMatchObject({ policy: { rules: [{ rulePriority: 1 }] } });
  expect(scope('tf-aws_cloudtrail.trail', 'aws_cloudtrail')).toMatchObject({ enable_log_file_validation: true });
  expect(scope('tf-aws_cloudwatch_event_rule.signal', 'aws_cloudwatch_event_rule')).toMatchObject({ event_pattern: { source: ['example.app'] } });
  expect(scope('tf-aws_cloudwatch_event_rule.signal', 'aws_cloudwatch_event_target')).toMatchObject({ input_transformer: [{ input_paths: { id: '$.id' } }] });
  expect(scope('tf-aws_sns_topic.notifications', 'aws_sns_topic_subscription')).toMatchObject({ protocol: 'sqs' });
  expect(scope('tf-cloud-aws', 'Terraform')).toMatchObject({ providers: [{ version_constraint: '~> 6.0' }], modules: [{ version_constraint: '~> 3.0' }] });

  const serialized = serializeStructlet(document);
  expect(serialized).not.toContain('SYNTHETIC_EXCLUDED');
  expect(parseStructlet(serialized)).toEqual({ ok: true, document });
});

it('retains Kubernetes ALB, workload, StorageClass and Argo CD settings', async () => {
  const input = JSON.stringify({
    apiVersion: 'v1', kind: 'List', items: [
      { apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', metadata: { name: 'web', annotations: {
        'alb.ingress.kubernetes.io/scheme': 'internet-facing', 'alb.ingress.kubernetes.io/listen-ports': '[{"HTTPS":443}]',
        'alb.ingress.kubernetes.io/target-type': 'ip', 'alb.ingress.kubernetes.io/healthcheck-path': '/health',
        'example.test/secret': 'SYNTHETIC_EXCLUDED',
      } }, spec: { ingressClassName: 'alb', rules: [{ host: 'example.test', http: { paths: [{ path: '/app' }] } }] } },
      { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'app' }, spec: { template: { spec: {
        tolerations: [{ key: 'infra', effect: 'NoSchedule' }],
        containers: [{ name: 'app', resources: { requests: { cpu: '200m' }, limits: { memory: '512Mi' } },
          env: [{ name: 'PASSWORD', value: 'SYNTHETIC_EXCLUDED' }] }],
      } } } },
      { apiVersion: 'storage.k8s.io/v1', kind: 'StorageClass', metadata: { name: 'encrypted' },
        provisioner: 'ebs.csi.aws.com', reclaimPolicy: 'Retain', allowVolumeExpansion: false,
        volumeBindingMode: 'WaitForFirstConsumer', parameters: { type: 'gp3', encrypted: 'true' } },
      { apiVersion: 'argoproj.io/v1alpha1', kind: 'Application', metadata: { name: 'root' }, spec: {
        project: 'platform', source: { repoURL: 'https://git.example.test/infra', directory: { recurse: true } },
      } },
    ],
  });
  const result = await importInto(base, input);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const { document } = result;
  const node = (id: string) => document.nodes.find((item) => item.id === id);
  expect(node('k8s-default-ingress-web')?.infrastructure?.resourceSettings?.[0]?.values).toMatchObject({
    ingressClassName: 'alb', alb: { 'listen-ports': [{ HTTPS: 443 }], 'target-type': 'ip', 'healthcheck-path': '/health' },
    rules: [{ host: 'example.test', http: { paths: [{ path: '/app' }] } }],
  });
  expect(node('k8s-default-deployment-app')?.infrastructure?.resourceSettings?.[0]?.values).toMatchObject({
    tolerations: [{ key: 'infra' }], containers: [{ name: 'app', resources: { requests: { cpu: '200m' }, limits: { memory: '512Mi' } } }],
  });
  expect(node('k8s-cluster-storageclass-encrypted')).toMatchObject({
    parentId: 'k8s-cluster', serviceId: 'k8s.storageclass', infrastructure: { resourceSettings: [{ values: {
      allowVolumeExpansion: false, provisioner: 'ebs.csi.aws.com', volumeBindingMode: 'WaitForFirstConsumer',
    } }] },
  });
  expect(node('k8s-default-application-root')?.infrastructure?.argoCd).toMatchObject({
    project: 'platform', sources: [{ directory: { recurse: true } }],
  });
  expect(serializeStructlet(document)).not.toContain('SYNTHETIC_EXCLUDED');
});

it('validates and saves area settings from an AI draft', () => {
  const good = compileDraft(JSON.stringify({
    containers: [{ id: 'vpc', infrastructure: {
      resourceSettings: [{ kind: 'aws_vpc', values: { cidr_block: '10.0.0.0/16', enable_dns_support: false } }],
    } }],
  }), base);
  expect(good.ok).toBe(true);
  if (!good.ok) return;
  expect(parseStructlet(good.text)).toEqual({ ok: true, document: good.document });
  const invalid = compileDraft(JSON.stringify({
    containers: [{ id: 'vpc', infrastructure: { resourceSettings: [{ kind: 'aws_vpc', values: ['10.0.0.0/16'] }] } }],
  }), base);
  expect(invalid).toMatchObject({ ok: false, errors: [expect.stringContaining('containers[0].infrastructure.resourceSettings[0].values')] });
});

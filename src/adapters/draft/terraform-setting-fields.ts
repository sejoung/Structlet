const STORAGE = `engine engine_version engine_version_actual instance_class node_type instance_count cluster_size
  num_cache_clusters num_node_groups replicas_per_node_group number_of_broker_nodes availability_zones
  availability_zone preferred_availability_zones multi_az multi_az_enabled automatic_failover_enabled
  publicly_accessible storage_encrypted encrypted kms_key_id kms_key_arn at_rest_encryption_enabled transit_encryption_enabled
  transit_encryption_mode auth_token_update_strategy iam_database_authentication_enabled manage_master_user_password
  master_user_secret_kms_key_id master_user_secret.secret_arn master_user_secret.kms_key_id
  backup_retention_period retention_period snapshot_retention_limit snapshot_window backup_window preferred_backup_window
  preferred_maintenance_window maintenance_window auto_minor_version_upgrade apply_immediately deletion_protection
  skip_final_snapshot final_snapshot_identifier parameter_group_name db_parameter_group_name db_cluster_parameter_group_name`;

export const TERRAFORM_FIELDS: Readonly<Record<string, string>> = {
  aws_cloudfront_distribution: `enabled is_ipv6_enabled aliases price_class restrictions.geo_restriction
    viewer_certificate.cloudfront_default_certificate viewer_certificate.acm_certificate_arn viewer_certificate.iam_certificate_id
    origin.origin_id origin.domain_name origin.origin_path origin.origin_access_control_id`,
  aws_cloudfront_origin_access_control: 'name origin_access_control_origin_type signing_behavior signing_protocol',
  aws_cloudfront_function: 'name runtime publish',
  aws_acm_certificate: 'domain_name subject_alternative_names validation_method domain_validation_options',
  aws_acm_certificate_validation: 'certificate_arn validation_record_fqdns',
  aws_vpc: 'cidr_block ipv6_cidr_block enable_dns_support enable_dns_hostnames instance_tenancy tags',
  aws_subnet: 'cidr_block ipv6_cidr_block availability_zone availability_zone_id map_public_ip_on_launch assign_ipv6_address_on_creation tags',
  aws_nat_gateway: 'connectivity_type subnet_id vpc_id allocation_id private_ip secondary_allocation_ids',
  aws_route_table: 'vpc_id route propagating_vgws tags',
  aws_route: 'route_table_id destination_cidr_block destination_ipv6_cidr_block destination_prefix_list_id gateway_id nat_gateway_id vpc_endpoint_id transit_gateway_id network_interface_id',
  aws_route_table_association: 'route_table_id subnet_id gateway_id',
  aws_vpc_endpoint: 'vpc_id service_name vpc_endpoint_type route_table_ids subnet_ids security_group_ids private_dns_enabled',
  aws_vpc_endpoint_route_table_association: 'vpc_endpoint_id route_table_id',
  aws_lb: 'name internal load_balancer_type subnets subnet_mapping security_groups ip_address_type enable_deletion_protection',
  aws_alb: 'name internal load_balancer_type subnets subnet_mapping security_groups ip_address_type enable_deletion_protection',
  aws_lb_listener: 'load_balancer_arn port protocol ssl_policy certificate_arn default_action.type default_action.redirect default_action.target_group_arn default_action.forward',
  aws_alb_listener: 'load_balancer_arn port protocol ssl_policy certificate_arn default_action.type default_action.redirect default_action.target_group_arn default_action.forward',
  aws_lb_listener_certificate: 'listener_arn certificate_arn',
  aws_lb_listener_rule: 'listener_arn priority condition.host_header condition.path_pattern condition.source_ip condition.http_request_method action.type action.redirect action.target_group_arn action.forward',
  aws_lb_target_group: 'vpc_id target_type protocol protocol_version port health_check',
  aws_eks_cluster: 'name version vpc_config authentication_mode access_config enabled_cluster_log_types encryption_config',
  aws_eks_access_entry: 'cluster_name principal_arn kubernetes_groups type',
  aws_eks_access_policy_association: 'cluster_name principal_arn policy_arn access_scope',
  aws_eks_addon: 'cluster_name addon_name addon_version resolve_conflicts_on_create resolve_conflicts_on_update service_account_role_arn',
  aws_eks_pod_identity_association: 'cluster_name namespace service_account role_arn target_role_arn',
  aws_eks_node_group: 'cluster_name node_group_name scaling_config capacity_type ami_type release_version version instance_types labels update_config',
  aws_cloudwatch_log_group: 'name retention_in_days kms_key_id',
  aws_instance: 'ami iam_instance_profile associate_public_ip_address metadata_options root_block_device.volume_type root_block_device.encrypted root_block_device.kms_key_id root_block_device.delete_on_termination',
  aws_launch_template: 'image_id iam_instance_profile network_interfaces.associate_public_ip_address metadata_options block_device_mappings.ebs',
  aws_db_instance: STORAGE,
  aws_rds_cluster: STORAGE,
  aws_rds_cluster_instance: STORAGE,
  aws_docdb_cluster: STORAGE,
  aws_docdb_cluster_instance: STORAGE,
  aws_elasticache_cluster: STORAGE,
  aws_elasticache_replication_group: `${STORAGE} auth_token_update_strategy user_group_ids`,
  aws_msk_cluster: `${STORAGE} kafka_version client_authentication encryption_info broker_node_group_info configuration_info`,
  aws_msk_serverless_cluster: 'client_authentication vpc_config',
  aws_db_parameter_group: 'name family parameter',
  aws_rds_cluster_parameter_group: 'name family parameter',
  aws_docdb_cluster_parameter_group: 'name family parameter',
  aws_elasticache_parameter_group: 'name family parameter',
  aws_msk_configuration: 'name kafka_versions server_properties latest_revision',
  aws_s3_bucket: 'bucket object_lock_enabled versioning server_side_encryption_configuration lifecycle_rule',
  aws_s3_bucket_versioning: 'bucket versioning_configuration',
  aws_s3_bucket_server_side_encryption_configuration: 'bucket rule',
  aws_s3_bucket_public_access_block: 'bucket block_public_acls block_public_policy ignore_public_acls restrict_public_buckets',
  aws_s3_bucket_ownership_controls: 'bucket rule',
  aws_s3_bucket_lifecycle_configuration: 'bucket rule',
  aws_s3_bucket_object_lock_configuration: 'bucket object_lock_enabled rule',
  aws_ecr_repository: 'name image_tag_mutability image_tag_mutability_exclusion_filter image_scanning_configuration encryption_configuration',
  aws_ecr_lifecycle_policy: 'repository policy',
  aws_cloudtrail: `name is_multi_region_trail include_global_service_events enable_logging enable_log_file_validation
    is_organization_trail event_selector advanced_event_selector s3_bucket_name s3_key_prefix kms_key_id cloud_watch_logs_group_arn sns_topic_name`,
  aws_cloudwatch_event_bus: 'name event_source_name',
  aws_cloudwatch_event_rule: 'event_bus_name name event_pattern schedule_expression state is_enabled',
  aws_cloudwatch_event_target: 'rule event_bus_name arn role_arn input_path input_transformer retry_policy dead_letter_config',
  aws_sns_topic: 'name fifo_topic kms_master_key_id',
  aws_sns_topic_subscription: 'topic_arn protocol endpoint subscription_role_arn filter_policy filter_policy_scope raw_message_delivery',
  helm_release: 'name chart version namespace repository wait timeout atomic skip_crds',
};

import { isSpecQuantity, NODE_SPEC_TEXT_LIMIT, type NodeSpecs } from '../../domain';

type Values = Record<string, unknown>;
type Ec2Type = NodeSpecs & { instanceType: string; cores?: number; threadsPerCore?: number };

const T4G = new Map<string, readonly [number, number]>([
  ['t4g.nano', [2, 0.5]],
  ['t4g.micro', [2, 1]],
  ['t4g.small', [2, 2]],
  ['t4g.medium', [2, 4]],
  ['t4g.large', [2, 8]],
  ['t4g.xlarge', [4, 16]],
  ['t4g.2xlarge', [8, 32]],
]);

const AZURE_VM = new Set([
  'azurerm_virtual_machine', 'azurerm_linux_virtual_machine', 'azurerm_windows_virtual_machine',
  'azurerm_linux_virtual_machine_scale_set', 'azurerm_windows_virtual_machine_scale_set',
]);

const quantity = (value: unknown) => isSpecQuantity(value) ? value : undefined;

function name(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const last = value.trim().split('/').at(-1);
  return last && /^[\w.-]+$/.test(last) && last.length <= NODE_SPEC_TEXT_LIMIT ? last : undefined;
}

function blocks(value: unknown): Values[] {
  const entries: unknown[] = Array.isArray(value) ? value : [value];
  return entries.filter((entry): entry is Values => entry !== null && typeof entry === 'object' && !Array.isArray(entry));
}

function gpuList(value: unknown, key: 'name' | 'type'): string | undefined {
  const entries = blocks(value).flatMap((entry) => {
    const model = name(entry[key]);
    const count = quantity(entry.count);
    return model ? [count === undefined ? model : `${count} × ${model}`] : [];
  });
  return entries.join(', ').slice(0, NODE_SPEC_TEXT_LIMIT) || undefined;
}

function clean(specs: NodeSpecs): NodeSpecs | undefined {
  const entries = Object.entries(specs).filter(([, value]) => value !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function ec2InstanceType(values: Values): Ec2Type | undefined {
  const instanceType = name(values.instance_type);
  if (!instanceType) return undefined;
  const memory = quantity(values.memory_size);
  return {
    instanceType,
    vcpus: quantity(values.default_vcpus),
    cores: quantity(values.default_cores),
    threadsPerCore: quantity(values.default_threads_per_core),
    memoryGiB: memory === undefined ? undefined : quantity(memory / 1024),
    gpu: gpuList(values.gpus, 'name'),
  };
}

export function terraformNodeSpecs(type: string, values: Values, ec2Types: ReadonlyMap<string, Ec2Type>): NodeSpecs | undefined {
  if (type === 'aws_instance' || type === 'aws_launch_template') {
    const instanceType = name(values.instance_type);
    const metadata = instanceType ? ec2Types.get(instanceType) : undefined;
    const preset = instanceType ? T4G.get(instanceType) : undefined;
    const cpu = blocks(values.cpu_options)[0];
    const coreOverride = quantity(cpu?.core_count ?? values.cpu_core_count);
    const threadOverride = quantity(cpu?.threads_per_core ?? values.cpu_threads_per_core);
    const cores = coreOverride ?? metadata?.cores ?? preset?.[0];
    const threads = threadOverride ?? metadata?.threadsPerCore ?? (preset ? 1 : undefined);
    const configured = cores !== undefined && threads !== undefined ? quantity(cores * threads) : undefined;
    return clean({
      instanceType,
      vcpus: coreOverride !== undefined || threadOverride !== undefined ? configured : metadata?.vcpus ?? preset?.[0],
      memoryGiB: metadata?.memoryGiB ?? preset?.[1],
      gpu: metadata?.gpu,
      diskGiB: quantity(blocks(values.root_block_device)[0]?.volume_size),
    });
  }
  if (AZURE_VM.has(type)) {
    const osDisk = blocks(values.os_disk ?? values.storage_os_disk)[0];
    return clean({ instanceType: name(values.size ?? values.vm_size ?? values.sku), diskGiB: quantity(osDisk?.disk_size_gb) });
  }
  if (type === 'google_compute_instance') {
    const instanceType = name(values.machine_type);
    const custom = instanceType?.match(/^(?:[a-z0-9]+-)?custom-(\d+)-(\d+)(?:-ext)?$/);
    const disk = blocks(values.boot_disk)[0];
    return clean({
      instanceType,
      vcpus: custom ? quantity(Number(custom[1])) : undefined,
      memoryGiB: custom ? quantity(Number(custom[2]) / 1024) : undefined,
      gpu: gpuList(values.guest_accelerator, 'type'),
      diskGiB: quantity(blocks(disk?.initialize_params)[0]?.size),
    });
  }
  return undefined;
}

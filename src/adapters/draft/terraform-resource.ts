export interface TerraformResource {
  address: string;
  type: string;
  name: string;
  mode?: string;
  values?: Record<string, unknown>;
  sensitive_values?: Record<string, unknown>;
  depends_on?: string[];
}

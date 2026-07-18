// lib/vmProviders/types.ts
// Shared interface every cloud provider adapter implements, so
// app/api/virtual-computers routes don't need to know which provider a
// given virtual_computers row uses.

export type VmProtocol = "vnc" | "rdp";
export type CloudProviderId = "digitalocean" | "aws" | "gcp";

export interface VmSizeOption {
  slug: string;
  label: string;
  vcpus: number;
  memoryMb: number;
  hourlyUsd: number;
}

// Shape depends on provider -- see supabase/company_cloud_credentials.sql.
export type ProviderCredentials = Record<string, string>;

export interface CreateInstanceParams {
  credentials: ProviderCredentials;
  name: string;
  sizeSlug: string;
  region: string;
  protocol: VmProtocol;
  remoteUsername: string;
  remotePassword: string;
}

export interface CreateInstanceResult {
  providerInstanceId: string;
  ipAddress: string | null;
}

export interface InstanceStatus {
  providerInstanceId: string;
  status: "provisioning" | "running" | "error";
  ipAddress: string | null;
}

export interface VmProvider {
  id: CloudProviderId;
  createInstance(params: CreateInstanceParams): Promise<CreateInstanceResult>;
  getInstance(credentials: ProviderCredentials, providerInstanceId: string): Promise<InstanceStatus>;
  destroyInstance(credentials: ProviderCredentials, providerInstanceId: string): Promise<void>;
}

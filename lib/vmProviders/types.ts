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
  // Only set for DigitalOcean -- the droplet's actual disk allocation,
  // which the Windows-on-DO path (lib/vmProviders/digitalocean.ts) uses to
  // size the guest's virtual disk instead of a fixed value.
  diskGb?: number;
}

// Shape depends on provider -- see supabase/company_cloud_credentials.sql.
export type ProviderCredentials = Record<string, string>;

export type VmOs = "linux" | "windows";

export interface CreateInstanceParams {
  credentials: ProviderCredentials;
  name: string;
  sizeSlug: string;
  region: string;
  protocol: VmProtocol;
  os: VmOs;
  remoteUsername: string;
  remotePassword: string;
  // DigitalOcean Linux/RDP only: also provision a background dockur/windows
  // guest (bound to localhost, never exposed) with Microsoft Office
  // installed, surfaced as individual app windows on the GNOME desktop via
  // WinApps/FreeRDP RemoteApp -- see officeGuestCloudInit in
  // lib/vmProviders/digitalocean.ts. Other providers/OSes ignore this.
  withOffice?: boolean;
  // Set when waking a hibernated VM: launch from this saved snapshot/image
  // instead of the provider's base image, and skip whatever first-boot
  // provisioning is already baked into it (see createSnapshot below).
  fromSnapshotId?: string;
  // Debug-only: attaches these SSH keys to the droplet's Ubuntu host (NOT
  // the Windows guest) so a developer can inspect/tune the actual QEMU
  // process dockur/windows runs -- e.g. verifying `-cpu host` is in effect,
  // or applying RT scheduling priority to reduce nested-KVM input jitter.
  // Only ever set for platform-billed DO VMs using our own debug keypair
  // (see DIGITALOCEAN_DEBUG_SSH_KEY_ID) -- never for BYO credentials, since
  // that would mean silently adding our own access to a customer's own
  // cloud account. DigitalOcean-specific; other providers ignore this.
  sshKeyIds?: string[];
}

export interface StartSnapshotResult {
  // Opaque provider-specific handle to poll via getSnapshotStatus. For AWS
  // this IS the eventual AMI/image ID (DescribeImages polls the same ID
  // that CreateImage returns); for DigitalOcean it's a droplet action ID,
  // which resolves to a *different* value (the new snapshot's image ID)
  // once the action completes.
  snapshotTaskId: string;
}

export interface SnapshotStatus {
  status: "pending" | "completed" | "error";
  // Only set once status is "completed" -- the value to store as
  // virtual_computers.snapshot_id and later pass back as `fromSnapshotId`.
  snapshotId: string | null;
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
  // `region` is unused by DigitalOcean (droplet IDs are looked up without it)
  // but required by AWS -- EC2 API calls are per-region regardless of an
  // instance ID's global uniqueness, so the region a VM was launched in has
  // to be threaded back through on every later call. Callers pass the
  // virtual_computers row's own `region` column, not the credential's
  // stored default region, since a company can launch VMs into a different
  // region than their credential's default.
  getInstance(credentials: ProviderCredentials, providerInstanceId: string, region: string): Promise<InstanceStatus>;
  destroyInstance(credentials: ProviderCredentials, providerInstanceId: string, region: string): Promise<void>;
  // Snapshotting a running instance takes anywhere from several minutes to
  // ~40+ minutes (DigitalOcean scales with used disk; AWS Windows AMIs
  // commonly take 10-20 min) -- far longer than a single serverless
  // function invocation should block for. So this is split into a
  // fire-and-forget start plus a cheap, repeatable status check: the sweep
  // route (app/api/virtual-computers/sweep/route.ts) calls startSnapshot
  // once, then calls getSnapshotStatus on subsequent cron passes until it
  // reports "completed", only then calling destroyInstance.
  startSnapshot(credentials: ProviderCredentials, providerInstanceId: string, region: string): Promise<StartSnapshotResult>;
  getSnapshotStatus(
    credentials: ProviderCredentials,
    providerInstanceId: string,
    region: string,
    snapshotTaskId: string
  ): Promise<SnapshotStatus>;
  // Only one snapshot is ever kept per VM (a fresh one on each hibernate
  // replaces the last), and a permanently-destroyed VM's snapshot is
  // deleted too -- otherwise every hibernate cycle leaves the previous
  // snapshot's storage billing behind it forever. Tolerates the snapshot
  // already being gone (already deleted, or never existed).
  deleteSnapshot(credentials: ProviderCredentials, snapshotId: string, region: string): Promise<void>;
}

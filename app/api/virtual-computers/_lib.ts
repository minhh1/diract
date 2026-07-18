// app/api/virtual-computers/_lib.ts
// Shared helpers for the virtual-computers API routes. Not a route itself
// (no exported HTTP method handlers), so Next.js ignores it for routing.
import crypto from "crypto";
import { getPlatformCredentials } from "@/lib/vmProviders/platformCredentials";
import type { CloudProviderId, ProviderCredentials } from "@/lib/vmProviders/types";

// Classic VNC auth (TigerVNC) truncates passwords to 8 characters, so keep
// the generated password short -- it behaves identically for RDP too.
export function generateRemotePassword(): string {
  const raw = crypto.randomBytes(6).toString("base64").replace(/[^a-zA-Z0-9]/g, "");
  return (raw + "Ax9K2qLp").slice(0, 8);
}

export async function loadVm(admin: any, companyId: string, id: string) {
  const { data } = await admin.from("virtual_computers").select("*").eq("id", id).maybeSingle();
  if (!data || data.company_id !== companyId) return null;
  return data;
}

// Resolves the credentials to hand a provider adapter for a given VM row,
// branching on billing_mode. Platform-billed rows have credential_id = NULL
// by design -- routes that only checked `vm.credential_id` before calling
// into a provider adapter would silently skip platform-billed VMs (destroy
// would mark the row destroyed without ever deleting the underlying
// instance; status would poll-loop stuck on "provisioning" forever).
export async function resolveCredentials(
  admin: any,
  vm: { billing_mode: string; credential_id: string | null; provider: string }
): Promise<ProviderCredentials | null> {
  if (vm.billing_mode === "platform") {
    return getPlatformCredentials(vm.provider as CloudProviderId);
  }
  if (!vm.credential_id) return null;
  const { data } = await admin
    .from("company_cloud_credentials")
    .select("credentials")
    .eq("id", vm.credential_id)
    .maybeSingle();
  return data?.credentials ?? null;
}

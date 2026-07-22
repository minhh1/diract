// app/api/virtual-computers/[id]/status/route.ts
// Poll target while a VM is provisioning. Assigned member or admin only.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getProvider } from "@/lib/vmProviders/registry";
import { loadVm, resolveCredentials, isPortReachable } from "../../_lib";
import type { CloudProviderId } from "@/lib/vmProviders/types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;

  const vm = await loadVm(admin, companyId, id);
  if (!vm) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdmin && vm.assigned_user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (vm.status === "provisioning" && vm.provider_instance_id) {
    try {
      const credentials = await resolveCredentials(admin, vm);
      if (credentials) {
        const adapter = getProvider(vm.provider as CloudProviderId);
        const instance = await adapter.getInstance(credentials, vm.provider_instance_id, vm.region);
        // The host powering on isn't the same as Windows being ready --
        // gate "running" on RDP actually accepting connections (see
        // isPortReachable's comment for why).
        let reportedStatus = instance.status;
        if (reportedStatus === "running" && vm.os === "windows" && instance.ipAddress) {
          const rdpUp = await isPortReachable(instance.ipAddress, 3389);
          if (!rdpUp) reportedStatus = "provisioning";
        }
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), status: reportedStatus };
        if (instance.ipAddress) updates.ip_address = instance.ipAddress;
        await admin.from("virtual_computers").update(updates).eq("id", id);
        vm.status = reportedStatus;
        if (instance.ipAddress) vm.ip_address = instance.ipAddress;
      }
    } catch {
      // Transient provider errors (or, e.g., a missing platform credential
      // env var) during polling shouldn't crash the request or flip status
      // to error -- report the last known state and let the next poll retry.
    }
  }

  return NextResponse.json({
    id: vm.id,
    status: vm.status,
    errorMessage: vm.error_message,
    ipAddress: vm.ip_address,
    os: vm.os,
    provider: vm.provider,
    createdAt: vm.created_at,
    hibernateDeadline: vm.hibernate_deadline,
    resolutionWidth: vm.resolution_width,
    resolutionHeight: vm.resolution_height,
  });
}

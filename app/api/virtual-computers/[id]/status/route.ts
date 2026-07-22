// app/api/virtual-computers/[id]/status/route.ts
// Poll target while a VM is provisioning. Assigned member or admin only.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadVm, reconcileProvisioningVm } from "../../_lib";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;

  let vm = await loadVm(admin, companyId, id);
  if (!vm) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdmin && vm.assigned_user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (vm.status === "provisioning" && vm.provider_instance_id) {
    // Also handles the Windows-on-DigitalOcean RDP-login verification (and
    // its auto-retry on failure) -- see reconcileProvisioningVm's own
    // comment for why that's not just a port-reachability check.
    await reconcileProvisioningVm(admin, vm);
    vm = await loadVm(admin, companyId, id);
    if (!vm) return NextResponse.json({ error: "Not found" }, { status: 404 });
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

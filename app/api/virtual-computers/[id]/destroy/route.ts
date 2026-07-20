// app/api/virtual-computers/[id]/destroy/route.ts
// Admin-only. Tears down the underlying cloud instance and marks the row destroyed.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getProvider } from "@/lib/vmProviders/registry";
import { loadVm, resolveCredentials, closeUsageEvent } from "../../_lib";
import type { CloudProviderId } from "@/lib/vmProviders/types";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const vm = await loadVm(admin, companyId, id);
  if (!vm) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (vm.status === "destroyed") return NextResponse.json({ ok: true });

  await admin.from("virtual_computers").update({ status: "destroying", updated_at: new Date().toISOString() }).eq("id", id);

  if (vm.provider_instance_id) {
    try {
      const credentials = await resolveCredentials(admin, vm);
      if (credentials) {
        const adapter = getProvider(vm.provider as CloudProviderId);
        // A hibernated VM's provider_instance_id is stale (already
        // terminated when it hibernated) -- both adapters tolerate
        // "already gone" gracefully, so calling this unconditionally is
        // harmless.
        await adapter.destroyInstance(credentials, vm.provider_instance_id, vm.region);
      }
    } catch (err) {
      // Don't fall through to marking the row destroyed -- if we can't
      // resolve credentials (e.g. a missing platform env var) or the
      // provider call fails, the underlying instance is still out there
      // and this IS the expensive resource (compute), unlike the snapshot
      // cleanup below.
      await admin
        .from("virtual_computers")
        .update({
          status: "error",
          error_message: err instanceof Error ? err.message : "Destroy failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      return NextResponse.json({ error: err instanceof Error ? err.message : "Destroy failed" }, { status: 502 });
    }
  }

  if (vm.snapshot_id) {
    // Best-effort, same as the sweep route's post-hibernate cleanup -- a
    // permanently-destroyed VM shouldn't leave its snapshot behind racking
    // up storage cost forever, but a failure here (e.g. a missing
    // ec2:DeregisterImage permission -- confirmed directly: this silently
    // left 3 VMs stuck in "error" with their compute already terminated,
    // just because the much cheaper snapshot cleanup afterward failed)
    // must never block marking the VM destroyed, since the instance is
    // already gone by this point regardless.
    try {
      const credentials = await resolveCredentials(admin, vm);
      if (credentials) {
        const adapter = getProvider(vm.provider as CloudProviderId);
        await adapter.deleteSnapshot(credentials, vm.snapshot_id, vm.region);
      }
    } catch {
      // Leave the snapshot behind -- a lingering storage cost, not worth
      // failing the destroy over.
    }
  }

  await closeUsageEvent(admin, id);
  await admin
    .from("virtual_computers")
    .update({ status: "destroyed", destroyed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}

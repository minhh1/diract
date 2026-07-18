// app/api/virtual-computers/[id]/session/route.ts
// Mints a short-lived Guacamole auth token for a running VM. Assigned
// member or admin only.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getGuacamoleSession } from "@/lib/guacamole";
import { loadVm } from "../../_lib";
import type { VmProtocol } from "@/lib/vmProviders/types";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;

  const vm = await loadVm(admin, companyId, id);
  if (!vm) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdmin && vm.assigned_user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (vm.status !== "running" || !vm.ip_address) {
    return NextResponse.json({ error: "Virtual computer is not ready yet" }, { status: 409 });
  }

  try {
    const session = await getGuacamoleSession({
      connectionLabel: vm.id,
      protocol: vm.protocol as VmProtocol,
      hostname: vm.ip_address,
      username: vm.remote_username,
      password: vm.remote_password,
    });
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start session" }, { status: 502 });
  }
}

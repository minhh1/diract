// app/api/virtual-computers/[id]/connection-info/route.ts
// Assigned member or admin only. Surfaces the raw address/username/password
// for connecting with a native RDP/VNC client instead of the in-browser
// Guacamole session -- see VirtualComputerSessionPage's "connect a
// different way" section. Safe to expose to the assigned member
// specifically: it's their own VM, and they already have full interactive
// control of it via the normal Guacamole flow, so knowing the login doesn't
// grant them anything beyond what they already effectively have.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadVm } from "../../_lib";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;

  const vm = await loadVm(admin, companyId, id);
  if (!vm) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdmin && vm.assigned_user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (vm.status !== "running" || !vm.ip_address) {
    return NextResponse.json({ error: "This virtual computer isn't running right now." }, { status: 409 });
  }

  return NextResponse.json({
    hostname: vm.ip_address,
    port: vm.protocol === "rdp" ? 3389 : 5901,
    protocol: vm.protocol,
    username: vm.remote_username,
    password: vm.remote_password,
  });
}

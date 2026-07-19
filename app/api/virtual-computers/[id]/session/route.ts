// app/api/virtual-computers/[id]/session/route.ts
// Mints a short-lived Guacamole auth token for a running VM. Assigned
// member or admin only.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getGuacamoleSession } from "@/lib/guacamole";
import { loadVm } from "../../_lib";
import type { VmProtocol } from "@/lib/vmProviders/types";

// Fallback when a VM has no fixed resolution preset (resolution_width/height
// null) and the browser didn't report its own screen size -- shouldn't
// normally happen since GuacamoleViewer always sends it, but keeps this
// route from ever failing outright over a missing display size.
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const body = await req.json().catch(() => ({}));
  // A fixed preset on the row always wins; otherwise use whatever screen
  // size the connecting browser reported (already scaled by its own
  // devicePixelRatio -- see GuacamoleViewer.tsx), falling back to a sane
  // default. DPI is scaled the same way, but only for the auto-detect
  // path -- a fixed preset is an explicit "this many pixels" choice
  // independent of whatever device happens to be viewing it.
  const usingPreset = !!(vm.resolution_width && vm.resolution_height);
  const width = vm.resolution_width || Number(body?.screenWidth) || DEFAULT_WIDTH;
  const height = vm.resolution_height || Number(body?.screenHeight) || DEFAULT_HEIGHT;
  const dpi = usingPreset ? 96 : Math.round(96 * (Number(body?.devicePixelRatio) || 1));

  try {
    const session = await getGuacamoleSession({
      connectionLabel: vm.id,
      protocol: vm.protocol as VmProtocol,
      hostname: vm.ip_address,
      username: vm.remote_username,
      password: vm.remote_password,
      width,
      height,
      dpi,
    });
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start session" }, { status: 502 });
  }
}

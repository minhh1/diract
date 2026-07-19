// app/api/virtual-computers/[id]/resolution/route.ts
// Sets (or clears) a fixed display size for a VM's Guacamole sessions.
// Assigned member or admin -- this is a personal display preference, same
// access level as connecting to the VM itself. Takes effect on next
// connect, not live mid-session (see supabase/virtual_computers_resolution.sql).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadVm } from "../../_lib";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;

  const vm = await loadVm(admin, companyId, id);
  if (!vm) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdmin && vm.assigned_user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  // Both null means "match my screen" -- auto-detect from the connecting
  // browser at connect time instead of a fixed preset.
  const width = body?.width === null ? null : Number(body?.width);
  const height = body?.height === null ? null : Number(body?.height);
  if ((width !== null && (!Number.isFinite(width) || width <= 0)) || (height !== null && (!Number.isFinite(height) || height <= 0))) {
    return NextResponse.json({ error: "width and height must be positive numbers, or both null" }, { status: 400 });
  }

  await admin
    .from("virtual_computers")
    .update({ resolution_width: width, resolution_height: height, updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}

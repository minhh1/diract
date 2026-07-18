// app/api/virtual-computers/[id]/reassign/route.ts
// Admin-only. Changes which company member can see/connect to a VM.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadVm } from "../../_lib";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const vm = await loadVm(admin, companyId, id);
  if (!vm) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const assignedUserId = body?.assignedUserId;
  if (!assignedUserId) return NextResponse.json({ error: "assignedUserId is required" }, { status: 400 });

  const { data: assignee } = await admin
    .from("company_memberships")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", assignedUserId)
    .maybeSingle();
  if (!assignee) return NextResponse.json({ error: "assignedUserId is not a member of this company" }, { status: 400 });

  const { error } = await admin
    .from("virtual_computers")
    .update({ assigned_user_id: assignedUserId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

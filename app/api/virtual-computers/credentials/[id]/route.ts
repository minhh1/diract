// app/api/virtual-computers/credentials/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { data: cred } = await admin
    .from("company_cloud_credentials").select("id, company_id").eq("id", id).maybeSingle();
  if (!cred || cred.company_id !== companyId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { count } = await admin
    .from("virtual_computers")
    .select("id", { count: "exact", head: true })
    .eq("credential_id", id)
    .neq("status", "destroyed");
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Cannot delete a credential in use by an active virtual computer" }, { status: 400 });
  }

  const { error } = await admin.from("company_cloud_credentials").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

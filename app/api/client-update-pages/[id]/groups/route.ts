// app/api/client-update-pages/[id]/groups/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Group name is required" }, { status: 400 });

  const { count } = await admin.from("client_update_groups").select("id", { count: "exact", head: true }).eq("page_id", id);
  const { data: group, error } = await admin.from("client_update_groups")
    .insert({ page_id: id, name, display_order: count || 0 }).select("id, name, display_order").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group });
}

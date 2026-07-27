// app/api/client-update-pages/[id]/fields/reorder/route.ts
// Bulk column reorder -- body is the full list of field ids in their new
// display order; display_order is rewritten sequentially to match.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const fieldIds: string[] = Array.isArray(body.fieldIds) ? body.fieldIds : [];
  if (!fieldIds.length) return NextResponse.json({ error: "fieldIds is required" }, { status: 400 });

  const results = await Promise.all(fieldIds.map((fieldId, i) =>
    admin.from("client_update_page_fields").update({ display_order: i }).eq("id", fieldId).eq("page_id", id)
  ));
  const failed = results.find(r => r.error);
  if (failed) return NextResponse.json({ error: failed.error!.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

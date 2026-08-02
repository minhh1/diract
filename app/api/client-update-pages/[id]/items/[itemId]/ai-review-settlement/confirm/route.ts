// app/api/client-update-pages/[id]/items/[itemId]/ai-review-settlement/confirm/route.ts
// Clears the "AI set this, not yet reviewed" flag on a cell (see
// client_update_page_ai_field_flags's own migration header) once a staff
// member has looked at the AI-applied date and is happy with it -- the
// value itself was already written when the review ran; this just stops
// the UI underlining it. The other way a flag clears is a subsequent
// direct edit to the same field (see values/route.ts's project_property
// branch) -- a human overwriting the value is itself a form of review.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const fieldId: string | undefined = body?.fieldId;
  const propertyId: string | undefined = body?.propertyId;
  if (!fieldId) return NextResponse.json({ error: "fieldId is required" }, { status: 400 });

  const [{ data: item }, { data: field }] = await Promise.all([
    admin.from("client_update_page_items").select("id, record_id").eq("id", itemId).eq("page_id", id).maybeSingle(),
    admin.from("client_update_page_fields").select("field_key").eq("id", fieldId).eq("page_id", id).maybeSingle(),
  ]);
  if (!item || !field) return NextResponse.json({ error: "Not found on this page" }, { status: 404 });

  const { data: links } = await admin.from("project_properties").select("id, property_id").eq("project_id", item.record_id).order("created_at", { ascending: true });
  const linkedRows = links || [];
  const targetLink = (propertyId && linkedRows.find((l: any) => l.property_id === propertyId)) || linkedRows[0];
  if (!targetLink) return NextResponse.json({ ok: true }); // nothing to clear

  await admin.from("client_update_page_ai_field_flags").delete()
    .eq("item_id", itemId).eq("project_property_id", targetLink.id).eq("field_key", field.field_key);

  return NextResponse.json({ ok: true });
}

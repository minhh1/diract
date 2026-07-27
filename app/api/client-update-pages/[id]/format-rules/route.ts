// app/api/client-update-pages/[id]/format-rules/route.ts
// Conditional formatting rules -- "when this column equals this value,
// highlight the row/card in this colour" -- managed from MatterBoard's
// left sidebar. See the migration's header comment for why field_id is
// ON DELETE CASCADE here (unlike group conditions).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

const VALID_COLORS = ["red", "amber", "green", "blue", "purple", "slate"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const { fieldId, value, color } = body;
  if (!fieldId || !value || !VALID_COLORS.includes(color)) {
    return NextResponse.json({ error: "fieldId, value, and a valid color are required" }, { status: 400 });
  }

  const { data: field } = await admin.from("client_update_page_fields").select("id, label").eq("id", fieldId).eq("page_id", id).maybeSingle();
  if (!field) return NextResponse.json({ error: "Field not found on this page" }, { status: 404 });

  const { count } = await admin.from("client_update_page_format_rules").select("id", { count: "exact", head: true }).eq("page_id", id);

  const { data: rule, error } = await admin.from("client_update_page_format_rules")
    .insert({ page_id: id, field_id: fieldId, value, color, display_order: count || 0 })
    .select("id, field_id, value, color, display_order").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "format_rule_added", `Added a ${color} highlight rule for "${field.label}" = "${value}"`);

  return NextResponse.json({ rule });
}

// app/api/client-update-pages/[id]/format-rules/[ruleId]/route.ts
// Update (change value/color) or remove a single conditional formatting rule.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

const VALID_COLORS = ["red", "amber", "green", "blue", "purple", "slate"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const { id, ruleId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, any> = {};
  if (typeof body.value === "string" && body.value) updates.value = body.value;
  if (typeof body.fieldId === "string") updates.field_id = body.fieldId;
  if (typeof body.color === "string") {
    if (!VALID_COLORS.includes(body.color)) return NextResponse.json({ error: "Invalid color" }, { status: 400 });
    updates.color = body.color;
  }
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await admin.from("client_update_page_format_rules").update(updates).eq("id", ruleId).eq("page_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const { id, ruleId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { error } = await admin.from("client_update_page_format_rules").delete().eq("id", ruleId).eq("page_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "format_rule_removed", "Removed a highlight rule");

  return NextResponse.json({ ok: true });
}

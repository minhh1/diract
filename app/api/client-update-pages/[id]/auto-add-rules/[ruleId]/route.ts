// app/api/client-update-pages/[id]/auto-add-rules/[ruleId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const { id, ruleId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: rule } = await admin.from("client_update_auto_add_rules")
    .select("id, field_id, operator, value").eq("id", ruleId).eq("page_id", id).maybeSingle();
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const { error } = await admin.from("client_update_auto_add_rules").delete().eq("id", ruleId).eq("page_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: field } = await admin.from("company_custom_fields").select("label").eq("id", rule.field_id).maybeSingle();
  const fieldLabel = field?.label || "field";
  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "auto_add_rule_removed", `Removed auto-add rule: "${fieldLabel}" ${rule.operator} "${rule.value ?? ""}"`);

  return NextResponse.json({ success: true });
}

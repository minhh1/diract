// app/api/client-update-pages/[id]/auto-add-rules/route.ts
// GET/POST for a page's auto-add rules -- see
// supabase/migrations/20260729300000_client_update_auto_add_rules.sql for
// the trigger that actually applies them. Only custom fields on the page's
// base_table are offerable (a rule reacts to company_custom_field_values
// inserts, which native/base columns never write to).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

const ALLOWED_OPERATORS = ["equals", "not_equals", "contains", "not_contains", "starts_with", "is_empty", "is_not_empty"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const [{ data: rules }, { data: fields }] = await Promise.all([
    admin.from("client_update_auto_add_rules").select("id, field_id, operator, value, is_active").eq("page_id", id).order("created_at"),
    admin.from("company_custom_fields").select("id, label, field_type").eq("company_id", companyId).eq("table_name", gate.page.base_table).is("deleted_at", null).order("display_order"),
  ]);

  const fieldById = new Map((fields || []).map((f: any) => [f.id, f]));
  const rulesWithLabel = (rules || []).map((r: any) => ({ ...r, fieldLabel: fieldById.get(r.field_id)?.label || "(deleted field)" }));

  return NextResponse.json({ rules: rulesWithLabel, fields: fields || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const { fieldId, operator } = body;
  const value: string | null = typeof body.value === "string" ? body.value.trim() : null;
  if (!ALLOWED_OPERATORS.includes(operator)) return NextResponse.json({ error: "Invalid operator" }, { status: 400 });
  if (!["is_empty", "is_not_empty"].includes(operator) && !value) {
    return NextResponse.json({ error: "Value is required for this operator" }, { status: 400 });
  }

  const { data: field } = await admin.from("company_custom_fields")
    .select("id, label").eq("id", fieldId).eq("company_id", companyId).eq("table_name", gate.page.base_table).is("deleted_at", null).maybeSingle();
  if (!field) return NextResponse.json({ error: "Field not found" }, { status: 404 });

  const { data: rule, error } = await admin.from("client_update_auto_add_rules")
    .insert({ page_id: id, field_id: fieldId, operator, value })
    .select("id, field_id, operator, value, is_active").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "auto_add_rule_created", `Added auto-add rule: "${field.label}" ${operator} "${value ?? ""}"`);

  return NextResponse.json({ rule: { ...rule, fieldLabel: field.label } });
}

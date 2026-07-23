// app/api/teams/bot/project-search-fields/route.ts
// Admin-only read/write for teams_bot_project_search_fields -- which of a
// company's projects-table custom fields (e.g. "Matter Number") the bot
// should also search when resolving a project by name/reference, on top of
// the project's own name (see lib/ai/actions.ts's resolveProjectByName).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const [{ data: customFields }, { data: searchFields }] = await Promise.all([
    admin
      .from("company_custom_fields")
      .select("id, field_key, label")
      .eq("company_id", companyId)
      .eq("table_name", "projects")
      .is("deleted_at", null)
      .order("display_order"),
    admin.from("teams_bot_project_search_fields").select("custom_field_id").eq("company_id", companyId),
  ]);

  const enabledIds = new Set((searchFields ?? []).map((s: { custom_field_id: string }) => s.custom_field_id));
  const fields = (customFields ?? []).map((f: { id: string; field_key: string; label: string }) => ({
    id: f.id,
    fieldKey: f.field_key,
    label: f.label,
    enabled: enabledIds.has(f.id),
  }));

  return NextResponse.json({ fields });
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const customFieldId = typeof body?.custom_field_id === "string" ? body.custom_field_id : null;
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : null;
  if (!customFieldId || enabled === null) {
    return NextResponse.json({ error: "custom_field_id and enabled (boolean) are required" }, { status: 400 });
  }

  if (enabled) {
    const { error } = await admin
      .from("teams_bot_project_search_fields")
      .upsert({ company_id: companyId, custom_field_id: customFieldId }, { onConflict: "company_id,custom_field_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin
      .from("teams_bot_project_search_fields")
      .delete()
      .eq("company_id", companyId)
      .eq("custom_field_id", customFieldId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

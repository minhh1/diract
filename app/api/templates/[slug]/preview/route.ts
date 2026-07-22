// app/api/templates/[slug]/preview/route.ts
// Read-only: for each table/system-field a template would install, checks
// whether the caller's company already has something with the same
// slug/field_key that this template doesn't already own, so the client can
// ask the admin how to resolve each conflict before actually installing
// (see app/api/templates/[slug]/install/route.ts).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const { slug } = await params;

  const { data: template } = await admin
    .from("template_definitions")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!template || (!template.is_published && template.owner_company_id !== companyId)) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const [{ data: tables }, { data: systemFields }, { data: tableMap }, { data: fieldMap }] = await Promise.all([
    admin.from("template_definition_tables").select("*").eq("template_id", template.id).order("display_order"),
    admin.from("template_definition_system_fields").select("*").eq("template_id", template.id).order("display_order"),
    admin.from("company_template_table_map").select("source_template_table_id").eq("company_id", companyId).eq("template_id", template.id),
    admin.from("company_template_field_map").select("source_template_system_field_id").eq("company_id", companyId).eq("template_id", template.id),
  ]);

  const ownedTableIds = new Set((tableMap || []).map(m => m.source_template_table_id));
  const ownedFieldIds = new Set((fieldMap || []).map(m => m.source_template_system_field_id));

  const tableConflicts = await Promise.all(
    (tables || []).map(async t => {
      if (ownedTableIds.has(t.id)) return { slug: t.slug, name: t.name, conflict: null };
      const { data: existing } = await admin
        .from("company_tables").select("id, name").eq("company_id", companyId).eq("slug", t.slug).is("deleted_at", null).maybeSingle();
      return {
        slug: t.slug,
        name: t.name,
        conflict: existing ? { existingId: existing.id, existingName: existing.name } : null,
      };
    })
  );

  const fieldConflicts = await Promise.all(
    (systemFields || []).map(async f => {
      if (ownedFieldIds.has(f.id)) return { tableName: f.table_name, fieldKey: f.field_key, label: f.label, conflict: null };
      const { data: existing } = await admin
        .from("company_custom_fields").select("id, label")
        .eq("company_id", companyId).eq("table_name", f.table_name).eq("field_key", f.field_key).is("deleted_at", null).maybeSingle();
      return {
        tableName: f.table_name,
        fieldKey: f.field_key,
        label: f.label,
        conflict: existing ? { existingId: existing.id, existingLabel: existing.label } : null,
      };
    })
  );

  const { data: install } = await admin
    .from("company_template_installs").select("id").eq("company_id", companyId).eq("template_id", template.id).maybeSingle();

  return NextResponse.json({
    alreadyInstalled: !!install,
    tables: tableConflicts,
    systemFields: fieldConflicts,
    suggestedLabelOverrides: template.suggested_label_overrides || {},
  });
}

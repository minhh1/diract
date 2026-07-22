// app/api/templates/[slug]/preview/route.ts
// Read-only: builds the full "what happens if I install this" manifest for
// the admin to review before approving — every table the template would
// add (with its fields), every system field it would add, whether each
// individually conflicts with something the company already has, and a
// snapshot of the company's current schema for context. See
// app/api/templates/[slug]/install/route.ts for the actual apply step,
// which takes the same resolutions this response's conflicts are asking
// the client to choose.
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
    admin.from("company_template_table_map").select("source_template_table_id, installed_company_table_id").eq("company_id", companyId).eq("template_id", template.id),
    admin.from("company_template_field_map").select("source_template_system_field_id").eq("company_id", companyId).eq("template_id", template.id),
  ]);

  const ownedTableIds = new Set((tableMap || []).map(m => m.source_template_table_id));
  const ownedFieldIds = new Set((fieldMap || []).map(m => m.source_template_system_field_id));
  // installed_company_table_id per source_template_table_id, for owned
  // tables -- used below to diff which of the template's CURRENT fields for
  // that table are missing from what's actually installed (a table gained
  // fields in the catalog after this company installed it -- see
  // upgrade_company_template in supabase/template_marketplace_upgrade.sql).
  const installedTableIdByTemplateTableId = new Map((tableMap || []).map(m => [m.source_template_table_id, m.installed_company_table_id]));

  const tableIds = (tables || []).map(t => t.id);
  const { data: allFields } = tableIds.length
    ? await admin.from("template_definition_table_fields").select("*").in("template_table_id", tableIds).order("display_order")
    : { data: [] as any[] };

  const tableNameById = new Map((tables || []).map(t => [t.id, t.name]));

  const tableConflicts = await Promise.all(
    (tables || []).map(async t => {
      const fieldRows = (allFields || []).filter(f => f.template_table_id === t.id);
      const fields = fieldRows.map(f => ({
        label: f.label,
        fieldType: f.field_type,
        linksTo: f.linked_system_table
          ? f.linked_system_table.charAt(0).toUpperCase() + f.linked_system_table.slice(1)
          : f.linked_template_table_id
            ? tableNameById.get(f.linked_template_table_id) || null
            : null,
      }));

      if (ownedTableIds.has(t.id)) {
        const installedTableId = installedTableIdByTemplateTableId.get(t.id);
        let newFields: typeof fields = [];
        if (installedTableId && fieldRows.length) {
          const { data: installedFields } = await admin
            .from("company_table_fields").select("field_key").eq("table_id", installedTableId).is("deleted_at", null);
          const installedKeys = new Set((installedFields || []).map(f => f.field_key));
          newFields = fieldRows
            .filter(f => !installedKeys.has(f.field_key))
            .map(f => ({
              label: f.label,
              fieldType: f.field_type,
              linksTo: f.linked_system_table
                ? f.linked_system_table.charAt(0).toUpperCase() + f.linked_system_table.slice(1)
                : f.linked_template_table_id
                  ? tableNameById.get(f.linked_template_table_id) || null
                  : null,
            }));
        }
        return { slug: t.slug, name: t.name, icon: t.icon, color: t.color, fields, owned: true, newFields, conflict: null };
      }

      const { data: existing } = await admin
        .from("company_tables").select("id, name").eq("company_id", companyId).eq("slug", t.slug).is("deleted_at", null).maybeSingle();
      return {
        slug: t.slug,
        name: t.name,
        icon: t.icon,
        color: t.color,
        fields,
        owned: false,
        newFields: [] as typeof fields,
        conflict: existing ? { existingId: existing.id, existingName: existing.name } : null,
      };
    })
  );

  const { data: dashboardDefs } = await admin
    .from("template_definition_dashboards").select("id, slug, name, icon, color").eq("template_id", template.id).order("display_order");
  const { data: dashboardMap } = await admin
    .from("company_template_dashboard_map").select("source_template_dashboard_id").eq("company_id", companyId).eq("template_id", template.id);
  const ownedDashboardIds = new Set((dashboardMap || []).map(m => m.source_template_dashboard_id));
  const dashboards = (dashboardDefs || []).map(d => ({
    slug: d.slug, name: d.name, icon: d.icon, color: d.color, owned: ownedDashboardIds.has(d.id),
  }));

  // Whether there's anything for upgrade_company_template to actually do --
  // only meaningful when alreadyInstalled (a fresh install always "has
  // everything to add" by definition, so this flag isn't shown then).
  const hasUpgrade =
    tableConflicts.some(t => !t.owned || t.newFields.length > 0) ||
    dashboards.some(d => !d.owned);

  const fieldConflicts = await Promise.all(
    (systemFields || []).map(async f => {
      if (ownedFieldIds.has(f.id)) return { tableName: f.table_name, fieldKey: f.field_key, label: f.label, fieldType: f.field_type, owned: true, conflict: null };
      const { data: existing } = await admin
        .from("company_custom_fields").select("id, label")
        .eq("company_id", companyId).eq("table_name", f.table_name).eq("field_key", f.field_key).is("deleted_at", null).maybeSingle();
      return {
        tableName: f.table_name,
        fieldKey: f.field_key,
        label: f.label,
        fieldType: f.field_type,
        owned: false,
        conflict: existing ? { existingId: existing.id, existingLabel: existing.label } : null,
      };
    })
  );

  // Snapshot of the company's current schema, so the admin has a baseline
  // to weigh the addition against, not just a list of new things in a vacuum.
  const [{ data: currentTables }, { count: projectsFieldCount }, { count: entitiesFieldCount }, { count: propertiesFieldCount }] = await Promise.all([
    admin.from("company_tables").select("name").eq("company_id", companyId).is("deleted_at", null).order("name"),
    admin.from("company_custom_fields").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("table_name", "projects").is("deleted_at", null),
    admin.from("company_custom_fields").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("table_name", "entities").is("deleted_at", null),
    admin.from("company_custom_fields").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("table_name", "properties").is("deleted_at", null),
  ]);

  const { data: install } = await admin
    .from("company_template_installs").select("id").eq("company_id", companyId).eq("template_id", template.id).maybeSingle();

  return NextResponse.json({
    templateName: template.name,
    templateDescription: template.description,
    alreadyInstalled: !!install,
    hasUpgrade,
    currentSchema: {
      tableNames: (currentTables || []).map(t => t.name),
      systemFieldCounts: {
        projects: projectsFieldCount ?? 0,
        entities: entitiesFieldCount ?? 0,
        properties: propertiesFieldCount ?? 0,
      },
    },
    tables: tableConflicts,
    systemFields: fieldConflicts,
    dashboards,
    suggestedLabelOverrides: template.suggested_label_overrides || {},
  });
}

// app/api/templates/[slug]/preview/route.ts
// Read-only: builds the full "what happens if I install this" manifest for
// the admin to review before approving -- every table the template would
// add (with its fields), every system field it would add, whether each
// individually conflicts with something the company already has, and a
// snapshot of the company's current schema for context. See
// app/api/templates/[slug]/install/route.ts for the actual apply step,
// which takes the same resolutions this response's conflicts are asking
// the client to choose.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { TEMPLATES_WITH_PRECEDENT_LIBRARY, getPrecedentLibraryStatus } from "@/lib/precedents/installLibrary";

// Human-readable first auto number (mirrors next_field_sequence's
// formatting in supabase/company_table_field_sequences.sql: date tokens in
// the prefix, zero-padded counter, configurable start).
function autoNumberExample(f: any): string | null {
  if (f.auto_number_prefix == null) return null;
  const now = new Date();
  const prefix = String(f.auto_number_prefix)
    .replace('{YYYY}', String(now.getFullYear()))
    .replace('{YY}', String(now.getFullYear()).slice(-2))
    .replace('{MM}', String(now.getMonth() + 1).padStart(2, '0'));
  const n = String(f.auto_number_start ?? 1);
  return prefix + n.padStart(Math.max(f.auto_number_pad ?? 6, n.length), '0');
}

// "Rate × Duration Hours", "10% of Subtotal (Ex. GST)", "Sum of Time & Fee
// Entries" -- so the install review can say what a computed field does
// instead of just flagging that it's computed.
function formulaDescription(
  f: any,
  labelByKey: Map<string, string>,
  tableNameBySlug: Map<string, string>
): string | null {
  if (!f.formula_type) return null;
  const a = f.formula_field_a_key ? (labelByKey.get(f.formula_field_a_key) || f.formula_field_a_key) : '';
  const b = f.formula_field_b_key ? (labelByKey.get(f.formula_field_b_key) || f.formula_field_b_key) : '';
  switch (f.formula_type) {
    case 'multiply': return `${a} × ${b}`;
    case 'add': return `${a} + ${b}`;
    case 'subtract': return `${a} - ${b}`;
    case 'percentage_of': return `${f.formula_percent ?? 0}% of ${a}`;
    case 'sum_related': {
      const rel = f.formula_related_table_slug
        ? (tableNameBySlug.get(f.formula_related_table_slug) || f.formula_related_table_slug)
        : 'related records';
      return `Sum of ${rel}`;
    }
    default: return f.formula_type;
  }
}

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
  const tableNameBySlug = new Map((tables || []).map(t => [t.slug, t.name]));

  // Labels for field keys that appear in synced dashboard widgets but
  // aren't in the template's field catalog (custom fields the owner added
  // to their live table without templating them) -- resolved from the OWNER
  // company's live tables so the review reads "Time Logged", not a
  // prettified "Field 1784713137612".
  const { data: ownerTableMap } = await admin
    .from("company_template_table_map")
    .select("source_template_table_id, installed_company_table_id")
    .eq("company_id", template.owner_company_id)
    .eq("template_id", template.id);
  const ownerInstalledByTemplateTableId = new Map((ownerTableMap || []).map(m => [m.source_template_table_id, m.installed_company_table_id]));
  const ownerInstalledIds = (ownerTableMap || []).map(m => m.installed_company_table_id).filter(Boolean);
  const { data: ownerFieldRows } = ownerInstalledIds.length
    ? await admin.from("company_table_fields").select("table_id, field_key, label").in("table_id", ownerInstalledIds).is("deleted_at", null)
    : { data: [] as any[] };
  const ownerLabelsByTableId = new Map<string, Record<string, string>>();
  for (const f of ownerFieldRows || []) {
    const rec = ownerLabelsByTableId.get(f.table_id) || {};
    rec[f.field_key] = f.label;
    ownerLabelsByTableId.set(f.table_id, rec);
  }

  const tableConflicts = await Promise.all(
    (tables || []).map(async t => {
      const fieldRows = (allFields || []).filter(f => f.template_table_id === t.id);
      // Full per-field settings manifest, so the review shows exactly what
      // gets configured -- required/unique flags, auto-numbering with its
      // real first number, computed-field formulas, dropdown options.
      const labelByKey = new Map(fieldRows.map(f => [f.field_key, f.label]));
      const describe = (f: any) => ({
        label: f.label,
        fieldKey: f.field_key,
        fieldType: f.field_type,
        linksTo: f.linked_system_table
          ? f.linked_system_table.charAt(0).toUpperCase() + f.linked_system_table.slice(1)
          : f.linked_template_table_id
            ? tableNameById.get(f.linked_template_table_id) || null
            : null,
        required: !!f.is_required,
        unique: !!f.is_unique,
        autoNumber: autoNumberExample(f),
        formula: formulaDescription(f, labelByKey, tableNameBySlug),
        helpText: f.help_text || null,
        selectOptions: Array.isArray(f.select_options) ? f.select_options : null,
      });
      const fields = fieldRows.map(describe);
      // Catalog labels win; owner-live labels fill the gaps.
      const fieldLabels = {
        ...(ownerLabelsByTableId.get(ownerInstalledByTemplateTableId.get(t.id) as string) || {}),
        ...Object.fromEntries(fieldRows.map((f: any) => [f.field_key, f.label])),
      };

      if (ownedTableIds.has(t.id)) {
        const installedTableId = installedTableIdByTemplateTableId.get(t.id);
        let newFields: typeof fields = [];
        if (installedTableId && fieldRows.length) {
          const { data: installedFields } = await admin
            .from("company_table_fields").select("field_key").eq("table_id", installedTableId).is("deleted_at", null);
          const installedKeys = new Set((installedFields || []).map(f => f.field_key));
          newFields = fieldRows.filter(f => !installedKeys.has(f.field_key)).map(describe);
        }
        return { slug: t.slug, name: t.name, icon: t.icon, color: t.color, isLedger: !!t.is_ledger, fields, fieldLabels, owned: true, newFields, conflict: null };
      }

      const { data: existing } = await admin
        .from("company_tables").select("id, name").eq("company_id", companyId).eq("slug", t.slug).is("deleted_at", null).maybeSingle();
      return {
        slug: t.slug,
        name: t.name,
        icon: t.icon,
        color: t.color,
        isLedger: !!t.is_ledger,
        fields,
        fieldLabels,
        owned: false,
        newFields: [] as typeof fields,
        conflict: existing ? { existingId: existing.id, existingName: existing.name } : null,
      };
    })
  );

  const { data: dashboardDefs } = await admin
    .from("template_definition_dashboards").select("id, slug, name, icon, color, widgets_template, source_template_table_id").eq("template_id", template.id).order("display_order");
  const { data: dashboardMap } = await admin
    .from("company_template_dashboard_map").select("source_template_dashboard_id").eq("company_id", companyId).eq("template_id", template.id);
  const ownedDashboardIds = new Set((dashboardMap || []).map(m => m.source_template_dashboard_id));
  const dashboards = (dashboardDefs || []).map(d => ({
    slug: d.slug, name: d.name, icon: d.icon, color: d.color, owned: ownedDashboardIds.has(d.id),
    // Full widget list (type + 12-col layout + config) so the review can
    // draw a wireframe of what the dashboard will actually look like, plus
    // the source table's slug so widget field keys resolve to real labels.
    widgets: Array.isArray(d.widgets_template) ? d.widgets_template : [],
    sourceTableSlug: (tables || []).find(t => t.id === d.source_template_table_id)?.slug ?? null,
  }));

  // Record-dashboard tabs the template ships (template_definition_record_tabs,
  // see supabase/template_record_tabs.sql) -- shown with the same wireframe
  // treatment as table dashboards. `owned` = this company already has the
  // matching materialized default.
  const { data: recordTabDefs } = await admin
    .from("template_definition_record_tabs").select("*").eq("template_id", template.id).order("display_order");
  const { data: companyTabDefaults } = (recordTabDefs || []).length
    ? await admin.from("company_record_tab_defaults").select("title, linked_table_id").eq("company_id", companyId)
    : { data: [] as any[] };
  const installedLinkedIdByTemplateTableId = installedTableIdByTemplateTableId;
  const recordTabs = (recordTabDefs || []).map(rt => {
    const installedLinkedId = installedLinkedIdByTemplateTableId.get(rt.linked_template_table_id);
    return {
      title: rt.title,
      icon: rt.icon,
      appearsOn: rt.record_table_name
        ? rt.record_table_name.charAt(0).toUpperCase() + rt.record_table_name.slice(1)
        : tableNameById.get(rt.record_template_table_id) || "records",
      linkedTable: tableNameById.get(rt.linked_template_table_id) || null,
      linkedTableSlug: (tables || []).find(t => t.id === rt.linked_template_table_id)?.slug ?? null,
      widgets: Array.isArray(rt.widgets_template) ? rt.widgets_template : [],
      owned: !!(companyTabDefaults || []).some(d => d.title === rt.title && d.linked_table_id === installedLinkedId),
    };
  });

  // Templates that ship the seeded precedent library (see
  // lib/precedents/installLibrary.ts) have a top-up that lives entirely
  // outside install_company_template/upgrade_company_template's schema
  // diffing -- it's authored in TypeScript, not template rows -- so it has
  // to be counted separately and folded into hasUpgrade by hand, or a
  // company that's fully up to date on tables and dashboards but behind on
  // precedents would be told it has nothing pending.
  const precedentLibrary = TEMPLATES_WITH_PRECEDENT_LIBRARY.has(slug)
    ? await getPrecedentLibraryStatus(admin, companyId)
    : null;

  // Whether there's anything for upgrade_company_template to actually do --
  // only meaningful when alreadyInstalled (a fresh install always "has
  // everything to add" by definition, so this flag isn't shown then).
  const hasUpgrade =
    tableConflicts.some(t => !t.owned || t.newFields.length > 0) ||
    dashboards.some(d => !d.owned) ||
    !!(precedentLibrary && precedentLibrary.available > 0);

  const fieldConflicts = await Promise.all(
    (systemFields || []).map(async f => {
      const detail = {
        tableName: f.table_name,
        fieldKey: f.field_key,
        label: f.label,
        fieldType: f.field_type,
        required: !!f.is_required,
        unique: !!f.is_unique,
        helpText: f.help_text || null,
        selectOptions: Array.isArray(f.select_options) ? f.select_options : null,
      };
      if (ownedFieldIds.has(f.id)) return { ...detail, owned: true, conflict: null };
      const { data: existing } = await admin
        .from("company_custom_fields").select("id, label")
        .eq("company_id", companyId).eq("table_name", f.table_name).eq("field_key", f.field_key).is("deleted_at", null).maybeSingle();
      if (existing) {
        return {
          ...detail,
          owned: false,
          conflict: { existingId: existing.id, existingLabel: existing.label, matchType: "field_key" as const },
        };
      }
      // No exact field_key match, but the company may already have this
      // same field under a different key (e.g. one they built by hand
      // before this template existed, or before this field was added to
      // it -- `field_key`s in that case are often auto-generated
      // (`field_<timestamp>`), not the template's clean slug). Installing
      // blindly in that case creates a confusing duplicate -- see the Huynh
      // Lawyers "Client" / "Client Name" cleanup this was found from -
      // so flag an exact case-insensitive label match on the same table too.
      const { data: labelMatch } = await admin
        .from("company_custom_fields").select("id, label")
        .eq("company_id", companyId).eq("table_name", f.table_name).ilike("label", f.label).is("deleted_at", null).maybeSingle();
      return {
        ...detail,
        owned: false,
        conflict: labelMatch ? { existingId: labelMatch.id, existingLabel: labelMatch.label, matchType: "label" as const } : null,
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
    recordTabs,
    precedentLibrary,
    suggestedLabelOverrides: template.suggested_label_overrides || {},
  });
}

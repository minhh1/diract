// lib/ai/tableBuilderTools.ts
// Tool schemas + executor for the /dashboard/ai table/dashboard-builder
// assistant (see app/api/ai/chat/route.ts, lib/ai/modelCall.ts's
// callTogetherModelWithTools). Every write here runs with admin-equivalent
// rights via the service-role `admin` client -- the assistant acts as an
// admin user of the company regardless of which member is chatting with it
// (owner_user_id: null on every table/dashboard it creates), following the
// same explicit-check-in-code convention as app/api/company/email-domain/
// route.ts rather than relying on RLS. `userId` is still recorded as
// actor_id on every schema_change_log entry, for audit/attribution only.
//
// Destructive tools require confirm: true, which the system prompt (see
// chat/route.ts) instructs the model to only ever set after the user has
// explicitly agreed in conversation -- enforced here, not just prompted.
// Every mutation logs to schema_change_log the same way the human UI does
// (CustomTableBuilder.tsx, SchemaVisualisation.tsx, DashboardBuilderPage.tsx),
// so AI-driven changes are restorable via Settings -> Trash / Schema History
// exactly like a manual change. Can't reuse lib/services/schemaChangeLog.ts
// directly -- it writes through the browser-scoped `supabase` client, which
// has no valid session here; this file has its own admin-client insert.
import { createWidget } from "@/lib/dashboardWidgets/defaults";
import type { DashboardWidget, DashboardWidgetType } from "@/lib/dashboardWidgets/types";
import type { ToolSchema } from "@/lib/ai/modelCall";

const FIELD_TYPES = ["text", "number", "date", "boolean", "select", "email", "url", "currency", "table_relation"] as const;
type FieldType = (typeof FIELD_TYPES)[number];

const FORMULA_TYPES = ["multiply", "percentage_of", "add", "sum_related", "max_related"] as const;
type FormulaType = (typeof FORMULA_TYPES)[number];

// The 7 general-purpose widget types -- deliberately excludes the 13
// industry-specific ones (trust_*, finance_model_*, residual_land_solver,
// public_*_page, my_tasks_button, auto_time_recording_button, time_*_report)
// which need context this assistant doesn't have and aren't broadly
// applicable. A user can add those manually afterward.
const GENERAL_WIDGET_TYPES: DashboardWidgetType[] = [
  "heading", "text", "filter_bar", "quick_add_form", "grid", "summary_tile", "chart", "document_export",
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

async function logSchemaChange(
  admin: any,
  params: {
    companyId: string; actorId: string; entityType: string; entityId: string;
    entityLabel?: string | null; action: "create" | "update" | "delete";
    before?: Record<string, any> | null; after?: Record<string, any> | null;
  }
): Promise<void> {
  const { error } = await admin.from("schema_change_log").insert({
    company_id: params.companyId,
    actor_id: params.actorId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    entity_label: params.entityLabel ?? null,
    action: params.action,
    before: params.before ?? null,
    after: params.after ?? null,
  });
  if (error) console.error("[tableBuilderTools] logSchemaChange:", error);
}

export const TABLE_BUILDER_TOOLS: ToolSchema[] = [
  {
    name: "list_existing_tables",
    description: "List this company's existing custom tables and their fields. Always call this before creating a table, so you don't create a duplicate of something that already exists.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_existing_dashboards",
    description: "List this company's existing dashboards, their source table, and their widgets. Call before creating a new dashboard to avoid duplicates.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_table",
    description: "Create a new custom table for this company (e.g. Invoices, Employees, Payroll). Returns the new table's id, needed for create_field/create_dashboard. Requires confirm=true -- only set this after you've laid out the full plan (this table, its fields, and the dashboard/widgets you'll add) and the user has explicitly agreed to it in chat.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Table name, e.g. 'Invoices'." },
        icon: { type: "string", description: "A Lucide icon name, e.g. 'FileText', 'Users', 'Truck', 'CreditCard', 'Briefcase', 'Package'." },
        color: { type: "string", description: "A hex color, e.g. '#6366f1'." },
        confirm: { type: "boolean", description: "Must be true, and only after you've presented the full plan and the user has explicitly agreed to it in this conversation." },
      },
      required: ["name", "icon", "color", "confirm"],
    },
  },
  {
    name: "create_field",
    description: "Add a field/column to a table (from create_table or list_existing_tables). Requires confirm=true -- only set this after the user has explicitly agreed to the plan that includes this field. Can also create a COMPUTED field (see formula_type) instead of a plain typed-in one -- see the formula_* params.",
    input_schema: {
      type: "object",
      properties: {
        table_id: { type: "string" },
        label: { type: "string", description: "Field label, e.g. 'Amount Due'." },
        field_type: { type: "string", enum: [...FIELD_TYPES], description: "'table_relation' links this field to another table's records -- pair it with relation_table_id." },
        select_options: { type: "array", items: { type: "string" }, description: "Only for field_type 'select' -- the list of choices, e.g. ['Draft','Sent','Paid']." },
        is_required: { type: "boolean" },
        help_text: { type: "string" },
        relation_table_id: { type: "string", description: "Required when field_type is 'table_relation' -- the id (from create_table/list_existing_tables) of the table this field links to." },
        formula_type: {
          type: "string",
          enum: [...FORMULA_TYPES],
          description:
            "Makes this field auto-computed instead of typed-in -- field_type should be 'number' or 'currency'. " +
            "'multiply'/'add': combines two fields on THIS SAME table (formula_field_a_label + formula_field_b_label). " +
            "'percentage_of': one field on THIS table times a percent (formula_field_a_label + formula_percent, e.g. 10 for 10%). " +
            "'sum_related'/'max_related': totals (or finds the max of) a field on a RELATED CHILD table across every one of its rows that links back to this record -- requires formula_child_table_id, formula_field_a_label (on that child table), and formula_relation_field_label (a table_relation field on that child table pointing back at THIS table -- create it first with its own create_field call if it doesn't exist yet).",
        },
        formula_field_a_label: { type: "string", description: "formula_type multiply/add/percentage_of: label of the other field, on THIS table. formula_type sum_related/max_related: label of the field to total/max, on formula_child_table_id." },
        formula_field_b_label: { type: "string", description: "formula_type multiply/add only: second field's label, on THIS table." },
        formula_percent: { type: "number", description: "formula_type percentage_of only, e.g. 10 for 10%." },
        formula_child_table_id: { type: "string", description: "formula_type sum_related/max_related only: id of the CHILD table formula_field_a_label and formula_relation_field_label live on." },
        formula_relation_field_label: { type: "string", description: "formula_type sum_related/max_related only: label of the table_relation field ON formula_child_table_id that points back at THIS table." },
        formula_condition_field_label: { type: "string", description: "formula_type sum_related/max_related only, optional: a field label on formula_child_table_id to only count matching rows (e.g. only 'Billable' items)." },
        formula_condition_value: { type: "string", description: "Required if formula_condition_field_label is set -- the value that field must equal for a row to count." },
        confirm: { type: "boolean", description: "Must be true, and only after you've presented the full plan and the user has explicitly agreed to it in this conversation." },
      },
      required: ["table_id", "label", "field_type", "confirm"],
    },
  },
  {
    name: "create_dashboard",
    description: "Create a new dashboard bound to a table, so its records can be viewed/entered/summarized. It starts empty -- call add_widget afterward to populate it. Requires confirm=true -- only set this after the user has explicitly agreed to the plan that includes this dashboard.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        icon: { type: "string", description: "A Lucide icon name, e.g. 'LayoutDashboard'." },
        color: { type: "string", description: "A hex color, e.g. '#6366f1'." },
        source_table_id: { type: "string", description: "The id of a custom table (from create_table/list_existing_tables) this dashboard shows records from." },
        confirm: { type: "boolean", description: "Must be true, and only after you've presented the full plan and the user has explicitly agreed to it in this conversation." },
      },
      required: ["name", "icon", "color", "source_table_id", "confirm"],
    },
  },
  {
    name: "add_widget",
    description: "Add a widget to a dashboard created with create_dashboard. Reference fields by their LABEL (e.g. 'Amount'), not id -- this tool resolves labels to the right field for you. Add a grid and/or quick_add_form first so the dashboard is actually usable, then summary_tile/chart for at-a-glance numbers. 'document_export' gives records a working PDF download (letter or invoice style) -- see its own params. Requires confirm=true -- only set this after the user has explicitly agreed to the plan that includes this widget.",
    input_schema: {
      type: "object",
      properties: {
        dashboard_id: { type: "string" },
        widget_type: { type: "string", enum: GENERAL_WIDGET_TYPES },
        text: { type: "string", description: "heading/text widgets: the text to show." },
        heading_level: { type: "number", enum: [1, 2, 3], description: "heading widgets only, defaults to 2." },
        field_labels: { type: "array", items: { type: "string" }, description: "filter_bar/quick_add_form/grid widgets: which fields to show, in order." },
        summary_label: { type: "string", description: "summary_tile widgets: the tile's title; chart widgets: the series label." },
        summary_field_label: { type: "string", description: "summary_tile/chart widgets: the field to aggregate (omit for a plain record-count tile)." },
        summary_aggregate: { type: "string", enum: ["sum", "count", "net", "count-distinct"], description: "summary_tile/chart widgets, defaults to 'count'." },
        chart_date_field_label: { type: "string", description: "chart widgets (required): the date field for the x-axis." },
        document_export_style: { type: "string", enum: ["letter", "invoice"], description: "document_export widgets (required): 'letter' renders onto the company's letterhead (needs a letterhead already uploaded in Settings -> Precedents); 'invoice' renders a generic billing-document layout. All fields below are on the dashboard's OWN bound table." },
        recipient_name_field_label: { type: "string", description: "document_export style 'letter': field holding who the letter is addressed to." },
        recipient_address_field_label: { type: "string", description: "document_export style 'letter': field holding the recipient's mailing address." },
        subject_field_label: { type: "string", description: "document_export style 'letter': field holding the letter's subject line." },
        body_field_label: { type: "string", description: "document_export style 'letter' (required): a text field holding the letter's body copy." },
        invoice_number_field_label: { type: "string", description: "document_export style 'invoice': field holding the invoice number." },
        invoice_date_field_label: { type: "string", description: "document_export style 'invoice': field holding the invoice date." },
        due_date_field_label: { type: "string", description: "document_export style 'invoice': field holding the due date." },
        customer_name_field_label: { type: "string", description: "document_export style 'invoice': field holding who's being billed." },
        customer_address_field_label: { type: "string", description: "document_export style 'invoice': field holding the customer's address." },
        description_field_label: { type: "string", description: "document_export style 'invoice': field holding this record's own line-item description." },
        amount_field_label: { type: "string", description: "document_export style 'invoice': field holding this record's own line-item amount." },
        subtotal_field_label: { type: "string", description: "document_export style 'invoice': field holding the subtotal." },
        tax_field_label: { type: "string", description: "document_export style 'invoice': field holding the tax amount." },
        total_field_label: { type: "string", description: "document_export style 'invoice': field holding the total." },
        confirm: { type: "boolean", description: "Must be true, and only after you've presented the full plan and the user has explicitly agreed to it in this conversation." },
      },
      required: ["dashboard_id", "widget_type", "confirm"],
    },
  },
  {
    name: "delete_table",
    description: "Soft-delete a table (and all its fields/records go with it from active view). Restorable afterward via Settings -> Trash. Requires confirm=true -- only set this after the user has explicitly agreed in chat to deleting this specific table, having been told what it contains.",
    input_schema: {
      type: "object",
      properties: {
        table_id: { type: "string" },
        confirm: { type: "boolean", description: "Must be true, and only after explicit user agreement in this conversation." },
      },
      required: ["table_id", "confirm"],
    },
  },
  {
    name: "delete_field",
    description: "Soft-delete a field from a table. Restorable afterward via Settings -> Trash. Requires confirm=true -- only set this after the user has explicitly agreed in chat.",
    input_schema: {
      type: "object",
      properties: {
        field_id: { type: "string" },
        confirm: { type: "boolean", description: "Must be true, and only after explicit user agreement in this conversation." },
      },
      required: ["field_id", "confirm"],
    },
  },
  {
    name: "remove_widget",
    description: "Remove one widget from a dashboard. Restorable via Settings -> Schema History (revert). Requires confirm=true -- only set this after the user has explicitly agreed in chat.",
    input_schema: {
      type: "object",
      properties: {
        dashboard_id: { type: "string" },
        widget_id: { type: "string" },
        confirm: { type: "boolean", description: "Must be true, and only after explicit user agreement in this conversation." },
      },
      required: ["dashboard_id", "widget_id", "confirm"],
    },
  },
  {
    name: "delete_dashboard",
    description: "Soft-delete a dashboard (its source table and records are untouched). Restorable afterward via Settings -> Trash. Requires confirm=true -- only set this after the user has explicitly agreed in chat.",
    input_schema: {
      type: "object",
      properties: {
        dashboard_id: { type: "string" },
        confirm: { type: "boolean", description: "Must be true, and only after explicit user agreement in this conversation." },
      },
      required: ["dashboard_id", "confirm"],
    },
  },
];

export interface ToolExecutionResult {
  content: string;
  isError?: boolean;
}

async function listExistingTables(admin: any, companyId: string): Promise<ToolExecutionResult> {
  const { data: tables } = await admin
    .from("company_tables")
    .select("id, name, slug, icon, color")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("display_order");
  const tableIds = (tables ?? []).map((t: any) => t.id);
  const { data: fields } = tableIds.length
    ? await admin.from("company_table_fields").select("id, table_id, label, field_type").in("table_id", tableIds).is("deleted_at", null)
    : { data: [] };
  const result = (tables ?? []).map((t: any) => ({
    ...t,
    fields: (fields ?? []).filter((f: any) => f.table_id === t.id).map((f: any) => ({ id: f.id, label: f.label, field_type: f.field_type })),
  }));
  return { content: JSON.stringify(result) };
}

async function listExistingDashboards(admin: any, companyId: string): Promise<ToolExecutionResult> {
  const { data: dashboards } = await admin
    .from("company_dashboards")
    .select("id, name, slug, source_table_type, source_table_id, widgets")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  const result = (dashboards ?? []).map((d: any) => ({
    id: d.id, name: d.name, slug: d.slug,
    source_table_type: d.source_table_type, source_table_id: d.source_table_id,
    widgets: (d.widgets ?? []).map((w: any) => ({ id: w.id, type: w.type })),
  }));
  return { content: JSON.stringify(result) };
}

async function createTable(admin: any, companyId: string, userId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  if (input.confirm !== true) return { content: "Creating a table requires confirm=true. First present the full plan (this table, its fields, and the dashboard/widgets) and get the user's explicit agreement, then call this tool again.", isError: true };
  const name = String(input.name || "").trim();
  if (!name) return { content: "name is required", isError: true };
  const icon = String(input.icon || "Table2");
  const color = String(input.color || "#6366f1");

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let suffix = 1;
  // Mirrors install_company_template's collision loop (supabase/template_marketplace.sql)
  // -- CustomTableBuilder.tsx itself just lets the insert fail on a raw
  // Postgres unique-violation, fine for a human who sees the error and
  // retries, not fine for a tool call the model can't visually debug.
  while (true) {
    const { data: existing } = await admin.from("company_tables").select("id").eq("company_id", companyId).eq("slug", slug).is("deleted_at", null).maybeSingle();
    if (!existing) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const { data: orderRows } = await admin.from("company_tables").select("display_order").eq("company_id", companyId).is("deleted_at", null).order("display_order", { ascending: false }).limit(1);
  const displayOrder = (orderRows?.[0]?.display_order ?? -1) + 1;

  const { data: created, error } = await admin
    .from("company_tables")
    .insert({ company_id: companyId, name, slug, icon, color, display_order: displayOrder, owner_user_id: null })
    .select()
    .single();
  if (error || !created) return { content: `Failed to create table: ${error?.message}`, isError: true };

  await logSchemaChange(admin, { companyId, actorId: userId, entityType: "company_table", entityId: created.id, entityLabel: name, action: "create", after: created });
  return { content: JSON.stringify({ id: created.id, name: created.name, slug: created.slug }) };
}

async function createField(admin: any, companyId: string, userId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  if (input.confirm !== true) return { content: "Adding a field requires confirm=true. First present the full plan and get the user's explicit agreement, then call this tool again.", isError: true };
  const tableId = String(input.table_id || "");
  const label = String(input.label || "").trim();
  const fieldType = String(input.field_type || "") as FieldType;
  if (!tableId || !label || !FIELD_TYPES.includes(fieldType)) {
    return { content: `table_id, label, and a valid field_type (${FIELD_TYPES.join(", ")}) are required`, isError: true };
  }

  const { data: table } = await admin.from("company_tables").select("id, is_from_template").eq("id", tableId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!table) return { content: "Table not found", isError: true };
  if (table.is_from_template) return { content: "This table was installed from a template and is locked -- it cannot be edited", isError: true };

  let linkedTableId: string | null = null;
  if (fieldType === "table_relation") {
    linkedTableId = String(input.relation_table_id || "");
    const { data: relTable } = await admin.from("company_tables").select("id").eq("id", linkedTableId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
    if (!relTable) return { content: "relation_table_id not found -- field_type 'table_relation' requires a valid relation_table_id", isError: true };
  }

  // Resolves a field by LABEL on a specific table -- same convention as
  // add_widget's own resolveLabel, since the model can't reliably produce
  // real field ids on its own. Used below to turn formula_* label params
  // into the real ids company_table_fields.formula_field_a_id etc. need.
  const resolveFieldOnTable = async (tid: string, label: string): Promise<{ id: string; field_type: string; linked_table_id: string | null } | null> => {
    const { data } = await admin.from("company_table_fields").select("id, field_type, linked_table_id").eq("table_id", tid).ilike("label", label).is("deleted_at", null).maybeSingle();
    return data ?? null;
  };

  let formulaType: FormulaType | null = null;
  let formulaFieldAId: string | null = null;
  let formulaFieldBId: string | null = null;
  let formulaPercent: number | null = null;
  let formulaRelationFieldId: string | null = null;
  let formulaConditionFieldId: string | null = null;
  let formulaConditionValue: string | null = null;

  if (input.formula_type) {
    const rawFormulaType = String(input.formula_type);
    if (!(FORMULA_TYPES as readonly string[]).includes(rawFormulaType)) {
      return { content: `formula_type must be one of: ${FORMULA_TYPES.join(", ")}`, isError: true };
    }
    formulaType = rawFormulaType as FormulaType;

    if (formulaType === "multiply" || formulaType === "add") {
      const a = await resolveFieldOnTable(tableId, String(input.formula_field_a_label || ""));
      const b = await resolveFieldOnTable(tableId, String(input.formula_field_b_label || ""));
      if (!a || !b) return { content: "formula_field_a_label and formula_field_b_label must both be existing fields on this table (create them first if they don't exist yet)", isError: true };
      formulaFieldAId = a.id;
      formulaFieldBId = b.id;
    } else if (formulaType === "percentage_of") {
      const a = await resolveFieldOnTable(tableId, String(input.formula_field_a_label || ""));
      if (!a) return { content: "formula_field_a_label must be an existing field on this table (create it first if it doesn't exist yet)", isError: true };
      formulaFieldAId = a.id;
      formulaPercent = Number(input.formula_percent);
      if (Number.isNaN(formulaPercent)) return { content: "formula_percent is required and must be a number for formula_type 'percentage_of'", isError: true };
    } else if (formulaType === "sum_related" || formulaType === "max_related") {
      const childTableId = String(input.formula_child_table_id || "");
      const { data: childTable } = await admin.from("company_tables").select("id").eq("id", childTableId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
      if (!childTable) return { content: "formula_child_table_id not found", isError: true };

      const a = await resolveFieldOnTable(childTableId, String(input.formula_field_a_label || ""));
      const rel = await resolveFieldOnTable(childTableId, String(input.formula_relation_field_label || ""));
      if (!a || !rel) return { content: "formula_field_a_label and formula_relation_field_label must both be existing fields on formula_child_table_id (create them first if they don't exist yet)", isError: true };
      if (rel.field_type !== "table_relation" || rel.linked_table_id !== tableId) {
        return { content: `"${input.formula_relation_field_label}" must be a table_relation field on formula_child_table_id that links back to THIS table -- create it first with a create_field call (field_type: 'table_relation', relation_table_id: this table's id)`, isError: true };
      }
      formulaFieldAId = a.id;
      formulaRelationFieldId = rel.id;

      if (input.formula_condition_field_label) {
        const cond = await resolveFieldOnTable(childTableId, String(input.formula_condition_field_label));
        if (!cond) return { content: "formula_condition_field_label not found on formula_child_table_id", isError: true };
        formulaConditionFieldId = cond.id;
        formulaConditionValue = String(input.formula_condition_value ?? "");
      }
    }
  }

  const { data: orderRows } = await admin.from("company_table_fields").select("display_order").eq("table_id", tableId).is("deleted_at", null).order("display_order", { ascending: false }).limit(1);
  const displayOrder = (orderRows?.[0]?.display_order ?? -1) + 1;

  const selectOptions = fieldType === "select" && Array.isArray(input.select_options) ? input.select_options.map(String) : null;

  const { data: created, error } = await admin
    .from("company_table_fields")
    .insert({
      company_id: companyId,
      table_id: tableId,
      field_key: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label,
      field_type: fieldType,
      linked_table_id: linkedTableId,
      select_options: selectOptions,
      is_required: !!input.is_required,
      help_text: input.help_text ? String(input.help_text) : null,
      show_in_table: true,
      display_order: displayOrder,
      formula_type: formulaType,
      formula_field_a_id: formulaFieldAId,
      formula_field_b_id: formulaFieldBId,
      formula_percent: formulaPercent,
      formula_relation_field_id: formulaRelationFieldId,
      formula_condition_field_id: formulaConditionFieldId,
      formula_condition_value: formulaConditionValue,
    })
    .select()
    .single();
  if (error || !created) return { content: `Failed to create field: ${error?.message}`, isError: true };

  await logSchemaChange(admin, { companyId, actorId: userId, entityType: "company_table_field", entityId: created.id, entityLabel: label, action: "create", after: created });
  return { content: JSON.stringify({ id: created.id, label: created.label, field_type: created.field_type }) };
}

async function createDashboard(admin: any, companyId: string, userId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  if (input.confirm !== true) return { content: "Creating a dashboard requires confirm=true. First present the full plan and get the user's explicit agreement, then call this tool again.", isError: true };
  const name = String(input.name || "").trim();
  if (!name) return { content: "name is required", isError: true };
  const icon = String(input.icon || "LayoutDashboard");
  const color = String(input.color || "#6366f1");
  const sourceTableId = String(input.source_table_id || "");
  if (!sourceTableId) return { content: "source_table_id is required", isError: true };

  const { data: table } = await admin.from("company_tables").select("id").eq("id", sourceTableId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!table) return { content: "source_table_id not found", isError: true };

  // Same slug shape as DashboardBuilderPage.tsx's handleSave -- the
  // (company_id, slug) unique constraint was dropped (schema_soft_delete_
  // unique_fix.sql), so no collision loop needed here, unlike create_table.
  const slug = `${slugify(name)}-${Date.now().toString(36)}`;

  const { data: orderRows } = await admin.from("company_dashboards").select("display_order").eq("company_id", companyId).is("deleted_at", null).order("display_order", { ascending: false }).limit(1);
  const displayOrder = (orderRows?.[0]?.display_order ?? -1) + 1;

  const { data: created, error } = await admin
    .from("company_dashboards")
    .insert({
      company_id: companyId, name, slug, icon, color,
      source_table_type: "custom", source_table_id: sourceTableId,
      widgets: [], builder_mode: "canvas",
      // Must be set on every insert -- a dashboard whose insert forgets this
      // has its (empty, at insert time) widgets treated as "not yet
      // migrated" and gets silently wiped on first view. See
      // supabase/company_dashboards_widgets_default_fix.sql's postmortem.
      widgets_migrated_at: new Date().toISOString(),
      owner_user_id: null, is_default: false,
      display_order: displayOrder,
    })
    .select()
    .single();
  if (error || !created) return { content: `Failed to create dashboard: ${error?.message}`, isError: true };

  await logSchemaChange(admin, { companyId, actorId: userId, entityType: "company_dashboard", entityId: created.id, entityLabel: name, action: "create", after: created });
  return { content: JSON.stringify({ id: created.id, name: created.name, slug: created.slug }) };
}

async function addWidget(admin: any, companyId: string, userId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  if (input.confirm !== true) return { content: "Adding a widget requires confirm=true. First present the full plan and get the user's explicit agreement, then call this tool again.", isError: true };
  const dashboardId = String(input.dashboard_id || "");
  const widgetType = String(input.widget_type || "") as DashboardWidgetType;
  if (!GENERAL_WIDGET_TYPES.includes(widgetType)) {
    return { content: `widget_type must be one of: ${GENERAL_WIDGET_TYPES.join(", ")}`, isError: true };
  }

  const { data: dashboard } = await admin.from("company_dashboards").select("*").eq("id", dashboardId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!dashboard) return { content: "Dashboard not found", isError: true };

  let fields: { id: string; label: string }[] = [];
  if (dashboard.source_table_id) {
    const { data } = await admin.from("company_table_fields").select("id, label").eq("table_id", dashboard.source_table_id).is("deleted_at", null);
    fields = data ?? [];
  }
  const resolveLabel = (label: string): string | null =>
    fields.find((f) => f.label.toLowerCase() === label.toLowerCase())?.id ?? null;

  const existingWidgets: DashboardWidget[] = dashboard.widgets ?? [];
  const widget = createWidget(widgetType, existingWidgets);

  if (widget.type === "heading") {
    widget.config.text = String(input.text || "");
    if (input.heading_level) widget.config.level = Number(input.heading_level) as 1 | 2 | 3;
  } else if (widget.type === "text") {
    widget.config.text = String(input.text || "");
  } else if (widget.type === "filter_bar" || widget.type === "quick_add_form" || widget.type === "grid") {
    const labels: string[] = Array.isArray(input.field_labels) ? input.field_labels.map(String) : [];
    widget.config.fieldIds = labels.map(resolveLabel).filter((id): id is string => !!id);
  } else if (widget.type === "summary_tile") {
    widget.config.label = String(input.summary_label || "");
    widget.config.fieldId = input.summary_field_label ? resolveLabel(String(input.summary_field_label)) : null;
    widget.config.aggregate = (input.summary_aggregate as "sum" | "count" | "net" | "count-distinct") || "count";
  } else if (widget.type === "chart") {
    const dateFieldId = input.chart_date_field_label ? resolveLabel(String(input.chart_date_field_label)) : null;
    if (!dateFieldId) return { content: "chart widgets need chart_date_field_label to match an existing date field on the dashboard's table", isError: true };
    widget.config.dateFieldId = dateFieldId;
    if (input.summary_field_label) {
      const valueFieldId = resolveLabel(String(input.summary_field_label));
      widget.config.series = [{
        label: String(input.summary_label || "Total"),
        valueFieldId,
        aggregate: (input.summary_aggregate as "sum" | "count" | "count-distinct") || "sum",
      }];
    }
  } else if (widget.type === "document_export") {
    const style = String(input.document_export_style || "");
    if (style !== "letter" && style !== "invoice") {
      return { content: "document_export widgets need document_export_style ('letter' or 'invoice')", isError: true };
    }
    widget.config.style = style;
    if (style === "letter") {
      const bodyFieldId = input.body_field_label ? resolveLabel(String(input.body_field_label)) : null;
      if (!bodyFieldId) return { content: "document_export style 'letter' needs body_field_label to match an existing field on the dashboard's table", isError: true };
      widget.config.letter = {
        bodyFieldId,
        recipientNameFieldId: input.recipient_name_field_label ? resolveLabel(String(input.recipient_name_field_label)) : null,
        recipientAddressFieldId: input.recipient_address_field_label ? resolveLabel(String(input.recipient_address_field_label)) : null,
        subjectFieldId: input.subject_field_label ? resolveLabel(String(input.subject_field_label)) : null,
      };
    } else {
      widget.config.invoice = {
        invoiceNumberFieldId: input.invoice_number_field_label ? resolveLabel(String(input.invoice_number_field_label)) : null,
        invoiceDateFieldId: input.invoice_date_field_label ? resolveLabel(String(input.invoice_date_field_label)) : null,
        dueDateFieldId: input.due_date_field_label ? resolveLabel(String(input.due_date_field_label)) : null,
        customerNameFieldId: input.customer_name_field_label ? resolveLabel(String(input.customer_name_field_label)) : null,
        customerAddressFieldId: input.customer_address_field_label ? resolveLabel(String(input.customer_address_field_label)) : null,
        descriptionFieldId: input.description_field_label ? resolveLabel(String(input.description_field_label)) : null,
        amountFieldId: input.amount_field_label ? resolveLabel(String(input.amount_field_label)) : null,
        subtotalFieldId: input.subtotal_field_label ? resolveLabel(String(input.subtotal_field_label)) : null,
        taxFieldId: input.tax_field_label ? resolveLabel(String(input.tax_field_label)) : null,
        totalFieldId: input.total_field_label ? resolveLabel(String(input.total_field_label)) : null,
      };
    }
  }

  const nextWidgets = [...existingWidgets, widget];
  const { data: updated, error } = await admin
    .from("company_dashboards")
    .update({ widgets: nextWidgets, updated_at: new Date().toISOString() })
    .eq("id", dashboardId)
    .select()
    .single();
  if (error || !updated) return { content: `Failed to add widget: ${error?.message}`, isError: true };

  await logSchemaChange(admin, { companyId, actorId: userId, entityType: "company_dashboard", entityId: dashboardId, entityLabel: dashboard.name, action: "update", before: dashboard, after: updated });
  return { content: JSON.stringify({ widget_id: widget.id, widget_type: widget.type }) };
}

async function deleteTable(admin: any, companyId: string, userId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  if (input.confirm !== true) return { content: "Deletion requires confirm=true. Ask the user to explicitly confirm this specific deletion first, then call this tool again.", isError: true };
  const tableId = String(input.table_id || "");
  const { data: table } = await admin.from("company_tables").select("*").eq("id", tableId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!table) return { content: "Table not found (or already deleted)", isError: true };
  if (table.is_from_template) return { content: "This table was installed from a template and cannot be deleted", isError: true };

  const { error } = await admin.from("company_tables").update({ deleted_at: new Date().toISOString() }).eq("id", tableId);
  if (error) return { content: `Failed to delete: ${error.message}`, isError: true };

  await logSchemaChange(admin, { companyId, actorId: userId, entityType: "company_table", entityId: tableId, entityLabel: table.name, action: "delete", before: table });
  return { content: `Deleted table "${table.name}". Restorable via Settings → Trash or Settings → Schema History.` };
}

async function deleteField(admin: any, companyId: string, userId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  if (input.confirm !== true) return { content: "Deletion requires confirm=true. Ask the user to explicitly confirm this specific deletion first, then call this tool again.", isError: true };
  const fieldId = String(input.field_id || "");
  const { data: field } = await admin.from("company_table_fields").select("*, company_tables!inner(company_id, is_from_template)").eq("id", fieldId).eq("company_tables.company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!field) return { content: "Field not found (or already deleted)", isError: true };
  if (field.is_from_template || field.company_tables?.is_from_template) return { content: "This field belongs to a table installed from a template and cannot be deleted", isError: true };

  const { error } = await admin.from("company_table_fields").update({ deleted_at: new Date().toISOString() }).eq("id", fieldId);
  if (error) return { content: `Failed to delete: ${error.message}`, isError: true };

  await logSchemaChange(admin, { companyId, actorId: userId, entityType: "company_table_field", entityId: fieldId, entityLabel: field.label, action: "delete", before: field });
  return { content: `Deleted field "${field.label}". Restorable via Settings → Trash or Settings → Schema History.` };
}

async function removeWidget(admin: any, companyId: string, userId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  if (input.confirm !== true) return { content: "Removing a widget requires confirm=true. Ask the user to explicitly confirm first, then call this tool again.", isError: true };
  const dashboardId = String(input.dashboard_id || "");
  const widgetId = String(input.widget_id || "");
  const { data: dashboard } = await admin.from("company_dashboards").select("*").eq("id", dashboardId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!dashboard) return { content: "Dashboard not found", isError: true };

  const existingWidgets: DashboardWidget[] = dashboard.widgets ?? [];
  if (!existingWidgets.some((w) => w.id === widgetId)) return { content: "Widget not found on this dashboard", isError: true };
  const nextWidgets = existingWidgets.filter((w) => w.id !== widgetId);

  const { data: updated, error } = await admin.from("company_dashboards").update({ widgets: nextWidgets, updated_at: new Date().toISOString() }).eq("id", dashboardId).select().single();
  if (error || !updated) return { content: `Failed to remove widget: ${error?.message}`, isError: true };

  await logSchemaChange(admin, { companyId, actorId: userId, entityType: "company_dashboard", entityId: dashboardId, entityLabel: dashboard.name, action: "update", before: dashboard, after: updated });
  return { content: "Widget removed. Restorable via Settings → Schema History." };
}

async function deleteDashboard(admin: any, companyId: string, userId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  if (input.confirm !== true) return { content: "Deletion requires confirm=true. Ask the user to explicitly confirm this specific deletion first, then call this tool again.", isError: true };
  const dashboardId = String(input.dashboard_id || "");
  const { data: dashboard } = await admin.from("company_dashboards").select("*").eq("id", dashboardId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!dashboard) return { content: "Dashboard not found (or already deleted)", isError: true };

  const { error } = await admin.from("company_dashboards").update({ deleted_at: new Date().toISOString() }).eq("id", dashboardId);
  if (error) return { content: `Failed to delete: ${error.message}`, isError: true };

  await logSchemaChange(admin, { companyId, actorId: userId, entityType: "company_dashboard", entityId: dashboardId, entityLabel: dashboard.name, action: "delete", before: dashboard });
  return { content: `Deleted dashboard "${dashboard.name}". Restorable via Settings → Trash or Settings → Schema History.` };
}

export async function executeTableBuilderTool(
  admin: any,
  companyId: string,
  userId: string,
  name: string,
  input: Record<string, any>
): Promise<ToolExecutionResult> {
  try {
    switch (name) {
      case "list_existing_tables": return await listExistingTables(admin, companyId);
      case "list_existing_dashboards": return await listExistingDashboards(admin, companyId);
      case "create_table": return await createTable(admin, companyId, userId, input);
      case "create_field": return await createField(admin, companyId, userId, input);
      case "create_dashboard": return await createDashboard(admin, companyId, userId, input);
      case "add_widget": return await addWidget(admin, companyId, userId, input);
      case "delete_table": return await deleteTable(admin, companyId, userId, input);
      case "delete_field": return await deleteField(admin, companyId, userId, input);
      case "remove_widget": return await removeWidget(admin, companyId, userId, input);
      case "delete_dashboard": return await deleteDashboard(admin, companyId, userId, input);
      default: return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    return { content: err instanceof Error ? err.message : String(err), isError: true };
  }
}

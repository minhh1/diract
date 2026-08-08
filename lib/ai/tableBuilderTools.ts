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
import { callTogetherModelWithTools, type ToolSchema } from "@/lib/ai/modelCall";
import { TAX_SCHEMES } from "@/lib/invoices/taxSchemes";
import { costUsd, TABLE_BUILDER_MODEL_ID } from "@/lib/billing/aiModels";
import { hasDataAccessGrant, grantAiDataAccess } from "./dataAccessGrant";
import { getValueColumn } from "@/lib/schema/fieldCapabilities";

const FIELD_TYPES = ["text", "number", "date", "boolean", "select", "email", "url", "currency", "table_relation"] as const;
type FieldType = (typeof FIELD_TYPES)[number];

const FORMULA_TYPES = ["multiply", "percentage_of", "add", "subtract", "divide", "sum_related", "max_related"] as const;
type FormulaType = (typeof FORMULA_TYPES)[number];

// The 7 general-purpose widget types -- deliberately excludes the 13
// industry-specific ones (trust_*, finance_model_*, residual_land_solver,
// public_*_page, my_tasks_button, auto_time_recording_button, time_*_report)
// which need context this assistant doesn't have and aren't broadly
// applicable. A user can add those manually afterward.
const GENERAL_WIDGET_TYPES: DashboardWidgetType[] = [
  "heading", "text", "filter_bar", "quick_add_form", "grid", "summary_tile", "chart", "document_export", "invoice_import",
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
    name: "research",
    description: "Investigate a specific question before proposing a plan or acting, when you're genuinely unsure how to proceed -- e.g. how a new table should relate to existing ones, which of several existing tables/dashboards is the right fit, or a non-obvious design tradeoff. Runs its own focused, read-only investigation (it can look at existing tables and dashboards) and returns findings as plain text. Don't use it for straightforward builds where the answer is already obvious; it costs extra time and tokens.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The specific question to investigate." },
      },
      required: ["question"],
    },
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
        field_type: { type: "string", enum: [...FIELD_TYPES], description: "'table_relation' links this field to another table's records, or to a built-in system list (Matters, Entities, Properties, or real company members) -- pair it with exactly one of relation_table_id or relation_system_table." },
        select_options: { type: "array", items: { type: "string" }, description: "Only for field_type 'select' -- the list of choices, e.g. ['Draft','Sent','Paid']." },
        is_required: { type: "boolean" },
        help_text: { type: "string" },
        relation_table_id: { type: "string", description: "field_type 'table_relation' only, when linking to another CUSTOM table this company built -- the id (from create_table/list_existing_tables) of that table. Use relation_system_table instead for Matters/Entities/Properties/company members." },
        relation_system_table: {
          type: "string",
          enum: ["projects", "entities", "properties", "profiles"],
          description: "field_type 'table_relation' only, when linking to a built-in list instead of a custom table: 'projects' for Matters, 'entities' for Entities, 'properties' for Properties, 'profiles' for real company members (people with a login -- use this for e.g. a Payroll table's Employee field, never a plain text name/email field for something that should reference an actual team member).",
        },
        formula_type: {
          type: "string",
          enum: [...FORMULA_TYPES],
          description:
            "Makes this field auto-computed instead of typed-in -- field_type should be 'number' or 'currency'. " +
            "'multiply'/'add'/'subtract'/'divide': combines two fields on THIS SAME table (formula_field_a_label + formula_field_b_label). 'subtract' is a minus b, e.g. Profit Margin = Price (a) minus Total Cost (b) -- a missing/zero b is treated as 0 (no cost recorded yet), but a itself must be set. 'divide' is a divided by b -- use this for any real per-unit rate derived from a batch/total (e.g. Cost Per Meal = Batch Total Cost (a) divided by Meals Produced (b)) instead of asking the user to do that division themselves and type in the result; a zero/unset b leaves the field blank rather than erroring. " +
            "'percentage_of': one field on THIS table times a percent (formula_field_a_label + formula_percent, e.g. 10 for 10%). " +
            "'sum_related'/'max_related': totals (or finds the max of) a field on a RELATED CHILD table across every one of its rows that links back to this record -- requires formula_child_table_id, formula_field_a_label (on that child table), and formula_relation_field_label (a table_relation field on that child table pointing back at THIS table -- create it first with its own create_field call if it doesn't exist yet).",
        },
        formula_field_a_label: { type: "string", description: "formula_type multiply/add/subtract/divide/percentage_of: label of the other field, on THIS table (for subtract, the minuend -- the value subtracted FROM; for divide, the dividend -- the value being divided). formula_type sum_related/max_related: label of the field to total/max, on formula_child_table_id." },
        formula_field_b_label: { type: "string", description: "formula_type multiply/add/subtract/divide only: second field's label, on THIS table (for subtract, the value subtracted, i.e. result = a - b; for divide, the divisor, i.e. result = a / b)." },
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
    description: "Add a widget to a dashboard created with create_dashboard. Reference fields by their LABEL (e.g. 'Amount'), not id -- this tool resolves labels to the right field for you. Add a grid and/or quick_add_form first so the dashboard is actually usable, then summary_tile/chart for at-a-glance numbers. 'document_export' gives records a working PDF download (letter or invoice style); 'invoice_import' lets someone upload a PDF invoice and import its line items as new records -- see each one's own params. Requires confirm=true -- only set this after the user has explicitly agreed to the plan that includes this widget.",
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
        invoice_number_field_label: { type: "string", description: "document_export style 'invoice' or invoice_import: field holding the invoice number." },
        invoice_date_field_label: { type: "string", description: "document_export style 'invoice' or invoice_import: field holding the invoice date." },
        due_date_field_label: { type: "string", description: "document_export style 'invoice': field holding the due date." },
        customer_name_field_label: { type: "string", description: "document_export style 'invoice': field holding who's being billed." },
        customer_address_field_label: { type: "string", description: "document_export style 'invoice': field holding the customer's address." },
        supplier_name_field_label: { type: "string", description: "invoice_import only: field holding the invoice's supplier/vendor name." },
        description_field_label: { type: "string", description: "document_export style 'invoice' or invoice_import (required for invoice_import): field holding this record's own line-item description." },
        amount_field_label: { type: "string", description: "document_export style 'invoice' or invoice_import (required for invoice_import): field holding this record's own line-item amount." },
        subtotal_field_label: { type: "string", description: "document_export style 'invoice': field holding the subtotal." },
        tax_field_label: { type: "string", description: "document_export style 'invoice': field holding the tax amount." },
        total_field_label: { type: "string", description: "document_export style 'invoice': field holding the total." },
        tax_scheme: { type: "string", enum: TAX_SCHEMES.map((s) => s.value), description: "document_export style 'invoice': which region's tax terminology to print next to the tax amount (e.g. 'au' -> \"GST\", 'eu'/'uk'/'vn' -> \"VAT\", 'us' -> \"Sales Tax\"). Only changes the printed label -- the amount still comes from tax_field_label. Ask the user which applies if unclear; omit for a generic \"Tax\" label." },
        payment_details: { type: "string", description: "document_export style 'invoice': static payment instructions (bank name, account/BSB/routing number, payment link, etc.), the same on every export from this widget. Printed below the totals. Ask the user for these if they want them included -- don't invent bank details." },
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
  {
    name: "query_records",
    description: "Read actual business records (not schema) from a table, so you can answer questions about the company's real data or propose specific records for an action (see propose_records). Use table_id 'projects' for the built-in Matters/Projects system table (this returns both its fixed columns -- name, status, description, purchase_price, property_id, estimated_completion_date -- and any custom fields this company has added to Matters, e.g. Matter Number); otherwise pass a custom table's id from list_existing_tables. Any question that names a specific matter, property, client, or record (a purchase price, a client's name, a due date, anything on one record) always needs this tool first -- never answer from your own general knowledge, and never suggest the user look somewhere outside this app. Reading real data always requires the user's (or an admin's) explicit consent first -- if it hasn't been granted yet, this returns instructions instead of data; follow them exactly rather than guessing or making up an answer.",
    input_schema: {
      type: "object",
      properties: {
        table_id: { type: "string", description: "'projects' for the Matters system table, or a custom table's id." },
        field_labels: { type: "array", items: { type: "string" }, description: "Custom tables only: which fields to return, by label. Omit for all fields." },
        filter_field_label: { type: "string", description: "Optional: a field label to filter on -- for 'projects', 'name'/'description' match on partial text (e.g. a matter's approximate name), 'status' matches exactly, or any custom field label this company has added to Matters. Pair with filter_value." },
        filter_value: { type: "string", description: "Required if filter_field_label is set -- the text to match." },
      },
      required: ["table_id"],
    },
  },
  {
    name: "update_record_field",
    description: "Sets a single field's value on one existing record -- e.g. filling in a matter's purchase price the user just told you, after query_records showed it was empty. Data entry, not schema: open to any member the same as query_records, not admin-only. Only ever call this after you've stated plainly what you're about to set (which field, on which record, to what value) and the user has explicitly agreed in their next message -- then call again with confirm=true. Works on table_id 'projects' (both its fixed columns -- purchase_price, estimated_completion_date, description -- and any custom field this company has added to Matters) and on custom tables (any of their own fields, by label from query_records/list_existing_tables).",
    input_schema: {
      type: "object",
      properties: {
        table_id: { type: "string", description: "'projects' for a Matters record, or a custom table's id." },
        record_id: { type: "string", description: "The record's real id, from a prior query_records call." },
        field_label: { type: "string", description: "The field to set, by label (e.g. 'Purchase Price')." },
        value: { type: "string", description: "The new value, as the user gave it. Numbers/dates are parsed automatically." },
        confirm: { type: "boolean", description: "Must be true, and only after the user has explicitly confirmed this exact field/record/value in this conversation." },
      },
      required: ["table_id", "record_id", "field_label", "value"],
    },
  },
  {
    name: "grant_ai_data_access",
    description: "Records the user's consent for you to read this company's business data, after you've explained what data you need it for and they've explicitly agreed in chat, including confirming whether they want one-time access or a standing 30-day grant. Only call this after that explicit agreement (never preemptively), and only ever on behalf of a company admin -- if the person you're talking to isn't an admin, use query_records instead, which will route their request to one.",
    input_schema: {
      type: "object",
      properties: {
        duration: { type: "string", enum: ["one_time", "30_days"], description: "'one_time' covers just this conversation; '30_days' keeps access open for a rolling 30 days without asking again." },
      },
      required: ["duration"],
    },
  },
  {
    name: "propose_records",
    description: "Present a specific list of records (from a prior query_records call) to the user as selectable candidates for an action, e.g. matters you think should be archived. Renders as an interactive checklist in the chat -- the user can review each one and choose to act on all, some, one, or none of them, right there, without you needing to take any further action yourself. Use this instead of just listing candidates as plain text whenever you're suggesting the user act on specific records.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One short sentence introducing the list, e.g. 'These matters have had no activity in over a year:'" },
        action_label: { type: "string", description: "What selecting records and confirming will do, e.g. 'Archive selected'." },
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              record_id: { type: "string", description: "The record's real id, from query_records." },
              table_id: { type: "string", description: "'projects', or the custom table id this record belongs to." },
              label: { type: "string", description: "Display name for this record, e.g. the matter name." },
              reason: { type: "string", description: "One short phrase on why this record is being proposed, e.g. 'No activity since Jan 2025'." },
            },
            required: ["record_id", "table_id", "label", "reason"],
          },
        },
      },
      required: ["summary", "action_label", "candidates"],
    },
  },
  {
    name: "create_calendar",
    description: "Turns on the company's Calendar page (/dashboard/calendar -- month/week/day views), optionally with staff rostering (a weekly staff x day grid for building draft rosters and publishing them). Event booking/invitations aren't built yet -- if asked for that, explain it's not available rather than claiming this tool provides it. Requires confirm=true -- only set this after you've told the user what you're about to turn on (calendar, and whether rostering too) and they've explicitly agreed.",
    input_schema: {
      type: "object",
      properties: {
        enable_rostering: { type: "boolean", description: "Whether to also turn on staff rostering, not just the calendar shell." },
        confirm: { type: "boolean", description: "Must be true, and only after you've stated what will be turned on and the user has explicitly agreed in this conversation." },
      },
      required: ["enable_rostering", "confirm"],
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

// The research tool's own sub-agent only ever gets these two -- filtered
// from TABLE_BUILDER_TOOLS (not hand-duplicated) so it always sees the
// exact same schemas the main assistant does, with zero drift risk.
const RESEARCH_TOOLS: ToolSchema[] = TABLE_BUILDER_TOOLS.filter(
  (t) => t.name === "list_existing_tables" || t.name === "list_existing_dashboards"
);

const RESEARCH_SYSTEM_PROMPT = `You are a research assistant investigating a specific question about this company's existing custom-table schema, on behalf of another assistant that's about to design or build something and needs your findings first. Use the tools available to look up real data -- don't guess or speculate. Answer concisely and concretely: name the actual tables/fields/dashboards involved. If you find nothing relevant, say so plainly rather than inventing an answer.`;

// A bounded, structurally read-only sub-agent -- dispatches ONLY to
// listExistingTables/listExistingDashboards directly (not through
// executeTableBuilderTool's full switch below), so it's incapable of
// mutating anything even if the model tried. Capped at a small iteration
// count (this is meant to be a focused lookup, not a full build) and logs
// its own ai_usage_events row since it spends real tokens the outer job's
// single final usage-event insert (see app/api/ai/chat/route.ts's runJob)
// wouldn't otherwise capture -- same pattern already used by
// lib/clientUpdatePageAskQuestion.ts and friends for their own nested
// model calls.
async function researchTopic(admin: any, companyId: string, userId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  const question = String(input.question || "").trim();
  if (!question) return { content: "question is required", isError: true };

  const executeReadOnly = async (name: string): Promise<ToolExecutionResult> => {
    if (name === "list_existing_tables") return listExistingTables(admin, companyId);
    if (name === "list_existing_dashboards") return listExistingDashboards(admin, companyId);
    return { content: `Unknown tool: ${name}`, isError: true };
  };

  const result = await callTogetherModelWithTools(
    TABLE_BUILDER_MODEL_ID,
    RESEARCH_SYSTEM_PROMPT,
    [{ role: "user", content: question }],
    RESEARCH_TOOLS,
    executeReadOnly,
    undefined,
    undefined,
    undefined,
    4,
    "medium"
  );

  const cost = costUsd("hosted", TABLE_BUILDER_MODEL_ID, result);
  await admin.from("ai_usage_events").insert({
    company_id: companyId,
    user_id: userId,
    model_id: TABLE_BUILDER_MODEL_ID,
    provider: "hosted",
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: cost,
  });

  // Same "don't let a truncated result look authoritative" concern
  // hit_iteration_limit already exists to solve for the outer loop --
  // this sub-agent's own cap is much smaller (4 vs 12), so hitting it is
  // more likely.
  const content = result.hitIterationLimit
    ? `[research was cut short, may be incomplete] ${result.content}`
    : result.content || "No findings.";
  return { content };
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
  let linkedSystemTable: string | null = null;
  let linkedDisplayField: string | null = null;
  if (fieldType === "table_relation") {
    const relationSystemTable = input.relation_system_table ? String(input.relation_system_table) : "";
    const relationTableId = input.relation_table_id ? String(input.relation_table_id) : "";
    if (!relationSystemTable && !relationTableId) {
      return { content: "field_type 'table_relation' requires exactly one of relation_table_id (a custom table) or relation_system_table (projects/entities/properties/profiles)", isError: true };
    }
    if (relationSystemTable && relationTableId) {
      return { content: "Pass only one of relation_table_id or relation_system_table, not both", isError: true };
    }
    if (relationSystemTable) {
      if (!["projects", "entities", "properties", "profiles"].includes(relationSystemTable)) {
        return { content: "relation_system_table must be one of: projects, entities, properties, profiles", isError: true };
      }
      linkedSystemTable = relationSystemTable;
      linkedDisplayField = relationSystemTable === "properties" ? "street_address" : relationSystemTable === "profiles" ? "full_name" : "name";
    } else {
      linkedTableId = relationTableId;
      const { data: relTable } = await admin.from("company_tables").select("id").eq("id", linkedTableId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
      if (!relTable) return { content: "relation_table_id not found -- field_type 'table_relation' requires a valid relation_table_id", isError: true };
    }
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

    if (formulaType === "multiply" || formulaType === "add" || formulaType === "subtract" || formulaType === "divide") {
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
      linked_system_table: linkedSystemTable,
      linked_display_field: linkedDisplayField,
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
        taxScheme: input.tax_scheme ? String(input.tax_scheme) : null,
        paymentDetails: input.payment_details ? String(input.payment_details) : null,
      };
    }
  } else if (widget.type === "invoice_import") {
    const descriptionFieldId = input.description_field_label ? resolveLabel(String(input.description_field_label)) : null;
    const amountFieldId = input.amount_field_label ? resolveLabel(String(input.amount_field_label)) : null;
    if (!descriptionFieldId || !amountFieldId) {
      return { content: "invoice_import widgets need description_field_label and amount_field_label to match existing fields on the dashboard's table", isError: true };
    }
    widget.config.descriptionFieldId = descriptionFieldId;
    widget.config.amountFieldId = amountFieldId;
    widget.config.supplierNameFieldId = input.supplier_name_field_label ? resolveLabel(String(input.supplier_name_field_label)) : null;
    widget.config.invoiceNumberFieldId = input.invoice_number_field_label ? resolveLabel(String(input.invoice_number_field_label)) : null;
    widget.config.invoiceDateFieldId = input.invoice_date_field_label ? resolveLabel(String(input.invoice_date_field_label)) : null;
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

// The Matters/Projects system table's fixed field set, returned by
// query_records for table_id 'projects' -- it isn't a company_tables row
// (see supabase/migrations/20260726110000_projects_active_index.sql), so it
// has no company_table_fields to look up field_labels/filter against the
// way a custom table does. status <> 'Closed' is this app's actual,
// currently-unrestricted definition of "active" -- see that same migration.
// purchase_price/property_id/estimated_completion_date are real projects
// columns (property-developer matters especially) that used to be silently
// excluded here -- confirmed live: asked for a matter's purchase price, the
// assistant had no way to see it via query_records at all and fell back to
// suggesting the user check Zillow/Redfin instead of its own database.
const PROJECT_SYSTEM_FIELDS = ["id", "name", "status", "description", "purchase_price", "property_id", "estimated_completion_date", "created_at", "updated_at"];

// Every read this file's tools can reach is capped here -- this is meant to
// ground a conversational answer or a short proposal list, not export a
// company's entire dataset in one call. A question that genuinely needs
// more than this should be narrowed (a filter, a specific table) rather
// than raising the cap.
const QUERY_RECORDS_LIMIT = 200;

async function queryRecords(admin: any, companyId: string, userId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  const tableId = String(input.table_id || "").trim();
  if (!tableId) return { content: "table_id is required", isError: true };

  if (!(await hasDataAccessGrant(admin, companyId))) {
    const { data: membership } = await admin.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
    const requesterIsAdmin = membership?.role === "company_admin";

    if (requesterIsAdmin) {
      return {
        content:
          "NEEDS_CONSENT: You do not have permission to read this company's business data yet. Do not call query_records again until the user has explicitly agreed. " +
          "In your reply: explain plainly what data you need (this table) and why, state clearly that nothing sent to the AI is retained or used to retrain any model (it's auto-deleted after 90 days, per this app's real privacy policy), " +
          "and ask them to choose between one-time access (just for this conversation) or a standing 30-day grant. Once they reply with their choice, call grant_ai_data_access with that duration, then retry query_records.",
        isError: true,
      };
    }

    const { data: requester } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    const requesterName = requester?.full_name?.trim() || "A team member";
    const { data: request, error: requestError } = await admin.from("ai_data_access_requests").insert({
      company_id: companyId, requested_by: userId,
      question: `Read access to "${tableId}"`,
      data_scope: tableId,
    }).select("id").single();
    if (requestError || !request) return { content: `Could not send the access request: ${requestError?.message}`, isError: true };

    await admin.rpc("notify_company_admins", {
      p_company_id: companyId,
      p_event_type: "ai_data_access_requested",
      p_title: `${requesterName} is requesting AI data access`,
      p_body: `${requesterName} asked the AI assistant a question that needs read access to "${tableId}". Approve to let it answer.`,
      p_link_url: "/dashboard/admin?tab=aiDataAccess",
      p_entity_table: "ai_data_access_requests",
      p_entity_id: request.id,
    });

    return {
      content: "A request for data access has been sent to a company admin for approval. Tell the user this plainly, and that you'll be able to answer once it's approved -- don't guess at an answer in the meantime.",
      isError: true,
    };
  }

  if (tableId === "projects") {
    let query = admin.from("projects").select(PROJECT_SYSTEM_FIELDS.join(", ")).eq("company_id", companyId).is("deleted_at", null).limit(QUERY_RECORDS_LIMIT);
    const filterField = String(input.filter_field_label || "").toLowerCase();
    if (filterField && input.filter_value !== undefined) {
      if (PROJECT_SYSTEM_FIELDS.includes(filterField)) {
        // name/description are free text a user asks about by partial,
        // not exact, phrasing ("lot 3, 10 astral court" vs. the record's
        // actual full name) -- ilike so a real substring still resolves,
        // matching how a human would search rather than requiring the
        // model to already know the record's literal stored name.
        query = filterField === "name" || filterField === "description"
          ? query.ilike(filterField, `%${String(input.filter_value)}%`)
          : query.eq(filterField, String(input.filter_value));
      } else {
        // Not one of the fixed columns -- try it as a company-defined
        // custom field on Matters/Projects (e.g. "Matter Number"), the
        // same extension mechanism a custom table's own fields use, just
        // keyed by table_name instead of table_id since 'projects' isn't
        // a company_tables row (see this const's own comment above).
        const { data: customField } = await admin
          .from("company_custom_fields")
          .select("id, label")
          .eq("company_id", companyId)
          .eq("table_name", "projects")
          .ilike("label", filterField)
          .is("deleted_at", null)
          .maybeSingle();
        if (!customField) {
          return { content: `filter_field_label "${filterField}" is not a Matters/Projects field. Fixed fields: ${PROJECT_SYSTEM_FIELDS.join(", ")} -- or the label of a custom field this company has added to Matters.`, isError: true };
        }
        const { data: matchingValues } = await admin
          .from("company_custom_field_values")
          .select("record_id")
          .eq("company_id", companyId)
          .eq("table_name", "projects")
          .eq("field_id", customField.id)
          .ilike("value_text", `%${String(input.filter_value)}%`);
        const matchingIds = (matchingValues ?? []).map((v: any) => v.record_id);
        if (!matchingIds.length) return { content: "[]" };
        query = query.in("id", matchingIds);
      }
    }
    const { data, error } = await query;
    if (error) return { content: `Failed to read matters: ${error.message}`, isError: true };
    const projectRows: any[] = data ?? [];
    if (!projectRows.length) return { content: "[]" };

    // Merge in every OTHER custom field this company has added to Matters
    // too (not just the one just filtered on, if any) -- otherwise a
    // record fetched by name would come back missing fields like Matter
    // Number/Client/Purchase Price that only exist as custom fields, the
    // same gap that originally hid purchase_price before it was promoted
    // to PROJECT_SYSTEM_FIELDS above (property-developer companies keep
    // some matter-level numbers as custom fields instead).
    const { data: customFields } = await admin
      .from("company_custom_fields")
      .select("id, label")
      .eq("company_id", companyId)
      .eq("table_name", "projects")
      .is("deleted_at", null);
    const allCustomFields: { id: string; label: string }[] = customFields ?? [];
    if (allCustomFields.length) {
      const recordIds = projectRows.map((r) => r.id);
      const { data: customValues } = await admin
        .from("company_custom_field_values")
        .select("record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id")
        .eq("company_id", companyId)
        .eq("table_name", "projects")
        .in("record_id", recordIds);
      const fieldById = new Map(allCustomFields.map((f) => [f.id, f]));
      const valuesByRecord = new Map<string, Record<string, any>>();
      (customValues ?? []).forEach((v: any) => {
        const field = fieldById.get(v.field_id);
        if (!field) return;
        const bucket = valuesByRecord.get(v.record_id) ?? {};
        bucket[field.label] = v.value_record_id ?? v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
        valuesByRecord.set(v.record_id, bucket);
      });
      projectRows.forEach((r) => Object.assign(r, valuesByRecord.get(r.id) ?? {}));
    }

    return { content: JSON.stringify(projectRows) };
  }

  const { data: table } = await admin.from("company_tables").select("id, name").eq("id", tableId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!table) return { content: "Table not found", isError: true };

  const { data: fields } = await admin.from("company_table_fields").select("id, field_key, label").eq("table_id", tableId).is("deleted_at", null);
  const allFields: { id: string; field_key: string; label: string }[] = fields ?? [];
  const requestedLabels: string[] = Array.isArray(input.field_labels) ? input.field_labels.map(String) : [];
  const selectedFields = requestedLabels.length
    ? allFields.filter((f) => requestedLabels.some((l) => l.toLowerCase() === f.label.toLowerCase()))
    : allFields;

  let recordsQuery = admin
    .from("company_table_records")
    .select("id, created_at, values:company_table_values(field_id, value_text, value_number, value_date, value_boolean, value_record_id)")
    .eq("table_id", tableId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(QUERY_RECORDS_LIMIT);

  const filterLabel = String(input.filter_field_label || "");
  if (filterLabel && input.filter_value !== undefined) {
    const filterField = allFields.find((f) => f.label.toLowerCase() === filterLabel.toLowerCase());
    if (!filterField) return { content: `filter_field_label "${filterLabel}" not found on this table`, isError: true };
    const { data: matchingValues } = await admin.from("company_table_values").select("record_id").eq("field_id", filterField.id).eq("value_text", String(input.filter_value));
    const matchingIds = (matchingValues ?? []).map((v: any) => v.record_id);
    if (!matchingIds.length) return { content: "[]" };
    recordsQuery = recordsQuery.in("id", matchingIds);
  }

  const { data: records, error } = await recordsQuery;
  if (error) return { content: `Failed to read records: ${error.message}`, isError: true };

  const fieldById = new Map(selectedFields.map((f) => [f.id, f]));
  const result = (records ?? []).map((rec: any) => {
    const values: Record<string, any> = { id: rec.id };
    (rec.values || []).forEach((v: any) => {
      const field = fieldById.get(v.field_id);
      if (!field) return;
      values[field.label] = v.value_record_id ?? v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
    });
    return values;
  });
  return { content: JSON.stringify(result) };
}

// Coerces the model's string `value` to whatever type the target column
// actually stores -- the tool schema only accepts a string (the shape a
// chat reply naturally comes in as), so a currency/number field's text
// ("450000" or "$450,000") needs stripping/parsing before it can go into
// value_number, same for a boolean field's "yes"/"true".
function coerceValueForColumn(valueCol: string, raw: string): { value: unknown } | { error: string } {
  if (valueCol === "value_number") {
    const cleaned = raw.replace(/[,$\s]/g, "");
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return { error: `"${raw}" isn't a valid number` };
    return { value: n };
  }
  if (valueCol === "value_boolean") {
    const lower = raw.trim().toLowerCase();
    if (["true", "yes", "y"].includes(lower)) return { value: true };
    if (["false", "no", "n"].includes(lower)) return { value: false };
    return { error: `"${raw}" isn't a valid yes/no value` };
  }
  // value_date and value_text both pass the string straight through --
  // date columns expect YYYY-MM-DD, which is what the model is asked to
  // produce in its own reply before confirming (same convention every
  // other date-taking tool in this file relies on).
  return { value: raw };
}

async function updateRecordField(admin: any, companyId: string, userId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  if (input.confirm !== true) {
    return { content: "Setting a field's value requires confirm=true. First state exactly which field, on which record, to what value, and wait for the user's explicit agreement in their next message, then call this tool again.", isError: true };
  }
  const tableId = String(input.table_id || "").trim();
  const recordId = String(input.record_id || "").trim();
  const fieldLabel = String(input.field_label || "").trim();
  const rawValue = String(input.value ?? "").trim();
  if (!tableId || !recordId || !fieldLabel || !rawValue) {
    return { content: "table_id, record_id, field_label, and value are all required", isError: true };
  }

  if (tableId === "projects") {
    const { data: project } = await admin.from("projects").select("id, name").eq("id", recordId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
    if (!project) return { content: "Matter not found", isError: true };

    // A deliberately small allow-list of the projects table's own hardcoded
    // columns that are safe free-text/number/date data entry -- name,
    // status, id, company_id, and the relation/review columns are excluded
    // since those have real structural meaning or dedicated flows elsewhere,
    // not something this tool should let a chat reply casually overwrite.
    const WRITABLE_PROJECT_COLUMNS: Record<string, string> = {
      "purchase price": "purchase_price",
      "description": "description",
      "estimated completion date": "estimated_completion_date",
    };
    const column = WRITABLE_PROJECT_COLUMNS[fieldLabel.toLowerCase()];
    if (column) {
      const valueCol = column === "purchase_price" ? "value_number" : column === "estimated_completion_date" ? "value_date" : "value_text";
      const coerced = coerceValueForColumn(valueCol, rawValue);
      if ("error" in coerced) return { content: coerced.error, isError: true };
      const { error } = await admin.from("projects").update({ [column]: coerced.value, updated_at: new Date().toISOString() }).eq("id", recordId);
      if (error) return { content: `Failed to update: ${error.message}`, isError: true };
      return { content: `Set ${fieldLabel} to ${rawValue} on "${project.name}".` };
    }

    const { data: customField } = await admin
      .from("company_custom_fields")
      .select("id, field_type")
      .eq("company_id", companyId)
      .eq("table_name", "projects")
      .ilike("label", fieldLabel)
      .is("deleted_at", null)
      .maybeSingle();
    if (!customField) return { content: `"${fieldLabel}" isn't a field on Matters. Check query_records' output for the exact field labels available.`, isError: true };

    const valueCol = getValueColumn(customField.field_type);
    const coerced = coerceValueForColumn(valueCol, rawValue);
    if ("error" in coerced) return { content: coerced.error, isError: true };
    const { error } = await admin.from("company_custom_field_values").upsert(
      { company_id: companyId, table_name: "projects", record_id: recordId, field_id: customField.id, [valueCol]: coerced.value },
      { onConflict: "field_id,record_id" }
    );
    if (error) return { content: `Failed to update: ${error.message}`, isError: true };
    return { content: `Set ${fieldLabel} to ${rawValue} on "${project.name}".` };
  }

  const { data: record } = await admin.from("company_table_records").select("id").eq("id", recordId).eq("table_id", tableId).is("deleted_at", null).maybeSingle();
  if (!record) return { content: "Record not found", isError: true };

  const { data: field } = await admin
    .from("company_table_fields")
    .select("id, field_type")
    .eq("table_id", tableId)
    .ilike("label", fieldLabel)
    .is("deleted_at", null)
    .maybeSingle();
  if (!field) return { content: `"${fieldLabel}" isn't a field on this table. Check query_records' output for the exact field labels available.`, isError: true };

  const valueCol = getValueColumn(field.field_type);
  const coerced = coerceValueForColumn(valueCol, rawValue);
  if ("error" in coerced) return { content: coerced.error, isError: true };
  const { error } = await admin.from("company_table_values").upsert(
    { company_id: companyId, table_id: tableId, record_id: recordId, field_id: field.id, [valueCol]: coerced.value },
    { onConflict: "record_id,field_id" }
  );
  if (error) return { content: `Failed to update: ${error.message}`, isError: true };
  return { content: `Set ${fieldLabel} to ${rawValue}.` };
}

async function proposeRecords(input: Record<string, any>): Promise<ToolExecutionResult> {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  if (!candidates.length) return { content: "candidates must be a non-empty array", isError: true };
  // The caller (app/api/ai/chat/route.ts) captures this call's raw `input`
  // directly for the interactive checklist -- this result is just the
  // model's own tool-result message, a short ack, not a data channel.
  return { content: `Presented ${candidates.length} record(s) for review.` };
}

// Upserts calendar_settings the same way a human would via
// AdminCalendarTab.tsx -- a settings toggle, not a company_dashboards
// widget, since a full rostering/booking calendar doesn't fit the generic
// per-table widget model add_widget already deliberately restricts to.
async function createCalendar(admin: any, companyId: string, input: Record<string, any>): Promise<ToolExecutionResult> {
  if (input.confirm !== true) return { content: "Turning on the calendar requires confirm=true. First tell the user what you're about to turn on (calendar, and whether rostering too) and get their explicit agreement, then call this tool again.", isError: true };
  const enableRostering = input.enable_rostering === true;

  const { error } = await admin.from("calendar_settings").upsert(
    { company_id: companyId, enabled: true, rostering_enabled: enableRostering, updated_at: new Date().toISOString() },
    { onConflict: "company_id" }
  );
  if (error) return { content: `Failed to turn on the calendar: ${error.message}`, isError: true };

  return { content: `Calendar turned on${enableRostering ? " with staff rostering" : ""}. It's now available at /dashboard/calendar.` };
}

// Schema-mutating tools stay admin-only even though the chat route itself
// (app/api/ai/chat/route.ts) is now open to any company member -- checked
// here, not just in the system prompt, so a non-admin can't reach these by
// steering the model, only by an admin actually being the one chatting.
// query_records/propose_records/update_record_field are available to any
// member -- these are data entry (query_records gates itself on the
// data-access grant/relay flow above; update_record_field requires the
// same explicit per-value chat confirmation every other mutation here
// does), not schema, and any member who can already edit a record in the
// UI should be able to do the same thing by telling the assistant the
// value instead. grant_ai_data_access only makes sense for whoever the
// model is actively walking through the direct consent flow, which the
// system prompt restricts to an admin.
const ADMIN_ONLY_TOOLS = new Set([
  "create_table", "create_field", "create_dashboard", "add_widget",
  "delete_table", "delete_field", "remove_widget", "delete_dashboard",
  "grant_ai_data_access", "create_calendar",
]);

export async function executeTableBuilderTool(
  admin: any,
  companyId: string,
  userId: string,
  isAdmin: boolean,
  name: string,
  input: Record<string, any>
): Promise<ToolExecutionResult> {
  if (ADMIN_ONLY_TOOLS.has(name) && !isAdmin) {
    return { content: "Only a company admin can do this. Ask an admin to make this change, or to grant the access you need.", isError: true };
  }
  try {
    switch (name) {
      case "list_existing_tables": return await listExistingTables(admin, companyId);
      case "list_existing_dashboards": return await listExistingDashboards(admin, companyId);
      case "research": return await researchTopic(admin, companyId, userId, input);
      case "create_table": return await createTable(admin, companyId, userId, input);
      case "create_field": return await createField(admin, companyId, userId, input);
      case "create_dashboard": return await createDashboard(admin, companyId, userId, input);
      case "add_widget": return await addWidget(admin, companyId, userId, input);
      case "delete_table": return await deleteTable(admin, companyId, userId, input);
      case "delete_field": return await deleteField(admin, companyId, userId, input);
      case "remove_widget": return await removeWidget(admin, companyId, userId, input);
      case "delete_dashboard": return await deleteDashboard(admin, companyId, userId, input);
      case "query_records": return await queryRecords(admin, companyId, userId, input);
      case "update_record_field": return await updateRecordField(admin, companyId, userId, input);
      case "grant_ai_data_access": return await grantAiDataAccess(admin, companyId, input);
      case "propose_records": return await proposeRecords(input);
      case "create_calendar": return await createCalendar(admin, companyId, input);
      default: return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    return { content: err instanceof Error ? err.message : String(err), isError: true };
  }
}

// lib/ai/pageBuilderTools.ts
// Tool schema + executor for lib/ai/pageGenerate.ts's page-content
// generation. set_page_blocks mirrors lib/ai/tableBuilderTools.ts's
// add_widget in spirit (one flat properties bag covering every block type's
// fields, disambiguated by `type` + description text -- deeply nested
// per-type JSON Schema branching isn't worth it here since this schema is a
// strong hint to the model, not the actual security boundary.
// lib/pages/validateBlocks.ts is -- every field returned by the model is
// re-validated/coerced/capped there before it's ever stored or rendered,
// regardless of what this schema says.
//
// list_record_fields/list_related_tables are the model's ONLY way to
// populate a record_field/record_list block with real ids -- it can never
// invent a fieldKey/childTableId/relationFieldId, the same "resolves
// labels/ids, doesn't trust the model to know real ones" convention
// tableBuilderTools.ts's own tools follow. Both are read-only and gated
// behind the same company-wide consent grant that chat's query_records
// uses (lib/ai/dataAccessGrant.ts) -- reading a real matter's fields is
// exactly the kind of business-data access that grant already governs.
// There is deliberately no tool here for FINDING/PICKING which SINGLE
// matter a page is primarily about -- that stays a human decision made in
// the Settings UI (components/settings/ContentPagesTab.tsx's "Link to a
// matter" picker). search_matters/link_matters below are a DIFFERENT,
// deliberately later-added capability: finding and bulk-linking ADDITIONAL
// matters by natural-language criteria (e.g. "matters with an email from
// niksen.com.au"), stored in company_page_projects, distinct from the
// single company_pages.project_id these two tools still never touch.
import { PAGE_BLOCK_TYPES } from "@/lib/pages/blockTypes";
import { resolveTableFields } from "@/lib/clientUpdatePageTableResolver";
import { relationCandidates } from "@/lib/dashboardWidgets/linkField";
import { hasDataAccessGrant, grantAiDataAccess, NEEDS_CONSENT_MESSAGE } from "./dataAccessGrant";
import type { ToolSchema, HostedToolExecutionResult } from "./modelCall";

const SEARCH_MATTERS_LIMIT = 50;
const MAX_LINKED_MATTERS = 100;

const BLOCK_ITEM_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: [...PAGE_BLOCK_TYPES] },
    level: { type: "number", enum: [2, 3], description: "heading only: section heading level. The page's title is already shown as its own top-level heading above your content, so never use 1 here -- 2 for a major section, 3 for a sub-point within one." },
    text: { type: "string", description: "heading/paragraph/quote only: the block's text." },
    url: { type: "string", description: "image/button only: a real http(s) URL. Never invent one -- only use a URL the user actually gave you." },
    alt: { type: "string", description: "image only: short alt text describing the image." },
    label: { type: "string", description: "button/record_field only: the button's clickable text, or the record field's display label." },
    style: { type: "string", enum: ["bullet", "number"], description: "list only: bullet or numbered." },
    items: { type: "array", items: { type: "string" }, description: "list only: each item's text." },
    attribution: { type: "string", description: "quote only, optional: who said it." },
    size: { type: "string", enum: ["sm", "md", "lg"], description: "spacer only: vertical gap size." },
    columns: {
      type: "array",
      description: "columns only: 2 or 3 columns laid out side by side, each an array of blocks (any type except columns) in that column, top to bottom.",
      items: { type: "array", items: { type: "object" } },
    },
    fieldSource: { type: "string", enum: ["base", "custom"], description: "record_field only: 'base' for a real matter column (from list_record_fields' base list), 'custom' for a custom field (from its custom list). Never guess -- call list_record_fields first." },
    fieldKey: { type: "string", description: "record_field only: the exact fieldKey from list_record_fields' output. Never invent one." },
    childTableId: { type: "string", description: "record_list only: the exact tableId from list_related_tables' output." },
    relationFieldId: { type: "string", description: "record_list only: the exact relationFieldId from list_related_tables' output for the chosen table." },
    fieldIds: { type: "array", items: { type: "string" }, description: "record_list only: up to 6 field ids (from list_related_tables' output for the chosen table) to show as columns." },
    title: { type: "string", description: "record_list/matter_list only: a heading for the table, e.g. 'Invoices' or 'Matching matters'." },
    fields: {
      type: "array",
      description: "matter_list only: up to 6 fields to show as columns for each linked matter, from list_record_fields' output (same fieldSource/fieldKey shape as record_field).",
      items: {
        type: "object",
        properties: {
          fieldSource: { type: "string", enum: ["base", "custom"] },
          fieldKey: { type: "string" },
          label: { type: "string" },
        },
      },
    },
  },
  required: ["type"],
};

export const PAGE_BUILDER_TOOLS: ToolSchema[] = [
  {
    name: "set_page_blocks",
    description:
      "Lay out this page's full content as an ordered list of blocks, top to bottom. Call this exactly once with the COMPLETE page, not incrementally. Only include fields relevant to each block's own type.",
    input_schema: {
      type: "object",
      properties: {
        blocks: { type: "array", items: BLOCK_ITEM_SCHEMA, description: "The page's full content, in display order." },
      },
      required: ["blocks"],
    },
  },
  {
    name: "list_record_fields",
    description: "List the real matter fields available (name, status, custom fields, etc.) -- for a record_field block, these come from this page's single linked matter (if any); for a matter_list block's columns, the same field catalog applies to every linked matter regardless of whether the page has a single linked matter. Requires the company's consent to read business data; call this before assuming, it will tell you if consent is needed.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_related_tables",
    description: "List custom tables with records related to this page's linked matter (e.g. Invoices, Tasks), each with its own fields, for use in a record_list block. Only useful if the page is linked to a matter. Requires the company's consent to read business data.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_matters",
    description: "Find matters by criteria, e.g. \"matters with an email from niksen.com.au\" or \"open matters with 'Smith' in the name\", so you can bulk-link the ones the user actually wants via link_matters. Read-only -- doesn't link anything itself. Requires the company's consent to read business data. Returns up to 50 matches; if that's suspiciously few for a broad request, say so rather than presenting it as exhaustive.",
    input_schema: {
      type: "object",
      properties: {
        name_contains: { type: "string", description: "Optional: matter name contains this text (case-insensitive)." },
        status: { type: "string", description: "Optional: exact matter status, e.g. 'Open' or 'Closed'." },
        email_domain: { type: "string", description: "Optional: only matters with at least one synced email from this domain, e.g. 'niksen.com.au' (no @ needed, no wildcards)." },
      },
      required: [],
    },
  },
  {
    name: "list_linked_matters",
    description: "List the matters already linked to this page (via a previous link_matters call), so you don't re-propose or re-link ones already added.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "link_matters",
    description: "Link one or more matters (found via search_matters) to this page, so a matter_list block can show them. Requires confirm=true -- only after you've presented the matches (count and a few example names) and the user has explicitly agreed in chat to linking them.",
    input_schema: {
      type: "object",
      properties: {
        projectIds: { type: "array", items: { type: "string" }, description: "Matter ids from search_matters' output to link." },
        confirm: { type: "boolean", description: "Must be true, and only after the user has explicitly agreed in this conversation to linking these specific matters." },
      },
      required: ["projectIds", "confirm"],
    },
  },
  {
    name: "grant_ai_data_access",
    description: "Records the user's consent for you to read this company's real matter data, after you've explained what you need it for and they've explicitly agreed in chat, including whether they want one-time or a standing 30-day grant. Only call this after that explicit agreement.",
    input_schema: {
      type: "object",
      properties: {
        duration: { type: "string", enum: ["one_time", "30_days"], description: "'one_time' covers just this conversation; '30_days' keeps access open for a rolling 30 days without asking again." },
      },
      required: ["duration"],
    },
  },
];

const NOT_LINKED_MESSAGE = "This page isn't linked to a matter yet, so there's no related-table data to list. Tell the user to link one via \"Link to a matter\" in Page Settings, or draft with plain content blocks instead.";

async function listRecordFields(admin: any, companyId: string): Promise<HostedToolExecutionResult> {
  if (!(await hasDataAccessGrant(admin, companyId))) return { content: NEEDS_CONSENT_MESSAGE, isError: true };

  const { base, custom } = await resolveTableFields(admin, companyId, "projects");
  return {
    content: JSON.stringify({
      base: base.map((f) => ({ fieldKey: f.field_key, label: f.label })),
      custom: custom.map((f) => ({ fieldKey: f.field_key, label: f.label })),
    }),
  };
}

async function listRelatedTables(admin: any, companyId: string, projectId: string | null): Promise<HostedToolExecutionResult> {
  if (!projectId) return { content: NOT_LINKED_MESSAGE };
  if (!(await hasDataAccessGrant(admin, companyId))) return { content: NEEDS_CONSENT_MESSAGE, isError: true };

  const { data: tables } = await admin.from("company_tables").select("id, name").eq("company_id", companyId).is("deleted_at", null);
  const result: { tableId: string; tableName: string; relationFieldId: string; fields: { id: string; label: string }[] }[] = [];
  for (const table of tables || []) {
    const { data: fields } = await admin.from("company_table_fields").select("id, table_id, field_key, label, field_type, linked_table_id, linked_system_table, linked_display_field, linked_display_field_2, linked_search_field_keys, linked_filter_column, linked_filter_value").eq("table_id", table.id).is("deleted_at", null);
    const candidates = relationCandidates(fields || [], "projects");
    if (!candidates.length) continue;
    result.push({
      tableId: table.id,
      tableName: table.name,
      relationFieldId: candidates[0].id,
      fields: (fields || []).map((f: any) => ({ id: f.id, label: f.label })),
    });
  }
  return { content: JSON.stringify(result) };
}

// A plain domain, no wildcards/whitespace -- rejected outright rather than
// silently stripped, since a malformed value here would otherwise become an
// ILIKE pattern the model didn't intend (e.g. a stray "%" broadening the
// match far past "matters from this domain").
function sanitizeDomain(raw: unknown): string | null {
  const domain = String(raw ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!domain || /[%_\s]/.test(domain)) return null;
  return domain;
}

async function searchMatters(admin: any, companyId: string, input: Record<string, any>): Promise<HostedToolExecutionResult> {
  if (!(await hasDataAccessGrant(admin, companyId))) return { content: NEEDS_CONSENT_MESSAGE, isError: true };

  let emailProjectIds: string[] | null = null;
  if (typeof input.email_domain === "string" && input.email_domain.trim()) {
    const domain = sanitizeDomain(input.email_domain);
    if (!domain) return { content: "email_domain must be a plain domain like 'example.com', no wildcards or spaces.", isError: true };
    // project_email_content is the deduplicated real store behind
    // project_emails (see 20260804050000_project_email_content_dedup.sql) --
    // querying it directly avoids re-matching the same email once per staff
    // mailbox copy.
    const { data: rows } = await admin
      .from("project_email_content").select("project_id")
      .eq("company_id", companyId).not("project_id", "is", null)
      .ilike("from_address", `%@${domain}`)
      .limit(500);
    emailProjectIds = Array.from(new Set<string>((rows || []).map((r: any): string => r.project_id)));
    if (!emailProjectIds.length) return { content: JSON.stringify({ matters: [], note: `No matters found with an email from @${domain}.` }) };
  }

  let query = admin.from("projects").select("id, name, status").eq("company_id", companyId).is("deleted_at", null).order("name").limit(SEARCH_MATTERS_LIMIT);
  if (typeof input.name_contains === "string" && input.name_contains.trim()) query = query.ilike("name", `%${input.name_contains.trim()}%`);
  if (typeof input.status === "string" && input.status.trim()) query = query.eq("status", input.status.trim());
  if (emailProjectIds) query = query.in("id", emailProjectIds);
  const { data: projects } = await query;

  return { content: JSON.stringify({ matters: (projects || []).map((p: any) => ({ id: p.id, name: p.name, status: p.status })) }) };
}

async function listLinkedMatters(admin: any, companyId: string, pageId: string): Promise<HostedToolExecutionResult> {
  const { data: links } = await admin.from("company_page_projects").select("project_id").eq("page_id", pageId);
  const projectIds = (links || []).map((l: any) => l.project_id);
  if (!projectIds.length) return { content: JSON.stringify({ matters: [] }) };

  const { data: projects } = await admin.from("projects").select("id, name, status").in("id", projectIds).eq("company_id", companyId).is("deleted_at", null);
  return { content: JSON.stringify({ matters: (projects || []).map((p: any) => ({ id: p.id, name: p.name, status: p.status })) }) };
}

async function linkMatters(admin: any, companyId: string, pageId: string, input: Record<string, any>): Promise<HostedToolExecutionResult> {
  if (!(await hasDataAccessGrant(admin, companyId))) return { content: NEEDS_CONSENT_MESSAGE, isError: true };
  if (input.confirm !== true) return { content: "Linking matters requires confirm=true. First present the matches (count and a few example names) and get the user's explicit agreement in chat, then call this tool again.", isError: true };

  const requestedIds = Array.isArray(input.projectIds) ? input.projectIds.filter((v: unknown) => typeof v === "string" && v) : [];
  if (!requestedIds.length) return { content: "projectIds must be a non-empty array of matter ids from search_matters.", isError: true };

  // Never trust the model's ids as already-belonging-to-this-company --
  // same "confirm it's real before writing" shape as PUT /api/pages/[id]'s
  // own projectId check.
  const { data: valid } = await admin.from("projects").select("id").in("id", requestedIds).eq("company_id", companyId).is("deleted_at", null);
  const validIds: string[] = (valid || []).map((p: any) => p.id);
  if (!validIds.length) return { content: "None of those matter ids belong to this company.", isError: true };

  const { count: existingCount } = await admin.from("company_page_projects").select("id", { count: "exact", head: true }).eq("page_id", pageId);
  const room = MAX_LINKED_MATTERS - (existingCount || 0);
  if (room <= 0) return { content: `This page already has the maximum of ${MAX_LINKED_MATTERS} linked matters -- remove some before adding more.`, isError: true };

  const toInsert = validIds.slice(0, room).map((projectId) => ({ page_id: pageId, project_id: projectId }));
  const { error } = await admin.from("company_page_projects").upsert(toInsert, { onConflict: "page_id,project_id", ignoreDuplicates: true });
  if (error) return { content: `Failed to link matters: ${error.message}`, isError: true };

  return { content: `Linked ${toInsert.length} matter(s) to this page. Add a matter_list block via set_page_blocks to actually show them.` };
}

export async function executePageBuilderTool(
  admin: any,
  companyId: string,
  projectId: string | null,
  pageId: string,
  name: string,
  input: Record<string, any>
): Promise<HostedToolExecutionResult> {
  switch (name) {
    case "list_record_fields": return listRecordFields(admin, companyId);
    case "list_related_tables": return listRelatedTables(admin, companyId, projectId);
    case "search_matters": return searchMatters(admin, companyId, input);
    case "list_linked_matters": return listLinkedMatters(admin, companyId, pageId);
    case "link_matters": return linkMatters(admin, companyId, pageId, input);
    case "grant_ai_data_access": return grantAiDataAccess(admin, companyId, input);
    default: return { content: `Unknown tool: ${name}`, isError: true };
  }
}

// lib/pages/resolveRecordBlocks.ts
// Resolves record_field/record_list blocks against the page's bound matter
// (company_pages.project_id) into DISPLAY-READY values -- called fresh on
// every read (app/api/pages/public/[slug]/route.ts and app/api/pages/[id]/
// route.ts's GET), never cached or baked into the stored blocks. Same "read
// live, never snapshot" principle client_update_pages already established
// (lib/clientUpdatePageDetail.ts) -- and this file deliberately reuses that
// system's own field-resolution primitives (lib/clientUpdatePageTableResolver.ts)
// rather than re-implementing base/custom field lookup.
//
// Security shape: the caller (the public route) resolves the page row by
// slug FIRST, then passes that row's own company_id/project_id in here --
// this function only ever reads within that single, already-verified
// company_id, the same pattern every other public route in this app follows
// (see that route's own header comment). It never accepts a client-supplied
// company_id.
import { resolveRecordsBatch, resolveFieldValuesBatch } from "@/lib/clientUpdatePageTableResolver";
import type { PageBlock, RecordFieldBlock, RecordListBlock, MatterListBlock, ColumnsBlock, NonColumnsBlock } from "./blockTypes";

const MAX_RELATED_ROWS = 20;
const MAX_MATTER_ROWS = 50;

export type ResolvedNonColumnsBlock =
  | Exclude<NonColumnsBlock, RecordFieldBlock | RecordListBlock | MatterListBlock>
  | (RecordFieldBlock & { resolvedValue: string | null })
  | (RecordListBlock & { resolvedFields: { id: string; label: string }[]; resolvedRows: Record<string, string>[] })
  | (MatterListBlock & { resolvedFields: { id: string; label: string }[]; resolvedRows: Record<string, string>[] });

export interface ResolvedColumnsBlock extends Omit<ColumnsBlock, "columns"> {
  columns: ResolvedNonColumnsBlock[][];
}

export type ResolvedPageBlock = ResolvedNonColumnsBlock | ResolvedColumnsBlock;

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

// Everything a resolution pass needs about the bound matter, fetched once
// up front regardless of how many record_field/record_list blocks the page
// has -- avoids a separate round trip per block.
interface MatterContext {
  companyId: string;
  projectId: string;
  project: Record<string, unknown>;
  customFieldValues: Map<string, unknown>; // keyed "<fieldId>:<projectId>" -- resolveFieldValuesBatch's own key shape
}

async function loadMatterContext(admin: any, companyId: string, projectId: string): Promise<MatterContext | null> {
  const records = await resolveRecordsBatch(admin, "projects", [projectId]);
  const project = records.get(projectId);
  if (!project || project.company_id !== companyId) return null; // wrong tenant or deleted -- never resolve
  return { companyId, projectId, project, customFieldValues: new Map() };
}

async function resolveField(admin: any, ctx: MatterContext | null, block: RecordFieldBlock): Promise<string | null> {
  if (!ctx) return null;
  if (block.fieldSource === "base") {
    return block.fieldKey in ctx.project ? displayValue(ctx.project[block.fieldKey]) : null;
  }
  if (!ctx.customFieldValues.has(`${block.fieldKey}:${ctx.projectId}`)) {
    const resolved = await resolveFieldValuesBatch(admin, "projects", [block.fieldKey], [ctx.projectId]);
    for (const [k, v] of resolved) ctx.customFieldValues.set(k, v);
  }
  const row = ctx.customFieldValues.get(`${block.fieldKey}:${ctx.projectId}`) as any;
  if (!row) return null;
  return displayValue(row.value_text ?? row.value_number ?? row.value_date ?? row.value_boolean);
}

async function resolveList(admin: any, ctx: MatterContext | null, block: RecordListBlock): Promise<{ resolvedFields: { id: string; label: string }[]; resolvedRows: Record<string, string>[] }> {
  const empty = { resolvedFields: [], resolvedRows: [] };
  if (!ctx || !block.childTableId || !block.relationFieldId || !block.fieldIds.length) return empty;

  // Confirm the child table + relation field genuinely belong to this
  // company before trusting anything stored on the block -- the block's ids
  // are only ever a HINT (set by the AI or a human editor at draft time),
  // never trusted as already-verified at read time.
  const { data: table } = await admin.from("company_tables").select("id").eq("id", block.childTableId).eq("company_id", ctx.companyId).is("deleted_at", null).maybeSingle();
  if (!table) return empty;
  const { data: relationField } = await admin.from("company_table_fields").select("id").eq("id", block.relationFieldId).eq("table_id", block.childTableId).is("deleted_at", null).maybeSingle();
  if (!relationField) return empty;

  const { data: fieldDefs } = await admin.from("company_table_fields").select("id, label").eq("table_id", block.childTableId).in("id", block.fieldIds).is("deleted_at", null);
  const resolvedFields = (fieldDefs || []).sort((a: any, b: any) => block.fieldIds.indexOf(a.id) - block.fieldIds.indexOf(b.id));
  if (!resolvedFields.length) return empty;

  // Every company_table_values row for this relation field pointing back at
  // the bound matter -- same linking convention as
  // lib/ai/tableBuilderTools.ts's sum_related/max_related formulas.
  const { data: relationRows } = await admin
    .from("company_table_values").select("record_id")
    .eq("field_id", block.relationFieldId).eq("value_record_id", ctx.projectId)
    .limit(MAX_RELATED_ROWS);
  const recordIds: string[] = Array.from(new Set<string>((relationRows || []).map((r: any): string => r.record_id)));
  if (!recordIds.length) return { resolvedFields, resolvedRows: [] };

  const { data: liveRecords } = await admin.from("company_table_records").select("id").in("id", recordIds).is("deleted_at", null);
  const liveIds = (liveRecords || []).map((r: any) => r.id);
  if (!liveIds.length) return { resolvedFields, resolvedRows: [] };

  const values = await resolveFieldValuesBatch(admin, block.childTableId, resolvedFields.map((f: any) => f.id), liveIds);
  const resolvedRows = liveIds.map((recordId: string) => {
    const row: Record<string, string> = {};
    for (const f of resolvedFields) {
      const v = values.get(`${f.id}:${recordId}`) as any;
      row[f.id] = v ? displayValue(v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean) : "";
    }
    return row;
  });
  return { resolvedFields, resolvedRows };
}

// The page's ADDITIONAL linked matters (company_page_projects), distinct
// from the single primary company_pages.project_id record_field/record_list
// resolve against. Fetched once per resolution pass, same "one round trip
// regardless of block count" reasoning as MatterContext above.
async function resolveMatterList(admin: any, companyId: string, pageId: string, block: MatterListBlock): Promise<{ resolvedFields: { id: string; label: string }[]; resolvedRows: Record<string, string>[] }> {
  const empty = { resolvedFields: [], resolvedRows: [] };
  if (!block.fields.length) return empty;

  const { data: links } = await admin.from("company_page_projects").select("project_id").eq("page_id", pageId).limit(MAX_MATTER_ROWS);
  const projectIds: string[] = (links || []).map((l: any) => l.project_id);
  if (!projectIds.length) return empty;

  const records = await resolveRecordsBatch(admin, "projects", projectIds);
  // Never trust the join row alone -- resolveRecordsBatch already excludes
  // soft-deleted matters, and this re-checks company_id the same way
  // loadMatterContext does for the single-matter path, in case a matter was
  // ever moved/merged across companies after being linked.
  const liveProjectIds = projectIds.filter((pid) => records.get(pid)?.company_id === companyId);
  if (!liveProjectIds.length) return empty;

  const customFieldKeys = block.fields.filter((f) => f.fieldSource === "custom").map((f) => f.fieldKey);
  const customValues = customFieldKeys.length
    ? await resolveFieldValuesBatch(admin, "projects", customFieldKeys, liveProjectIds)
    : new Map();

  const resolvedFields = block.fields.map((f) => ({ id: f.fieldKey, label: f.label }));
  const resolvedRows = liveProjectIds.map((pid) => {
    const project = records.get(pid)!;
    const row: Record<string, string> = {};
    for (const f of block.fields) {
      if (f.fieldSource === "base") {
        row[f.fieldKey] = f.fieldKey in project ? displayValue(project[f.fieldKey]) : "";
      } else {
        const v = customValues.get(`${f.fieldKey}:${pid}`) as any;
        row[f.fieldKey] = v ? displayValue(v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean) : "";
      }
    }
    return row;
  });
  return { resolvedFields, resolvedRows };
}

async function resolveOne(admin: any, ctx: MatterContext | null, companyId: string, pageId: string, block: PageBlock): Promise<ResolvedPageBlock> {
  if (block.type === "record_field") {
    return { ...block, resolvedValue: await resolveField(admin, ctx, block) };
  }
  if (block.type === "record_list") {
    const { resolvedFields, resolvedRows } = await resolveList(admin, ctx, block);
    return { ...block, resolvedFields, resolvedRows };
  }
  if (block.type === "matter_list") {
    const { resolvedFields, resolvedRows } = await resolveMatterList(admin, companyId, pageId, block);
    return { ...block, resolvedFields, resolvedRows };
  }
  if (block.type === "columns") {
    const columns = await Promise.all(block.columns.map((col) => Promise.all(col.map((child) => resolveOne(admin, ctx, companyId, pageId, child) as Promise<ResolvedNonColumnsBlock>))));
    return { ...block, columns };
  }
  return block as ResolvedNonColumnsBlock;
}

export async function resolveRecordBlocks(admin: any, companyId: string, pageId: string, projectId: string | null, blocks: PageBlock[]): Promise<ResolvedPageBlock[]> {
  const ctx = projectId ? await loadMatterContext(admin, companyId, projectId) : null;
  return Promise.all(blocks.map((b) => resolveOne(admin, ctx, companyId, pageId, b)));
}

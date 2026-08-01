// app/api/duplicates/scan/route.ts
// Duplicate-record scanner for the Settings > Reconciliation tool
// (app/dashboard/settings/page.tsx). Replaces the old find_potential_
// duplicates/find_entity_duplicates/find_project_duplicates Postgres RPCs
// (opaque, untracked, hardcoded to 3 system tables) with one app-owned
// engine that works the same way for every system table AND every company
// custom table -- see lib/duplicates/similarity.ts and fieldConfig.ts.
//
// Read-only and open to any company member (matches the old tool's access —
// only the merge RPC itself is admin-gated, at the database layer).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { similarity } from "@/lib/duplicates/similarity";
import {
  SYSTEM_TABLE_COMPARISON_FIELDS, customTableComparisonFields, systemTableCustomComparisonFields,
  type SystemTableName, type ComparisonField,
} from "@/lib/duplicates/fieldConfig";

const SYSTEM_TABLES: SystemTableName[] = ["properties", "entities", "projects", "tasks"];
// properties is the one system table with no created_at column at all
// (confirmed against the live schema -- selecting it throws "column
// properties.created_at does not exist", which is exactly what broke the
// Reconciliation tool's Properties scan). Same shape as
// lib/services/systemTableRecordService.ts's HAS_CREATED_BY/HAS_UPDATED_AT
// maps for the same kind of per-table column gap.
const HAS_CREATED_AT: Record<SystemTableName, boolean> = { projects: true, properties: false, entities: true, tasks: true };
const MATCH_THRESHOLD = 0.5;
// A record-count safety valve, not a real scaling strategy -- this scans
// pairwise (O(n^2)) within one company's table. Every table this runs
// against today (system tables, or a single company's custom table) is
// well under this in practice; a company that somehow exceeds it gets a
// clear error instead of a slow/hung request.
const MAX_RECORDS = 3000;

interface ScannedRecord {
  id: string;
  label: string;
  fields: Record<string, any>;
}

// PostgREST (and so the Supabase client) caps a single select at 1000 rows
// by default -- a plain .select() on a table bigger than that silently
// truncates instead of erroring, which meant this scanner could miss real
// duplicate pairs whenever one side happened to land past row 1000 (in
// whatever order the table came back in, not necessarily anything intuitive
// like alphabetical). Pages through .range() the same way
// lib/hooks/prefetchShells.ts's fetchCustomFieldValues already does for the
// same reason.
const PAGE_SIZE = 1000;
async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryFactory(from, from + PAGE_SIZE - 1);
    // A query error used to look identical to "no more rows" here (data
    // was just null either way) -- silently returning zero rows on a real
    // failure, which is exactly what made this scanner's "no duplicates
    // found" indistinguishable from "the query blew up" from the outside.
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => null);
  const tableKind: string | undefined = body?.tableKind;
  const table: string | undefined = body?.table;
  if (!tableKind || !table) {
    return NextResponse.json({ error: "tableKind and table are required" }, { status: 400 });
  }

  try {
    return await scan(admin, companyId, tableKind, table);
  } catch (err) {
    // Every failure below this point used to surface as an opaque 500 (or,
    // client-side, as a silently swallowed "no duplicates found" -- see
    // fetchDuplicatesData in app/dashboard/settings/page.tsx) with nothing
    // to actually debug from. Return the real message instead.
    console.error("[duplicates/scan]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}

function prettifyKey(key: string): string {
  return key.replace(/_id$/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

async function scan(admin: any, companyId: string, tableKind: string, table: string) {
  let records: ScannedRecord[];
  let fields: ComparisonField[];
  // key -> human label, for the pair-review UI (a raw "custom_field:<uuid>"
  // key -- see systemTableCustomComparisonFields -- is meaningless on
  // screen otherwise).
  let fieldLabels: Record<string, string> = {};

  if (tableKind === "system") {
    if (!SYSTEM_TABLES.includes(table as SystemTableName)) {
      return NextResponse.json({ error: "Unknown system table" }, { status: 400 });
    }
    const tableName = table as SystemTableName;
    const baseFields = SYSTEM_TABLE_COMPARISON_FIELDS[tableName];
    // created_at isn't a comparison field (never scored), just carried
    // through onto each record's fields object so the review UI can default
    // "which one to keep" to the older record when nothing else
    // distinguishes a pair. Omitted for tables that don't have the column
    // (see HAS_CREATED_AT) -- the review UI already falls back gracefully
    // (defaultKeepSide in app/dashboard/settings/page.tsx) when it's absent.
    const cols = ["id", ...(HAS_CREATED_AT[tableName] ? ["created_at"] : []), ...baseFields.map(f => f.key)];
    const data = await fetchAllRows<any>((from, to) =>
      admin
        .from(tableName)
        .select(cols.join(", "))
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .range(from, to)
    );
    records = data.map(row => ({
      id: row.id,
      label: row[baseFields[0].key] ?? row.id,
      fields: row,
    }));

    // Merge in identifier-looking custom fields defined on this system
    // table (e.g. entities' abn/acn, which used to be native columns --
    // see systemTableCustomComparisonFields's own comment) so a field that
    // moves off a hardcoded column and onto company_custom_fields doesn't
    // just silently drop out of matching.
    const { data: customFieldRows } = await admin
      .from("company_custom_fields")
      .select("id, field_key, field_type, label")
      .eq("company_id", companyId)
      .eq("table_name", tableName)
      .is("deleted_at", null);
    const customFieldMeta = (customFieldRows || []) as { id: string; field_key: string; field_type: string; label: string }[];
    const customFields = systemTableCustomComparisonFields(customFieldMeta);
    fields = [...baseFields, ...customFields];

    fieldLabels = Object.fromEntries(baseFields.map(f => [f.key, prettifyKey(f.key)]));
    const customFieldById = new Map(customFieldMeta.map(f => [f.id, f]));
    customFields.forEach(f => {
      const meta = customFieldById.get(f.key.replace(/^custom_field:/, ""));
      if (meta) fieldLabels[f.key] = meta.label;
    });

    if (customFields.length && records.length) {
      const fieldIds = customFieldMeta
        .filter(f => customFields.some(c => c.key === `custom_field:${f.id}`))
        .map(f => f.id);
      const recordIds = records.map(r => r.id);
      const valueRows = await fetchAllRows<any>((from, to) =>
        admin
          .from("company_custom_field_values")
          .select("record_id, field_id, value_text, value_number, value_date, value_boolean")
          .eq("company_id", companyId)
          .in("record_id", recordIds)
          .in("field_id", fieldIds)
          .range(from, to)
      );
      const byRecord = new Map<string, Record<string, any>>();
      valueRows.forEach((v: any) => {
        const value = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean;
        if (!byRecord.has(v.record_id)) byRecord.set(v.record_id, {});
        byRecord.get(v.record_id)![`custom_field:${v.field_id}`] = value;
      });
      records.forEach(r => {
        const extra = byRecord.get(r.id);
        if (extra) Object.assign(r.fields, extra);
      });
    }
  } else if (tableKind === "custom") {
    const { data: tableDef } = await admin
      .from("company_tables")
      .select("id, name, primary_field_key")
      .eq("id", table)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!tableDef) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    const { data: tableFields } = await admin
      .from("company_table_fields")
      .select("id, field_key, field_type, label")
      .eq("table_id", tableDef.id)
      .is("deleted_at", null);
    const fieldList = (tableFields || []) as { id: string; field_key: string; field_type: string; label: string }[];
    fields = customTableComparisonFields(fieldList, tableDef.primary_field_key);
    const fieldById = new Map(fieldList.map(f => [f.id, f]));
    const fieldIdByKey = new Map(fieldList.map(f => [f.field_key, f.id]));
    const relevantFieldIds = fields.map(f => fieldIdByKey.get(f.key)).filter((id): id is string => !!id);

    const fieldByKey = new Map(fieldList.map(f => [f.field_key, f]));
    fieldLabels = Object.fromEntries(fields.map(f => [f.key, fieldByKey.get(f.key)?.label ?? prettifyKey(f.key)]));

    const recordRows = await fetchAllRows<{ id: string; created_at: string }>((from, to) =>
      admin
        .from("company_table_records")
        .select("id, created_at")
        .eq("table_id", tableDef.id)
        .is("deleted_at", null)
        .range(from, to)
    );
    const recordIds = recordRows.map(r => r.id);
    const createdAtById = new Map(recordRows.map(r => [r.id, r.created_at]));

    if (recordIds.length === 0 || relevantFieldIds.length === 0) {
      return NextResponse.json({ pairs: [], fieldLabels });
    }

    // record_id/field_id are both already-bounded arrays (recordIds capped
    // by MAX_RECORDS below before this ever runs at true scale; field count
    // is a handful), so .in() on them doesn't itself need paging -- it's
    // the RESULT rows (up to recordIds.length * relevantFieldIds.length)
    // that can exceed the page cap.
    const valueRows = await fetchAllRows<any>((from, to) =>
      admin
        .from("company_table_values")
        .select("record_id, field_id, value_text, value_number, value_date, value_boolean")
        .eq("company_id", companyId)
        .in("record_id", recordIds)
        .in("field_id", relevantFieldIds)
        .range(from, to)
    );

    const byRecord = new Map<string, Record<string, any>>();
    valueRows.forEach((v: any) => {
      const field = fieldById.get(v.field_id);
      if (!field) return;
      const value = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean;
      if (!byRecord.has(v.record_id)) byRecord.set(v.record_id, {});
      byRecord.get(v.record_id)![field.field_key] = value;
    });

    const primaryKey = fields[0]?.key;
    records = recordIds.map(id => {
      // created_at carried through the same way as the system-table branch
      // above -- see that branch's comment.
      const rowFields: Record<string, any> = { ...(byRecord.get(id) || {}), created_at: createdAtById.get(id) };
      return { id, label: rowFields[primaryKey] ?? id, fields: rowFields };
    });
  } else {
    return NextResponse.json({ error: "Invalid tableKind" }, { status: 400 });
  }

  if (records.length > MAX_RECORDS) {
    return NextResponse.json(
      { error: `${records.length} records is too many to scan at once.` },
      { status: 413 }
    );
  }

  // The first (dominant) comparison field is required on BOTH sides of a
  // pair for it to even be considered -- without this, two records that are
  // both simply missing their real identifying field but happen to share a
  // low-weight secondary one (e.g. two blank-named tasks in the same
  // project) could still normalize to a deceptively high score, since the
  // weighted average is only ever taken over fields that were actually
  // compared.
  const primaryFieldKey = fields[0]?.key;

  const pairs: {
    idA: string; idB: string; labelA: string; labelB: string;
    score: number; reason: string; fieldsA: Record<string, any>; fieldsB: Record<string, any>;
  }[] = [];

  for (let i = 0; i < records.length; i++) {
    const a = records[i];
    if (primaryFieldKey && (a.fields[primaryFieldKey] === null || a.fields[primaryFieldKey] === undefined || a.fields[primaryFieldKey] === "")) continue;
    for (let j = i + 1; j < records.length; j++) {
      const b = records[j];
      if (primaryFieldKey && (b.fields[primaryFieldKey] === null || b.fields[primaryFieldKey] === undefined || b.fields[primaryFieldKey] === "")) continue;

      let totalWeight = 0;
      let scoreSum = 0;
      const reasons: string[] = [];
      for (const f of fields) {
        const va = a.fields[f.key];
        const vb = b.fields[f.key];
        if (va === null || va === undefined || va === "" || vb === null || vb === undefined || vb === "") continue;
        const s = f.exact ? (String(va) === String(vb) ? 1 : 0) : similarity(va, vb);
        totalWeight += f.weight;
        scoreSum += s * f.weight;
        if (s >= 0.8) reasons.push(f.key);
      }
      if (totalWeight === 0) continue;
      const score = scoreSum / totalWeight;
      if (score >= MATCH_THRESHOLD && reasons.length > 0) {
        pairs.push({
          idA: a.id, idB: b.id,
          labelA: String(a.label), labelB: String(b.label),
          score: Math.round(score * 100) / 100,
          reason: reasons.map(k => fieldLabels[k] || k).join(", "),
          fieldsA: a.fields, fieldsB: b.fields,
        });
      }
    }
  }

  pairs.sort((x, y) => y.score - x.score);
  return NextResponse.json({ pairs, fieldLabels });
}

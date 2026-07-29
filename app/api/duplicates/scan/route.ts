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
  SYSTEM_TABLE_COMPARISON_FIELDS, customTableComparisonFields,
  type SystemTableName, type ComparisonField,
} from "@/lib/duplicates/fieldConfig";

const SYSTEM_TABLES: SystemTableName[] = ["properties", "entities", "projects", "tasks"];
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

async function scan(admin: any, companyId: string, tableKind: string, table: string) {
  let records: ScannedRecord[];
  let fields: ComparisonField[];

  if (tableKind === "system") {
    if (!SYSTEM_TABLES.includes(table as SystemTableName)) {
      return NextResponse.json({ error: "Unknown system table" }, { status: 400 });
    }
    const tableName = table as SystemTableName;
    fields = SYSTEM_TABLE_COMPARISON_FIELDS[tableName];
    const cols = ["id", ...fields.map(f => f.key)];
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
      label: row[fields[0].key] ?? row.id,
      fields: row,
    }));
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
      .select("id, field_key, field_type")
      .eq("table_id", tableDef.id)
      .is("deleted_at", null);
    const fieldList = (tableFields || []) as { id: string; field_key: string; field_type: string }[];
    fields = customTableComparisonFields(fieldList, tableDef.primary_field_key);
    const fieldById = new Map(fieldList.map(f => [f.id, f]));
    const fieldIdByKey = new Map(fieldList.map(f => [f.field_key, f.id]));
    const relevantFieldIds = fields.map(f => fieldIdByKey.get(f.key)).filter((id): id is string => !!id);

    const recordRows = await fetchAllRows<{ id: string }>((from, to) =>
      admin
        .from("company_table_records")
        .select("id")
        .eq("table_id", tableDef.id)
        .is("deleted_at", null)
        .range(from, to)
    );
    const recordIds = recordRows.map(r => r.id);

    if (recordIds.length === 0 || relevantFieldIds.length === 0) {
      return NextResponse.json({ pairs: [], fields: fields.map(f => f.key) });
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
      const rowFields = byRecord.get(id) || {};
      return { id, label: rowFields[primaryKey] ?? id, fields: rowFields };
    });
  } else {
    return NextResponse.json({ error: "Invalid tableKind" }, { status: 400 });
  }

  if (records.length > MAX_RECORDS) {
    return NextResponse.json(
      { error: `${records.length} records — too many to scan at once.` },
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
          reason: reasons.join(", "),
          fieldsA: a.fields, fieldsB: b.fields,
        });
      }
    }
  }

  pairs.sort((x, y) => y.score - x.score);
  return NextResponse.json({ pairs, fields: fields.map(f => f.key) });
}

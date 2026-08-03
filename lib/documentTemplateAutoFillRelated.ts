// lib/documentTemplateAutoFillRelated.ts
// Resolves a document template field's auto-fill -- ONE-HOP related field
// (auto_fill_relation_column/auto_fill_related_table/auto_fill_related_field,
// see supabase/document_template_fields_related_autofill.sql) or a small
// fixed set of computed composites (auto_fill_composite, see
// supabase/document_template_fields_composite_autofill.sql) -- to an actual
// value for a given project. Shared by both public document-fill routes (GET
// for prefill, POST .../submit for final render) so the two can't drift on
// how a relation is walked -- mirrors the relation model RecordDashboard.tsx
// already uses to show a record's own linked fields (system relations from
// SYSTEM_TABLE_RELATION_MAP, custom relation-type fields via
// company_custom_field_values).
import { SYSTEM_TABLE_RELATION_MAP } from "@/lib/schema/systemTableRelations";

export interface RelatedAutoFillField {
  auto_fill_relation_column: string | null;
  auto_fill_related_table: string | null;
  auto_fill_related_field: string | null;
}

// Composite key a caller uses to look up its own field's resolved value in
// the map resolveRelatedAutoFillValues returns.
export function relatedAutoFillKey(f: RelatedAutoFillField): string {
  return `${f.auto_fill_relation_column} ${f.auto_fill_related_table} ${f.auto_fill_related_field}`;
}

// "Which record does this project link to via this relation column" --
// system relation (SYSTEM_TABLE_RELATION_MAP, junction or direct FK) first,
// else treated as a custom relation-type field's key on the project, whose
// stored value is the linked record's id (same as RecordDashboard.tsx's
// editing model for entity/property/project/table_relation fields).
async function resolveProjectRelationId(admin: any, projectId: string, relationColumn: string): Promise<string | null> {
  const config = SYSTEM_TABLE_RELATION_MAP[relationColumn];
  try {
    if (config?.junction) {
      // Multi-valued relation (e.g. property_id via project_properties) --
      // a document field can only hold one value, so the first linked
      // record wins. Documented limitation, see AutoFillFieldPicker.tsx.
      const { data } = await admin
        .from(config.junction.table)
        .select(config.junction.targetCol)
        .eq(config.junction.sourceCol, projectId)
        .limit(1)
        .maybeSingle();
      return data ? (data as any)[config.junction.targetCol] : null;
    }
    if (config) {
      // Direct FK column on projects itself (e.g. parent_project_id).
      const { data } = await admin.from("projects").select(relationColumn).eq("id", projectId).maybeSingle();
      return data ? (data as any)[relationColumn] : null;
    }
    const { data: fieldDef } = await admin
      .from("company_custom_fields")
      .select("id")
      .eq("table_name", "projects")
      .eq("field_key", relationColumn)
      .is("deleted_at", null)
      .maybeSingle();
    if (!fieldDef) return null;
    const { data: valueRow } = await admin
      .from("company_custom_field_values")
      .select("value_text")
      .eq("field_id", fieldDef.id)
      .eq("record_id", projectId)
      .maybeSingle();
    return valueRow?.value_text ?? null;
  } catch {
    return null;
  }
}

// One field's value on one already-resolved record -- native column first,
// else that table's own custom field data (same "native column, else custom
// field" branching RecordDashboard.tsx uses for relation display columns).
async function resolveFieldOnRecord(admin: any, table: string, recordId: string, fieldName: string): Promise<any> {
  try {
    const { data: row } = await admin.from(table).select("*").eq("id", recordId).maybeSingle();
    if (row && fieldName in row) return row[fieldName];
  } catch {
    // fall through to custom-field lookup
  }
  try {
    const { data: fieldDef } = await admin
      .from("company_custom_fields")
      .select("id")
      .eq("table_name", table)
      .eq("field_key", fieldName)
      .is("deleted_at", null)
      .maybeSingle();
    if (!fieldDef) return null;
    const { data: valueRow } = await admin
      .from("company_custom_field_values")
      .select("value_text, value_number, value_date, value_boolean")
      .eq("field_id", fieldDef.id)
      .eq("record_id", recordId)
      .maybeSingle();
    return valueRow ? (valueRow.value_text ?? valueRow.value_number ?? valueRow.value_date ?? valueRow.value_boolean ?? null) : null;
  } catch {
    return null;
  }
}

export async function resolveRelatedAutoFillValues(
  admin: any,
  projectId: string,
  fields: RelatedAutoFillField[]
): Promise<Record<string, any>> {
  const relevant = fields.filter(f => f.auto_fill_relation_column && f.auto_fill_related_table && f.auto_fill_related_field);
  if (!relevant.length) return {};

  const values: Record<string, any> = {};

  // Group by relation column -- every field using the same relation shares
  // one lookup of "which record does this project link to via it".
  const byRelationColumn = new Map<string, RelatedAutoFillField[]>();
  for (const f of relevant) {
    const col = f.auto_fill_relation_column!;
    if (!byRelationColumn.has(col)) byRelationColumn.set(col, []);
    byRelationColumn.get(col)!.push(f);
  }

  for (const [relationColumn, group] of byRelationColumn) {
    const relatedId = await resolveProjectRelationId(admin, projectId, relationColumn);
    if (!relatedId) continue;

    const relatedTable = group[0].auto_fill_related_table!;
    // Fetch the related record once and reuse it across every field this
    // group needs, rather than resolveFieldOnRecord's one-row-per-field
    // (fine for the single-lookup composite resolver below, wasteful here
    // when several fields on the same document share one relation).
    let nativeRow: Record<string, any> | null = null;
    try {
      const { data } = await admin.from(relatedTable).select("*").eq("id", relatedId).maybeSingle();
      nativeRow = data || null;
    } catch {
      nativeRow = null;
    }

    for (const f of group) {
      const fieldName = f.auto_fill_related_field!;
      if (nativeRow && fieldName in nativeRow) {
        values[relatedAutoFillKey(f)] = nativeRow[fieldName];
        continue;
      }
      values[relatedAutoFillKey(f)] = await resolveFieldOnRecord(admin, relatedTable, relatedId, fieldName);
    }
  }

  return values;
}

// Finds a company's own `projects`-table custom field by LABEL, not
// field_key -- a field's key is only predictable when it was never touched
// after seeding (confirmed live: Huynh Lawyers' actual Client/Other Side
// fields have auto-generated keys like field_1783322037432 because they
// were edited post-seed, even though the seed template itself uses clean
// keys like 'client'/'other_side'). Labels are the only thing consistently
// human-recognizable across companies, so matching goes on those.
export interface ProjectFieldMatch {
  fieldKey: string;
  fieldType: string;
  linkedTable: string | null;
  linkedDisplayColumn: string | null;
}

function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function findProjectFieldByLabel(
  admin: any,
  companyId: string,
  opts: { includes: string[]; excludes?: string[] }
): Promise<ProjectFieldMatch | null> {
  const { data: fields } = await admin
    .from("company_custom_fields")
    .select("field_key, label, field_type, linked_table, linked_display_column")
    .eq("company_id", companyId)
    .eq("table_name", "projects")
    .is("deleted_at", null);
  for (const f of fields || []) {
    const label = normalizeLabel(String(f.label || ""));
    if (opts.excludes?.some(x => label.includes(x))) continue;
    if (opts.includes.some(inc => label.includes(inc))) {
      return { fieldKey: f.field_key, fieldType: f.field_type, linkedTable: f.linked_table, linkedDisplayColumn: f.linked_display_column };
    }
  }
  return null;
}

export type CompositeAutoFillType = "full_property_address" | "client_v_other_side";

async function resolveFullPropertyAddress(admin: any, projectId: string): Promise<string | null> {
  const propertyId = await resolveProjectRelationId(admin, projectId, "property_id");
  if (!propertyId) return null;
  const { data: property } = await admin
    .from("properties")
    .select("street_address, suburb, state, postcode")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property) return null;
  const line1 = property.street_address || "";
  const line2 = [property.suburb, property.state, property.postcode].filter(Boolean).join(" ");
  const full = [line1, line2].filter(Boolean).join(", ");
  return full || null;
}

async function resolvePartyName(admin: any, companyId: string, projectId: string, includes: string[], excludes: string[]): Promise<string | null> {
  const match = await findProjectFieldByLabel(admin, companyId, { includes, excludes });
  if (!match) return null;
  const relatedId = await resolveProjectRelationId(admin, projectId, match.fieldKey);
  if (!relatedId) return null;
  const table = match.linkedTable || "entities";
  const field = match.linkedDisplayColumn || "name";
  const value = await resolveFieldOnRecord(admin, table, relatedId, field);
  return value != null ? String(value) : null;
}

async function resolveClientVOtherSide(admin: any, companyId: string, projectId: string): Promise<string | null> {
  const [client, otherSide] = await Promise.all([
    resolvePartyName(admin, companyId, projectId, ["client"], ["solicitor", "other side"]),
    resolvePartyName(admin, companyId, projectId, ["other side", "opposing"], ["solicitor"]),
  ]);
  if (client && otherSide) return `${client} v ${otherSide}`;
  return client || otherSide || null;
}

export async function resolveCompositeAutoFillValue(
  admin: any,
  companyId: string,
  projectId: string,
  compositeType: CompositeAutoFillType
): Promise<string | null> {
  if (compositeType === "full_property_address") return resolveFullPropertyAddress(admin, projectId);
  if (compositeType === "client_v_other_side") return resolveClientVOtherSide(admin, companyId, projectId);
  return null;
}

function normalizeTag(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Best-effort auto-fill suggestion for a template field, based on its own
// tag/label text -- so common tags (Our Ref, Property, Client v Other Side)
// "just work" without an admin manually configuring them via
// AutoFillFieldPicker.tsx every single time a template is uploaded. Never
// silent: whatever this guesses lands in the same picker, fully visible and
// correctable before the admin saves. Used both at upload time (see
// app/api/document-templates/upload/route.ts) and by the one-off backfill
// for fields that existed before this feature (scripts/
// backfillDocumentTemplateAutoFill.ts) -- kept in one place so the two
// can't drift on what counts as a match.
//
// Matches on LABEL text, not field_key -- a company's own field keys aren't
// reliable once a field has been edited after being created (confirmed
// live: Huynh Lawyers' Client/Other Side fields have auto-generated keys
// like field_1783322037432 despite the seed template using clean keys like
// 'client'/'other_side'). Order matters: the composite patterns are checked
// before the plain "client"/"other side" single-field patterns, so a tag
// literally called "Client v Other Side" doesn't fall into the narrower
// "client" match first.
// Words that mean a tag wants a SPECIFIC attribute of the party/property,
// not the party's plain name or the property's full address -- e.g. "Client
// ACN / ABN" or "Client Signatory Name" is not asking for the client
// entity's own name, and "Per-Property Fee Amount" is not asking for an
// address at all. Matching too eagerly here means silently binding the
// WRONG value into a real client-facing document, which is worse than not
// auto-filling at all, so these gate every pattern below rather than being
// an afterthought.
const PARTY_ATTRIBUTE_EXCLUDES = ["acn", "abn", "address", "signatory", "title", "email", "phone", "mobile", "number", "date", "type", "occupation", "position"];
const PROPERTY_ATTRIBUTE_EXCLUDES = ["fee", "amount", "price", "cost", "value", "type", "description", "number", "date", "manager", "agent", "size", "id"];

export async function detectAutoFill(admin: any, companyId: string, tagText: string): Promise<Record<string, any> | null> {
  const n = normalizeTag(tagText);
  const words = n.split(" ").filter(Boolean);

  if (n.includes("our ref") || n.includes("reference") || n.includes("matter number") || n.includes("file number")) {
    const match = await findProjectFieldByLabel(admin, companyId, { includes: ["matter number", "reference", "our ref"] });
    if (match && match.fieldType !== "entity" && match.fieldType !== "property" && match.fieldType !== "project" && match.fieldType !== "table_relation") {
      const { data: fieldRow } = await admin
        .from("company_custom_fields").select("id").eq("company_id", companyId).eq("table_name", "projects").eq("field_key", match.fieldKey).maybeSingle();
      if (fieldRow) return { auto_fill_field_id: fieldRow.id };
    }
  }

  // Full address only for a tag that's clearly just naming the property --
  // the explicit phrase, or a short "Property"/"The Property"/"Subject
  // Property" style tag with nothing suggesting a different attribute
  // (a fee, a type, a description...) riding along with it.
  const isPropertyAddress = n.includes("property address") || n.includes("site address")
    || (n.includes("property") && words.length <= 3 && !PROPERTY_ATTRIBUTE_EXCLUDES.some(w => n.includes(w)));
  if (isPropertyAddress) {
    return { auto_fill_composite: "full_property_address" };
  }

  if (n.includes("v other side") || n.includes("style of cause") || n === "parties" || /\bv\b|\bversus\b/.test(n)) {
    return { auto_fill_composite: "client_v_other_side" };
  }

  if (n.includes("client") && !PARTY_ATTRIBUTE_EXCLUDES.some(w => n.includes(w)) && !n.includes("solicitor")) {
    const match = await findProjectFieldByLabel(admin, companyId, { includes: ["client"], excludes: ["solicitor", "other side"] });
    if (match) return { auto_fill_relation_column: match.fieldKey, auto_fill_related_table: match.linkedTable || "entities", auto_fill_related_field: match.linkedDisplayColumn || "name" };
  }

  if ((n.includes("other side") || n.includes("opposing") || n.includes("respondent") || n.includes("defendant")) && !PARTY_ATTRIBUTE_EXCLUDES.some(w => n.includes(w)) && !n.includes("solicitor")) {
    const match = await findProjectFieldByLabel(admin, companyId, { includes: ["other side", "opposing", "respondent", "defendant"], excludes: ["solicitor"] });
    if (match) return { auto_fill_relation_column: match.fieldKey, auto_fill_related_table: match.linkedTable || "entities", auto_fill_related_field: match.linkedDisplayColumn || "name" };
  }

  return null;
}

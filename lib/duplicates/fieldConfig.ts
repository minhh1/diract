// lib/duplicates/fieldConfig.ts
// Which columns/fields the duplicate scanner compares, and how much each one
// counts toward a pair's overall match score. System tables get a hardcoded
// list (mirrors what the old per-type UI in app/dashboard/settings/page.tsx
// showed); custom tables derive theirs at scan time since every company's
// fields are different -- see customTableComparisonFields below.

export type SystemTableName = "properties" | "entities" | "projects" | "tasks";

export interface ComparisonField {
  key: string;
  weight: number;
  // Exact (normalized) match required instead of fuzzy similarity -- used
  // for fields like a foreign key where "close" isn't meaningful.
  exact?: boolean;
}

// Base-column comparison fields per system table. Deliberately just each
// table's own strong display column(s) -- NOT things like entities' old
// abn/acn, which used to be native columns here but, as of supabase/
// migrations/20260729310000_entities_finance_fields_to_custom.sql, are
// company_custom_fields rows instead. Secondary identifier-ish signals now
// come from systemTableCustomComparisonFields below, resolved dynamically
// against whatever that company's actual custom fields are -- the same
// migration pattern could move more native columns to custom fields later,
// and a hardcoded base-column reference would just break again (as abn
// did) rather than adapt.
export const SYSTEM_TABLE_COMPARISON_FIELDS: Record<SystemTableName, ComparisonField[]> = {
  properties: [
    { key: "street_address", weight: 0.7 },
    { key: "suburb", weight: 0.3 },
  ],
  entities: [
    { key: "name", weight: 0.6 },
  ],
  projects: [
    { key: "name", weight: 1.0 },
  ],
  tasks: [
    { key: "name", weight: 0.7 },
    { key: "project_id", weight: 0.3, exact: true },
  ],
};

// Reserved out of each system table's total weight budget for whatever
// identifier-looking custom fields turn up dynamically (e.g. entities'
// abn/acn) -- see systemTableCustomComparisonFields.
const SYSTEM_TABLE_CUSTOM_FIELD_WEIGHT = 0.4;

interface CustomFieldMeta {
  id: string;
  field_key: string;
  field_type: string;
}

// Text-ish field types worth comparing at all -- relation/date/boolean/
// number-only-as-identifier fields aren't useful similarity inputs the same
// way free text is (a formula or relation column doesn't have "close"
// matches in the same sense). Includes the 'abn'/'acn' field types (see
// supabase/migrations/20260729310000_entities_finance_fields_to_custom.sql)
// alongside the general-purpose text-ish types.
const COMPARABLE_FIELD_TYPES = new Set(["text", "email", "select", "number", "currency", "abn", "acn"]);

// Field keys that look like an identifier -- worth including as a secondary
// signal alongside a table's primary/display field, same spirit as
// properties' suburb or entities' abn.
const IDENTIFIER_KEY_PATTERN = /email|phone|abn|acn|number|code|reference/i;

function identifierFields(fields: CustomFieldMeta[], excludeKey: string | null): CustomFieldMeta[] {
  return fields.filter(f =>
    f.field_key !== excludeKey &&
    COMPARABLE_FIELD_TYPES.has(f.field_type) &&
    IDENTIFIER_KEY_PATTERN.test(f.field_key)
  );
}

// Auto-picks comparison fields for a custom table: the table's own primary
// (display) field always dominates, plus up to a few identifier-looking
// fields at a lower weight. No per-table configuration UI -- see the plan
// this was built against for why (every company's custom fields differ, and
// a field-picker step was explicitly scoped out).
export function customTableComparisonFields(
  fields: CustomFieldMeta[],
  primaryFieldKey: string | null,
): ComparisonField[] {
  const primary = primaryFieldKey ? fields.find(f => f.field_key === primaryFieldKey) : null;
  const idFields = identifierFields(fields, primaryFieldKey);

  const result: ComparisonField[] = [];
  if (primary) {
    result.push({ key: primary.field_key, weight: idFields.length ? 0.7 : 1.0 });
  }
  const secondaryWeight = idFields.length ? (primary ? 0.3 : 1.0) / idFields.length : 0;
  for (const f of idFields) {
    result.push({ key: f.field_key, weight: secondaryWeight });
  }
  // No primary field and nothing identifier-like -- fall back to every
  // comparable text field equally weighted rather than returning nothing
  // (an empty config would silently skip this table in the scan).
  if (result.length === 0) {
    const fallback = fields.filter(f => COMPARABLE_FIELD_TYPES.has(f.field_type));
    return fallback.map(f => ({ key: f.field_key, weight: 1 / Math.max(1, fallback.length) }));
  }
  return result;
}

// Additional comparison fields for a SYSTEM table, sourced from that
// table's own company_custom_fields (e.g. entities' abn/acn) -- additive to
// SYSTEM_TABLE_COMPARISON_FIELDS above, not a replacement. Keys are
// prefixed "custom_field:<id>", matching the convention the rest of the app
// already uses for a custom field's column id (see e.g.
// components/GenericMasterTable.tsx's resolveColLabel) so the scan route can
// tell a custom-field key apart from a base-column key sharing the same map.
export function systemTableCustomComparisonFields(fields: CustomFieldMeta[]): ComparisonField[] {
  const idFields = identifierFields(fields, null);
  if (!idFields.length) return [];
  const weight = SYSTEM_TABLE_CUSTOM_FIELD_WEIGHT / idFields.length;
  return idFields.map(f => ({ key: `custom_field:${f.id}`, weight }));
}

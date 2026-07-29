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

export const SYSTEM_TABLE_COMPARISON_FIELDS: Record<SystemTableName, ComparisonField[]> = {
  properties: [
    { key: "street_address", weight: 0.7 },
    { key: "suburb", weight: 0.3 },
  ],
  entities: [
    { key: "name", weight: 0.6 },
    { key: "abn", weight: 0.4 },
  ],
  projects: [
    { key: "name", weight: 1.0 },
  ],
  tasks: [
    { key: "name", weight: 0.7 },
    { key: "project_id", weight: 0.3, exact: true },
  ],
};

interface CustomFieldMeta {
  id: string;
  field_key: string;
  field_type: string;
}

// Text-ish field types worth comparing at all -- relation/date/boolean/
// number-only-as-identifier fields aren't useful similarity inputs the same
// way free text is (a formula or relation column doesn't have "close"
// matches in the same sense).
const COMPARABLE_FIELD_TYPES = new Set(["text", "email", "select", "number", "currency"]);

// Field keys that look like an identifier -- worth including as a secondary
// signal alongside the table's primary/display field, same spirit as
// entities' abn or properties' suburb above.
const IDENTIFIER_KEY_PATTERN = /email|phone|abn|acn|number|code|reference/i;

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
  const identifierFields = fields.filter(f =>
    f.field_key !== primaryFieldKey &&
    COMPARABLE_FIELD_TYPES.has(f.field_type) &&
    IDENTIFIER_KEY_PATTERN.test(f.field_key)
  );

  const result: ComparisonField[] = [];
  if (primary) {
    result.push({ key: primary.field_key, weight: identifierFields.length ? 0.7 : 1.0 });
  }
  const secondaryWeight = identifierFields.length ? (primary ? 0.3 : 1.0) / identifierFields.length : 0;
  for (const f of identifierFields) {
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

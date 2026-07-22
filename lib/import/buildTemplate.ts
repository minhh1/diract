// lib/import/buildTemplate.ts

import { supabase } from "@/lib/supabase";

export interface CrossTableField {
  alias: string;       // e.g. 'holding_entity'
  fkColumn: string;    // e.g. 'holding_entity_id'
  sourceTable: string; // e.g. 'entities'
  fieldName: string;   // e.g. 'abn'
  label: string;       // e.g. 'Holding Entity — ABN'
  headerKey: string;   // e.g. 'relation:holding_entity.abn'
}

export interface ImportSection {
  key: string;
  title: string;
  targetTable: string;
  parentKey: string;
  fixedValues?: Record<string, any>;
  headers: string[];
  customFields?: { id: string; table_name: string; field_key: string; label: string; field_type: string }[];
  crossTableFields?: CrossTableField[];
}

// ── Static base section definitions ───────────────────────────────

const PROPERTY_HEADERS = [
  'full_address', 'suburb', 'state', 'postcode', 'country',
  'folio_identifier', 'purchase_price', 'purchase_date',
  'entity_name', 'entity_type',
  'project_manager', 'project_owner', 'last_coc_date',
];

const ENTITY_HEADERS = [
  'entity_name', 'entity_type', 'abn', 'acn',
  'gst_registered', 'trust_deed_date', 'established_date',
  'bank_name', 'bsb', 'account_number',
];

const PROJECT_HEADERS = [
  'name', 'description', 'status',
  'estimated_completion_date',
  'property_street_address',
];

const BILL_HEADERS = [
  'issued_date', 'amount', 'is_paid', 'paid_up_to',
  'expected_amount', 'expected_amount_period', 'notes',
  'e_notice_reference', 'email_notices',
  'provider_entity_name', 'provider_entity_type',
];

const CREDENTIAL_HEADERS = [
  'account_name', 'account_number', 'login_id',
  'access_note', 'nominated_payor', 'nominated_mobile',
  'additional_email', 'auto_forward_note',
];

const VALUATION_HEADERS = [
  'valuation_date', 'amount', 'is_full_valuation', 'notes',
];

// Columns that should never appear as cross-table import targets —
// either because they're identity/metadata columns, or because
// they're already handled by the base import logic (e.g. entity_name
// on properties already resolves the holding entity)
const SKIP_CROSS_TABLE_COLUMNS = new Set([
  'id', 'company_id', 'deleted_at', 'import_id',
  'created_at', 'updated_at', 'created_by', 'team_id',
  'active_company_id', 'is_admin', 'is_active',
]);

function buildBaseSections(
  baseMode: "properties" | "entities" | "projects"
): ImportSection[] {
  if (baseMode === 'entities') {
    return [{
      key: 'entities', title: 'Entities',
      targetTable: 'entities', parentKey: '',
      headers: ENTITY_HEADERS,
    }];
  }

  if (baseMode === 'projects') {
    return [{
      key: 'projects', title: 'Projects',
      targetTable: 'projects', parentKey: '',
      headers: PROJECT_HEADERS,
    }];
  }

  return [
    { key: 'properties', title: 'Properties', targetTable: 'properties', parentKey: '', headers: PROPERTY_HEADERS },
    { key: 'valuations', title: 'Valuations', targetTable: 'property_valuations', parentKey: 'property_id', headers: VALUATION_HEADERS },
    { key: 'bills_local_government', title: 'Local government bills', targetTable: 'property_bills_local_government', parentKey: 'property_id', fixedValues: { category: 'council' }, headers: BILL_HEADERS },
    { key: 'bills_electricity', title: 'Electricity bills', targetTable: 'property_bills_electricity', parentKey: 'property_id', fixedValues: { category: 'electricity' }, headers: BILL_HEADERS },
    { key: 'bills_water', title: 'Water bills', targetTable: 'property_bills_water', parentKey: 'property_id', fixedValues: { category: 'water' }, headers: BILL_HEADERS },
    { key: 'bills_gas', title: 'Gas bills', targetTable: 'property_bills_gas', parentKey: 'property_id', fixedValues: { category: 'gas' }, headers: BILL_HEADERS },
    { key: 'bills_land_tax', title: 'Land tax bills', targetTable: 'property_bills_land_tax', parentKey: 'property_id', fixedValues: { category: 'land_tax' }, headers: BILL_HEADERS },
    { key: 'credentials_council', title: 'Council credentials', targetTable: 'property_credentials', parentKey: 'property_id', fixedValues: { category: 'council' }, headers: CREDENTIAL_HEADERS },
    { key: 'credentials_electricity', title: 'Electricity credentials', targetTable: 'property_credentials', parentKey: 'property_id', fixedValues: { category: 'electricity' }, headers: CREDENTIAL_HEADERS },
    { key: 'credentials_water', title: 'Water credentials', targetTable: 'property_credentials', parentKey: 'property_id', fixedValues: { category: 'water' }, headers: CREDENTIAL_HEADERS },
    { key: 'credentials_gas', title: 'Gas credentials', targetTable: 'property_credentials', parentKey: 'property_id', fixedValues: { category: 'gas' }, headers: CREDENTIAL_HEADERS },
    { key: 'credentials_land_tax', title: 'Land tax credentials', targetTable: 'property_credentials', parentKey: 'property_id', fixedValues: { category: 'land_tax' }, headers: CREDENTIAL_HEADERS },
  ];
}

// ── Append custom fields ───────────────────────────────────────────

async function appendCustomFieldHeaders(
  sections: ImportSection[],
  companyId: string
): Promise<ImportSection[]> {
  const { data: customFields } = await supabase
    .from('company_custom_fields')
    .select('id, table_name, field_key, label, field_type')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('display_order');

  if (!customFields?.length) return sections;

  return sections.map(section => {
    const tableCustomFields = customFields.filter(
      f => f.table_name === section.targetTable
    );
    if (!tableCustomFields.length) return section;

    // Use the field's label as the CSV header — human readable
    // Keep custom: prefix only internally for the parser
    const customHeaders = tableCustomFields.map(
      f => `custom:${f.id}:${f.field_key}`
    );

    return {
      ...section,
      headers: [...section.headers, ...customHeaders],
      customFields: tableCustomFields,
    };
  });
}

// ── Append cross-table fields from get_all_related_fields ──────────

async function appendCrossTableHeaders(
  sections: ImportSection[],
  companyId: string
): Promise<ImportSection[]> {
  // Cache results per table so we don't call the RPC multiple times
  // for sections that share the same targetTable (e.g. all 5 bill tables)
  const cache = new Map<string, any[]>();

  const getRelatedFields = async (tableName: string) => {
    if (cache.has(tableName)) return cache.get(tableName)!;
    const { data } = await supabase.rpc('get_all_related_fields', {
      base_table: tableName,
      p_company_id: companyId,
      max_depth: 1, // depth 1 only for import — deep nesting gets unwieldy in CSV
    });
    const fields = (data || []).filter((f: any) => !f.is_sensitive);
    cache.set(tableName, fields);
    return fields;
  };

  return Promise.all(sections.map(async section => {
    const relatedFields = await getRelatedFields(section.targetTable);
    if (!relatedFields.length) return section;

    const crossTableFields: CrossTableField[] = relatedFields
      .filter((f: any) => !SKIP_CROSS_TABLE_COLUMNS.has(f.field_name))
      .map((f: any) => ({
        alias: f.alias,
        fkColumn: f.fk_column,
        sourceTable: f.source_table,
        fieldName: f.field_name,
        label: f.label,
        headerKey: `relation:${f.alias}.${f.field_name}`,
      }));

    if (!crossTableFields.length) return section;

    return {
      ...section,
      headers: [...section.headers, ...crossTableFields.map(f => f.headerKey)],
      crossTableFields,
    };
  }));
}

// ── Public API ─────────────────────────────────────────────────────

export async function buildAllSections(
  baseMode: "properties" | "entities" | "projects"
): Promise<ImportSection[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return buildBaseSections(baseMode);

  const { data: prof } = await supabase
    .from('profiles')
    .select('active_company_id')
    .eq('id', user.id)
    .single();

  const companyId = prof?.active_company_id;
  if (!companyId) return buildBaseSections(baseMode);

  const base = buildBaseSections(baseMode);
  const withCustom = await appendCustomFieldHeaders(base, companyId);
  const withCrossTable = await appendCrossTableHeaders(withCustom, companyId);
  return withCrossTable;
}

// ── Label resolver for template download ──────────────────────────
// Converts raw header keys to human-readable CSV column names

export function headerToLabel(
  header: string,
  section: ImportSection
): string {
  if (header.startsWith('custom:')) {
    const parts = header.split(':');
    const fieldId = parts[1];
    const fieldKey = parts[2];

    // Always prefer the label from section metadata
    const cf = section.customFields?.find(f => f.id === fieldId);
    if (cf?.label) return cf.label;

    // Fallback: clean up the field_key
    return fieldKey
      ? fieldKey
          .replace(/^(field_|custom_)\d+$/, 'Custom Field') // clean up auto-keys
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())
      : `Custom ${fieldId.slice(0, 6)}`;
  }

  if (header.startsWith('relation:')) {
    // "relation:property.street_address" → "Property Street Address"
    const path = header.replace('relation:', '');
    const [tableAlias, fieldName] = path.split('.');
    if (!fieldName) return path;
    const tablePart = tableAlias.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const fieldPart = fieldName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `${tablePart} ${fieldPart}`;
  }

  // Base field
  return header.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export async function buildHeaderMap(
  targetTable: string,
  companyId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!targetTable) return map;

  // Note: don't filter by company_id here — if cid is wrong/empty
  // we'd silently return an empty map. Filter by table_name only,
  // since custom fields are already company-scoped via RLS.
  const { data: customFields } = await supabase
    .from('company_custom_fields')
    .select('id, field_key, label')
    .eq('table_name', targetTable)
    .is('deleted_at', null)
    .order('display_order');

  (customFields || []).forEach(f => {
    map.set(f.label.toLowerCase().trim(), `custom:${f.id}:${f.field_key}`);
    map.set(f.field_key.toLowerCase().trim(), `custom:${f.id}:${f.field_key}`);
    map.set(
      f.label.toLowerCase().trim().replace(/\s+/g, '_'),
      `custom:${f.id}:${f.field_key}`
    );
  });

  return map;
}
import { MapPin, Building2, Folder } from "lucide-react";

const formatLabel = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

const buildFields = (cols: string[], prefix = '') =>
  cols.map(c => ({
    id: prefix ? `${prefix}.${c}` : c,
    label: formatLabel(c),
  }));

// ---- properties ----
// Excluded: id, created_at, updated_at, deleted_at, import_id, company_id (metadata)
// No sensitive fields on properties itself (credentials live in property_credentials, a separate table, not exposed here)
export const PROPERTY_COLUMNS = [
  'street_address', 'suburb', 'state', 'postcode', 'country',
  'folio_identifier', 'holding_entity_id', 'purchase_price', 'purchase_date',
  'insurer_name', 'insurance_expiry', 'purchase_entity_id', 'policy_number',
  'project_manager', 'project_owner', 'last_coc_date', 'council_entity_id',
  'insurer_entity_id', 'is_sold', 'sold_date', 'sold_price',
];

// ---- entities ----
// Excluded: id, company_id, created_at, type_id, deleted_at, import_id (metadata)
// Excluded as sensitive: tfn, bank_name, bsb, account_number, nab_connect_id
export const ENTITY_COLUMNS = [
  'name', 'entity_type', 'acn', 'abn', 'gst_registered',
  'trust_deed_date', 'established_date',
];

// ---- projects ----
// Excluded: id, created_at, created_by(*), updated_at, deleted_at, import_id, company_id (metadata)
// (*created_by kept out since it's a profile reference, not a display field — see note below)
export const PROJECT_COLUMNS = [
  'name', 'description', 'property_id', 'estimated_completion_date',
];

export function buildPropertySections() {
  return [
    { title: "Property", icon: MapPin, fields: buildFields(PROPERTY_COLUMNS) },
    { title: "Holding Entity", icon: Building2, fields: buildFields(ENTITY_COLUMNS, 'holding_entity') },
  ];
}

export function buildEntitySections() {
  return [
    { title: "Entity", icon: Building2, fields: buildFields(ENTITY_COLUMNS) },
  ];
}

export function buildProjectSections() {
  return [
    { title: "Project", icon: Folder, fields: buildFields(PROJECT_COLUMNS) },
    { title: "Property", icon: MapPin, fields: buildFields(PROPERTY_COLUMNS, 'property') },
  ];
}
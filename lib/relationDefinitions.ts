export interface RelationDef {
  key: string;              // unique id, used in expandRelations array + storage
  label: string;            // shown in ColumnConfigDrawer toggle and sub-table header
  parentTable: 'properties' | 'entities';
  childTable: string;       // the related Supabase table to query
  foreignKey: string;       // column on childTable pointing back to parent's id
  columns: { id: string; label: string }[]; // columns shown in the sub-table, in order
  orderBy?: { column: string; ascending?: boolean };
  linkTo?: (row: any) => string | null; // optional: clicking a sub-row navigates
}

export const ENTITY_RELATIONS: RelationDef[] = [
  {
    key: 'entity_officeholders',
    label: 'Officeholders',
    parentTable: 'entities',
    childTable: 'entity_officeholders',
    foreignKey: 'entity_id',
    columns: [
      { id: 'full_name', label: 'Name' },
      { id: 'role', label: 'Role' },
      { id: 'date_appointed', label: 'Appointed' },
      { id: 'is_active', label: 'Active' },
    ],
    orderBy: { column: 'date_appointed', ascending: false },
  },
  {
    key: 'owned_properties',
    label: 'Owned properties',
    parentTable: 'entities',
    childTable: 'properties',
    foreignKey: 'holding_entity_id',
    columns: [
      { id: 'street_address', label: 'Address' },
      { id: 'suburb', label: 'Suburb' },
      { id: 'is_sold', label: 'Sold' },
    ],
    orderBy: { column: 'street_address', ascending: true },
    linkTo: (row) => `/dashboard/properties?id=${row.id}`,
  },
];

const BILL_COLUMNS = [
  { id: 'issued_date', label: 'Issued' },
  { id: 'amount', label: 'Amount' },
  { id: 'is_paid', label: 'Paid' },
  { id: 'paid_up_to', label: 'Paid up to' },
  { id: 'expected_amount', label: 'Expected amount' },
  { id: 'expected_amount_period', label: 'Frequency' },
  { id: 'e_notice_reference', label: 'E-notice reference' },
  { id: 'email_notices', label: 'Email notices' },
  { id: 'provider_entity_name', label: 'Provider' }, // resolved via provider_entity_id join, see below
  { id: 'credential.account_number', label: 'Account/property number' },
  { id: 'credential.access_note', label: 'Online access note' },
  { id: 'credential.nominated_payor', label: 'Payor' },
  { id: 'notes', label: 'Notes' },
];

export const PROPERTY_RELATIONS: RelationDef[] = [
  {
    key: 'property_valuations',
    label: 'Valuations',
    parentTable: 'properties',
    childTable: 'property_valuations',
    foreignKey: 'property_id',
    columns: [
      { id: 'valuation_date', label: 'Date' },
      { id: 'amount', label: 'Amount' },
      { id: 'is_full_valuation', label: 'Full valuation' },
    ],
    orderBy: { column: 'valuation_date', ascending: false },
  },
  {
    key: 'property_bills',
    label: 'Bills (uncategorized)',
    parentTable: 'properties',
    childTable: 'property_bills',
    foreignKey: 'property_id',
    columns: [
      { id: 'category', label: 'Category' },
      { id: 'issued_date', label: 'Issued' },
      { id: 'amount', label: 'Amount' },
      { id: 'is_paid', label: 'Paid' },
    ],
    orderBy: { column: 'issued_date', ascending: false },
  },
  {
    key: 'property_bills_local_government',
    label: 'Local government bills',
    parentTable: 'properties',
    childTable: 'property_bills_local_government',
    foreignKey: 'property_id',
    columns: BILL_COLUMNS,
    orderBy: { column: 'issued_date', ascending: false },
  },
  {
    key: 'property_bills_electricity',
    label: 'Electricity bills',
    parentTable: 'properties',
    childTable: 'property_bills_electricity',
    foreignKey: 'property_id',
    columns: BILL_COLUMNS,
    orderBy: { column: 'issued_date', ascending: false },
  },
  {
    key: 'property_bills_water',
    label: 'Water bills',
    parentTable: 'properties',
    childTable: 'property_bills_water',
    foreignKey: 'property_id',
    columns: BILL_COLUMNS,
    orderBy: { column: 'issued_date', ascending: false },
  },
  {
    key: 'property_bills_gas',
    label: 'Gas bills',
    parentTable: 'properties',
    childTable: 'property_bills_gas',
    foreignKey: 'property_id',
    columns: BILL_COLUMNS,
    orderBy: { column: 'issued_date', ascending: false },
  },
  {
    key: 'property_bills_land_tax',
    label: 'Land tax bills',
    parentTable: 'properties',
    childTable: 'property_bills_land_tax',
    foreignKey: 'property_id',
    columns: BILL_COLUMNS,
    orderBy: { column: 'issued_date', ascending: false },
  },
];
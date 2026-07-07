// lib/relationDefinitions.ts
import { supabase } from "@/lib/supabase";

export interface RelationDef {
  key: string;
  label: string;
  parentTable?: string;
  childTable: string;
  foreignKey: string;
  orderBy?: { column: string; ascending: boolean };
  columns: { id: string; label: string }[];
  linkTo?: (row: any) => string;
}

const BILL_COLUMNS = [
  { id: 'issued_date', label: 'Issued' },
  { id: 'amount', label: 'Amount' },
  { id: 'is_paid', label: 'Paid' },
  { id: 'paid_up_to', label: 'Paid up to' },
  { id: 'expected_amount', label: 'Expected amount' },
  { id: 'expected_amount_period', label: 'Frequency' },
  { id: 'e_notice_reference', label: 'E-notice reference' },
  { id: 'email_notices', label: 'Email notices' },
  { id: 'provider_entity_name', label: 'Provider' },
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
    orderBy: { column: 'valuation_date', ascending: false },
    columns: [
      { id: 'amount', label: 'Amount' },
      { id: 'valuation_date', label: 'Date' },
      { id: 'is_full_valuation', label: 'Full valuation' },
    ],
  },
  {
    key: 'property_bills_local_government',
    label: 'Council bills',
    parentTable: 'properties',
    childTable: 'property_bills_local_government',
    foreignKey: 'property_id',
    orderBy: { column: 'issued_date', ascending: false },
    columns: BILL_COLUMNS,
  },
  {
    key: 'property_bills_electricity',
    label: 'Electricity bills',
    parentTable: 'properties',
    childTable: 'property_bills_electricity',
    foreignKey: 'property_id',
    orderBy: { column: 'issued_date', ascending: false },
    columns: BILL_COLUMNS,
  },
  {
    key: 'property_bills_water',
    label: 'Water bills',
    parentTable: 'properties',
    childTable: 'property_bills_water',
    foreignKey: 'property_id',
    orderBy: { column: 'issued_date', ascending: false },
    columns: BILL_COLUMNS,
  },
  {
    key: 'property_bills_gas',
    label: 'Gas bills',
    parentTable: 'properties',
    childTable: 'property_bills_gas',
    foreignKey: 'property_id',
    orderBy: { column: 'issued_date', ascending: false },
    columns: BILL_COLUMNS,
  },
  {
    key: 'property_bills_land_tax',
    label: 'Land tax bills',
    parentTable: 'properties',
    childTable: 'property_bills_land_tax',
    foreignKey: 'property_id',
    orderBy: { column: 'issued_date', ascending: false },
    columns: BILL_COLUMNS,
  },
  {
    key: 'property_credentials',
    label: 'Credentials',
    parentTable: 'properties',
    childTable: 'property_credentials',
    foreignKey: 'property_id',
    columns: [
      { id: 'category', label: 'Category' },
      { id: 'account_name', label: 'Account name' },
      { id: 'account_number', label: 'Account number' },
      { id: 'login_id', label: 'Login ID' },
      { id: 'nominated_payor', label: 'Payor' },
      { id: 'access_note', label: 'Access note' },
    ],
  },
  // Project linked to a property — shown in property expand panel
  {
    key: 'projects',
    label: 'Project',
    parentTable: 'properties',
    childTable: 'projects',
    foreignKey: 'property_id',
    orderBy: { column: 'created_at', ascending: false },
    columns: [
      { id: 'name', label: 'Name' },
      { id: 'status', label: 'Status' },
      { id: 'description', label: 'Description' },
      { id: 'estimated_completion_date', label: 'Est. Completion' },
    ],
    linkTo: (row) => `/dashboard/projects?id=${row.id}`,
  },
];

export const ENTITY_RELATIONS: RelationDef[] = [
  {
    key: 'entity_officeholders',
    label: 'Officeholders',
    parentTable: 'entities',
    childTable: 'entity_officeholders',
    foreignKey: 'entity_id',
    columns: [
      { id: 'name', label: 'Name' },
      { id: 'role', label: 'Role' },
      { id: 'date_appointed', label: 'Appointed' },
      { id: 'is_current', label: 'Current' },
    ],
  },
];

// PROJECT_RELATIONS is intentionally empty here — it's fully driven
// by useTableRelations which introspects sub-projects and child
// properties from the database. Keeping this export so any legacy
// imports don't break.
export const PROJECT_RELATIONS: RelationDef[] = [];
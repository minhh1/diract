// Shared native-column metadata for the three system tables
// (projects/properties/entities) that isn't reliably derivable from the
// get_schema_metadata RPC alone. Extracted from
// components/dashboard/RecordDashboard.tsx's inline copies (its own comment
// there notes the RPC "sometimes returns wrong" relation targets) so this
// app's two consumers of it -- RecordDashboard.tsx's record-detail page and
// lib/hooks/useSystemTableAsCustomTable.ts's dashboard-widget adapter --
// can't drift apart.

export const SYSTEM_TABLE_HIDDEN_COLS = ['access_mode', 'deleted_at', 'company_id'];

export const SYSTEM_TABLE_RELATION_MAP: Record<string, { table: string; displayCol: string }> = {
  // Properties
  holding_entity_id: { table: 'entities', displayCol: 'name' },
  purchase_entity_id: { table: 'entities', displayCol: 'name' },
  council_entity_id: { table: 'entities', displayCol: 'name' },
  insurer_entity_id: { table: 'entities', displayCol: 'name' },
  property_id: { table: 'properties', displayCol: 'street_address' },
  project_id: { table: 'projects', displayCol: 'name' },
  // Projects
  parent_property_id: { table: 'properties', displayCol: 'street_address' },
  parent_project_id: { table: 'projects', displayCol: 'name' },
  // Entities
  type_id: { table: 'entity_types', displayCol: 'label' },
};

// Free-text columns that identify a person but aren't a real FK relation --
// rendered/edited as plain text, not modeled as a relation field.
export const SYSTEM_TABLE_PERSON_LINK_COLS = ['project_manager', 'project_owner'];

// A system table's primary display column -- used everywhere else in the app
// (e.g. RelationPicker's default `displayField`) except properties, whose
// primary column is street_address, not name.
export function systemTablePrimaryDisplayColumn(tableName: string): string {
  return tableName === 'properties' ? 'street_address' : 'name';
}

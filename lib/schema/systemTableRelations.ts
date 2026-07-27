// Shared native-column metadata for the three system tables
// (projects/properties/entities) that isn't reliably derivable from the
// get_schema_metadata RPC alone. Extracted from
// components/dashboard/RecordDashboard.tsx's inline copies (its own comment
// there notes the RPC "sometimes returns wrong" relation targets) so this
// app's two consumers of it -- RecordDashboard.tsx's record-detail page and
// lib/hooks/useSystemTableAsCustomTable.ts's dashboard-widget adapter --
// can't drift apart.

export const SYSTEM_TABLE_HIDDEN_COLS = ['access_mode', 'deleted_at', 'company_id'];

export interface SystemRelationConfig {
  table: string;
  displayCol: string;
  // Multi-valued relations (a project can have 2+ properties) are backed by
  // a junction table instead of the column holding a single UUID directly.
  // sourceCol/targetCol are the junction table's FK columns pointing back
  // at the record being edited / at the linked table, respectively.
  junction?: { table: string; sourceCol: string; targetCol: string };
}

export const SYSTEM_TABLE_RELATION_MAP: Record<string, SystemRelationConfig> = {
  // Properties
  holding_entity_id: { table: 'entities', displayCol: 'name' },
  purchase_entity_id: { table: 'entities', displayCol: 'name' },
  council_entity_id: { table: 'entities', displayCol: 'name' },
  insurer_entity_id: { table: 'entities', displayCol: 'name' },
  project_id: { table: 'projects', displayCol: 'name' },
  // Projects -- despite living under a "// Properties" heading this is
  // projects' own column (the only system table that actually has a
  // property_id -- confirmed against live schema, tasks/properties don't),
  // linking a project to its "parent property"/properties. Junction-backed
  // so a project can have 2+ (see supabase/migrations/
  // 20260727035000_project_properties_multi.sql). This used to be a
  // separate `parent_property_id` entry -- a name that doesn't match any
  // real column, so the junction config here never actually applied and
  // the field silently rendered single-valued despite the junction table,
  // handleAddLinked, and the multi-select UI all already existing for it.
  property_id: {
    table: 'properties', displayCol: 'street_address',
    junction: { table: 'project_properties', sourceCol: 'project_id', targetCol: 'property_id' },
  },
  parent_project_id: { table: 'projects', displayCol: 'name' },
  // Entities
  type_id: { table: 'entity_types', displayCol: 'label' },
  // Tasks -- project_id is already covered above (shared with properties).
  assignee_id: { table: 'profiles', displayCol: 'full_name' },
  status_id: { table: 'task_statuses', displayCol: 'label' },
  assigned_team_id: { table: 'teams', displayCol: 'team_name' },
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

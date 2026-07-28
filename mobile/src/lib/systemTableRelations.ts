// Copied verbatim from lib/schema/systemTableRelations.ts on the web app --
// pure data, no framework dependency, kept identical so the two apps never
// disagree about what a given native column on a system table points to.

export const SYSTEM_TABLE_HIDDEN_COLS = ['access_mode', 'deleted_at', 'company_id'];

export const SYSTEM_TABLE_RELATION_MAP: Record<string, { table: string; displayCol: string }> = {
  holding_entity_id: { table: 'entities', displayCol: 'name' },
  purchase_entity_id: { table: 'entities', displayCol: 'name' },
  council_entity_id: { table: 'entities', displayCol: 'name' },
  insurer_entity_id: { table: 'entities', displayCol: 'name' },
  property_id: { table: 'properties', displayCol: 'street_address' },
  project_id: { table: 'projects', displayCol: 'name' },
  parent_property_id: { table: 'properties', displayCol: 'street_address' },
  parent_project_id: { table: 'projects', displayCol: 'name' },
  type_id: { table: 'entity_types', displayCol: 'label' },
  assignee_id: { table: 'profiles', displayCol: 'full_name' },
  status_id: { table: 'task_statuses', displayCol: 'label' },
  assigned_team_id: { table: 'teams', displayCol: 'team_name' },
};

export const SYSTEM_TABLE_PERSON_LINK_COLS = ['project_manager', 'project_owner'];

export function systemTablePrimaryDisplayColumn(tableName: string): string {
  return tableName === 'properties' ? 'street_address' : 'name';
}

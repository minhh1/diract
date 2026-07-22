// Records a schema-*shape* change (create/rename/delete a custom table or a
// field on a custom table or on entities/projects/properties) to the
// app-wide, revertible history (see supabase/schema_change_log.sql). Not for
// data changes -- company_table_values/company_custom_field_values aren't
// logged here.
//
// Called from the small number of real mutation call sites:
// components/CustomTableBuilder.tsx, components/SchemaVisualisation.tsx, the
// template schema editor, and the template install/uninstall API routes.
import { supabase } from "@/lib/supabase";

export type SchemaChangeEntityType =
  | 'company_table' | 'company_table_field' | 'company_custom_field'
  | 'template_definition' | 'template_definition_table'
  | 'template_definition_table_field' | 'template_definition_system_field'
  | 'company_template_install' | 'company_dashboard';

export type SchemaChangeAction = 'create' | 'update' | 'delete';

export interface LogChangeParams {
  companyId: string;
  actorId: string | null;
  entityType: SchemaChangeEntityType;
  entityId: string;
  entityLabel?: string | null;
  action: SchemaChangeAction;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
}

export async function logSchemaChange(params: LogChangeParams): Promise<void> {
  const { error } = await supabase.from('schema_change_log').insert({
    company_id: params.companyId,
    actor_id: params.actorId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    entity_label: params.entityLabel ?? null,
    action: params.action,
    before: params.before ?? null,
    after: params.after ?? null,
  });
  if (error) console.error('logSchemaChange:', error);
}

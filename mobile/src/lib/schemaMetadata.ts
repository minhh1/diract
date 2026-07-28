import { supabase } from './supabase';

// Mirrors lib/services/schemaService.ts's ColumnMeta shape/RPC call --
// React Query (see records.ts) provides the caching layer here instead of
// that file's own in-memory Map.
export type ColumnMeta = {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  category: 'identity' | 'metadata' | 'data' | 'relation' | 'sensitive';
  label: string | null;
  is_hidden: boolean;
  relation_table: string | null;
  relation_display_column: string | null;
};

export async function getSchemaMetadata(tableName: string, companyId: string | null): Promise<ColumnMeta[]> {
  const { data, error } = await supabase.rpc('get_schema_metadata', {
    target_table: tableName,
    p_company_id: companyId,
  });
  if (error) {
    console.error(`[getSchemaMetadata] ${tableName}:`, error.message);
    return [];
  }
  return (data ?? []) as ColumnMeta[];
}

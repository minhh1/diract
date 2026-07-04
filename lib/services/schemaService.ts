import { supabase } from "@/lib/supabase";

export interface ColumnMeta {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  category: 'identity' | 'metadata' | 'data' | 'relation' | 'sensitive';
  label: string | null;
  is_hidden: boolean;
  relation_table: string | null;
  relation_display_column: string | null;
  select_table: string | null;
  select_display_column: string | null;
  validate_rule: string | null;
}

// Cache keyed by "tableName:companyId" so each company gets its own
// cached metadata (with their label overrides/hidden fields applied)
// while the base schema (no company_id) is cached separately for admin use.
const cache = new Map<string, ColumnMeta[]>();

function cacheKey(tableName: string, companyId?: string | null): string {
  return `${tableName}:${companyId ?? 'base'}`;
}

export async function getSchemaMetadata(
  tableName: string,
  companyId?: string | null
): Promise<ColumnMeta[]> {
  const key = cacheKey(tableName, companyId);
  if (cache.has(key)) return cache.get(key)!;

  const { data, error } = await supabase.rpc('get_schema_metadata', {
    target_table: tableName,
    p_company_id: companyId ?? null,
  });

  if (error) {
    console.error(`schemaService.getSchemaMetadata(${tableName}, ${companyId}):`, error);
    return [];
  }

  const result = (data || []) as ColumnMeta[];
  cache.set(key, result);
  return result;
}

export function invalidateSchemaCache(tableName?: string, companyId?: string) {
  if (tableName) {
    cache.delete(cacheKey(tableName, companyId));
    cache.delete(cacheKey(tableName)); // also bust the base cache
  } else {
    cache.clear();
  }
}

export function deriveLabel(columnName: string): string {
  return columnName
    .replace(/_id$/, '')
    .replace(/_at$/, '')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}


let companyCacheResolved = false;
let cachedCompanyId: string | null = null;

export async function getCompanyId(): Promise<string | null> {
  if (companyCacheResolved) return cachedCompanyId;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { companyCacheResolved = true; cachedCompanyId = null; return null; }
  const { data } = await supabase
    .from('profiles')
    .select('active_company_id')  // ← was 'company_id', renamed in migration
    .eq('id', user.id)
    .single();
  cachedCompanyId = data?.active_company_id ?? null;
  companyCacheResolved = true;
  return cachedCompanyId;
}

export function clearCompanyIdCache() {
  companyCacheResolved = false;
  cachedCompanyId = null;
}

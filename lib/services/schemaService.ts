import { supabase } from "@/lib/supabase";
import { readShellCache, writeShellCache, clearShellCache } from "@/lib/shellCache";

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

function shellCacheKey(key: string): string {
  return `schema-metadata:${key}`;
}

async function fetchSchemaMetadataRemote(tableName: string, companyId: string | null | undefined, key: string): Promise<ColumnMeta[]> {
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
  writeShellCache(shellCacheKey(key), result);
  return result;
}

// get_schema_metadata is a live RPC (column/relation config for a table),
// re-run from scratch on every page load since the in-memory `cache` above
// dies on reload -- same gap as get_all_related_fields (see
// useRelatedFields.ts's fix). The schema it describes only changes when an
// admin edits it, so persist the last-known result to localStorage: a fresh
// page load with no in-memory cache yet can still return the persisted
// result immediately while a real fetch confirms/updates it in the
// background. `onBackgroundUpdate` lets a caller (useTableSchema.ts) react
// if that background fetch turns up something different.
export async function getSchemaMetadata(
  tableName: string,
  companyId?: string | null,
  onBackgroundUpdate?: (cols: ColumnMeta[]) => void
): Promise<ColumnMeta[]> {
  const key = cacheKey(tableName, companyId);
  if (cache.has(key)) return cache.get(key)!;

  const persisted = readShellCache<ColumnMeta[]>(shellCacheKey(key));
  if (persisted) {
    cache.set(key, persisted);
    fetchSchemaMetadataRemote(tableName, companyId, key).then(fresh => {
      if (onBackgroundUpdate && JSON.stringify(fresh) !== JSON.stringify(persisted)) onBackgroundUpdate(fresh);
    });
    return persisted;
  }

  return fetchSchemaMetadataRemote(tableName, companyId, key);
}

// Synchronous accessor for use in useState lazy initializers -- a component
// remounting for a table already visited this session (e.g. switching
// between Properties/Entities/Projects) can read the cache instantly on
// first render, instead of waiting a tick for the async version to resolve
// and flash a loading state in between. Falls back to the persisted
// localStorage copy so even the FIRST mount in a fresh tab/session paints
// from a previous visit's schema instead of an empty list.
export function getCachedSchemaMetadata(tableName: string, companyId?: string | null): ColumnMeta[] | null {
  const key = cacheKey(tableName, companyId);
  return cache.get(key) ?? readShellCache<ColumnMeta[]>(shellCacheKey(key)) ?? null;
}

export function invalidateSchemaCache(tableName?: string, companyId?: string) {
  if (tableName) {
    cache.delete(cacheKey(tableName, companyId));
    clearShellCache(shellCacheKey(cacheKey(tableName, companyId)));
    cache.delete(cacheKey(tableName)); // also bust the base cache
    clearShellCache(shellCacheKey(cacheKey(tableName)));
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

// Synchronous companion to getCompanyId() -- same rationale as
// getCachedSchemaMetadata above.
export function getCachedCompanyIdSync(): { resolved: boolean; companyId: string | null } {
  return { resolved: companyCacheResolved, companyId: cachedCompanyId };
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { useCompany } from "@/components/CompanyContext";

export interface RelatedField {
  path: string;
  label: string;
  section_label: string;
  alias: string;
  fk_column: string;
  source_table: string;
  field_name: string;
  data_type: string;
  is_sensitive: boolean;
  depth: number;
}

export interface RelatedFieldsResult {
  sections: { title: string; fields: { id: string; label: string }[] }[];
  byPath: Map<string, RelatedField>;
  all: RelatedField[];
  loading: boolean;
}

const KNOWN_ACRONYMS = new Set(['abn', 'acn', 'tfn', 'bsb', 'gst', 'id', 'nab']);

function fixCasing(segment: string): string {
  return segment
    .split(' ')
    .map(word =>
      KNOWN_ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(' ');
}

// The RPC's raw label is the whole chain (e.g. "Parent Property -- Council
// Entity -- Name" for a depth-2 relation) -- once a field is shown inside its
// own drill-in folder (see ColumnConfigDrawer.tsx), repeating that entire
// chain as the row's own label just runs off the edge of the panel. Only the
// LAST segment is the field itself; the rest is exactly the folder the user
// already drilled through to get here.
export function cleanLabel(raw: string): string {
  const parts = raw.split(' -- ');
  return fixCasing(parts[parts.length - 1]);
}

// Same chain, but keeping every segment -- for contexts that show the field
// without the folder context alongside it (e.g. a grid column's hover
// tooltip), where the section still needs to be spelled out.
export function cleanFullLabel(raw: string): string {
  return raw.split(' -- ').map(fixCasing).join(' -- ');
}

// Scoped by companyId -- a bare tableName key served a previous company's
// stale related-fields list after switching active company. Same class of
// bug as lib/hooks/useCompanyCustomFields.ts's cache (see its own doc
// comment) and lib/hooks/prefetchShells.ts's tableShellKey/dashboardShellKey.
const cache = new Map<string, RelatedField[]>();

function cacheKey(companyId: string, tableName: string): string {
  return `${companyId}:${tableName}`;
}

function shellCacheKey(companyId: string, tableName: string): string {
  return `related-fields:${companyId}:${tableName}`;
}

// get_all_related_fields feeds the actual row-fetch query (dotted cross-table
// columns get silently dropped without it), so it can't be made lazy without
// risking data loss for already-configured columns. Instead, cap how long we
// wait for it -- this RPC is known to occasionally hang for 10+ seconds
// server-side (statement timeout); failing fast client-side keeps the rest of
// the page responsive even when that happens.
const FETCH_TIMEOUT_MS = 4000;

interface RelatedFieldsFetchResult { data: RelatedField[] | null; error: Error | null }

async function fetchRelatedFieldsRemote(tableName: string): Promise<RelatedFieldsFetchResult> {
  const rpcPromise = supabase.rpc('get_all_related_fields', {
    base_table: tableName,
    p_company_id: null,
    max_depth: 2,
  });
  const timeoutPromise = new Promise<{ data: null; error: Error }>(resolve => {
    setTimeout(() => resolve({ data: null, error: new Error('get_all_related_fields client-side timeout') }), FETCH_TIMEOUT_MS);
  });
  const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);
  if (error) return { data: null, error };
  return { data: (data || []) as RelatedField[], error: null };
}

// Exported so background prefetch (lib/hooks/prefetchShells.ts) can warm a
// table's related fields into the same shellCache the hook below reads from,
// without mounting the hook itself. No-ops if already warm (in-memory or
// persisted) -- a real visit's hook will still background-refresh either way.
export async function warmRelatedFields(tableName: string, companyId: string): Promise<void> {
  const key = cacheKey(companyId, tableName);
  if (cache.has(key) || readShellCache<RelatedField[]>(shellCacheKey(companyId, tableName))) return;
  const { data } = await fetchRelatedFieldsRemote(tableName);
  if (!data) return;
  cache.set(key, data);
  writeShellCache(shellCacheKey(companyId, tableName), data);
}

export function useRelatedFields(tableName: string): RelatedFieldsResult {
  const { companyId } = useCompany();
  // get_all_related_fields is a live information_schema/pg_catalog
  // introspection query -- expensive (recursive FK-graph walk over system
  // catalogs), and re-run from scratch on every single page load since the
  // in-memory `cache` above dies on reload. The actual schema it describes
  // (table FKs/columns) only changes when an admin edits it, so persist the
  // last-known result to localStorage (same stale-while-revalidate pattern
  // as lib/shellCache.ts's other consumers) -- every reload after the first
  // paints instantly from that, with a real fetch still confirming/updating
  // it in the background.
  const [fields, setFields] = useState<RelatedField[]>(
    () => (companyId ? cache.get(cacheKey(companyId, tableName)) || readShellCache<RelatedField[]>(shellCacheKey(companyId, tableName)) : null) || []
  );
  const [loading, setLoading] = useState(
    () => !companyId || (!cache.has(cacheKey(companyId, tableName)) && !readShellCache(shellCacheKey(companyId, tableName)))
  );

  useEffect(() => {
    if (tableName === '__skip__') { setLoading(false); return; }
    if (!companyId) return;
    const key = cacheKey(companyId, tableName);
    const persisted = readShellCache<RelatedField[]>(shellCacheKey(companyId, tableName));
    if (cache.has(key)) { setFields(cache.get(key)!); setLoading(false); return; }
    if (persisted) { cache.set(key, persisted); setFields(persisted); setLoading(false); }
    let active = true;
    perfLog(`useRelatedFields(${tableName}): start`, persisted ? "seeded from shellCache, refreshing in background" : undefined);

    fetchRelatedFieldsRemote(tableName).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error('useRelatedFields error:', error);
        perfLog(`useRelatedFields(${tableName}): resolved`, String(error.message));
        // Don't cache a timeout as if it were "no related fields" -- a later
        // mount (e.g. after the slow request actually finishes) should retry
        // rather than being stuck with an empty result. If we already had a
        // persisted result, keep showing that instead of clearing it.
        if (!persisted) { setFields([]); setLoading(false); }
        return;
      }
      const result = data!;
      perfLog(`useRelatedFields(${tableName}): resolved`, `${result.length} fields`);
      cache.set(key, result);
      writeShellCache(shellCacheKey(companyId, tableName), result);
      setFields(result);
      setLoading(false);
    });

    return () => { active = false; };
  }, [tableName, companyId]);

    // In useRelatedFields, the byPath map already handles this since
    // we store the full path. The sections grouping needs updating for
    // depth-2 to show sensible section names:

    const sections = useMemo(() => {
    const map: Record<string, { id: string; label: string }[]> = {};
    for (const f of fields) {
        if (f.is_sensitive) continue;
        if (!map[f.section_label]) map[f.section_label] = [];
        map[f.section_label].push({ id: f.path, label: cleanLabel(f.label) });
    }
    return Object.entries(map).map(([title, sectionFields]) => ({
        title,
        fields: sectionFields,
    }));
    }, [fields]);

  const byPath = useMemo(
    () => new Map(fields.map(f => [f.path, f])),
    [fields]
  );

  return { sections, byPath, all: fields, loading };
}
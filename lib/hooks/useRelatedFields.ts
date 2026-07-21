"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";

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

export function cleanLabel(raw: string): string {
  const parts = raw.split(' — ');
  if (parts.length !== 2) return raw;
  const [section, field] = parts;
  const fixedField = field
    .split(' ')
    .map(word =>
      KNOWN_ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(' ');
  return `${section} — ${fixedField}`;
}

const cache = new Map<string, RelatedField[]>();

// get_all_related_fields feeds the actual row-fetch query (dotted cross-table
// columns get silently dropped without it), so it can't be made lazy without
// risking data loss for already-configured columns. Instead, cap how long we
// wait for it — this RPC is known to occasionally hang for 10+ seconds
// server-side (statement timeout); failing fast client-side keeps the rest of
// the page responsive even when that happens.
const FETCH_TIMEOUT_MS = 4000;

export function useRelatedFields(tableName: string): RelatedFieldsResult {
  const [fields, setFields] = useState<RelatedField[]>(cache.get(tableName) || []);
  const [loading, setLoading] = useState(!cache.has(tableName));

  useEffect(() => {
    if (tableName === '__skip__') { setLoading(false); return; }
    if (cache.has(tableName)) { setFields(cache.get(tableName)!); setLoading(false); return; }
    let active = true;

    const rpcPromise = supabase.rpc('get_all_related_fields', {
      base_table: tableName,
      p_company_id: null,
      max_depth: 2,
    });
    const timeoutPromise = new Promise<{ data: null; error: Error }>(resolve => {
      setTimeout(() => resolve({ data: null, error: new Error('get_all_related_fields client-side timeout') }), FETCH_TIMEOUT_MS);
    });

    Promise.race([rpcPromise, timeoutPromise]).then(({ data, error }) => {
      if (!active) return;
      if (error) console.error('useRelatedFields error:', error);
      const result = (data || []) as RelatedField[];
      // Don't cache a timeout as if it were "no related fields" — a later
      // mount (e.g. after the slow request actually finishes) should retry
      // rather than being stuck with an empty result for the whole session.
      if (!error) cache.set(tableName, result);
      setFields(result);
      setLoading(false);
    });

    return () => { active = false; };
  }, [tableName]);

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
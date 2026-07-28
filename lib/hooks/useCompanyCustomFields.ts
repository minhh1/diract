"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";
import { readShellCache, writeShellCache } from "@/lib/shellCache";

export interface CompanyCustomField {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  show_in_table: boolean;
  select_options: string[] | null;
}

// Module-level cache shared by every caller — Sidebar's tree section and
// GenericMasterTable both need this same "custom fields for table X" list,
// and previously each fetched it independently even when showing the same
// table, doubling a query that never changes mid-session.
const cache = new Map<string, CompanyCustomField[]>();
const inFlight = new Map<string, Promise<CompanyCustomField[]>>();

function shellCacheKey(tableName: string): string {
  return `custom-fields:${tableName}`;
}

async function fetchRemote(tableName: string): Promise<CompanyCustomField[]> {
  perfLog(`useCompanyCustomFields(${tableName}): start`);
  const { data } = await supabase
    .from("company_custom_fields")
    .select("id, field_key, label, field_type, show_in_table, select_options")
    .eq("table_name", tableName)
    .is("deleted_at", null)
    .order("display_order");
  const result = data || [];
  cache.set(tableName, result);
  writeShellCache(shellCacheKey(tableName), result);
  inFlight.delete(tableName);
  perfLog(`useCompanyCustomFields(${tableName}): resolved`, `${result.length} fields`);
  return result;
}

// Exported so any non-hook caller (e.g. RecordDashboard's imperative load
// waterfall) can share this same cache instead of running its own redundant
// select — RecordDashboard needs exactly these columns already.
//
// The in-memory cache/inFlight above dies on reload, so this is re-queried
// from scratch on every fresh page load even though a company's custom
// fields only change when an admin edits them. Persist the last-known
// result to localStorage (same stale-while-revalidate pattern as
// useRelatedFields.ts/schemaService.ts): a fresh load with no in-memory
// cache yet returns the persisted result immediately, while a real fetch
// confirms/updates it in the background. `onBackgroundUpdate` lets a caller
// react if that turns up something different.
export function fetchCompanyCustomFields(
  tableName: string,
  onBackgroundUpdate?: (fresh: CompanyCustomField[]) => void
): Promise<CompanyCustomField[]> {
  if (cache.has(tableName)) return Promise.resolve(cache.get(tableName)!);
  if (inFlight.has(tableName)) return inFlight.get(tableName)!;

  const persisted = readShellCache<CompanyCustomField[]>(shellCacheKey(tableName));
  if (persisted) {
    cache.set(tableName, persisted);
    fetchRemote(tableName).then(fresh => {
      if (onBackgroundUpdate && JSON.stringify(fresh) !== JSON.stringify(persisted)) onBackgroundUpdate(fresh);
    });
    return Promise.resolve(persisted);
  }

  const promise = fetchRemote(tableName);
  inFlight.set(tableName, promise);
  return promise;
}

export function useCompanyCustomFields(tableName: string, enabled: boolean = true): {
  fields: CompanyCustomField[];
  loading: boolean;
} {
  const [fields, setFields] = useState<CompanyCustomField[]>(
    () => cache.get(tableName) ?? readShellCache<CompanyCustomField[]>(shellCacheKey(tableName)) ?? []
  );
  const [loading, setLoading] = useState(() => !cache.has(tableName) && !readShellCache(shellCacheKey(tableName)));

  useEffect(() => {
    if (cache.has(tableName)) {
      setFields(cache.get(tableName)!);
      setLoading(false);
      return;
    }
    if (!enabled) return;
    let active = true;
    fetchCompanyCustomFields(tableName, fresh => { if (active) setFields(fresh); }).then(result => {
      if (!active) return;
      setFields(result);
      setLoading(false);
    });
    return () => { active = false; };
  }, [tableName, enabled]);

  return { fields, loading };
}

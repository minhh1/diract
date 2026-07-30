"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { useCompany } from "@/components/CompanyContext";

export interface CompanyCustomField {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  show_in_table: boolean;
  select_options: string[] | null;
  // Auto numbering (see lib/schema/autoNumberPresets.ts +
  // supabase/migrations/20260730180000_custom_field_auto_numbering.sql) --
  // auto_number_prefix null means off; '' is a valid "bare number" prefix.
  auto_number_prefix: string | null;
  auto_number_start: number | null;
  auto_number_pad: number | null;
}

// Module-level cache shared by every caller — Sidebar's tree section and
// GenericMasterTable both need this same "custom fields for table X" list,
// and previously each fetched it independently even when showing the same
// table, doubling a query that never changes mid-session.
//
// Scoped by companyId -- a bare tableName key served a previous company's
// stale field list after switching active company (components/Sidebar.tsx's
// handleSwitchCompany reloads the page but doesn't reach into this module's
// cache), so a field that's alive and well in the new company could resolve
// to nothing and fall back to "Deleted field" purely because the cached
// list was really the OLD company's. Same class of bug as
// lib/hooks/prefetchShells.ts's tableShellKey/dashboardShellKey.
const cache = new Map<string, CompanyCustomField[]>();
const inFlight = new Map<string, Promise<CompanyCustomField[]>>();

function cacheKey(companyId: string, tableName: string): string {
  return `${companyId}:${tableName}`;
}

function shellCacheKey(companyId: string, tableName: string): string {
  return `custom-fields:${companyId}:${tableName}`;
}

async function fetchRemote(companyId: string, tableName: string): Promise<CompanyCustomField[]> {
  perfLog(`useCompanyCustomFields(${tableName}): start`);
  const { data } = await supabase
    .from("company_custom_fields")
    .select("id, field_key, label, field_type, show_in_table, select_options, auto_number_prefix, auto_number_start, auto_number_pad")
    .eq("table_name", tableName)
    .is("deleted_at", null)
    .order("display_order");
  const result = data || [];
  cache.set(cacheKey(companyId, tableName), result);
  writeShellCache(shellCacheKey(companyId, tableName), result);
  inFlight.delete(cacheKey(companyId, tableName));
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
  companyId: string,
  tableName: string,
  onBackgroundUpdate?: (fresh: CompanyCustomField[]) => void
): Promise<CompanyCustomField[]> {
  const key = cacheKey(companyId, tableName);
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  if (inFlight.has(key)) return inFlight.get(key)!;

  const persisted = readShellCache<CompanyCustomField[]>(shellCacheKey(companyId, tableName));
  if (persisted) {
    cache.set(key, persisted);
    fetchRemote(companyId, tableName).then(fresh => {
      if (onBackgroundUpdate && JSON.stringify(fresh) !== JSON.stringify(persisted)) onBackgroundUpdate(fresh);
    });
    return Promise.resolve(persisted);
  }

  const promise = fetchRemote(companyId, tableName);
  inFlight.set(key, promise);
  return promise;
}

export function useCompanyCustomFields(tableName: string, enabled: boolean = true): {
  fields: CompanyCustomField[];
  loading: boolean;
} {
  const { companyId } = useCompany();
  const [fields, setFields] = useState<CompanyCustomField[]>(
    () => (companyId ? cache.get(cacheKey(companyId, tableName)) ?? readShellCache<CompanyCustomField[]>(shellCacheKey(companyId, tableName)) : null) ?? []
  );
  const [loading, setLoading] = useState(
    () => !companyId || (!cache.has(cacheKey(companyId, tableName)) && !readShellCache(shellCacheKey(companyId, tableName)))
  );

  useEffect(() => {
    if (!companyId) return;
    const key = cacheKey(companyId, tableName);
    if (cache.has(key)) {
      setFields(cache.get(key)!);
      setLoading(false);
      return;
    }
    if (!enabled) return;
    let active = true;
    fetchCompanyCustomFields(companyId, tableName, fresh => { if (active) setFields(fresh); }).then(result => {
      if (!active) return;
      setFields(result);
      setLoading(false);
    });
    return () => { active = false; };
  }, [companyId, tableName, enabled]);

  return { fields, loading };
}

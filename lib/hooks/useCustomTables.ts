"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";

export interface CustomTable {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  primary_field_key: string | null;
  display_order: number;
  // Append-only statutory ledger (see supabase/company_table_ledger.sql):
  // rows can only be added, never edited or deleted.
  is_ledger: boolean;
  // Pure line-item data, meaningfully edited only from a dashboard's inline
  // grid (see supabase/company_tables_disable_record_dashboard.sql) -- this
  // table's own master page (CustomTableMasterPage.tsx) skips navigating to
  // a full RecordDashboard on row click / after creating a record.
  disable_record_dashboard: boolean;
}

// Module-level cache, not per-component -- app/dashboard/[tableSlug]/page.tsx
// calls this hook on EVERY custom-table (and dashboard) visit just to
// decide "is this slug a custom table or a dashboard?", and until this
// resolves it renders nothing at all. Confirmed live: that left a genuine
// blank screen (progress bar's first "round") before CustomTableMasterPage
// even mounted to show its own skeleton (a second round) -- two full
// loading stages stacked in front of any real content. warmCustomTables()
// (called once from CompanyContext right after auth resolves, same pattern
// as RelationPicker's warmRelationOptionsCache) pre-fills this so the FIRST
// real mount, not just the second, can seed its initial state synchronously
// from an already-warm cache instead of blocking on a fresh round trip.
// 60s TTL: long enough that "sign in, then click into a table" always hits
// warm cache; short enough that a table created in another tab shows up
// within the same session without a full reload.
const CACHE_TTL_MS = 60_000;
let cachedTables: CustomTable[] | null = null;
let cacheExpiresAt = 0;
let inFlight: Promise<CustomTable[]> | null = null;

function isCacheWarm(): boolean {
  return cachedTables !== null && cacheExpiresAt > Date.now();
}

function fetchTables(): Promise<CustomTable[]> {
  if (inFlight) return inFlight;
  perfLog("useCustomTables: start");
  const promise = (async () => {
    const { data } = await supabase
      .from('company_tables')
      .select('*')
      .is('deleted_at', null)
      .order('display_order');
    const tables = data || [];
    perfLog("useCustomTables: resolved", `${tables.length} tables`);
    cachedTables = tables;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    inFlight = null;
    return tables;
  })();
  inFlight = promise;
  return promise;
}

export function warmCustomTables(): void {
  if (isCacheWarm() || inFlight) return;
  fetchTables().catch(() => {});
}

export function useCustomTables(): {
  tables: CustomTable[];
  loading: boolean;
  refetch: () => void;
} {
  // Lazy initializers -- read the cache synchronously on first render so a
  // warm cache never even flashes a loading state, rather than only
  // avoiding it after an effect gets a chance to run.
  const [tables, setTables] = useState<CustomTable[]>(() => cachedTables ?? []);
  const [loading, setLoading] = useState<boolean>(() => !isCacheWarm());

  useEffect(() => {
    let active = true;
    if (isCacheWarm()) {
      setTables(cachedTables!);
      setLoading(false);
      return;
    }
    fetchTables().then(t => {
      if (!active) return;
      setTables(t);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const refetch = useCallback(() => {
    // Forces a real network fetch (e.g. after creating/renaming/deleting a
    // table in CustomTableBuilder) -- invalidating the shared cache too, so
    // any OTHER component that mounts useCustomTables after this point
    // (Sidebar, RecordDashboard, etc.) also picks up the change instead of
    // serving stale data for up to CACHE_TTL_MS.
    cachedTables = null;
    inFlight = null;
    setLoading(true);
    fetchTables().then(t => {
      setTables(t);
      setLoading(false);
    });
  }, []);

  return { tables, loading, refetch };
}

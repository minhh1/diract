"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";
import { fetchScopedDefaultResourceIds } from "@/lib/hooks/scopedDefaultResources";

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
  // Admin-designated company default (see supabase/migrations/
  // 20260727040000_default_and_private_tables_dashboards.sql) -- mandatory
  // in every member's sidebar, only an admin can set this or remove the
  // table. Always false for a private (owner_user_id set) table.
  is_default: boolean;
  // null = shared/company-wide (the only kind that existed before this
  // column) -- non-null = private, visible only to that user (RLS also
  // lets an admin see it, for oversight; see fetchTables' own filter below
  // for why the client still hides it from anyone but the owner regardless
  // of admin status).
  owner_user_id: string | null;
  // Resolved for the CURRENT viewer: is_default (mandatory for everyone) OR
  // this viewer's team/person has their own company_default_scopes row for
  // this table (see 20260729000000_scoped_default_views.sql /
  // AdminDefaultTablesTab.tsx). Sidebar.tsx uses this, not the raw
  // is_default, to decide what's pinned/mandatory -- AdminDefaultTablesTab
  // still reads the raw is_default for its own company-wide toggle.
  effectiveDefault: boolean;
  // Set once by install_company_template and never again -- see supabase/
  // migrations/20260803030000_lock_template_schema.sql. RLS itself already
  // refuses any UPDATE/DELETE on a row with this true (for anyone, admin
  // included); CustomTableBuilder.tsx uses this to grey the same actions
  // out client-side instead of surfacing a raw Postgres error.
  is_from_template: boolean;
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
//
// Keyed by user id, not just "warm or not" -- results now differ per user
// (each user's own private tables are mixed in), so a cache built for one
// signed-in user must never be served to another. In practice a single tab
// only ever has one signed-in user, so this is a single slot that gets
// invalidated whenever the resolved user id changes, not a real multi-user
// cache.
const CACHE_TTL_MS = 60_000;
let cachedTables: CustomTable[] | null = null;
let cachedForUserId: string | null = null;
let cacheExpiresAt = 0;
let inFlight: Promise<CustomTable[]> | null = null;

function isCacheWarm(userId: string | null): boolean {
  return cachedTables !== null && cachedForUserId === userId && cacheExpiresAt > Date.now();
}

async function resolveUserId(providedUserId?: string | null): Promise<string | null> {
  if (providedUserId) return providedUserId;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// RLS already restricts rows to shared (owner_user_id null) + this user's
// own private ones -- except an admin, who RLS also lets see every OTHER
// member's private tables (for oversight/support, see the migration's own
// comment). That's the right call for a dedicated admin review surface, but
// not for an admin's own everyday sidebar -- so this always additionally
// filters to "mine or shared" client-side regardless of role, rather than
// relying on RLS alone to decide what shows up here.
function fetchTables(userId: string | null): Promise<CustomTable[]> {
  if (inFlight) return inFlight;
  perfLog("useCustomTables: start");
  const promise = (async () => {
    let query = supabase
      .from('company_tables')
      .select('*')
      .is('deleted_at', null);
    query = userId ? query.or(`owner_user_id.is.null,owner_user_id.eq.${userId}`) : query.is('owner_user_id', null);
    const [{ data }, scopedIds] = await Promise.all([
      query.order('display_order'),
      fetchScopedDefaultResourceIds('table', userId),
    ]);
    const tables = (data || []).map((t: any) => ({ ...t, effectiveDefault: t.is_default || scopedIds.has(t.id) }));
    perfLog("useCustomTables: resolved", `${tables.length} tables`);
    cachedTables = tables;
    cachedForUserId = userId;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    inFlight = null;
    return tables;
  })();
  inFlight = promise;
  return promise;
}

export function warmCustomTables(userId?: string | null): Promise<void> {
  return (async () => {
    const uid = await resolveUserId(userId);
    if (isCacheWarm(uid) || inFlight) return;
    await fetchTables(uid).catch(() => {});
  })();
}

export function useCustomTables(userId?: string | null): {
  tables: CustomTable[];
  loading: boolean;
  refetch: () => void;
} {
  // Lazy initializers -- read the cache synchronously on first render so a
  // warm cache never even flashes a loading state, rather than only
  // avoiding it after an effect gets a chance to run. Can't resolve the
  // "is this the right user's cache" check synchronously when userId isn't
  // provided by the caller (that needs an async auth call) -- callers that
  // pass their own already-known userId (from useCompany()) get the full
  // synchronous benefit; others fall back to the effect below.
  const [tables, setTables] = useState<CustomTable[]>(() => (userId && isCacheWarm(userId)) ? cachedTables! : []);
  const [loading, setLoading] = useState<boolean>(() => !(userId && isCacheWarm(userId)));

  useEffect(() => {
    let active = true;
    (async () => {
      const uid = await resolveUserId(userId);
      if (!active) return;
      if (isCacheWarm(uid)) {
        setTables(cachedTables!);
        setLoading(false);
        return;
      }
      const t = await fetchTables(uid);
      if (!active) return;
      setTables(t);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [userId]);

  const refetch = useCallback(() => {
    cachedTables = null;
    inFlight = null;
    setLoading(true);
    (async () => {
      const uid = await resolveUserId(userId);
      const t = await fetchTables(uid);
      setTables(t);
      setLoading(false);
    })();
  }, [userId]);

  return { tables, loading, refetch };
}

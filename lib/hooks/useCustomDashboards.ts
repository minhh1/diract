"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";

export interface CustomDashboard {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  source_table_id: string;
  display_order: number;
  // Admin-designated company default (see supabase/migrations/
  // 20260727040000_default_and_private_tables_dashboards.sql) -- mandatory
  // in every member's sidebar, only an admin can set this or remove the
  // dashboard. Always false for a private (owner_user_id set) dashboard.
  is_default: boolean;
  // null = shared/company-wide (the only kind that existed before this
  // column) -- non-null = private, visible only to that user.
  owner_user_id: string | null;
}

// Mirrors lib/hooks/useCustomTables.ts's module-level cache/TTL/inFlight
// pattern exactly -- same reasoning: this hook is called on every Sidebar
// mount just to build the dashboards list, so warming it once (from
// CompanyContext's bootstrap, same spot warmCustomTables is warmed from)
// lets the first real mount seed synchronously instead of blocking on a
// fresh round trip. 60s TTL, keyed by user id for the same reason
// useCustomTables' cache is: results differ per user (private dashboards
// mixed in).
const CACHE_TTL_MS = 60_000;
let cachedDashboards: CustomDashboard[] | null = null;
let cachedForUserId: string | null = null;
let cacheExpiresAt = 0;
let inFlight: Promise<CustomDashboard[]> | null = null;

function isCacheWarm(userId: string | null): boolean {
  return cachedDashboards !== null && cachedForUserId === userId && cacheExpiresAt > Date.now();
}

async function resolveUserId(providedUserId?: string | null): Promise<string | null> {
  if (providedUserId) return providedUserId;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// RLS also lets an admin see every other member's private dashboards
// (oversight), but this list is "my sidebar" -- filter to shared-or-mine
// client-side regardless of role, same reasoning as useCustomTables.ts's
// fetchTables.
function fetchDashboards(userId: string | null): Promise<CustomDashboard[]> {
  if (inFlight) return inFlight;
  perfLog("useCustomDashboards: start");
  const promise = (async () => {
    let query = supabase
      .from('company_dashboards')
      .select('id, name, slug, icon, color, source_table_id, display_order, is_default, owner_user_id')
      .is('deleted_at', null);
    query = userId ? query.or(`owner_user_id.is.null,owner_user_id.eq.${userId}`) : query.is('owner_user_id', null);
    const { data } = await query.order('display_order');
    const dashboards = data || [];
    perfLog("useCustomDashboards: resolved", `${dashboards.length} dashboards`);
    cachedDashboards = dashboards;
    cachedForUserId = userId;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    inFlight = null;
    return dashboards;
  })();
  inFlight = promise;
  return promise;
}

export function warmCustomDashboards(userId?: string | null): Promise<void> {
  return (async () => {
    const uid = await resolveUserId(userId);
    if (isCacheWarm(uid) || inFlight) return;
    await fetchDashboards(uid).catch(() => {});
  })();
}

// Mirrors lib/hooks/useCustomTables.ts's shape/pattern for the sidebar list.
// userId is optional (falls back to an auth.getUser() call) -- pass it when
// already resolved via useCompany() to skip that extra round trip.
export function useCustomDashboards(userId?: string | null): {
  dashboards: CustomDashboard[];
  loading: boolean;
  refetch: () => void;
} {
  // Lazy initializers -- read the cache synchronously on first render, same
  // as useCustomTables.ts, so a warm cache never flashes a loading state.
  const [dashboards, setDashboards] = useState<CustomDashboard[]>(() => (userId && isCacheWarm(userId)) ? cachedDashboards! : []);
  const [loading, setLoading] = useState<boolean>(() => !(userId && isCacheWarm(userId)));

  useEffect(() => {
    let active = true;
    (async () => {
      const uid = await resolveUserId(userId);
      if (!active) return;
      if (isCacheWarm(uid)) {
        setDashboards(cachedDashboards!);
        setLoading(false);
        return;
      }
      const d = await fetchDashboards(uid);
      if (!active) return;
      setDashboards(d);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [userId]);

  const refetch = useCallback(() => {
    cachedDashboards = null;
    inFlight = null;
    setLoading(true);
    (async () => {
      const uid = await resolveUserId(userId);
      const d = await fetchDashboards(uid);
      setDashboards(d);
      setLoading(false);
    })();
  }, [userId]);

  return { dashboards, loading, refetch };
}

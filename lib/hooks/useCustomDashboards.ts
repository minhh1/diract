"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";
import { fetchScopedDefaultResourceIds } from "@/lib/hooks/scopedDefaultResources";

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
  // Resolved for the CURRENT viewer: is_default OR this viewer's team/
  // person has their own company_default_scopes row for this dashboard --
  // see the matching field on CustomTable in useCustomTables.ts.
  effectiveDefault: boolean;
  // Non-null = only company_admin + this team's leader get this dashboard
  // in their sidebar at all (see isVisibleRestrictedDashboard above) --
  // already filtered out of the returned list for anyone else, kept here
  // only for callers that want to know why a dashboard is/isn't present.
  restricted_to_team_id: string | null;
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
// A dashboard with restricted_to_team_id set (see the Irregularities
// dashboard / AdminTeamsTab.tsx's Administration Team) should stay out of
// the sidebar entirely for anyone who isn't company_admin or that team's
// leader -- app/dashboard/boards/[slug]/page.tsx enforces the same rule on
// direct navigation, this just keeps the nav list itself honest too.
async function isVisibleRestrictedDashboard(userId: string | null, teamId: string): Promise<boolean> {
  if (!userId) return false;
  const { data: prof } = await supabase.from('profiles').select('active_company_id').eq('id', userId).maybeSingle();
  if (prof?.active_company_id) {
    const { data: membership } = await supabase.from('company_memberships').select('role')
      .eq('user_id', userId).eq('company_id', prof.active_company_id).maybeSingle();
    if (membership?.role === 'company_admin') return true;
  }
  const { data: team } = await supabase.from('teams').select('leader_id').eq('id', teamId).maybeSingle();
  return team?.leader_id === userId;
}

function fetchDashboards(userId: string | null): Promise<CustomDashboard[]> {
  if (inFlight) return inFlight;
  perfLog("useCustomDashboards: start");
  const promise = (async () => {
    let query = supabase
      .from('company_dashboards')
      .select('id, name, slug, icon, color, source_table_id, display_order, is_default, owner_user_id, restricted_to_team_id')
      .is('deleted_at', null);
    query = userId ? query.or(`owner_user_id.is.null,owner_user_id.eq.${userId}`) : query.is('owner_user_id', null);
    const [{ data }, scopedIds] = await Promise.all([
      query.order('display_order'),
      fetchScopedDefaultResourceIds('dashboard', userId),
    ]);
    const restrictedVisibility = await Promise.all(
      (data || []).map((d: any) => d.restricted_to_team_id ? isVisibleRestrictedDashboard(userId, d.restricted_to_team_id) : Promise.resolve(true))
    );
    const dashboards = (data || [])
      .map((d: any, i: number) => ({ ...d, effectiveDefault: d.is_default || scopedIds.has(d.id), visible: restrictedVisibility[i] }))
      .filter((d: any) => d.visible);
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

// Every mounted useCustomDashboards() instance registers its own re-check
// here, so a mutation ANYWHERE in the app (the builder's save/delete, the
// trash page's restore/permanent-delete, admin's is_default toggle) can tell
// every currently-mounted instance -- most importantly the Sidebar's, which
// stays mounted across the whole session in the persistent layout -- to
// catch up immediately, without each mutation site needing a reference to
// that specific instance. Replaces a previous approach where the Sidebar
// force-refetched (bypassing its own cache entirely) on every single route
// change on the theory that "the create/delete/save flows navigate away
// right after" -- correct in spirit, but it meant EVERY navigation anywhere
// paid a live re-fetch, not just the ones that actually followed a mutation.
const listeners = new Set<() => void>();

export function invalidateCustomDashboards(): void {
  cachedDashboards = null;
  cacheExpiresAt = 0;
  inFlight = null;
  listeners.forEach(fn => fn());
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
    const load = async () => {
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
    };
    load();
    listeners.add(load);
    return () => { active = false; listeners.delete(load); };
  }, [userId]);

  const refetch = useCallback(() => {
    invalidateCustomDashboards();
  }, []);

  return { dashboards, loading, refetch };
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

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

// Mirrors lib/hooks/useCustomTables.ts's shape/pattern for the sidebar list.
// userId is optional (falls back to an auth.getUser() call) -- pass it when
// already resolved via useCompany() to skip that extra round trip.
export function useCustomDashboards(userId?: string | null): {
  dashboards: CustomDashboard[];
  loading: boolean;
  refetch: () => void;
} {
  const [dashboards, setDashboards] = useState<CustomDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      let uid = userId ?? null;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id ?? null;
      }
      if (!active) return;
      // RLS also lets an admin see every other member's private dashboards
      // (oversight), but this list is "my sidebar" -- filter to shared-or-
      // mine client-side regardless of role, same reasoning as
      // useCustomTables.ts's fetchTables.
      let query = supabase
        .from('company_dashboards')
        .select('id, name, slug, icon, color, source_table_id, display_order, is_default, owner_user_id')
        .is('deleted_at', null);
      query = uid ? query.or(`owner_user_id.is.null,owner_user_id.eq.${uid}`) : query.is('owner_user_id', null);
      const { data } = await query.order('display_order');
      if (!active) return;
      setDashboards(data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [tick, userId]);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  return { dashboards, loading, refetch };
}

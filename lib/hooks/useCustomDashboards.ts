"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface CustomDashboard {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  source_table_id: string;
  display_order: number;
}

// Mirrors lib/hooks/useCustomTables.ts's shape/pattern for the sidebar list.
export function useCustomDashboards(): {
  dashboards: CustomDashboard[];
  loading: boolean;
  refetch: () => void;
} {
  const [dashboards, setDashboards] = useState<CustomDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    supabase
      .from('company_dashboards')
      .select('id, name, slug, icon, color, source_table_id, display_order')
      .is('deleted_at', null)
      .order('display_order')
      .then(({ data }) => {
        if (!active) return;
        setDashboards(data || []);
        setLoading(false);
      });
    return () => { active = false; };
  }, [tick]);

  return { dashboards, loading, refetch: () => setTick(t => t + 1) };
}

"use client";

import { useState, useEffect, useMemo } from "react";
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
}

const cache = new Map<string, CustomTable[]>();

export function useCustomTables(): {
  tables: CustomTable[];
  loading: boolean;
  refetch: () => void;
} {
  const [tables, setTables] = useState<CustomTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    perfLog("useCustomTables: start");
    supabase
      .from('company_tables')
      .select('*')
      .is('deleted_at', null)
      .order('display_order')
      .then(({ data }) => {
        if (!active) return;
        perfLog("useCustomTables: resolved", `${data?.length ?? 0} tables`);
        setTables(data || []);
        setLoading(false);
      });
    return () => { active = false; };
  }, [tick]);

  return { tables, loading, refetch: () => setTick(t => t + 1) };
}
"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";

export interface CustomTable {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  primary_field_key: string | null;
  display_order: number;
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
    supabase
      .from('company_tables')
      .select('*')
      .order('display_order')
      .then(({ data }) => {
        if (!active) return;
        setTables(data || []);
        setLoading(false);
      });
    return () => { active = false; };
  }, [tick]);

  return { tables, loading, refetch: () => setTick(t => t + 1) };
}
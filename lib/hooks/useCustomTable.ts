"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { CustomTable } from "./useCustomTables";

export interface CustomTableField {
  id: string;
  table_id: string;
  field_key: string;
  label: string;
  field_type: string;
  select_options: string[] | null;
  linked_table_id: string | null;
  linked_system_table: string | null;
  linked_display_field: string | null;
  is_required: boolean;
  is_unique: boolean;
  show_in_table: boolean;
  display_order: number;
  section_name: string | null;
  help_text: string | null;
}

export interface CustomTableRecord {
  id: string;
  table_id: string;
  created_at: string;
  values: Record<string, any>; // field_key → value
}

export function useCustomTable(tableSlug: string | null): {
  tableDef: CustomTable | null;
  fields: CustomTableField[];
  records: CustomTableRecord[];
  loading: boolean;
  refetch: () => void;
} {
  const [tableDef, setTableDef] = useState<CustomTable | null>(null);
  const [fields, setFields] = useState<CustomTableField[]>([]);
  const [records, setRecords] = useState<CustomTableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!tableSlug) return;
    let active = true;
    setLoading(true);

    (async () => {
      // Load table definition
      const { data: tbl } = await supabase
        .from('company_tables')
        .select('*')
        .eq('slug', tableSlug)
        .single();

      if (!tbl || !active) { setLoading(false); return; }
      setTableDef(tbl);

      // Load fields
      const { data: flds } = await supabase
        .from('company_table_fields')
        .select('*')
        .eq('table_id', tbl.id)
        .order('display_order');

      const fieldList = (flds || []) as CustomTableField[];
      setFields(fieldList);

      // Load records with their values
      const { data: recs } = await supabase
        .from('company_table_records')
        .select('*, values:company_table_values(field_id, value_text, value_number, value_date, value_boolean, value_record_id)')
        .eq('table_id', tbl.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Build a field_id → field_key map for resolving values
      const fieldMap = new Map(fieldList.map(f => [f.id, f]));

      const hydratedRecords: CustomTableRecord[] = (recs || []).map(rec => {
        const values: Record<string, any> = {};
        (rec.values || []).forEach((v: any) => {
          const field = fieldMap.get(v.field_id);
          if (!field) return;
          values[field.field_key] = v.value_text
            ?? v.value_number
            ?? v.value_date
            ?? v.value_boolean
            ?? v.value_record_id
            ?? null;
        });
        return { id: rec.id, table_id: rec.table_id, created_at: rec.created_at, values };
      });

      if (active) {
        setRecords(hydratedRecords);
        setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [tableSlug, tick]);

  return {
    tableDef,
    fields,
    records,
    loading,
    refetch: () => setTick(t => t + 1),
  };
}
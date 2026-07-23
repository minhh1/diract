"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Resolves a set of record ids on a given system table (projects/entities/
// properties) to their display name, for widgets that only store the raw id
// in a value (e.g. a trust ledger row's `matter`/`client` field) and need the
// human label for display. Batches one query per distinct (table, ids-not-
// yet-resolved) call, same shape as TrustReconciliationWidget's inline
// version of this -- kept here as a shared hook since trust ledger
// statement/cash book/aged-balances widgets all need it too.
export function useRecordNames(table: string, ids: string[]): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const missing = ids.filter(id => id && !names.has(id));
    if (!missing.length) return;
    supabase.from(table).select('id, name').in('id', missing).then(({ data }) => {
      if (!data?.length) return;
      setNames(prev => {
        const next = new Map(prev);
        data.forEach((r: any) => next.set(r.id, r.name));
        return next;
      });
    });
  }, [table, ids, names]);

  return names;
}

"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import { readCache, writeCache } from "@/lib/queryCache";

// Resolves a set of record ids on a given system table (projects/entities/
// properties) to their display name, for widgets that only store the raw id
// in a value (e.g. a trust ledger row's `matter`/`client` field) and need the
// human label for display. Batches one query per distinct (table, ids-not-
// yet-resolved) call, same shape as TrustReconciliationWidget's inline
// version of this -- kept here as a shared hook since trust ledger
// statement/cash book/aged-balances widgets all need it too.
//
// Previously started from a blank Map on every mount with nothing cached --
// so "Matter Number"/"Client Name" (this hook resolves the latter) visibly
// showed blank/"—" and then jumped to the real value on every single visit,
// not just first load. Seeded from localStorage now, same
// paint-then-revalidate-in-background shape as the rest of the app.
const cacheKey = (companyId: string, table: string) => `record_names_${companyId}_${table}`;

export function useRecordNames(table: string, ids: string[]): Map<string, string> {
  const { companyId } = useCompany();
  const [names, setNames] = useState<Map<string, string>>(() => {
    const cached = companyId ? readCache<Record<string, string>>(cacheKey(companyId, table)) : null;
    return cached ? new Map(Object.entries(cached)) : new Map();
  });

  useEffect(() => {
    if (!companyId) return;
    const missing = ids.filter(id => id && !names.has(id));
    if (!missing.length) return;
    supabase.from(table).select('id, name').in('id', missing).then(({ data }) => {
      if (!data?.length) return;
      setNames(prev => {
        const next = new Map(prev);
        data.forEach((r: any) => next.set(r.id, r.name));
        writeCache(cacheKey(companyId, table), Object.fromEntries(next));
        return next;
      });
    });
  }, [table, ids, names, companyId]);

  return names;
}

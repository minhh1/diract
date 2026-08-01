"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";

// Resolves a set of `projects` record ids to their Matter Number -- a
// per-company custom field (see supabase/template_law_firm_seed.sql's
// "Matter fields on projects" block, field_key 'matter_number'), stored in
// the generic company_custom_fields/company_custom_field_values EAV pair
// (table_name = 'projects'), not a native column -- so it can't be
// resolved the same way useRecordNames.ts resolves a plain `name` column.
// Same batching/caching shape as that hook, kept separate since this one
// needs the field id lookup first.
export function useMatterNumbers(matterIds: string[]): Map<string, string> {
  const { companyId } = useCompany();
  const [numbers, setNumbers] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!companyId) return;
    const missing = matterIds.filter(id => id && !numbers.has(id));
    if (!missing.length) return;
    (async () => {
      const { data: field } = await supabase
        .from('company_custom_fields')
        .select('id')
        .eq('company_id', companyId)
        .eq('table_name', 'projects')
        .eq('field_key', 'matter_number')
        .is('deleted_at', null)
        .maybeSingle();
      if (!field) return;
      const { data } = await supabase
        .from('company_custom_field_values')
        .select('record_id, value_text')
        .eq('field_id', field.id)
        .in('record_id', missing);
      if (!data?.length) return;
      setNumbers(prev => {
        const next = new Map(prev);
        data.forEach((r: any) => { if (r.value_text) next.set(r.record_id, r.value_text); });
        return next;
      });
    })();
  }, [companyId, matterIds, numbers]);

  return numbers;
}

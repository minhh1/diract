import { useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';

// Lazily resolves a single relation field's display label (e.g. a
// project_id -> that project's name) for the detail view -- a light,
// per-row equivalent of resolveRelationLabels() in the web app's
// lib/hooks/useCustomTable.ts, which batches this for a whole grid. A
// detail screen only ever renders a handful of relation fields at once, so
// one small query per row (cached by React Query) is simpler and plenty
// fast here.
export function useRelationLabel(table: string | null, column: string | null, id: unknown) {
  return useQuery({
    queryKey: ['relation-label', table, column, id],
    enabled: !!table && !!column && !!id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from(table as string)
        .select(column as string)
        .eq('id', id as string)
        .maybeSingle();
      const value = (data as Record<string, unknown> | null)?.[column as string];
      return value == null ? null : String(value);
    },
  });
}

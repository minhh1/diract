import { useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';
import { fetchMatterNumbersByProjectId, withMatterNumber } from './matterNumberDisplay';

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
      if (value == null) return null;
      // A linked Matter also gets its per-company matter number prepended --
      // see matterNumberDisplay.ts's header comment. A failure here should
      // never hide an otherwise-resolved name (e.g. a transient network
      // error) -- worst case this just falls back to the name alone.
      if (table === 'projects') {
        try {
          const numberById = await fetchMatterNumbersByProjectId([id as string]);
          return withMatterNumber(String(value), numberById.get(id as string));
        } catch (err) {
          console.error('[relationLabels] fetchMatterNumbersByProjectId failed:', err);
        }
      }
      return String(value);
    },
  });
}

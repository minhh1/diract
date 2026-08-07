import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { callApi } from './api';

// Native port of components/public/PublicClientUpdateContent.tsx, staff
// side only -- a logged-in company member viewing/managing the board, not
// the anonymous slug+PIN client route (app/api/client-update-pages/public/
// [slug]/*). Mirrors the "staff" half of that component: full unfiltered
// board via by-slug, notes via the [id]/notes route, ask-AI via
// [id]/items/[itemId]/ask. Editing values/groups/fields/format-rules is
// still web-only for now -- this is read (all fields/groups/items) + the
// two write actions (notes, ask) a company member is most likely to want
// on the go.

export type ClientUpdatePageSummary = {
  id: string;
  title: string;
  client_label: string | null;
  slug: string;
  is_active: boolean;
  base_table: string;
  visibility: 'public' | 'team';
  matterCount: number;
  teamNames: string[];
};

export type ClientUpdateGroup = {
  id: string;
  name: string;
  display_order: number;
  parent_group_id: string | null;
};

export type ClientUpdateField = {
  id: string;
  field_source: string;
  field_key: string;
  label: string;
  display_order: number;
  field_type: string;
  group_id: string | null;
};

export type ClientUpdateNote = {
  id: string;
  note_date: string | null;
  body: string;
  author_name: string | null;
  source: 'staff' | 'client';
  created_at: string;
};

export type ClientUpdateItem = {
  id: string;
  record_table: string;
  record_id: string;
  group_id: string | null;
  display_name: string | null;
  matterName: string;
  ai_summary: string | null;
  values: Record<string, unknown>;
  notes: ClientUpdateNote[];
};

// Admin-set, company-wide default sort/filter for one group (see
// app/api/client-update-pages/[id]/view-defaults/route.ts) -- a viewer's
// own choice always overrides this, it's only the starting point.
export type ClientUpdateViewDefault = {
  group_id: string;
  filters: { fieldId: string; values: string[] }[];
  sort: { fieldId: string; dir: 'asc' | 'desc' }[];
};

export type ClientUpdateBoard = {
  page: {
    id: string;
    title: string;
    client_label: string | null;
    ai_ask_enabled: boolean;
    base_table: string;
    date_format: string;
  };
  groups: ClientUpdateGroup[];
  fields: ClientUpdateField[];
  items: ClientUpdateItem[];
  viewDefaults: ClientUpdateViewDefault[];
};

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

export function useClientUpdatePagesList() {
  return useQuery({
    queryKey: ['client-update-pages'],
    queryFn: async (): Promise<ClientUpdatePageSummary[]> => {
      const res = await callApi('/api/client-update-pages/list');
      const json = await unwrap<{ pages: ClientUpdatePageSummary[] }>(res);
      return json.pages;
    },
  });
}

export function useClientUpdateBoard(slug: string) {
  return useQuery({
    queryKey: ['client-update-board', slug],
    enabled: !!slug,
    queryFn: async (): Promise<ClientUpdateBoard> => {
      const res = await callApi(`/api/client-update-pages/by-slug/${slug}`);
      return unwrap<ClientUpdateBoard>(res);
    },
  });
}

export function useAddClientUpdateNote(pageId: string, slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, note }: { itemId: string; note: string }): Promise<{ note: ClientUpdateNote }> => {
      const res = await callApi(`/api/client-update-pages/${pageId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ itemId, note }),
      });
      return unwrap(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-update-board', slug] }),
  });
}

export async function askAboutClientUpdateItem(
  pageId: string,
  itemId: string,
  question: string,
  fields: { label: string; value: string }[],
): Promise<string> {
  const res = await callApi(`/api/client-update-pages/${pageId}/items/${itemId}/ask`, {
    method: 'POST',
    body: JSON.stringify({ question, fields }),
  });
  const json = await unwrap<{ answer: string }>(res);
  return json.answer;
}

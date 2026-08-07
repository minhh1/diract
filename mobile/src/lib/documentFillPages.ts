import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { callApi } from './api';
import { APP_URL } from './config';

// Native port of components/public/PublicDocumentsContent.tsx. Unlike
// public-tasks, this one is genuinely unauthenticated -- app/api/document-
// templates/public/[pageId]/* never checks a session, only an optional
// access_code -- and that's true for a logged-in company member too (see
// components/dashboard/DocumentPublicPageWidget.tsx: the "staff preview"
// is just this same component embedded, code prompt and all). So the
// public/* calls below are plain fetch() against APP_URL, no bearer token;
// only the admin-only listing call goes through callApi.

export type DocumentPageSummary = {
  id: string;
  title: string;
  clientName: string | null;
  projectName: string | null;
};

export type DocumentFillField = {
  tagKey: string;
  label: string;
  fieldType: 'text' | 'date' | 'number' | 'currency' | 'select' | 'multiselect';
  selectOptions: string[] | null;
  isRequired: boolean;
  autoFilled: boolean;
  value: string;
  triggerTagKey: string | null;
  triggerValue: string | null;
};

export type DocumentFillDoc = { id: string; name: string; description: string | null; fieldTagKeys: string[] };

export type DocumentFillPageData = {
  title: string;
  heading: string;
  requiresCode: boolean;
  documents: DocumentFillDoc[];
  fields: DocumentFillField[];
  naFields?: string[];
};

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

export function useDocumentFillPagesList() {
  return useQuery({
    queryKey: ['document-fill-pages'],
    queryFn: async (): Promise<DocumentPageSummary[]> => {
      const res = await callApi('/api/document-templates/pages');
      const json = await unwrap<{ pages: DocumentPageSummary[] }>(res);
      return json.pages;
    },
  });
}

export async function fetchDocumentFillPage(pageId: string, code?: string): Promise<DocumentFillPageData> {
  const qs = code ? `?code=${encodeURIComponent(code)}` : '';
  const res = await fetch(`${APP_URL}/api/document-templates/public/${pageId}${qs}`);
  return unwrap<DocumentFillPageData>(res);
}

export async function saveDocumentFillDraft(pageId: string, values: Record<string, string>, naFields: string[], code?: string): Promise<void> {
  await fetch(`${APP_URL}/api/document-templates/public/${pageId}/draft`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values, naFields, code }),
  });
}

export type GeneratedFile = { name: string; url: string };

export function useSubmitDocumentFill(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      values,
      naFields,
      code,
      templateIds,
    }: {
      values: Record<string, string>;
      naFields: string[];
      code?: string;
      templateIds?: string[];
    }): Promise<{ files: GeneratedFile[]; zipUrl: string | null }> => {
      const res = await fetch(`${APP_URL}/api/document-templates/public/${pageId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, naFields, code, templateIds }),
      });
      return unwrap(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-fill-page', pageId] }),
  });
}

import { useQuery } from '@tanstack/react-query';

import { callApi } from './api';
import type { PageBlock } from './pages/blockTypes';

// Native read path for company_pages ("Pages" -> AI-authored content
// pages, see app/api/pages/route.ts's header comment). Both routes below
// are authenticated + company-scoped (authorizeCompanyMember()), and GET
// /api/pages/[id] returns the real `blocks` regardless of the page's
// visibility ('company'/'client'/'public') -- unlike client-update-pages,
// a page's CONTENT never differs by viewer, only who's allowed to reach it
// externally, so there's no separate "staff vs public" fetch path needed
// here at all, just the one authenticated route already used by web's own
// Settings editor/preview.

export type CompanyPageSummary = {
  id: string;
  title: string;
  slug: string;
  visibility: 'company' | 'client' | 'public';
  status: 'draft' | 'published';
  updatedAt: string;
};

export function useCompanyPagesList() {
  return useQuery({
    queryKey: ['company-pages'],
    queryFn: async (): Promise<CompanyPageSummary[]> => {
      const res = await callApi('/api/pages');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load pages');
      return (json.pages ?? []).map((p: any) => ({
        id: p.id, title: p.title, slug: p.slug, visibility: p.visibility, status: p.status, updatedAt: p.updated_at,
      }));
    },
  });
}

export type CompanyPageDetail = {
  id: string;
  title: string;
  slug: string;
  visibility: 'company' | 'client' | 'public';
  status: 'draft' | 'published';
  blocks: PageBlock[];
};

export function useCompanyPage(id: string | null) {
  return useQuery({
    queryKey: ['company-page', id],
    enabled: !!id,
    queryFn: async (): Promise<CompanyPageDetail> => {
      const res = await callApi(`/api/pages/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load this page');
      const p = json.page;
      return { id: p.id, title: p.title, slug: p.slug, visibility: p.visibility, status: p.status, blocks: p.blocks ?? [] };
    },
  });
}

import { useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';

// Mirrors components/Sidebar.tsx's company switcher query on the web app --
// same table/columns, same client-side suspended-sandbox filter (PostgREST's
// embedded-resource filter doesn't guarantee dropping the parent row without
// an !inner hint, so this filters after the fetch instead).
export type CompanyMembership = {
  company_id: string;
  role: string;
  company: {
    id: string;
    name: string;
    status: string;
    company_type: string | null;
  } | null;
};

export function useCompanyMemberships(userId: string | null) {
  return useQuery({
    queryKey: ['company-memberships', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<CompanyMembership[]> => {
      const { data, error } = await supabase
        .from('company_memberships')
        .select('company_id, role, company:company_id(id, name, status, company_type)')
        .eq('user_id', userId as string);
      if (error) {
        console.error('[useCompanyMemberships]', error.message);
        return [];
      }
      return ((data ?? []) as unknown as CompanyMembership[]).filter((m) => m.company && m.company.status !== 'suspended');
    },
  });
}

export async function switchActiveCompany(userId: string, companyId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ active_company_id: companyId }).eq('id', userId);
  if (error) throw new Error(error.message);
}

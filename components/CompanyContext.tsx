// components/CompanyContext.tsx
// Fetches company/profile once and shares across all components.
// Eliminates duplicate auth calls in Sidebar + GenericMasterTable.
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

interface CompanyContextValue {
  companyId: string | null;
  companyName: string | null;
  userId: string | null;
  isAdmin: boolean;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextValue>({
  companyId: null,
  companyName: null,
  userId: null,
  isAdmin: false,
  loading: true,
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("active_company_id, companies:active_company_id(name)")
        .eq("id", user.id)
        .single();

      if (cancelled) return;
      const cid = prof?.active_company_id || null;
      const cname = (prof?.companies as any)?.name || null;

      setUserId(user.id);
      setCompanyId(cid);
      setCompanyName(cname);

      if (cid) {
        const { data: mem } = await supabase
          .from("company_memberships")
          .select("role")
          .eq("user_id", user.id)
          .eq("company_id", cid)
          .single();
        if (!cancelled) setIsAdmin(mem?.role === "company_admin");
      }

      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <CompanyContext.Provider value={{ companyId, companyName, userId, isAdmin, loading }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
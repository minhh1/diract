// components/CompanyContext.tsx
// Fetches company/profile once and shares across all components.
// Eliminates duplicate auth calls in Sidebar + GenericMasterTable.
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";

interface CompanyContextValue {
  companyId: string | null;
  companyName: string | null;
  userId: string | null;
  userEmail: string | null;
  isAdmin: boolean;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextValue>({
  companyId: null,
  companyName: null,
  userId: null,
  userEmail: null,
  isAdmin: false,
  loading: true,
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      perfLog("CompanyContext: start");
      // getSession() reads the local session (no network round-trip) instead
      // of getUser() re-validating the JWT against the auth server on every
      // page load. Safe here because this only bootstraps UI context — every
      // actual data query that follows is still enforced by RLS using the
      // real JWT on each request, so a stale/tampered local session can't
      // grant access to anything; it can at most show slightly-stale
      // identity info for a moment before a real query fails.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      perfLog("CompanyContext: auth.getSession resolved");
      if (!user || cancelled) return;

      // Membership lookup only needs user_id, not active_company_id — so it
      // doesn't actually have to wait on the profile fetch to resolve first.
      // Fetching all of this user's memberships (not filtered to one company)
      // and matching client-side lets both queries run in parallel instead
      // of a sequential round-trip chain.
      const [{ data: prof }, { data: allMemberships }] = await Promise.all([
        supabase
          .from("profiles")
          .select("active_company_id, companies:active_company_id(name)")
          .eq("id", user.id)
          .single(),
        supabase
          .from("company_memberships")
          .select("company_id, role")
          .eq("user_id", user.id),
      ]);
      perfLog("CompanyContext: profiles+memberships resolved");

      if (cancelled) return;
      const cid = prof?.active_company_id || null;
      const cname = (prof?.companies as any)?.name || null;

      setUserId(user.id);
      setUserEmail(user.email ?? null);
      setCompanyId(cid);
      setCompanyName(cname);
      setIsAdmin((allMemberships || []).find(m => m.company_id === cid)?.role === "company_admin");

      setLoading(false);
      perfLog("CompanyContext: done");
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <CompanyContext.Provider value={{ companyId, companyName, userId, userEmail, isAdmin, loading }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
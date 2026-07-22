// components/CompanyContext.tsx
// Fetches company/profile once and shares across all components.
// Eliminates duplicate auth calls in Sidebar + GenericMasterTable.
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";

// Per-company display-name overrides for the three system tables, e.g. a
// law firm renaming "Projects" to "Matters" (see supabase/companies_table_labels.sql).
export interface TableLabelOverride { singular: string; plural: string }
export type TableLabelOverrides = Record<string, TableLabelOverride>;

interface CompanyContextValue {
  companyId: string | null;
  companyName: string | null;
  userId: string | null;
  userEmail: string | null;
  isAdmin: boolean;
  loading: boolean;
  tableLabelOverrides: TableLabelOverrides;
  refreshTableLabelOverrides: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue>({
  companyId: null,
  companyName: null,
  userId: null,
  userEmail: null,
  isAdmin: false,
  loading: true,
  tableLabelOverrides: {},
  refreshTableLabelOverrides: async () => {},
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableLabelOverrides, setTableLabelOverrides] = useState<TableLabelOverrides>({});

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
          .select("active_company_id, companies:active_company_id(name, table_label_overrides)")
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
      const overrides = (prof?.companies as any)?.table_label_overrides || {};

      setUserId(user.id);
      setUserEmail(user.email ?? null);
      setCompanyId(cid);
      setCompanyName(cname);
      setTableLabelOverrides(overrides);
      setIsAdmin((allMemberships || []).find(m => m.company_id === cid)?.role === "company_admin");

      setLoading(false);
      perfLog("CompanyContext: done");
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Re-fetches just the label overrides, so the settings panel that edits
  // companies.table_label_overrides can push the change out to the Sidebar
  // (and anywhere else reading tableLabelOverrides) without a full reload.
  const refreshTableLabelOverrides = async () => {
    if (!companyId) return;
    const { data } = await supabase.from("companies").select("table_label_overrides").eq("id", companyId).single();
    setTableLabelOverrides((data as any)?.table_label_overrides || {});
  };

  return (
    <CompanyContext.Provider value={{ companyId, companyName, userId, userEmail, isAdmin, loading, tableLabelOverrides, refreshTableLabelOverrides }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
// components/CompanyContext.tsx
// Fetches company/profile once and shares across all components.
// Eliminates duplicate auth calls in Sidebar + GenericMasterTable.
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";
import { warmRelationOptionsCache } from "@/components/dashboard/RelationPicker";
import { warmCustomTables } from "@/lib/hooks/useCustomTables";

// Per-company display-name overrides for the three system tables, e.g. a
// law firm renaming "Projects" to "Matters" (see supabase/companies_table_labels.sql).
export interface TableLabelOverride { singular: string; plural: string }
export type TableLabelOverrides = Record<string, TableLabelOverride>;

// "Deleting" one of the 3 built-in tables (see
// supabase/companies_disabled_system_tables.sql) -- field_ids is exactly
// which company_custom_fields this soft-deleted, so restoring only
// un-deletes those.
export interface DisabledSystemTable { deleted_at: string; field_ids: string[] }
export type DisabledSystemTables = Record<string, DisabledSystemTable>;

interface CompanyContextValue {
  companyId: string | null;
  companyName: string | null;
  userId: string | null;
  userEmail: string | null;
  isAdmin: boolean;
  isSiteAdmin: boolean;
  loading: boolean;
  tableLabelOverrides: TableLabelOverrides;
  refreshTableLabelOverrides: () => Promise<void>;
  disabledSystemTables: DisabledSystemTables;
  refreshDisabledSystemTables: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue>({
  companyId: null,
  companyName: null,
  userId: null,
  userEmail: null,
  isAdmin: false,
  isSiteAdmin: false,
  loading: true,
  tableLabelOverrides: {},
  refreshTableLabelOverrides: async () => {},
  disabledSystemTables: {},
  refreshDisabledSystemTables: async () => {},
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSiteAdmin, setIsSiteAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableLabelOverrides, setTableLabelOverrides] = useState<TableLabelOverrides>({});
  const [disabledSystemTables, setDisabledSystemTables] = useState<DisabledSystemTables>({});

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

      // Fire the moment we have a real session, not after profile+membership
      // resolve too -- RelationPicker's cache is company-scoped by RLS, not
      // by anything CompanyContext itself computes (companyId etc.), so it
      // has no real dependency on those still-pending queries. Confirmed
      // live this was costing Matter/Staff pickers ~650ms of otherwise-free
      // head start (the gap between "auth.getSession resolved" and
      // "profiles+memberships resolved" in this file's own perfLog marks).
      warmRelationOptionsCache();
      // Same reasoning, same early spot -- every custom-table page blocks
      // on this exact list just to tell a custom table apart from a
      // dashboard (see app/dashboard/[tableSlug]/page.tsx), so warming it
      // here removes a whole blank-screen stage before that page even
      // starts rendering anything.
      warmCustomTables();

      // Membership lookup only needs user_id, not active_company_id — so it
      // doesn't actually have to wait on the profile fetch to resolve first.
      // Fetching all of this user's memberships (not filtered to one company)
      // and matching client-side lets both queries run in parallel instead
      // of a sequential round-trip chain.
      const [{ data: prof }, { data: allMemberships }] = await Promise.all([
        supabase
          .from("profiles")
          .select("active_company_id, is_site_admin, companies:active_company_id(name, table_label_overrides, disabled_system_tables)")
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
      const disabled = (prof?.companies as any)?.disabled_system_tables || {};

      setUserId(user.id);
      setUserEmail(user.email ?? null);
      setCompanyId(cid);
      setCompanyName(cname);
      setTableLabelOverrides(overrides);
      setDisabledSystemTables(disabled);
      setIsAdmin((allMemberships || []).find(m => m.company_id === cid)?.role === "company_admin");
      setIsSiteAdmin(!!prof?.is_site_admin);

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

  // Re-fetches just which system tables are disabled, so CustomTableBuilder
  // (delete/restore) can push the change out to the Sidebar/schema map/
  // schema editor/table pages without a full reload.
  const refreshDisabledSystemTables = async () => {
    if (!companyId) return;
    const { data } = await supabase.from("companies").select("disabled_system_tables").eq("id", companyId).single();
    setDisabledSystemTables((data as any)?.disabled_system_tables || {});
  };

  return (
    <CompanyContext.Provider value={{ companyId, companyName, userId, userEmail, isAdmin, isSiteAdmin, loading, tableLabelOverrides, refreshTableLabelOverrides, disabledSystemTables, refreshDisabledSystemTables }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
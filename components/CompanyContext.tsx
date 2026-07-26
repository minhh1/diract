// components/CompanyContext.tsx
// Fetches company/profile once and shares across all components.
// Eliminates duplicate auth calls in Sidebar + GenericMasterTable.
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";
import { readShellCache, writeShellCache, clearShellCache } from "@/lib/shellCache";
import { warmRelationOptionsCache } from "@/components/dashboard/RelationPicker";
import { warmCustomTables } from "@/lib/hooks/useCustomTables";
import { emptyInvoiceSettings, type InvoiceSettings } from "@/lib/invoices/types";

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
  // e.g. 'Law Firm' -- null for a general/unspecified business. Gates
  // industry-specific features (currently just the detailed law-firm
  // invoice template) rather than being read as a display label anywhere.
  companyType: string | null;
  userId: string | null;
  userEmail: string | null;
  isAdmin: boolean;
  isSiteAdmin: boolean;
  loading: boolean;
  tableLabelOverrides: TableLabelOverrides;
  refreshTableLabelOverrides: () => Promise<void>;
  disabledSystemTables: DisabledSystemTables;
  refreshDisabledSystemTables: () => Promise<void>;
  invoiceSettings: InvoiceSettings;
  refreshInvoiceSettings: () => Promise<void>;
  logoUrl: string | null;
  refreshLogoUrl: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue>({
  companyId: null,
  companyName: null,
  companyType: null,
  userId: null,
  userEmail: null,
  isAdmin: false,
  isSiteAdmin: false,
  loading: true,
  tableLabelOverrides: {},
  refreshTableLabelOverrides: async () => {},
  disabledSystemTables: {},
  refreshDisabledSystemTables: async () => {},
  invoiceSettings: emptyInvoiceSettings(),
  refreshInvoiceSettings: async () => {},
  logoUrl: null,
  refreshLogoUrl: async () => {},
});

// Bootstrap identity/company info -- everything CompanyProvider resolves
// before `loading` goes false. Cached in localStorage (see shellCache.ts)
// so a repeat visit can paint with yesterday's answer instantly instead of
// blocking every page's shell behind auth.getSession + the profiles/
// memberships round trip. Every real query downstream is still enforced by
// RLS using the live JWT, so a stale cached companyId can't grant access to
// anything -- it can at most show slightly-stale identity for a moment
// before the real fetch below corrects it.
interface CachedCompanyState {
  companyId: string | null;
  companyName: string | null;
  companyType: string | null;
  userId: string | null;
  userEmail: string | null;
  isAdmin: boolean;
  isSiteAdmin: boolean;
  tableLabelOverrides: TableLabelOverrides;
  disabledSystemTables: DisabledSystemTables;
  invoiceSettings: InvoiceSettings;
  logoUrl: string | null;
}
const COMPANY_CACHE_KEY = "company-context";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [cachedBoot] = useState<CachedCompanyState | null>(() => readShellCache<CachedCompanyState>(COMPANY_CACHE_KEY));
  const [companyId, setCompanyId] = useState<string | null>(cachedBoot?.companyId ?? null);
  const [companyName, setCompanyName] = useState<string | null>(cachedBoot?.companyName ?? null);
  const [companyType, setCompanyType] = useState<string | null>(cachedBoot?.companyType ?? null);
  const [userId, setUserId] = useState<string | null>(cachedBoot?.userId ?? null);
  const [userEmail, setUserEmail] = useState<string | null>(cachedBoot?.userEmail ?? null);
  const [isAdmin, setIsAdmin] = useState(cachedBoot?.isAdmin ?? false);
  const [isSiteAdmin, setIsSiteAdmin] = useState(cachedBoot?.isSiteAdmin ?? false);
  const [loading, setLoading] = useState(!cachedBoot);
  const [tableLabelOverrides, setTableLabelOverrides] = useState<TableLabelOverrides>(cachedBoot?.tableLabelOverrides ?? {});
  const [disabledSystemTables, setDisabledSystemTables] = useState<DisabledSystemTables>(cachedBoot?.disabledSystemTables ?? {});
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>(cachedBoot?.invoiceSettings ?? emptyInvoiceSettings());
  const [logoUrl, setLogoUrl] = useState<string | null>(cachedBoot?.logoUrl ?? null);

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
      if (cancelled) return;
      if (!user) {
        // Logged out (or cache left over from a previous account on a
        // shared browser) -- don't leave a stale cached identity showing.
        clearShellCache(COMPANY_CACHE_KEY);
        setCompanyId(null); setCompanyName(null); setCompanyType(null);
        setUserId(null); setUserEmail(null); setIsAdmin(false); setIsSiteAdmin(false);
        setTableLabelOverrides({}); setDisabledSystemTables({});
        setInvoiceSettings(emptyInvoiceSettings()); setLogoUrl(null);
        setLoading(false);
        return;
      }

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
          .select("active_company_id, is_site_admin, companies:active_company_id(name, company_type, table_label_overrides, disabled_system_tables, invoice_settings, logo_url)")
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
      const ctype = (prof?.companies as any)?.company_type || null;
      const overrides = (prof?.companies as any)?.table_label_overrides || {};
      const disabled = (prof?.companies as any)?.disabled_system_tables || {};
      const invoiceSettingsData = (prof?.companies as any)?.invoice_settings;
      const logo = (prof?.companies as any)?.logo_url || null;

      setUserId(user.id);
      setUserEmail(user.email ?? null);
      setCompanyId(cid);
      setCompanyName(cname);
      setCompanyType(ctype);
      setTableLabelOverrides(overrides);
      setDisabledSystemTables(disabled);
      setInvoiceSettings({ ...emptyInvoiceSettings(), ...invoiceSettingsData });
      setLogoUrl(logo);
      const admin = (allMemberships || []).find(m => m.company_id === cid)?.role === "company_admin";
      const siteAdmin = !!prof?.is_site_admin;
      setIsAdmin(admin);
      setIsSiteAdmin(siteAdmin);

      setLoading(false);
      perfLog("CompanyContext: done");
      writeShellCache<CachedCompanyState>(COMPANY_CACHE_KEY, {
        companyId: cid, companyName: cname, companyType: ctype, userId: user.id, userEmail: user.email ?? null,
        isAdmin: admin, isSiteAdmin: siteAdmin, tableLabelOverrides: overrides, disabledSystemTables: disabled,
        invoiceSettings: { ...emptyInvoiceSettings(), ...invoiceSettingsData }, logoUrl: logo,
      });
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

  // Re-fetches just the invoice branding/terms/template settings, so
  // InvoiceTemplateSettingsTab can push a change out to CreateInvoiceModal/
  // the PDF route without a full reload.
  const refreshInvoiceSettings = async () => {
    if (!companyId) return;
    const { data } = await supabase.from("companies").select("invoice_settings").eq("id", companyId).single();
    setInvoiceSettings({ ...emptyInvoiceSettings(), ...((data as any)?.invoice_settings || {}) });
  };

  // Re-fetches just the logo, so a fresh upload/removal via
  // app/api/company/logo shows up immediately without a full reload.
  const refreshLogoUrl = async () => {
    if (!companyId) return;
    const { data } = await supabase.from("companies").select("logo_url").eq("id", companyId).single();
    setLogoUrl((data as any)?.logo_url || null);
  };

  return (
    <CompanyContext.Provider value={{
      companyId, companyName, companyType, userId, userEmail, isAdmin, isSiteAdmin, loading,
      tableLabelOverrides, refreshTableLabelOverrides, disabledSystemTables, refreshDisabledSystemTables,
      invoiceSettings, refreshInvoiceSettings, logoUrl, refreshLogoUrl,
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
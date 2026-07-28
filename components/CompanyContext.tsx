// components/CompanyContext.tsx
// Fetches company/profile once and shares across all components.
// Eliminates duplicate auth calls in Sidebar + GenericMasterTable.
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { readShellCache, writeShellCache, clearShellCache } from "@/lib/shellCache";
import { resolveCompanyBootstrap } from "@/lib/companyBootstrap";
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
// Exported so components/AppLoader.tsx can check "is there already a warm
// cached identity" directly (it sits above CompanyProvider in the tree, so
// it can't use useCompany() -- but readShellCache is a plain function
// either side can call against the same key).
export const COMPANY_CACHE_KEY = "company-context";

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
      // resolveCompanyBootstrap does the actual session/profile/membership
      // resolution (and fires the tables/dashboards/relations/shells warm-up)
      // -- see lib/companyBootstrap.ts. components/AppLoader.tsx calls this
      // exact same function for its own loading-screen progress bar; the
      // module-level in-flight dedup there means only one of us ever does
      // the real network round trip, regardless of which mounts first.
      const result = await resolveCompanyBootstrap();
      if (cancelled) return;
      if (!result) {
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

      setUserId(result.userId);
      setUserEmail(result.userEmail);
      setCompanyId(result.companyId);
      setCompanyName(result.companyName);
      setCompanyType(result.companyType);
      setTableLabelOverrides(result.tableLabelOverrides);
      setDisabledSystemTables(result.disabledSystemTables);
      setInvoiceSettings(result.invoiceSettings);
      setLogoUrl(result.logoUrl);
      setIsAdmin(result.isAdmin);
      setIsSiteAdmin(result.isSiteAdmin);
      setLoading(false);
      writeShellCache<CachedCompanyState>(COMPANY_CACHE_KEY, {
        companyId: result.companyId, companyName: result.companyName, companyType: result.companyType,
        userId: result.userId, userEmail: result.userEmail,
        isAdmin: result.isAdmin, isSiteAdmin: result.isSiteAdmin,
        tableLabelOverrides: result.tableLabelOverrides, disabledSystemTables: result.disabledSystemTables,
        invoiceSettings: result.invoiceSettings, logoUrl: result.logoUrl,
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
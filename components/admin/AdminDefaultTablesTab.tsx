// components/admin/AdminDefaultTablesTab.tsx
// Lets an admin mark a shared custom table or dashboard as a company
// default -- mandatory in every member's sidebar, removable only by an
// admin (see supabase/migrations/20260727040000_default_and_private_tables_dashboards.sql).
// Only shared (owner_user_id null) rows are eligible here; a private table/
// dashboard can't be promoted to a default (RLS independently rejects
// is_default = true from anyone but an admin regardless -- this UI is just
// the matching admin-only surface, mirroring AdminDefaultTabsTab.tsx's
// list/toggle style).
"use client";

import { useState } from "react";
import { Loader2, Table2, LayoutDashboard } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import { useCustomDashboards } from "@/lib/hooks/useCustomDashboards";

interface Props { companyId: string; }

export default function AdminDefaultTablesTab({ companyId }: Props) {
  const { tables, loading: tablesLoading, refetch: refetchTables } = useCustomTables();
  const { dashboards, loading: dashboardsLoading, refetch: refetchDashboards } = useCustomDashboards();
  const [savingId, setSavingId] = useState<string | null>(null);

  const sharedTables = tables.filter(t => t.owner_user_id === null);
  const sharedDashboards = dashboards.filter(d => d.owner_user_id === null);

  const toggleTableDefault = async (id: string, next: boolean) => {
    setSavingId(id);
    await supabase.from('company_tables').update({ is_default: next }).eq('id', id);
    setSavingId(null);
    refetchTables();
  };

  const toggleDashboardDefault = async (id: string, next: boolean) => {
    setSavingId(id);
    await supabase.from('company_dashboards').update({ is_default: next }).eq('id', id);
    setSavingId(null);
    refetchDashboards();
  };

  if (tablesLoading || dashboardsLoading) return <p className="text-[11px] text-slate-400">Loading...</p>;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Default tables</p>
        <p className="text-[11px] text-slate-400 mb-4">
          A default table is mandatory in every member&apos;s sidebar — they can&apos;t hide or remove it, only an admin can.
        </p>
        <div className="space-y-2">
          {sharedTables.map(t => {
            const Icon = (LucideIcons as any)[t.icon] || Table2;
            return (
              <div key={t.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-5 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon size={15} style={{ color: t.color }} className="shrink-0" />
                  <p className="text-[12px] font-bold text-slate-700 truncate">{t.name}</p>
                </div>
                <button
                  onClick={() => toggleTableDefault(t.id, !t.is_default)}
                  disabled={savingId === t.id}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all disabled:opacity-50 ${
                    t.is_default ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {savingId === t.id ? <Loader2 size={11} className="animate-spin" /> : t.is_default ? 'Default' : 'Make default'}
                </button>
              </div>
            );
          })}
          {sharedTables.length === 0 && (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-6">No shared tables yet</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Default dashboards</p>
        <p className="text-[11px] text-slate-400 mb-4">
          A default dashboard is mandatory in every member&apos;s sidebar — only an admin can remove it.
        </p>
        <div className="space-y-2">
          {sharedDashboards.map(d => {
            const Icon = (LucideIcons as any)[d.icon] || LayoutDashboard;
            return (
              <div key={d.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-5 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon size={15} style={{ color: d.color }} className="shrink-0" />
                  <p className="text-[12px] font-bold text-slate-700 truncate">{d.name}</p>
                </div>
                <button
                  onClick={() => toggleDashboardDefault(d.id, !d.is_default)}
                  disabled={savingId === d.id}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all disabled:opacity-50 ${
                    d.is_default ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {savingId === d.id ? <Loader2 size={11} className="animate-spin" /> : d.is_default ? 'Default' : 'Make default'}
                </button>
              </div>
            );
          })}
          {sharedDashboards.length === 0 && (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-6">No shared dashboards yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

// components/admin/AdminDefaultTablesTab.tsx
// Lets an admin mark a shared custom table as a company default -- mandatory
// in every member's sidebar, removable only by an admin (see
// supabase/migrations/20260727040000_default_and_private_tables_dashboards.sql).
// Only shared (owner_user_id null) rows are eligible here; a private table
// can't be promoted to a default (RLS independently rejects is_default =
// true from anyone but an admin regardless -- this UI is just the matching
// admin-only surface). Dashboards get the equivalent, separate
// AdminDefaultDashboardsTab.tsx -- same list/toggle style, different table.
//
// When a team/person scope is selected (see AdminDefaultSettingsTab.tsx),
// the toggle instead adds/removes a row in company_default_scopes
// (20260729000000_scoped_default_views.sql) -- additive on top of the
// company-wide flag, never a replacement for it, so a table already
// mandatory for everyone shows locked here rather than toggleable off.
"use client";

import { useState, useEffect } from "react";
import { Loader2, Table2, Lock } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import type { DefaultScope } from "@/components/admin/AdminDefaultSettingsTab";

interface Props { companyId: string; scope: DefaultScope; }

export default function AdminDefaultTablesTab({ companyId, scope }: Props) {
  const { tables, loading: tablesLoading, refetch: refetchTables } = useCustomTables();
  const [savingId, setSavingId] = useState<string | null>(null);
  const isCompanyScope = !scope.teamId && !scope.userId;
  const [scopedIds, setScopedIds] = useState<Set<string>>(new Set());
  const [loadingScoped, setLoadingScoped] = useState(!isCompanyScope);

  const sharedTables = tables.filter(t => t.owner_user_id === null);

  useEffect(() => {
    if (isCompanyScope) { setScopedIds(new Set()); setLoadingScoped(false); return; }
    let active = true;
    (async () => {
      setLoadingScoped(true);
      let query = supabase.from('company_default_scopes').select('resource_id')
        .eq('company_id', companyId).eq('resource_type', 'table');
      query = scope.teamId ? query.eq('team_id', scope.teamId) : query.eq('user_id', scope.userId!);
      const { data } = await query;
      if (!active) return;
      setScopedIds(new Set((data || []).map((r: any) => r.resource_id)));
      setLoadingScoped(false);
    })();
    return () => { active = false; };
  }, [companyId, scope.teamId, scope.userId, isCompanyScope]);

  const toggleTableDefault = async (id: string, next: boolean) => {
    setSavingId(id);
    await supabase.from('company_tables').update({ is_default: next }).eq('id', id);
    setSavingId(null);
    refetchTables();
  };

  const toggleScopedDefault = async (id: string, next: boolean) => {
    setSavingId(id);
    if (next) {
      await supabase.from('company_default_scopes').insert({
        company_id: companyId, resource_type: 'table', resource_id: id,
        team_id: scope.teamId, user_id: scope.userId,
      });
      setScopedIds(prev => new Set(prev).add(id));
    } else {
      let del = supabase.from('company_default_scopes').delete()
        .eq('company_id', companyId).eq('resource_type', 'table').eq('resource_id', id);
      del = scope.teamId ? del.eq('team_id', scope.teamId) : del.eq('user_id', scope.userId!);
      await del;
      setScopedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
    setSavingId(null);
  };

  if (tablesLoading || loadingScoped) return <p className="text-[11px] text-slate-400">Loading...</p>;

  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Default tables</p>
      <p className="text-[11px] text-slate-400 mb-4">
        {isCompanyScope
          ? "A default table is mandatory in every member's sidebar — they can't hide or remove it, only an admin can."
          : "Adding a table here adds it to this scope's sidebar in addition to whatever's already a company-wide default."}
      </p>
      <div className="space-y-2">
        {sharedTables.map(t => {
          const Icon = (LucideIcons as any)[t.icon] || Table2;
          const isScoped = scopedIds.has(t.id);
          return (
            <div key={t.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-5 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon size={15} style={{ color: t.color }} className="shrink-0" />
                <p className="text-[12px] font-bold text-slate-700 truncate">{t.name}</p>
              </div>
              {isCompanyScope ? (
                <button
                  onClick={() => toggleTableDefault(t.id, !t.is_default)}
                  disabled={savingId === t.id}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all disabled:opacity-50 ${
                    t.is_default ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {savingId === t.id ? <Loader2 size={11} className="animate-spin" /> : t.is_default ? 'Default' : 'Make default'}
                </button>
              ) : t.is_default ? (
                <span className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-400">
                  <Lock size={10} /> Company default
                </span>
              ) : (
                <button
                  onClick={() => toggleScopedDefault(t.id, !isScoped)}
                  disabled={savingId === t.id}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all disabled:opacity-50 ${
                    isScoped ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {savingId === t.id ? <Loader2 size={11} className="animate-spin" /> : isScoped ? 'Default' : 'Make default'}
                </button>
              )}
            </div>
          );
        })}
        {sharedTables.length === 0 && (
          <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-6">No shared tables yet</p>
        )}
      </div>
    </div>
  );
}

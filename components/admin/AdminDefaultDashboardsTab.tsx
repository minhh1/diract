// components/admin/AdminDefaultDashboardsTab.tsx
// Lets an admin mark a shared custom dashboard as a company default --
// mandatory in every member's sidebar, removable only by an admin (see
// supabase/migrations/20260727040000_default_and_private_tables_dashboards.sql).
// Split out from AdminDefaultTablesTab.tsx (which now handles tables only)
// so each gets its own Admin tab -- same list/toggle style, different table.
//
// When a team/person scope is selected (see AdminDefaultSettingsTab.tsx),
// the toggle instead adds/removes a row in company_default_scopes
// (20260729000000_scoped_default_views.sql) -- additive on top of the
// company-wide flag, never a replacement for it, so a dashboard already
// mandatory for everyone shows locked here rather than toggleable off.
"use client";

import { useState, useEffect } from "react";
import { Loader2, LayoutDashboard, Lock } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCustomDashboards } from "@/lib/hooks/useCustomDashboards";
import type { DefaultScope } from "@/components/admin/AdminDefaultSettingsTab";

interface Props { companyId: string; scope: DefaultScope; }

export default function AdminDefaultDashboardsTab({ companyId, scope }: Props) {
  const { dashboards, loading: dashboardsLoading, refetch: refetchDashboards } = useCustomDashboards();
  const [savingId, setSavingId] = useState<string | null>(null);
  const isCompanyScope = !scope.teamId && !scope.userId;
  const [scopedIds, setScopedIds] = useState<Set<string>>(new Set());
  const [loadingScoped, setLoadingScoped] = useState(!isCompanyScope);

  const sharedDashboards = dashboards.filter(d => d.owner_user_id === null);

  useEffect(() => {
    if (isCompanyScope) { setScopedIds(new Set()); setLoadingScoped(false); return; }
    let active = true;
    (async () => {
      setLoadingScoped(true);
      let query = supabase.from('company_default_scopes').select('resource_id')
        .eq('company_id', companyId).eq('resource_type', 'dashboard');
      query = scope.teamId ? query.eq('team_id', scope.teamId) : query.eq('user_id', scope.userId!);
      const { data } = await query;
      if (!active) return;
      setScopedIds(new Set((data || []).map((r: any) => r.resource_id)));
      setLoadingScoped(false);
    })();
    return () => { active = false; };
  }, [companyId, scope.teamId, scope.userId, isCompanyScope]);

  const toggleDashboardDefault = async (id: string, next: boolean) => {
    setSavingId(id);
    await supabase.from('company_dashboards').update({ is_default: next }).eq('id', id);
    setSavingId(null);
    refetchDashboards();
  };

  const toggleScopedDefault = async (id: string, next: boolean) => {
    setSavingId(id);
    if (next) {
      await supabase.from('company_default_scopes').insert({
        company_id: companyId, resource_type: 'dashboard', resource_id: id,
        team_id: scope.teamId, user_id: scope.userId,
      });
      setScopedIds(prev => new Set(prev).add(id));
    } else {
      let del = supabase.from('company_default_scopes').delete()
        .eq('company_id', companyId).eq('resource_type', 'dashboard').eq('resource_id', id);
      del = scope.teamId ? del.eq('team_id', scope.teamId) : del.eq('user_id', scope.userId!);
      await del;
      setScopedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
    setSavingId(null);
  };

  if (dashboardsLoading || loadingScoped) return <p className="text-[11px] text-slate-400">Loading...</p>;

  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Default dashboards</p>
      <p className="text-[11px] text-slate-400 mb-4">
        {isCompanyScope
          ? "A default dashboard is mandatory in every member's sidebar, only an admin can remove it."
          : "Adding a dashboard here adds it to this scope's sidebar in addition to whatever's already a company-wide default."}
      </p>
      <div className="space-y-2">
        {sharedDashboards.map(d => {
          const Icon = (LucideIcons as any)[d.icon] || LayoutDashboard;
          const isScoped = scopedIds.has(d.id);
          return (
            <div key={d.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-5 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon size={15} style={{ color: d.color }} className="shrink-0" />
                <p className="text-[12px] font-bold text-slate-700 truncate">{d.name}</p>
              </div>
              {isCompanyScope ? (
                <button
                  onClick={() => toggleDashboardDefault(d.id, !d.is_default)}
                  disabled={savingId === d.id}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all disabled:opacity-50 ${
                    d.is_default ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {savingId === d.id ? <Loader2 size={11} className="animate-spin" /> : d.is_default ? 'Default' : 'Make default'}
                </button>
              ) : d.is_default ? (
                <span className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-400">
                  <Lock size={10} /> Company default
                </span>
              ) : (
                <button
                  onClick={() => toggleScopedDefault(d.id, !isScoped)}
                  disabled={savingId === d.id}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all disabled:opacity-50 ${
                    isScoped ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {savingId === d.id ? <Loader2 size={11} className="animate-spin" /> : isScoped ? 'Default' : 'Make default'}
                </button>
              )}
            </div>
          );
        })}
        {sharedDashboards.length === 0 && (
          <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-6">No shared dashboards yet</p>
        )}
      </div>
    </div>
  );
}

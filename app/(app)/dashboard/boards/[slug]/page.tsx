"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import * as LucideIcons from "lucide-react";
import { Settings, LayoutDashboard, Lock } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import { useCompany } from "@/components/CompanyContext";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { supabase } from "@/lib/supabase";
import StaticWidgetGrid from "@/components/dashboard/builder/StaticWidgetGrid";
import DashboardWidgetRenderer from "@/components/dashboard/DashboardWidgetRenderer";

export default function DashboardViewPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { companyId, userId, isAdmin } = useCompany();
  const {
    dashboard, sourceKind, tableDef, fields, fieldById, records, allRecords, loading, filters, setFilter, refetch, updateWidget,
  } = useDashboardData(slug);

  // A dashboard with restricted_to_team_id set (see AdminTeamsTab.tsx's
  // Administration Team / the Irregularities dashboard) is only visible to
  // company_admin + that team's leader -- checked here, app-side, same as
  // every other role-gated page in this app (billing, admin) rather than
  // via RLS (company_dashboards' RLS stays company-wide).
  const [teamLeaderId, setTeamLeaderId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const teamId = dashboard?.restricted_to_team_id;
    if (!teamId) { setTeamLeaderId(null); return; }
    setTeamLeaderId(undefined);
    supabase.from('teams').select('leader_id').eq('id', teamId).maybeSingle()
      .then(({ data }) => setTeamLeaderId(data?.leader_id ?? null));
  }, [dashboard?.restricted_to_team_id]);

  useProgressBarWhile(loading || !companyId || !userId);

  if (loading || !companyId || !userId) {
    return null;
  }
  if (!dashboard) {
    return <p className="text-center text-[12px] text-slate-400 py-20">Dashboard not found</p>;
  }

  if (dashboard.restricted_to_team_id && !isAdmin && teamLeaderId !== userId) {
    if (teamLeaderId === undefined) return null; // still resolving
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Lock size={20} className="text-slate-300" />
        <p className="text-[12px] text-slate-400">This dashboard is restricted to the team leader and company admins.</p>
      </div>
    );
  }

  const Icon = (LucideIcons as any)[dashboard.icon] || LayoutDashboard;

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${dashboard.color}20` }}>
            <Icon size={18} style={{ color: dashboard.color }} />
          </div>
          <h1 className="text-xl font-light uppercase tracking-tight text-slate-900">{dashboard.name}</h1>
        </div>
        {isAdmin && (
          <Link
            href={`/dashboard/boards/${slug}/builder`}
            className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all"
          >
            <Settings size={13} /> Edit
          </Link>
        )}
      </div>

      <StaticWidgetGrid widgets={dashboard.widgets}>
        {(w) => (
          <DashboardWidgetRenderer
            widget={w}
            fields={fields}
            fieldById={fieldById}
            records={records}
            allRecords={allRecords}
            tableId={dashboard.source_table_id ?? dashboard.source_table_type}
            sourceKind={sourceKind}
            companyId={companyId}
            userId={userId}
            filters={filters}
            setFilter={setFilter}
            onChanged={refetch}
            mode="view"
            isLedger={tableDef?.is_ledger}
            isAdmin={isAdmin}
            onWidgetChange={updateWidget}
          />
        )}
      </StaticWidgetGrid>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as LucideIcons from "lucide-react";
import { Settings, LayoutDashboard, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import { useCompany } from "@/components/CompanyContext";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { invalidateCustomDashboards } from "@/lib/hooks/useCustomDashboards";
import { supabase } from "@/lib/supabase";
import { logSchemaChange } from "@/lib/services/schemaChangeLog";
import { perfLog, perfLogPageStart, perfLogPageReady } from "@/lib/perfLog";
import StaticWidgetGrid from "@/components/dashboard/builder/StaticWidgetGrid";
import DashboardWidgetRenderer from "@/components/dashboard/DashboardWidgetRenderer";
import ResourcePermissionsPanel from "@/components/ResourcePermissionsPanel";

export default function DashboardViewPage({ slug }: { slug: string }) {
  const router = useRouter();
  const { companyId, userId, isAdmin } = useCompany();
  // Resource-level role from resource_permissions -- see
  // supabase/migrations/20260801400000_resource_permissions.sql. A
  // non-admin editor/admin on this specific dashboard now legitimately has
  // RLS write access to it (previously only owner/company-admin could edit
  // a shared dashboard at all), so the Edit link below needs to reflect
  // that instead of staying hard-gated to isAdmin.
  const [myDashboardRole, setMyDashboardRole] = useState<"admin" | "editor" | "viewer" | null>(null);
  const {
    dashboard, sourceKind, tableDef, fields, fieldById, records, chartRecords, allRecords, loading, recordsLoading, filters, setFilter,
    canSeeMultipleScope, viewDefaultFieldIds, setViewDefault, clearViewDefault,
    quickAddPrefill, setQuickAddPrefill, refetch, addRecordOptimistic, updateWidget,
  } = useDashboardData(slug);

  const isPageLoading = loading || !companyId || !userId;
  // Tracks this URL's own start->ready boundary for Admin > Performance --
  // keyed by slug (not just mount) so navigating client-side from one
  // dashboard to another, which reuses this same component instance rather
  // than remounting it, still gets logged as its own page load. "ready"
  // now means the SHELL is visible (fields loaded -- see useCustomTable.ts),
  // not that every widget has real data yet; recordsReady below is the
  // separate, later mark for that, so Admin > Performance can show both.
  const perfStartedForRef = useRef<string | null>(null);
  const perfReadyForRef = useRef<string | null>(null);
  const perfRecordsReadyForRef = useRef<string | null>(null);
  useEffect(() => {
    if (perfStartedForRef.current !== slug) {
      perfStartedForRef.current = slug;
      perfLogPageStart("dashboard", slug);
    }
  }, [slug]);
  useEffect(() => {
    if (!isPageLoading && perfReadyForRef.current !== slug) {
      perfReadyForRef.current = slug;
      perfLogPageReady("dashboard", slug);
    }
  }, [isPageLoading, slug]);
  useEffect(() => {
    if (!isPageLoading && !recordsLoading && perfRecordsReadyForRef.current !== slug) {
      perfRecordsReadyForRef.current = slug;
      perfLog(`PAGE dashboard(${slug}): records ready`);
    }
  }, [isPageLoading, recordsLoading, slug]);

  // Fullscreen = the whole dashboard (every widget), not any single one --
  // covers the persistent Sidebar too (fixed + a high z-index, rather than
  // anything Sidebar/layout.tsx need to know about) and drops the max-w-6xl
  // cap so widgets actually get to use the extra width. Esc exits, same as
  // the platform convention for the real Fullscreen API even though this
  // is a CSS-only "maximize within the page" rather than that API.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  useEffect(() => {
    if (!dashboard?.id || !userId || isAdmin) return;
    let cancelled = false;
    // Deferred a tick so the null-reset case below doesn't setState
    // synchronously within the effect body itself.
    const timer = setTimeout(() => {
      supabase.from("resource_permissions")
        .select("role").eq("resource_type", "dashboard").eq("resource_id", dashboard.id).eq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => { if (!cancelled) setMyDashboardRole(data?.role ?? null); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [dashboard?.id, userId, isAdmin]);

  useProgressBarWhile(isPageLoading);

  if (isPageLoading) {
    return null;
  }
  if (!dashboard) {
    return <p className="text-center text-[12px] text-slate-400 py-20">Dashboard not found</p>;
  }

  const Icon = (LucideIcons as any)[dashboard.icon] || LayoutDashboard;

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${dashboard.name}"? This moves it to Trash and can be restored later.`)) return;
    await supabase.from('company_dashboards').update({ deleted_at: new Date().toISOString() }).eq('id', dashboard.id);
    logSchemaChange({ companyId, actorId: userId, entityType: 'company_dashboard', entityId: dashboard.id, entityLabel: dashboard.name, action: 'delete', before: dashboard });
    invalidateCustomDashboards();
    router.push('/dashboard/properties');
  };

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-slate-50 overflow-y-auto" : ""}>
      <div className={fullscreen ? "p-8 space-y-4" : "max-w-6xl mx-auto p-8 space-y-4"}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${dashboard.color}20` }}>
              <Icon size={18} style={{ color: dashboard.color }} />
            </div>
            <h1 className="text-xl font-light uppercase tracking-tight text-slate-900">{dashboard.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFullscreen(p => !p)}
              title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all"
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            {companyId && (
              <ResourcePermissionsPanel
                resourceType="dashboard"
                resourceId={dashboard.id}
                resourceName={dashboard.name}
                companyId={companyId}
              />
            )}
            {(isAdmin || myDashboardRole === "editor" || myDashboardRole === "admin") && (
              <Link
                href={`/dashboard/${slug}/builder`}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all"
              >
                <Settings size={13} /> Edit
              </Link>
            )}
            {(isAdmin || myDashboardRole === "admin") && (
              <button
                onClick={handleDelete}
                title="Delete dashboard"
                aria-label="Delete dashboard"
                className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>

        <StaticWidgetGrid widgets={dashboard.widgets}>
          {(w) => (
            <DashboardWidgetRenderer
              widget={w}
              fields={fields}
              fieldById={fieldById}
              records={records}
              recordsLoading={recordsLoading}
              chartRecords={chartRecords}
              allRecords={allRecords}
              tableId={dashboard.source_table_id ?? dashboard.source_table_type}
              primaryFieldKey={tableDef?.primary_field_key}
              sourceKind={sourceKind}
              companyId={companyId}
              userId={userId}
              filters={filters}
              setFilter={setFilter}
              canSeeMultipleScope={canSeeMultipleScope}
              viewDefaultFieldIds={viewDefaultFieldIds}
              onSetViewDefault={setViewDefault}
              onClearViewDefault={clearViewDefault}
              quickAddPrefill={quickAddPrefill}
              onQuickAddPrefill={setQuickAddPrefill}
              onChanged={refetch}
              onOptimisticAdd={addRecordOptimistic}
              mode="view"
              isLedger={tableDef?.is_ledger}
              isAdmin={isAdmin}
              onWidgetChange={updateWidget}
            />
          )}
        </StaticWidgetGrid>
      </div>
    </div>
  );
}

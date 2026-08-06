"use client";

// Quick Glance -- the landing page for companies whose type has a widget
// set built for it (see the redirects into /dashboard/quick-glance: proxy.ts,
// app/auth/callback/route.ts, app/(marketing)/login/page.tsx, and
// Sidebar.tsx's company-switch handler). A customizable, drag/resize canvas
// (see lib/dashboardWidgets/quickGlanceTypes.ts, QuickGlanceCanvas.tsx) --
// company-wide, any member can add/move/resize/delete widgets, persisted to
// company_quick_glance_layout (RLS: any company member, unlike companies'
// own admin-only update policy -- see that migration's header comment for
// why this needed a dedicated table). A company with no row yet (created
// after that migration ran) gets one lazily seeded here with the same
// default arrangement the migration backfilled for existing companies (see
// lib/dashboardWidgets/defaultQuickGlanceLayout.ts).
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, Pencil, Check, X } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import { supabase } from "@/lib/supabase";
import { defaultQuickGlanceWidgets } from "@/lib/dashboardWidgets/defaultQuickGlanceLayout";
import type { QuickGlanceWidget } from "@/lib/dashboardWidgets/quickGlanceTypes";
import WelcomeOnboarding from "./quickGlance/WelcomeOnboarding";

const QuickGlanceCanvas = dynamic(() => import("./quickGlance/QuickGlanceCanvas"));

const KNOWN_TYPES = ['Law Firm', 'Property Developer'];

export default function QuickGlanceDashboard() {
  const { companyId, companyType, userId, loading: companyLoading } = useCompany();
  const router = useRouter();
  const { tables, loading: tablesLoading, refetch: refetchTables } = useCustomTables(userId);
  const isKnownType = !!companyType && KNOWN_TYPES.includes(companyType);
  // A templateless company (companyType never got set -- true for every
  // brand-new self-signup, see register_company_and_profile) keeps landing
  // on the onboarding assistant even after it has AI-built tables -- those
  // tables came from chatting with this same assistant, and the expectation
  // is they'll keep coming back to it to adjust the schema to fit their
  // workflow (add a field, add another table, ...), not get redirected away
  // the moment the first one exists. Only a genuine marketplace template
  // install (is_from_template -- see install_company_template, locked from
  // further AI/manual edits by supabase/migrations/20260803030000_lock_
  // template_schema.sql) means the company is "done" onboarding and should
  // land on its real first table instead, same as the old hardcoded
  // /dashboard/properties redirect intended (which was hidden by default
  // for exactly this kind of company -- see supabase/migrations/
  // 20260805070000_hide_system_tables_for_templateless_companies.sql -- and
  // was a dead-end "Properties has been deleted" screen regardless of
  // whether anything had been built).
  const hasAnyTables = tables.length > 0;
  const hasTemplateTable = tables.some(t => t.is_from_template);

  const [widgets, setWidgets] = useState<QuickGlanceWidget[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuickGlanceWidget[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || !companyType) return;
    const { data } = await supabase.from('company_quick_glance_layout').select('widgets').eq('company_id', companyId).maybeSingle();
    if (data) {
      setWidgets(data.widgets || []);
      return;
    }
    // No row yet -- seed one with the default arrangement for this
    // company type (mirrors the migration's own backfill).
    const timeFeeEntries = tables.find(t => t.slug === 'time-fee-entries');
    const seeded = defaultQuickGlanceWidgets(companyType, timeFeeEntries?.id || null);
    await supabase.from('company_quick_glance_layout').upsert({ company_id: companyId, widgets: seeded });
    setWidgets(seeded);
  }, [companyId, companyType, tables]);

  useEffect(() => {
    if (!companyLoading && !tablesLoading && isKnownType) load();
  }, [load, companyLoading, tablesLoading, isKnownType]);

  // Decided once, the first time loading finishes, not reactively on every
  // change to `tables` -- WelcomeOnboarding's embedded assistant can build
  // several tables/dashboards across one conversation, and refetching mid-
  // chat (see its onBuildProgress prop below) would otherwise yank the user
  // away the instant a marketplace template got installed mid-chat, cutting
  // a multi-step build short (in practice the assistant itself never
  // installs a template -- only the Marketplace page does -- but the same
  // "decide once" guard still protects against that changing later). A
  // fresh visit to this page (a real remount) still redirects correctly
  // once there's a template installed to redirect to.
  // null = not decided yet, true = started with no template installed (keep
  // showing onboarding for the rest of this mount even after AI-built
  // tables exist -- see hasTemplateTable above), false = already had a
  // template at first load (redirecting away now).
  const [startedEmpty, setStartedEmpty] = useState<boolean | null>(null);
  const redirectDecidedRef = useRef(false);
  useEffect(() => {
    if (companyLoading || tablesLoading || redirectDecidedRef.current) return;
    redirectDecidedRef.current = true;
    if (isKnownType) return;
    setStartedEmpty(!hasTemplateTable);
    if (hasTemplateTable) router.replace(`/dashboard/${tables[0].slug}`);
  }, [companyLoading, tablesLoading, isKnownType, hasTemplateTable, tables, router]);

  const hasLawFirmTemplate = tables.some(t => t.slug === 'trust-accounts');
  const hasPropertyDeveloperTemplate = tables.some(t => t.slug === 'finance-model-loans');

  const startEditing = () => {
    setDraft(widgets || []);
    setEditing(true);
  };

  const discardEditing = () => setEditing(false);

  const saveEditing = async () => {
    if (!companyId) return;
    setSaving(true);
    await supabase.from('company_quick_glance_layout').update({ widgets: draft, updated_at: new Date().toISOString() }).eq('company_id', companyId);
    setSaving(false);
    setWidgets(draft);
    setEditing(false);
  };

  if (companyLoading || tablesLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#F9FAFB]">
        <Loader2 size={20} className="animate-spin text-slate-300" />
      </div>
    );
  }

  if (!isKnownType) {
    // startedEmpty === false means this company already had a marketplace
    // template installed the first time this page loaded -- the redirect
    // effect above is sending it to its first table right now, so just show
    // the spinner. startedEmpty === true means no template is installed yet
    // (even if it already has AI-built tables); keep the onboarding
    // assistant up for the rest of this visit so it stays the landing page
    // for adjusting the schema to fit their workflow, offering a manual
    // link to move on once there's somewhere real to go instead of forcing
    // a redirect.
    if (startedEmpty !== true) {
      return (
        <div className="flex flex-col h-screen items-center justify-center bg-[#F9FAFB]">
          <Loader2 size={20} className="animate-spin text-slate-300" />
        </div>
      );
    }
    return (
      <WelcomeOnboarding
        onBuildProgress={refetchTables}
        firstTableHref={hasAnyTables ? `/dashboard/${tables[0].slug}` : null}
      />
    );
  }

  if (widgets === null) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#F9FAFB]">
        <Loader2 size={20} className="animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white border-b border-slate-100 shrink-0">
        <div className="pt-16 md:pt-8 px-8 pb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-light uppercase tracking-tight text-slate-900">
            Quick Glance
          </h1>
          {editing ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={saveEditing}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save layout
              </button>
              <button
                onClick={discardEditing}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                <X size={12} /> Discard
              </button>
            </div>
          ) : (
            <button
              onClick={startEditing}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-200 transition-all shrink-0"
            >
              <Pencil size={12} /> Edit layout
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-8">
        <QuickGlanceCanvas
          widgets={editing ? draft : widgets}
          onChange={editing ? setDraft : () => {}}
          editable={editing}
          hasLawFirmTemplate={hasLawFirmTemplate}
          hasPropertyDeveloperTemplate={hasPropertyDeveloperTemplate}
        />
      </main>
    </div>
  );
}

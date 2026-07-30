"use client";

// Dashboard builder: pick a source custom table, then build the dashboard's
// widgets either visually (Canvas, drag/resize via react-grid-layout) or as
// text (Code, a small line-based DSL) -- both authoring modes read/write the
// same canonical `widgets` array, so switching between them never loses
// work. slugParam === 'new' creates a fresh company_dashboards row; any other
// slug edits that dashboard. See lib/hooks/useDashboardData.ts for how a
// saved dashboard's widgets get rendered on the view page.
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, LayoutGrid, Code2, LayoutDashboard, Table2, Share2, Check } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import { supabase } from "@/lib/supabase";
import { clearShellCache } from "@/lib/shellCache";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { useSystemTableAsCustomTable, SYSTEM_TABLE_NAMES, type SystemTableName } from "@/lib/hooks/useSystemTableAsCustomTable";
import { dashboardShellKey, type DashboardSourceKind } from "@/lib/hooks/useDashboardData";
import { invalidateCustomDashboards } from "@/lib/hooks/useCustomDashboards";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";
import { logSchemaChange } from "@/lib/services/schemaChangeLog";
import { ensureDashboardWidgetsMigrated, type RawCompanyDashboardRow } from "@/lib/dashboardWidgets/ensureMigrated";
import { serializeToDSL, type DslParseError } from "@/lib/dashboardWidgets/dsl";
import type { DashboardWidget } from "@/lib/dashboardWidgets/types";
import CanvasEditor from "@/components/dashboard/builder/CanvasEditor";
import CodeEditor from "@/components/dashboard/builder/CodeEditor";

const ICON_OPTIONS = ['LayoutDashboard', 'Clock', 'Receipt', 'BarChart2', 'Table2', 'Briefcase'];
const COLOR_OPTIONS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];

// A dashboard is either bound to a real table ('data', the original/default
// kind -- Source table picker below) or holds only table-independent link
// widgets ('public_pages' -- public_task_page/public_document_page, see
// AddWidgetMenu's filtering for them). A distinct top-level choice, not an
// option buried inside the Source table <select>, so switching to it reads
// as "this dashboard has no table" rather than looking like just another
// table to pick.
type DashboardKind = 'data' | 'public_pages';

// The builder's Canvas/Code previews render through the exact same
// DashboardWidgetRenderer the live view page uses -- if it were handed the
// real fetched `records`, a grid widget would render every real row (a
// 1000-entry table renders 1000 rows just to preview a column layout) and
// summary tiles/charts would show real, possibly sensitive, aggregate
// figures (e.g. billable amounts) to whoever is editing the dashboard's
// structure, not just its owner. A stable empty array -- not the real
// `records` state -- means every widget preview renders its own already-
// established "no data" look (grid: "No entries yet"; summary tile: 0;
// chart: empty). Module-level so it's the same reference across renders,
// not a fresh [] literal each time that would otherwise cascade into
// needless re-renders downstream.
const EMPTY_PREVIEW_RECORDS: CustomTableRecord[] = [];

// Default plural labels for the 3 system tables, overridden per company by
// companies.table_label_overrides (see components/CustomTableBuilder.tsx's
// identical DEFAULT_LABELS) -- e.g. a law firm sees "Matters" here instead
// of "Projects".
const DEFAULT_SYSTEM_TABLE_LABELS: Record<SystemTableName, string> = {
  projects: 'Projects', properties: 'Properties', entities: 'Entities',
};

export default function DashboardBuilderPage({ slugParam }: { slugParam: string }) {
  const router = useRouter();
  const isNew = slugParam === 'new';
  const { companyId, userId, isAdmin, loading: companyLoading, tableLabelOverrides } = useCompany();
  const { tables } = useCustomTables(userId);

  const [loading, setLoading] = useState(!isNew);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [before, setBefore] = useState<any>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('LayoutDashboard');
  const [color, setColor] = useState('#6366f1');
  const [dashboardKind, setDashboardKind] = useState<DashboardKind>('data');
  // Either a company_tables.id (custom table) or a system table name
  // ('projects'/'properties'/'entities') -- one flat picker, no visual
  // distinction between the two kinds of table (see the <select> below).
  // Only meaningful when dashboardKind === 'data'.
  const [sourceTableKey, setSourceTableKey] = useState('');
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [codeSource, setCodeSource] = useState('');
  const [codeWidgets, setCodeWidgets] = useState<DashboardWidget[]>([]);
  const [codeErrors, setCodeErrors] = useState<DslParseError[]>([]);
  const [builderMode, setBuilderMode] = useState<'canvas' | 'code'>('canvas');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // null = shared/company-wide, a user id = private to that user (see
  // supabase/migrations/20260727040000_default_and_private_tables_dashboards.sql).
  // Only meaningful once an existing dashboard has loaded -- a brand new one
  // hasn't been assigned an owner yet (see handleSave's isNew branch for
  // what it becomes on creation).
  const [existingOwnerUserId, setExistingOwnerUserId] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  // null = visible to every company member (the default, same as every
  // dashboard before this existed) -- a team id restricts the sidebar entry
  // and the view page itself to that team's members plus admins (see
  // app/dashboard/boards/[slug]/page.tsx and useCustomDashboards.ts's
  // isVisibleRestrictedDashboard). App-level gate only, not RLS -- matches
  // how billing/admin pages already gate in this app (see the migration
  // that added this column).
  const [restrictedToTeamId, setRestrictedToTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<{ id: string; team_name: string }[]>([]);

  const isNoneSource = dashboardKind === 'public_pages';
  const isSystemSource = !isNoneSource && (SYSTEM_TABLE_NAMES as readonly string[]).includes(sourceTableKey);
  const sourceKind: DashboardSourceKind = isNoneSource ? 'none' : isSystemSource ? (sourceTableKey as SystemTableName) : 'custom';
  const sourceTableSlug = useMemo(
    () => (isSystemSource || isNoneSource ? null : tables.find(t => t.id === sourceTableKey)?.slug || null),
    [tables, sourceTableKey, isSystemSource, isNoneSource]
  );

  // Both hooks are always called (Rules of Hooks) -- each tolerates a null
  // table identifier by no-op'ing, and only the one matching sourceKind ever
  // has real data. Mirrors lib/hooks/useDashboardData.ts's identical pattern.
  const customTableResult = useCustomTable(sourceTableSlug);
  const systemTableResult = useSystemTableAsCustomTable(
    isSystemSource ? (sourceTableKey as SystemTableName) : null,
    companyId,
    isSystemSource ? (tableLabelOverrides[sourceTableKey]?.plural || DEFAULT_SYSTEM_TABLE_LABELS[sourceTableKey as SystemTableName]) : undefined,
  );
  // Only `fields` (the schema) is used here -- the builder's Canvas/Code
  // previews deliberately never see real row data; see EMPTY_PREVIEW_RECORDS.
  const { fields } = isSystemSource ? systemTableResult : customTableResult;
  const fieldById = useMemo(() => new Map(fields.map(f => [f.id, f])), [fields]);

  useEffect(() => {
    if (!isAdmin || !companyId) return;
    supabase.from('teams').select('id, team_name').eq('company_id', companyId).eq('is_active', true).order('team_name')
      .then(({ data }) => setTeams(data || []));
  }, [isAdmin, companyId]);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data } = await supabase.from('company_dashboards').select('*').eq('slug', slugParam).maybeSingle();
      if (data) {
        let row = data as RawCompanyDashboardRow & {
          name: string; icon: string; color: string;
          source_table_id: string | null; source_table_type: DashboardSourceKind;
          code_source: string | null; builder_mode: 'canvas' | 'code';
          owner_user_id: string | null; is_default: boolean; restricted_to_team_id: string | null;
        };
        if (!row.widgets_migrated_at) {
          const migrated = await ensureDashboardWidgetsMigrated(row);
          row = { ...row, widgets: migrated, widgets_migrated_at: new Date().toISOString() };
        }
        setDashboardId(row.id);
        setBefore(row);
        setName(row.name);
        setIcon(row.icon);
        setColor(row.color);
        if (row.source_table_type === 'none') {
          setDashboardKind('public_pages');
          setSourceTableKey('');
        } else {
          setDashboardKind('data');
          setSourceTableKey(row.source_table_type === 'custom' ? (row.source_table_id || '') : row.source_table_type);
        }
        setWidgets(row.widgets || []);
        setCodeSource(row.code_source || '');
        setBuilderMode(row.builder_mode || 'canvas');
        setExistingOwnerUserId(row.owner_user_id ?? null);
        setIsDefault(!!row.is_default);
        setRestrictedToTeamId(row.restricted_to_team_id ?? null);
      }
      setLoading(false);
    })();
  }, [isNew, slugParam]);

  useProgressBarWhile(loading);

  const handleSourceTableChange = (key: string) => {
    setSourceTableKey(key);
    setWidgets([]);
    setCodeSource('');
  };

  const handleDashboardKindChange = (kind: DashboardKind) => {
    if (kind === dashboardKind) return;
    setDashboardKind(kind);
    setSourceTableKey('');
    setWidgets([]);
    setCodeSource('');
  };

  const switchMode = (mode: 'canvas' | 'code') => {
    if (mode === builderMode) return;
    if (mode === 'code') {
      setCodeSource(serializeToDSL(widgets, fields));
      setBuilderMode('code');
      return;
    }
    // code -> canvas
    if (codeErrors.length > 0) {
      alert('Fix the errors in your code before switching to Canvas mode.');
      return;
    }
    setWidgets(codeWidgets);
    setBuilderMode('canvas');
  };

  const handleSave = async () => {
    if (!name.trim() || (!isNoneSource && !sourceTableKey) || !companyId) return;
    if (builderMode === 'code' && codeErrors.length > 0) return;
    setSaving(true);
    setError('');

    const finalWidgets = builderMode === 'code' ? codeWidgets : widgets;
    const payload = {
      company_id: companyId,
      name: name.trim(),
      icon,
      color,
      source_table_type: sourceKind,
      source_table_id: (isSystemSource || isNoneSource) ? null : sourceTableKey,
      widgets: finalWidgets,
      code_source: builderMode === 'code' ? codeSource : serializeToDSL(finalWidgets, fields),
      builder_mode: builderMode,
      // Only an admin can ever end up true here -- the checkbox itself is
      // only rendered for an admin (see the JSX below), and RLS's own
      // WITH CHECK independently rejects is_default = true from anyone else.
      is_default: isAdmin && isDefault,
      // Only an admin can change this (picker is admin-only, see the JSX
      // below) -- not RLS-enforced like is_default, since this column gates
      // at the app level, not via RLS (see the migration that added it).
      // undefined (not false/null) for a non-admin so the key is dropped
      // from the JSON body entirely, leaving any existing value untouched.
      restricted_to_team_id: isAdmin ? restrictedToTeamId : undefined,
    };

    if (isNew) {
      const slug = `${name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-')}-${Date.now().toString(36)}`;
      // A brand-new dashboard is never a legacy pre-widgets row -- mark it
      // migrated immediately so ensureDashboardWidgetsMigrated (which treats
      // widgets_migrated_at IS NULL as "convert from the empty legacy
      // columns") never overwrites these real, just-built widgets with an
      // empty array the first time the dashboard is opened. Also covered by
      // the column's DB default (see
      // supabase/company_dashboards_widgets_default_fix.sql) -- set
      // explicitly here too for clarity at the call site.
      //
      // owner_user_id: a non-admin's new dashboard is always private (RLS's
      // own insert policy enforces this regardless -- a non-admin can only
      // insert with owner_user_id = themselves); an admin's stays shared,
      // same as every dashboard created before this feature existed, unless
      // they've also ticked "Set as company default" below.
      const { data, error: err } = await supabase.from('company_dashboards').insert({
        ...payload, slug, widgets_migrated_at: new Date().toISOString(),
        owner_user_id: isAdmin ? null : userId,
      }).select().single();
      setSaving(false);
      if (err) { setError(err.message); return; }
      if (data) {
        logSchemaChange({ companyId, actorId: userId, entityType: 'company_dashboard', entityId: data.id, entityLabel: data.name, action: 'create', after: data });
        invalidateCustomDashboards();
        router.push(`/dashboard/${data.slug}`);
      }
      return;
    }

    const { data, error: err } = await supabase.from('company_dashboards').update(payload).eq('id', dashboardId).select().single();
    setSaving(false);
    if (err) { setError(err.message); return; }
    if (data && before) {
      logSchemaChange({ companyId, actorId: userId, entityType: 'company_dashboard', entityId: dashboardId!, entityLabel: data.name, action: 'update', before, after: data });
      // useDashboardData.ts now trusts a cache hit for up to
      // DASHBOARD_CONFIG_TTL_MS with no live re-check at all -- without
      // this, the view page could show this edit's pre-save state for up
      // to 5 minutes if it was visited recently enough to still be warm.
      clearShellCache(dashboardShellKey(companyId, data.slug));
      // Sidebar's list (name/icon/colour/order) can also change here --
      // see useCustomDashboards.ts's invalidateCustomDashboards doc comment.
      invalidateCustomDashboards();
      router.push(`/dashboard/${data.slug}`);
    }
  };

  // Every edit here (name/icon/colour/widgets/code) only ever lives in this
  // component's own state until handleSave actually writes it -- so
  // "discard" is just "leave without calling handleSave", not an undo of
  // anything already persisted. Existing only-way-out was the browser's own
  // back button, which works but isn't discoverable as "cancel this edit"
  // the way an explicit button is. Confirms first since there's no undo for
  // a discard itself (unlike handleDelete's, which moves to Trash).
  const handleDiscard = () => {
    if (!window.confirm('Discard your unsaved changes to this dashboard?')) return;
    router.push(isNew ? '/dashboard/properties' : `/dashboard/${slugParam}`);
  };

  const handleDelete = async () => {
    if (!dashboardId || !companyId || !before) return;
    if (!window.confirm(`Delete "${name}"? This moves it to Trash and can be restored later.`)) return;
    await supabase.from('company_dashboards').update({ deleted_at: new Date().toISOString() }).eq('id', dashboardId);
    logSchemaChange({ companyId, actorId: userId, entityType: 'company_dashboard', entityId: dashboardId, entityLabel: name, action: 'delete', before });
    invalidateCustomDashboards();
    router.push('/dashboard/properties');
  };

  if (loading || companyLoading) {
    return null;
  }
  // A brand-new dashboard is open to any user (their own ends up private,
  // see handleSave); an existing one is editable by an admin or whoever
  // privately owns it -- matches RLS's own update/delete policies exactly
  // (supabase/migrations/20260727040000_default_and_private_tables_dashboards.sql),
  // this is just the matching UI gate.
  const isOwner = !!userId && existingOwnerUserId === userId;
  if (!isNew && !isAdmin && !isOwner) {
    return <p className="text-center text-[12px] text-slate-400 py-20">Only the owner or a company admin can edit this dashboard.</p>;
  }

  const canSave = !saving && !!name.trim() && (isNoneSource || !!sourceTableKey) && !(builderMode === 'code' && codeErrors.length > 0);
  // The default toggle only makes sense for a shared dashboard an admin can
  // actually mark mandatory-for-everyone -- a brand new one (about to become
  // shared, since admin's creation defaults to shared) or an existing shared
  // one. Never shown for a private dashboard (is_default would always be
  // rejected by RLS for one anyway).
  const canShowDefaultToggle = isAdmin && (isNew || existingOwnerUserId === null);

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-light uppercase tracking-tight text-slate-900">
        {isNew ? 'New dashboard' : `Edit "${name}"`}
      </h1>

      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Time Entry" className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100" />
        </div>
        {canShowDefaultToggle && (
          <button
            type="button"
            onClick={() => setIsDefault(p => !p)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all text-left"
          >
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
              isDefault ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
            }`}>
              {isDefault && <Check size={11} className="text-white" strokeWidth={3} />}
            </div>
            <span className="text-[12px] font-medium text-slate-600">
              Set as company default -- mandatory in every member's sidebar, only an admin can remove it
            </span>
          </button>
        )}
        {isAdmin && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Visible to</label>
            <select
              value={restrictedToTeamId || ''}
              onChange={e => setRestrictedToTeamId(e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none appearance-none"
            >
              <option value="">Everyone in the company</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.team_name}&apos;s leader only</option>)}
            </select>
            {restrictedToTeamId && (
              <p className="text-[10px] text-slate-400 mt-1 px-1">Only that team&apos;s leader and company admins can see this dashboard — not the whole team. Change the leader in Admin → Teams.</p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Icon</label>
            <div className="flex gap-1.5 pt-1.5">
              {ICON_OPTIONS.map(i => {
                const Icon = (LucideIcons as any)[i] || LayoutDashboard;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    title={i}
                    className={`w-9 h-9 flex items-center justify-center rounded-full border transition-all ${
                      icon === i ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Colour</label>
            <div className="flex gap-1.5 pt-1.5">
              {COLOR_OPTIONS.map(c => (
                <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full ${color === c ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Dashboard type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleDashboardKindChange('data')}
              disabled={!isNew && !!dashboardId}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-[11px] font-bold border transition-all disabled:opacity-60 ${
                dashboardKind === 'data' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Table2 size={13} /> Data
            </button>
            <button
              type="button"
              onClick={() => handleDashboardKindChange('public_pages')}
              disabled={!isNew && !!dashboardId}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-[11px] font-bold border transition-all disabled:opacity-60 ${
                dashboardKind === 'public_pages' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Share2 size={13} /> Public pages
            </button>
          </div>
          {!isNew && <p className="text-[10px] text-slate-400 mt-1 px-1">Can&apos;t be changed after creation — delete and recreate to switch.</p>}
        </div>

        {dashboardKind === 'data' ? (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Source table</label>
            <select
              value={sourceTableKey}
              onChange={e => handleSourceTableChange(e.target.value)}
              disabled={!isNew && !!dashboardId}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none appearance-none disabled:opacity-60"
            >
              <option value="">Select a table...</option>
              {SYSTEM_TABLE_NAMES.map(t => (
                <option key={t} value={t}>{tableLabelOverrides[t]?.plural || DEFAULT_SYSTEM_TABLE_LABELS[t]}</option>
              ))}
              {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {!isNew && <p className="text-[10px] text-slate-400 mt-1 px-1">Can&apos;t be changed after creation — delete and recreate to switch tables.</p>}
          </div>
        ) : (
          <p className="text-[10px] text-slate-400 px-1">No table needed — add Public task page / Public document page widgets below to link to pages you've already created.</p>
        )}
      </div>

      {(isNoneSource || sourceTableKey) && companyId && userId && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-full w-fit">
            <button
              onClick={() => switchMode('canvas')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold transition-all ${builderMode === 'canvas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
            >
              <LayoutGrid size={13} /> Canvas
            </button>
            <button
              onClick={() => switchMode('code')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold transition-all ${builderMode === 'code' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
            >
              <Code2 size={13} /> Code
            </button>
          </div>

          {builderMode === 'canvas' ? (
            <CanvasEditor
              widgets={widgets}
              onChange={setWidgets}
              fields={fields}
              fieldById={fieldById}
              records={EMPTY_PREVIEW_RECORDS}
              tableId={sourceTableKey}
              sourceKind={sourceKind}
              companyId={companyId}
              userId={userId}
            />
          ) : (
            <CodeEditor
              source={codeSource}
              onSourceChange={setCodeSource}
              onWidgetsChange={setCodeWidgets}
              onErrorsChange={setCodeErrors}
              fields={fields}
              fieldById={fieldById}
              records={EMPTY_PREVIEW_RECORDS}
              tableId={sourceTableKey}
              sourceKind={sourceKind}
              companyId={companyId}
              userId={userId}
            />
          )}
        </div>
      )}

      {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={!canSave} className="flex-1 py-3.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save dashboard'}
        </button>
        <button onClick={handleDiscard} disabled={saving} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-full text-[11px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50">
          Discard changes
        </button>
        {!isNew && (
          <button onClick={handleDelete} className="p-3.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><Trash2 size={16} /></button>
        )}
      </div>
    </div>
  );
}

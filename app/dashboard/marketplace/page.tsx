"use client";

// Template marketplace: browse + install published templates (any company's,
// see supabase/template_marketplace.sql's install_company_template), and
// author/manage the ones your own company owns via TemplateTableBuilder.
import { useState, useEffect, useCallback } from "react";
import * as LucideIcons from "lucide-react";
import { Store, Plus, Loader2, Check, X, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import TemplateTableBuilder from "@/components/marketplace/TemplateTableBuilder";
import { logSchemaChange } from "@/lib/services/schemaChangeLog";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface Template {
  id: string; slug: string; name: string; description: string | null;
  industry: string | null; icon: string; color: string; owner_company_id: string;
  is_published: boolean; suggested_label_overrides: Record<string, { singular: string; plural: string }>;
}

interface TemplateTableField {
  label: string; fieldKey?: string; fieldType: string; linksTo: string | null;
  // Best-practice settings the template configures on this field, surfaced
  // so the admin approves exactly what they'll get (see the preview route).
  required?: boolean; unique?: boolean;
  autoNumber?: string | null;   // the real first number, e.g. "260001"
  formula?: string | null;      // e.g. "Rate × Duration Hours"
  helpText?: string | null;
  selectOptions?: string[] | null;
}

interface PreviewConflict {
  slug?: string; tableName?: string; fieldKey?: string; name?: string; label?: string;
  icon?: string; color?: string; fieldType?: string; fields?: TemplateTableField[];
  // Present once this template has already been installed once -- true means
  // this table/field is already installed for the company (nothing pending);
  // false means it was added to the template's catalog since (see
  // upgrade_company_template in supabase/template_marketplace_upgrade.sql).
  owned?: boolean;
  // Table-only: template fields not yet present on the already-installed
  // table -- e.g. new fields added to the catalog after this company
  // installed it. Empty when the table itself isn't owned yet.
  newFields?: TemplateTableField[];
  // Table-only: append-only ledger table (consecutive receipt numbers,
  // running balances, overdraw guard -- see company_table_ledger.sql).
  isLedger?: boolean;
  // Table-only: field_key -> label for wireframe rendering. Catalog labels
  // plus the OWNER company's live labels for keys not (yet) in the catalog.
  fieldLabels?: Record<string, string>;
  // System-field-only settings (same idea as TemplateTableField's).
  required?: boolean; unique?: boolean; helpText?: string | null; selectOptions?: string[] | null;
  conflict: { existingId: string; existingName?: string; existingLabel?: string } | null;
}

interface PreviewWidget { id: string; type: string; layout?: { x: number; y: number; w: number; h: number }; config?: Record<string, any> }
interface PreviewDashboard { slug: string; name: string; icon: string; color: string; owned: boolean; widgets?: PreviewWidget[]; sourceTableSlug?: string | null }
// Record-dashboard tab the template ships -- appears on every record of
// `appearsOn`, showing linked rows of `linkedTable` (see
// supabase/template_record_tabs.sql).
interface PreviewRecordTab { title: string; icon: string | null; appearsOn: string; linkedTable: string | null; linkedTableSlug: string | null; widgets: PreviewWidget[]; owned: boolean }

interface PreviewResult {
  templateName: string;
  templateDescription: string | null;
  alreadyInstalled: boolean;
  // True when there's something for an upgrade to actually add (a new table,
  // new fields on an owned table, or a new dashboard) -- only meaningful
  // when alreadyInstalled.
  hasUpgrade: boolean;
  currentSchema: { tableNames: string[]; systemFieldCounts: Record<string, number> };
  tables: PreviewConflict[];
  systemFields: PreviewConflict[];
  dashboards: PreviewDashboard[];
  recordTabs?: PreviewRecordTab[];
  suggestedLabelOverrides: Record<string, { singular: string; plural: string }>;
}

const SYSTEM_TABLE_LABELS: Record<string, string> = { projects: 'Projects', entities: 'Entities', properties: 'Properties' };

// ── Field setting badges + dashboard wireframe (install review) ────────

// Compact inline badges for the settings a template field ships with.
// Partial so both custom-table fields and system fields (PreviewConflict)
// can pass straight through.
function FieldSettingBadges({ f }: { f: Partial<TemplateTableField> }) {
  return (
    <>
      {f.required && <span className="ml-1 text-[9px] font-bold text-rose-500 uppercase">required</span>}
      {f.unique && <span className="ml-1 text-[9px] font-bold text-violet-500 uppercase">unique</span>}
      {f.autoNumber && <span className="ml-1 text-[9px] font-bold text-emerald-600">auto № {f.autoNumber}…</span>}
      {f.formula && <span className="ml-1 text-[9px] font-bold text-indigo-500">= {f.formula}</span>}
    </>
  );
}

function fieldTooltip(f: Partial<TemplateTableField>): string | undefined {
  const parts = [];
  if (f.helpText) parts.push(f.helpText);
  if (f.selectOptions?.length) parts.push(`Options: ${f.selectOptions.slice(0, 12).join(', ')}${f.selectOptions.length > 12 ? '…' : ''}`);
  return parts.length ? parts.join(' — ') : undefined;
}

const WIREFRAME_STYLES: Record<string, string> = {
  filter_bar:     'bg-slate-100 text-slate-600',
  quick_add_form: 'bg-indigo-50 text-indigo-700',
  summary_tile:   'bg-emerald-50 text-emerald-700',
  chart:          'bg-sky-50 text-sky-700',
  grid:           'bg-amber-50 text-amber-800',
};

// What each widget actually does, resolved against the source table's real
// field labels -- so the Leads wireframe reads "New · count where Status =
// New", not a generic "Tile" that looks the same on every dashboard.
function widgetText(w: PreviewWidget, labelFor: (k: string) => string): { title: string; detail: string } {
  const c = w.config || {};
  const names = (ids?: string[]) => (ids || []).map(labelFor);
  const listed = (ids: string[] | undefined, max: number, unit: string) => {
    const n = names(ids);
    return n.length > max ? `${n.slice(0, max).join(' · ')} +${n.length - max} ${unit}` : n.join(' · ');
  };
  switch (w.type) {
    case 'filter_bar':     return { title: 'Filters', detail: listed(c.fieldIds, 5, 'more') };
    case 'quick_add_form': return { title: 'Quick add', detail: listed(c.fieldIds, 6, 'more') };
    case 'summary_tile': {
      const agg = c.aggregate === 'count' ? 'count' : c.fieldId ? `sum of ${labelFor(c.fieldId)}` : 'sum';
      const filt = c.filterFieldId ? ` · ${labelFor(c.filterFieldId)} = ${String(c.filterValue)}` : '';
      return { title: c.label || 'Tile', detail: agg + filt };
    }
    case 'chart': {
      const val = c.aggregate === 'count' ? 'Count' : c.valueFieldId ? `Sum of ${labelFor(c.valueFieldId)}` : 'Sum';
      return { title: 'Chart', detail: c.dateFieldId ? `${val} by ${labelFor(c.dateFieldId)}` : val };
    }
    case 'grid':           return { title: 'Records grid', detail: listed(c.fieldIds, 6, 'cols') };
    default:               return { title: w.type.replace(/_/g, ' '), detail: '' };
  }
}

// Scaled-down schematic of the dashboard's real 12-column widget layout, so
// the admin sees what the dashboard looks like before agreeing to it.
function DashboardWireframe({ widgets, labelFor }: { widgets: PreviewWidget[]; labelFor: (k: string) => string }) {
  if (!widgets.length) return null;
  const ROW_PX = 15;
  const MAX_ROWS = 30; // deep dashboards (e.g. Trust Account) get truncated with a note
  const shown = widgets.filter(w => (w.layout?.y ?? 0) < MAX_ROWS);
  const hidden = widgets.filter(w => (w.layout?.y ?? 0) >= MAX_ROWS);
  const rows = Math.min(MAX_ROWS, Math.max(...shown.map(w => (w.layout?.y ?? 0) + (w.layout?.h ?? 2))));
  return (
    <div>
      <div className="relative w-full rounded-xl border border-slate-100 bg-slate-50/50 overflow-hidden" style={{ height: rows * ROW_PX + 6 }}>
        {shown.map(w => {
          const l = w.layout || { x: 0, y: 0, w: 12, h: 2 };
          const { title, detail } = widgetText(w, labelFor);
          const cls = WIREFRAME_STYLES[w.type] || 'bg-white text-slate-500 border border-slate-100';
          return (
            <div
              key={w.id}
              title={detail ? `${title} — ${detail}` : title}
              className={`absolute rounded-md flex flex-col justify-center px-2 overflow-hidden leading-tight ${cls}`}
              style={{
                left: `calc(${(l.x / 12) * 100}% + 2px)`,
                width: `calc(${(l.w / 12) * 100}% - 4px)`,
                top: l.y * ROW_PX + 3,
                height: Math.max(l.h * ROW_PX - 4, 12),
              }}
            >
              <span className="text-[9px] font-bold truncate">{title}</span>
              {detail && l.h >= 2 && <span className="text-[8px] opacity-75 truncate">{detail}</span>}
            </div>
          );
        })}
      </div>
      {hidden.length > 0 && (
        <p className="text-[9px] text-slate-400 mt-1 px-1">
          + below: {hidden.map(w => widgetText(w, labelFor).title).join(', ')}
        </p>
      )}
    </div>
  );
}

export default function MarketplacePage() {
  const { companyId, userId, isAdmin } = useCompany();
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [published, setPublished] = useState<Template[]>([]);
  const [mine, setMine] = useState<Template[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [installing, setInstalling] = useState<Template | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [resolutions, setResolutions] = useState<{ tables: Record<string, string>; systemFields: Record<string, string>; applyLabelOverrides: boolean }>({ tables: {}, systemFields: {}, applyLabelOverrides: false });
  // Bundled dashboards are opt-in (see install_company_template's
  // p_install_dashboards) -- tables always install, dashboards only if asked.
  const [installDashboards, setInstallDashboards] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [installError, setInstallError] = useState('');

  const [managing, setManaging] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIndustry, setNewIndustry] = useState('');
  const [creatingSaving, setCreatingSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: pub }, { data: own }, { data: installs }] = await Promise.all([
      supabase.from('template_definitions').select('*').eq('is_published', true).order('name'),
      supabase.from('template_definitions').select('*').eq('owner_company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('company_template_installs').select('template_id').eq('company_id', companyId),
    ]);
    setPublished(pub || []);
    setMine(own || []);
    setInstalledIds(new Set((installs || []).map(i => i.template_id)));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  useProgressBarWhile(loading);
  useProgressBarWhile(!!installing && !preview);

  const openInstall = async (template: Template) => {
    setInstalling(template);
    setInstallError('');
    setPreview(null);
    setInstallDashboards(false);
    const res = await fetch(`/api/templates/${template.slug}/preview`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { setInstallError(data.error || 'Could not load preview'); return; }
    setPreview(data);
    setResolutions({
      tables: Object.fromEntries((data.tables || []).filter((t: PreviewConflict) => t.conflict).map((t: PreviewConflict) => [t.slug, 'create_new'])),
      systemFields: Object.fromEntries((data.systemFields || []).filter((f: PreviewConflict) => f.conflict).map((f: PreviewConflict) => [`${f.tableName}:${f.fieldKey}`, 'create_new'])),
      applyLabelOverrides: Object.keys(data.suggestedLabelOverrides || {}).length > 0,
    });
  };

  const confirmInstall = async () => {
    if (!installing) return;
    setInstallBusy(true);
    setInstallError('');
    // Same review dialog serves both flows -- an already-installed template
    // hits /upgrade (only adds what's missing) instead of /install (which
    // would just return status:'already_installed' and do nothing).
    const endpoint = preview?.alreadyInstalled ? 'upgrade' : 'install';
    const res = await fetch(`/api/templates/${installing.slug}/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutions, installDashboards }),
    });
    const data = await res.json();
    setInstallBusy(false);
    if (!res.ok) { setInstallError(data.error || (preview?.alreadyInstalled ? 'Upgrade failed' : 'Install failed')); return; }
    setInstalling(null);
    load();
  };

  // Owner-only: push this company's live dashboards (fields, layout, empty
  // rows, conditions, widths, highlights) into the template catalog -- see
  // supabase/template_dashboards_owner_sync.sql.
  const [syncingDashboards, setSyncingDashboards] = useState<string | null>(null);
  const syncDashboards = async (template: Template) => {
    setSyncingDashboards(template.id);
    const res = await fetch(`/api/templates/${template.slug}/sync-dashboards`, { method: 'POST' });
    const data = await res.json();
    setSyncingDashboards(null);
    if (!res.ok) { alert(data.error || 'Sync failed'); return; }
    alert(`Dashboards synced into the template: ${data.updated} updated, ${data.created} added${data.skipped ? `, ${data.skipped} skipped (no template table binding)` : ''}.`);
  };

  const uninstall = async (template: Template) => {
    if (!window.confirm(`Uninstall "${template.name}"? This moves everything it created for your company (tables it made and the records in them) to Trash, where it can be restored. Anything you told it to "use existing" for is untouched.`)) return;
    const res = await fetch(`/api/templates/${template.slug}/uninstall`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Uninstall failed'); return; }
    load();
  };

  const handleCreateTemplate = async () => {
    if (!newName.trim() || !companyId) return;
    setCreatingSaving(true);
    const slug = `${newName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-')}-${Date.now().toString(36)}`;
    const { data, error } = await supabase.from('template_definitions').insert({
      slug, name: newName.trim(), description: newDescription.trim() || null, industry: newIndustry.trim() || null,
      owner_company_id: companyId, is_published: false,
    }).select().single();
    setCreatingSaving(false);
    if (error) { alert(error.message); return; }
    if (data) {
      logSchemaChange({ companyId, actorId: userId, entityType: 'template_definition', entityId: data.id, entityLabel: data.name, action: 'create', after: data });
    }
    setCreating(false);
    setNewName(''); setNewDescription(''); setNewIndustry('');
    load();
    if (data) setManaging(data);
  };

  const togglePublish = async (template: Template) => {
    const { data, error } = await supabase.from('template_definitions')
      .update({ is_published: !template.is_published }).eq('id', template.id).select().single();
    if (error) { alert(error.message); return; }
    if (data && companyId) {
      logSchemaChange({ companyId, actorId: userId, entityType: 'template_definition', entityId: template.id, entityLabel: template.name, action: 'update', before: template, after: data });
    }
    load();
  };

  const deleteTemplate = async (template: Template) => {
    if (!window.confirm(`Delete the "${template.name}" template? Companies that already installed it keep what they installed -- this only removes the template itself from the marketplace.`)) return;
    await supabase.from('template_definitions').delete().eq('id', template.id);
    if (companyId) logSchemaChange({ companyId, actorId: userId, entityType: 'template_definition', entityId: template.id, entityLabel: template.name, action: 'delete', before: template });
    if (managing?.id === template.id) setManaging(null);
    load();
  };

  const renderCard = (template: Template, mode: 'browse' | 'mine') => {
    const Icon = (LucideIcons as any)[template.icon] || Store;
    const isInstalled = installedIds.has(template.id);
    return (
      <div key={template.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${template.color}20` }}>
          <Icon size={18} style={{ color: template.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-bold text-slate-800">{template.name}</p>
            {template.industry && <span className="text-[9px] font-bold text-slate-400 uppercase px-2 py-0.5 bg-slate-50 rounded-full">{template.industry}</span>}
            {mode === 'mine' && (
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${template.is_published ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                {template.is_published ? 'Published' : 'Draft'}
              </span>
            )}
          </div>
          {template.description && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{template.description}</p>}
        </div>

        {mode === 'browse' && (
          isInstalled ? (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => openInstall(template)} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Update</button>
              <button onClick={() => uninstall(template)} className="px-4 py-2 bg-slate-50 text-slate-500 rounded-full text-[11px] font-bold hover:bg-red-50 hover:text-red-500 transition-all">Uninstall</button>
            </div>
          ) : (
            <button onClick={() => openInstall(template)} className="px-4 py-2 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all">Install</button>
          )
        )}
        {mode === 'mine' && isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => syncDashboards(template)}
              disabled={syncingDashboards === template.id}
              title="Copy this workspace's live dashboards (fields, layout, empty rows, conditions, widths, highlights) into the template"
              className="px-3 py-2 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold hover:bg-slate-100 transition-all disabled:opacity-50"
            >
              {syncingDashboards === template.id ? <Loader2 size={12} className="animate-spin" /> : 'Sync dashboards'}
            </button>
            <button onClick={() => togglePublish(template)} className="px-3 py-2 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold hover:bg-slate-100 transition-all">
              {template.is_published ? 'Unpublish' : 'Publish'}
            </button>
            <button onClick={() => setManaging(template)} className="px-3 py-2 bg-slate-900 text-white rounded-full text-[10px] font-bold hover:bg-black transition-all">Manage</button>
            <button onClick={() => deleteTemplate(template)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><Trash2 size={14} /></button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Store size={22} className="text-indigo-600" />
        <div>
          <h1 className="text-xl font-light uppercase tracking-tight text-slate-900">Template marketplace</h1>
          <p className="text-[11px] text-slate-400">Install ready-made tables and fields, or publish your own for other companies to take.</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('browse')} className={`px-4 py-2 rounded-full text-[11px] font-bold transition-all ${tab === 'browse' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500'}`}>Browse</button>
        <button onClick={() => setTab('mine')} className={`px-4 py-2 rounded-full text-[11px] font-bold transition-all ${tab === 'mine' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500'}`}>My templates</button>
      </div>

      {loading ? null : tab === 'browse' ? (
        <div className="space-y-2">
          {published.map(t => renderCard(t, 'browse'))}
          {published.length === 0 && <p className="text-center text-[11px] text-slate-300 italic py-8">No published templates yet</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end">
            <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all">
              <Plus size={13} /> New template
            </button>
          </div>
          {mine.map(t => renderCard(t, 'mine'))}
          {mine.length === 0 && <p className="text-center text-[11px] text-slate-300 italic py-8">Your company hasn't created a template yet</p>}
        </div>
      )}

      {/* Create template modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-light uppercase tracking-wide text-slate-900">New template</h3>
              <button onClick={() => setCreating(false)} className="p-2 text-slate-300 hover:text-black"><X size={18} /></button>
            </div>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Template name" className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100" />
            <input value={newIndustry} onChange={e => setNewIndustry(e.target.value)} placeholder="Industry (e.g. Legal)" className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none" />
            <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Description" rows={3} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 text-sm font-medium outline-none resize-none" />
            <button onClick={handleCreateTemplate} disabled={creatingSaving || !newName.trim()} className="w-full py-3.5 bg-slate-900 text-white rounded-full text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
              {creatingSaving ? <Loader2 size={14} className="animate-spin" /> : 'Create draft'}
            </button>
          </div>
        </div>
      )}

      {/* Install / review-and-approve modal */}
      {installing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-light uppercase tracking-wide text-slate-900">
                {preview?.alreadyInstalled ? 'Update' : 'Install'} "{installing.name}"
              </h3>
              <button onClick={() => setInstalling(null)} className="p-2 text-slate-300 hover:text-black"><X size={18} /></button>
            </div>

            {!preview ? null : (
              <>
                {preview.alreadyInstalled && (
                  <p className="text-[12px] font-medium text-emerald-600">
                    {preview.hasUpgrade
                      ? "Already installed — here's what's been added to the template since."
                      : "Already installed, and you're fully up to date."}
                  </p>
                )}
                {preview.templateDescription && (
                  <p className="text-[12px] text-slate-500">{preview.templateDescription}</p>
                )}

                {/* Your workspace today, for context */}
                <div className="p-4 bg-slate-50 rounded-2xl space-y-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Your workspace today</p>
                  <p className="text-[12px] text-slate-600">
                    {preview.currentSchema.tableNames.length > 0
                      ? `${preview.currentSchema.tableNames.length} table${preview.currentSchema.tableNames.length === 1 ? '' : 's'}: ${preview.currentSchema.tableNames.join(', ')}`
                      : 'No tables yet'}
                  </p>
                  <p className="text-[12px] text-slate-600">
                    {preview.currentSchema.systemFieldCounts.projects} field(s) on Projects · {preview.currentSchema.systemFieldCounts.entities} on Entities · {preview.currentSchema.systemFieldCounts.properties} on Properties
                  </p>
                </div>

                {/* Exactly what this template will do to that schema -- for
                    an upgrade, a fully-owned table with nothing new just
                    doesn't render at all, so the list only ever shows what's
                    actually pending. */}
                <div className="space-y-3">
                  <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest">
                    {preview.alreadyInstalled ? 'Template contents — live status' : 'This template will add'}
                  </p>

                  {preview.tables.map(t => (
                    <div key={t.slug} className={`p-3 rounded-2xl border space-y-2 ${t.conflict ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] font-bold text-slate-800">
                          {t.name} <span className="font-normal text-slate-400">
                            {t.owned
                              ? (t.newFields!.length ? `— ${t.newFields!.length} new field${t.newFields!.length === 1 ? '' : 's'}` : '— installed')
                              : '— new table'}
                          </span>
                        </p>
                        <span className="flex items-center gap-2">
                          {t.isLedger && (
                            <span
                              className="text-[9px] font-bold text-teal-700 uppercase bg-teal-50 px-2 py-0.5 rounded-full"
                              title="Append-only ledger: consecutive receipt numbers assigned server-side, per-matter running balances, entries can never be edited or deleted, overdraws refused"
                            >
                              Ledger
                            </span>
                          )}
                          {t.owned && !t.newFields?.length && <span className="text-[9px] font-bold text-slate-400 uppercase">Installed</span>}
                          {!t.conflict && (!t.owned || !!t.newFields?.length) && <span className="text-[9px] font-bold text-emerald-600 uppercase">New</span>}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(t.fields || []).map((f, i) => {
                          const isNew = !t.owned || !!t.newFields?.some(nf => nf.label === f.label);
                          return (
                            <span key={i} title={fieldTooltip(f)} className={`px-2 py-1 rounded-full text-[10px] font-medium text-slate-600 ${isNew && t.owned ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-slate-50'}`}>
                              {f.label} <span className="text-slate-400">· {f.fieldType}{f.linksTo ? ` → ${f.linksTo}` : ''}{f.selectOptions?.length ? ` · ${f.selectOptions.length} options` : ''}</span>
                              <FieldSettingBadges f={f} />
                            </span>
                          );
                        })}
                      </div>
                      {t.isLedger && (
                        <p className="text-[10px] text-teal-700">
                          Statutory trust ledger: append-only entries, consecutive receipt numbers, per-matter running balances and an overdraw guard.
                        </p>
                      )}
                      {t.conflict && (
                        <>
                          <p className="text-[11px] text-amber-700">You already have a table called "{t.conflict.existingName}"</p>
                          <div className="flex gap-2">
                            {(['use_existing', 'create_new'] as const).map(r => (
                              <button key={r} onClick={() => setResolutions(prev => ({ ...prev, tables: { ...prev.tables, [t.slug!]: r } }))}
                                className={`flex-1 py-1.5 rounded-full text-[10px] font-bold ${resolutions.tables[t.slug!] === r ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                                {r === 'use_existing' ? 'Use existing' : 'Create new'}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {Object.entries(
                    preview.systemFields.reduce<Record<string, PreviewConflict[]>>((acc, f) => {
                      const key = f.tableName!;
                      (acc[key] ||= []).push(f);
                      return acc;
                    }, {})
                  ).map(([tableName, fields]) => (
                    <div key={tableName} className="p-3 bg-white border border-slate-200 rounded-2xl space-y-2">
                      <p className="text-[11px] font-bold text-slate-500">{SYSTEM_TABLE_LABELS[tableName] || tableName} fields</p>
                      <div className="space-y-2">
                        {fields.map(f => (
                          <div key={f.fieldKey} className={`p-2 rounded-xl ${f.conflict ? 'bg-amber-50' : ''}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium text-slate-700" title={fieldTooltip(f)}>
                                {f.label} <span className="text-slate-400">· {f.fieldType}{f.selectOptions?.length ? ` · ${f.selectOptions.length} options` : ''}</span>
                                <FieldSettingBadges f={f} />
                              </span>
                              {f.owned
                                ? <span className="text-[9px] font-bold text-slate-400 uppercase">Installed</span>
                                : !f.conflict && <span className="text-[9px] font-bold text-emerald-600 uppercase">New</span>}
                            </div>
                            {f.conflict && (
                              <>
                                <p className="text-[10px] text-amber-700 mt-1">You already have "{f.conflict.existingLabel}"</p>
                                <div className="flex gap-2 mt-1">
                                  {(['use_existing', 'create_new'] as const).map(r => (
                                    <button key={r} onClick={() => setResolutions(prev => ({ ...prev, systemFields: { ...prev.systemFields, [`${f.tableName}:${f.fieldKey}`]: r } }))}
                                      className={`flex-1 py-1 rounded-full text-[9px] font-bold ${resolutions.systemFields[`${f.tableName}:${f.fieldKey}`] === r ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                                      {r === 'use_existing' ? 'Use existing' : 'Create new'}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {preview.dashboards.length > 0 && (
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-2">
                      Ready-made dashboards <span className="font-normal normal-case">— new ones created only if ticked below</span>
                    </p>
                  )}
                  {preview.dashboards.map(d => {
                    const DashIcon = (LucideIcons as any)[d.icon] || Store;
                    // Resolve widget field keys against the source table's
                    // real field labels (catalog + owner-live, see the
                    // preview route's fieldLabels); prettified key fallback.
                    const labels = preview.tables.find(t => t.slug === d.sourceTableSlug)?.fieldLabels || {};
                    const labelFor = (k: string) => labels[k] || k.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
                    return (
                      <div key={d.slug} className={`p-3 bg-white border border-slate-200 rounded-2xl space-y-2 ${d.owned || installDashboards ? '' : 'opacity-60'}`}>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${d.color}20` }}>
                            <DashIcon size={14} style={{ color: d.color }} />
                          </div>
                          <p className="text-[12px] font-bold text-slate-800 flex-1">
                            {d.name} <span className="font-normal text-slate-400">— dashboard · {(d.widgets || []).length} widgets</span>
                          </p>
                          {d.owned
                            ? <span className="text-[9px] font-bold text-slate-400 uppercase">Installed</span>
                            : <span className="text-[9px] font-bold text-emerald-600 uppercase">{installDashboards ? 'New' : 'Skipped'}</span>}
                        </div>
                        <DashboardWireframe widgets={d.widgets || []} labelFor={labelFor} />
                      </div>
                    );
                  })}

                  {(preview.recordTabs || []).length > 0 && (
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-2">
                      Record dashboards <span className="font-normal normal-case">— tabs shown on each record's page</span>
                    </p>
                  )}
                  {(preview.recordTabs || []).map((rt, i) => {
                    const TabIcon = (LucideIcons as any)[rt.icon || ''] || Store;
                    const labels = preview.tables.find(t => t.slug === rt.linkedTableSlug)?.fieldLabels || {};
                    const labelFor = (k: string) => labels[k] || k.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
                    return (
                      <div key={i} className={`p-3 bg-white border border-slate-200 rounded-2xl space-y-2 ${rt.owned || installDashboards ? '' : 'opacity-60'}`}>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                            <TabIcon size={14} className="text-slate-500" />
                          </div>
                          <p className="text-[12px] font-bold text-slate-800 flex-1">
                            {rt.title} <span className="font-normal text-slate-400">
                              — tab on every {rt.appearsOn} record{rt.linkedTable ? `, showing its ${rt.linkedTable}` : ''}
                            </span>
                          </p>
                          {rt.owned
                            ? <span className="text-[9px] font-bold text-slate-400 uppercase">Installed</span>
                            : <span className="text-[9px] font-bold text-emerald-600 uppercase">{installDashboards ? 'New' : 'Skipped'}</span>}
                        </div>
                        <DashboardWireframe widgets={rt.widgets} labelFor={labelFor} />
                      </div>
                    );
                  })}

                  {preview.alreadyInstalled && !preview.hasUpgrade && (
                    <p className="text-center text-[11px] text-slate-300 italic py-4">Nothing pending — you have everything this template currently offers.</p>
                  )}
                </div>

                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                  <input type="checkbox" checked={installDashboards} onChange={e => setInstallDashboards(e.target.checked)} />
                  Also create the template&apos;s ready-made dashboards
                </label>

                {Object.keys(preview.suggestedLabelOverrides || {}).length > 0 && (
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                    <input type="checkbox" checked={resolutions.applyLabelOverrides} onChange={e => setResolutions(prev => ({ ...prev, applyLabelOverrides: e.target.checked }))} />
                    Rename {Object.entries(preview.suggestedLabelOverrides).map(([k, v]) => `${k} → ${v.plural}`).join(', ')} in my sidebar
                  </label>
                )}

                {installError && <p className="text-[11px] text-red-500 font-medium">{installError}</p>}

                {!(preview.alreadyInstalled && !preview.hasUpgrade) && (
                  <button onClick={confirmInstall} disabled={installBusy} className="w-full py-3.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
                    {installBusy
                      ? <Loader2 size={14} className="animate-spin" />
                      : <><Check size={14} /> {preview.alreadyInstalled ? 'Apply upgrade' : 'Approve & install'}</>}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Manage (schema editor) modal */}
      {managing && companyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-light uppercase tracking-wide text-slate-900">Manage "{managing.name}"</h3>
              <button onClick={() => setManaging(null)} className="p-2 text-slate-300 hover:text-black"><X size={18} /></button>
            </div>
            <TemplateTableBuilder templateId={managing.id} companyId={companyId} actorId={userId} />
          </div>
        </div>
      )}
    </div>
  );
}

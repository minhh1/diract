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

interface TemplateTableField { label: string; fieldType: string; linksTo: string | null }

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
  conflict: { existingId: string; existingName?: string; existingLabel?: string } | null;
}

interface PreviewDashboard { slug: string; name: string; icon: string; color: string; owned: boolean }

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
  suggestedLabelOverrides: Record<string, { singular: string; plural: string }>;
}

const SYSTEM_TABLE_LABELS: Record<string, string> = { projects: 'Projects', entities: 'Entities', properties: 'Properties' };

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
      body: JSON.stringify({ resolutions }),
    });
    const data = await res.json();
    setInstallBusy(false);
    if (!res.ok) { setInstallError(data.error || (preview?.alreadyInstalled ? 'Upgrade failed' : 'Install failed')); return; }
    setInstalling(null);
    load();
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
          <div className="bg-white rounded-[40px] p-8 w-full max-w-xl shadow-2xl max-h-[85vh] overflow-y-auto space-y-5">
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
                      ? `${preview.currentSchema.tableNames.length} custom table${preview.currentSchema.tableNames.length === 1 ? '' : 's'}: ${preview.currentSchema.tableNames.join(', ')}`
                      : 'No custom tables yet'}
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
                    {preview.alreadyInstalled ? "What's pending" : 'This template will add'}
                  </p>

                  {preview.tables.filter(t => !t.owned || (t.newFields?.length ?? 0) > 0).map(t => (
                    <div key={t.slug} className={`p-3 rounded-2xl border space-y-2 ${t.conflict ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] font-bold text-slate-800">
                          {t.name} <span className="font-normal text-slate-400">
                            {t.owned ? `— ${t.newFields!.length} new field${t.newFields!.length === 1 ? '' : 's'}` : '— new table'}
                          </span>
                        </p>
                        {!t.conflict && <span className="text-[9px] font-bold text-emerald-600 uppercase">New</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(t.owned ? t.newFields! : (t.fields || [])).map((f, i) => (
                          <span key={i} className="px-2 py-1 bg-slate-50 rounded-full text-[10px] font-medium text-slate-600">
                            {f.label} <span className="text-slate-400">· {f.fieldType}{f.linksTo ? ` → ${f.linksTo}` : ''}</span>
                          </span>
                        ))}
                      </div>
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
                    preview.systemFields.filter(f => !f.owned).reduce<Record<string, PreviewConflict[]>>((acc, f) => {
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
                              <span className="text-[11px] font-medium text-slate-700">{f.label} <span className="text-slate-400">· {f.fieldType}</span></span>
                              {!f.conflict && <span className="text-[9px] font-bold text-emerald-600 uppercase">New</span>}
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

                  {preview.dashboards.filter(d => !d.owned).map(d => {
                    const DashIcon = (LucideIcons as any)[d.icon] || Store;
                    return (
                      <div key={d.slug} className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${d.color}20` }}>
                          <DashIcon size={14} style={{ color: d.color }} />
                        </div>
                        <p className="text-[12px] font-bold text-slate-800 flex-1">{d.name} <span className="font-normal text-slate-400">— dashboard</span></p>
                        <span className="text-[9px] font-bold text-emerald-600 uppercase">New</span>
                      </div>
                    );
                  })}

                  {preview.alreadyInstalled && !preview.hasUpgrade && (
                    <p className="text-center text-[11px] text-slate-300 italic py-4">Nothing pending — you have everything this template currently offers.</p>
                  )}
                </div>

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

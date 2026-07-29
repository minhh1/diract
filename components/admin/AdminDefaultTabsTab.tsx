// components/admin/AdminDefaultTabsTab.tsx
// Lets an admin add a custom table as a default record-dashboard tab on
// every Matter (e.g. a "Trust Transactions" tab alongside the built-in
// Time & Fees/Disbursements/Invoices), or remove one -- backed by
// company_record_tab_defaults (supabase/template_record_tabs.sql), which
// previously only the template-install RPCs ever wrote to. See
// supabase/company_record_tab_defaults_admin.sql for the two RPCs this
// calls: adding backfills every existing Matter immediately (so the
// marketplace's existing "Sync dashboards" button has something live to
// promote into the Law Firm template's catalog right away, rather than
// waiting on each Matter's own lazy tab top-up); removing lets the admin
// choose whether that also applies retroactively to Matters that already
// have the tab, or only stops it being added to new ones.
"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, Check, Info } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import { relationCandidates } from "@/lib/dashboardWidgets/linkField";
import { createWidget } from "@/lib/dashboardWidgets/defaults";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import type { QuickAddFormWidget, GridWidget } from "@/lib/dashboardWidgets/types";
import type { DefaultScope } from "@/components/admin/AdminDefaultSettingsTab";

interface Props { companyId: string; scope: DefaultScope; }

interface DefaultTabRow {
  id: string;
  title: string;
  icon: string | null;
  linked_table_id: string;
  display_order: number;
}

// The 3 tabs every Matter with a Law Firm-style schema already gets, via
// the separate hardcoded path in lib/dashboardWidgets/defaultRecordDashboardTabs.ts
// (billing_role-tagged -- invoicing depends on them, so they're not
// editable here, just shown for context).
const BUILT_IN_TABS: { slug: string; title: string; icon: string }[] = [
  { slug: 'time-fee-entries', title: 'Time & Fees', icon: 'Clock' },
  { slug: 'disbursements', title: 'Disbursements', icon: 'Receipt' },
  { slug: 'invoices', title: 'Invoices', icon: 'Receipt' },
];

const ICON_OPTIONS = ['LayoutGrid', 'Landmark', 'FileText', 'Table2', 'CheckSquare', 'FolderKanban', 'Receipt', 'Clock'];

export default function AdminDefaultTabsTab({ companyId, scope }: Props) {
  const isCompanyScope = !scope.teamId && !scope.userId;
  const { tables: customTables, loading: tablesLoading } = useCustomTables();
  const [defaults, setDefaults] = useState<DefaultTabRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newTableId, setNewTableId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newIcon, setNewIcon] = useState('LayoutGrid');
  const [newFields, setNewFields] = useState<CustomTableField[]>([]);
  const [newLinkFieldId, setNewLinkFieldId] = useState('');
  const [saving, setSaving] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeMatterCount, setRemoveMatterCount] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('company_record_tab_defaults')
      .select('id, title, icon, linked_table_id, display_order')
      .eq('company_id', companyId).eq('record_table', 'projects')
      .order('display_order');
    setDefaults((data || []) as DefaultTabRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [companyId]);

  const builtInPresent = BUILT_IN_TABS.filter(b => customTables.some(t => t.slug === b.slug));
  const usedLinkedTableIds = new Set(defaults.map(d => d.linked_table_id));
  const availableTables = customTables.filter(t =>
    !BUILT_IN_TABS.some(b => b.slug === t.slug) && !usedLinkedTableIds.has(t.id)
  );

  const startAdd = () => {
    setAdding(true);
    setNewTableId(''); setNewTitle(''); setNewIcon('LayoutGrid');
    setNewFields([]); setNewLinkFieldId(''); setError(null);
  };

  const pickTable = async (tableId: string) => {
    setNewTableId(tableId);
    const table = customTables.find(t => t.id === tableId);
    setNewTitle(table?.name || '');
    setNewLinkFieldId('');
    if (!tableId) { setNewFields([]); return; }
    const { data } = await supabase
      .from('company_table_fields').select('*').eq('table_id', tableId).is('deleted_at', null).order('display_order');
    const fields = (data || []) as CustomTableField[];
    setNewFields(fields);
    const candidates = relationCandidates(fields, 'projects');
    if (candidates.length === 1) setNewLinkFieldId(candidates[0].id);
  };

  const linkCandidates = relationCandidates(newFields, 'projects');

  const submitAdd = async () => {
    if (!newTableId || !newTitle.trim() || !newLinkFieldId) return;
    setSaving(true);
    setError(null);

    const fieldIds = newFields.map(f => f.id);
    const quickAdd = createWidget('quick_add_form', []) as QuickAddFormWidget;
    quickAdd.config.fieldIds = fieldIds;
    const grid = createWidget('grid', [quickAdd]) as GridWidget;
    grid.config.fieldIds = fieldIds;
    grid.config.showTotalsRow = newFields.some(f => f.field_type === 'currency');

    const { data: count, error: rpcError } = await supabase.rpc('add_company_record_tab_default', {
      p_company_id: companyId, p_record_table: 'projects', p_title: newTitle.trim(),
      p_icon: newIcon, p_linked_table_id: newTableId, p_link_field_id: newLinkFieldId,
      p_widgets: [quickAdd, grid],
    });
    setSaving(false);
    if (rpcError) { setError(rpcError.message); return; }
    setAdding(false);
    await load();
    window.alert(`Added — this tab now shows on ${count ?? 0} existing Matter${count === 1 ? '' : 's'}, and every new one going forward.`);
  };

  const startRemove = async (row: DefaultTabRow) => {
    setRemovingId(row.id);
    setRemoveMatterCount(null);
    const { count } = await supabase
      .from('record_tabs').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('record_table', 'projects')
      .eq('title', row.title).eq('linked_table_id', row.linked_table_id);
    setRemoveMatterCount(count ?? 0);
  };

  const confirmRemove = async (row: DefaultTabRow, retroactive: boolean) => {
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('remove_company_record_tab_default', {
      p_company_id: companyId, p_record_table: 'projects', p_title: row.title,
      p_linked_table_id: row.linked_table_id, p_retroactive: retroactive,
    });
    setSaving(false);
    setRemovingId(null);
    if (rpcError) { setError(rpcError.message); return; }
    await load();
  };

  if (loading || tablesLoading) return <p className="text-[11px] text-slate-400">Loading...</p>;

  return (
    <div className="space-y-8">
      {!isCompanyScope && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700">
            Default tabs are company-wide only — the team/person scope you picked above doesn&apos;t apply here.
          </p>
        </div>
      )}
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">What every Matter gets</p>
        <p className="text-[11px] text-slate-400 mb-4">
          These tabs are added automatically to every Matter — existing and new. Built-in ones always apply once
          their table exists; additional ones are yours to configure below.
        </p>

        {builtInPresent.length > 0 && (
          <div className="space-y-2 mb-4">
            {builtInPresent.map(b => (
              <div key={b.slug} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3">
                <p className="text-[12px] font-bold text-slate-700">{b.title}</p>
                <span className="text-[10px] text-slate-400">Always included — not editable here</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {defaults.map(row => (
            <div key={row.id} className="bg-white border border-slate-200 rounded-2xl px-5 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold text-slate-700">{row.title}</p>
                {removingId !== row.id && (
                  <button onClick={() => startRemove(row)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {removingId === row.id && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                  {removeMatterCount === null ? (
                    <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Checking how many Matters have this tab...</p>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-500">
                        This tab is currently on <span className="font-bold">{removeMatterCount}</span> Matter{removeMatterCount === 1 ? '' : 's'}.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => confirmRemove(row, false)} disabled={saving}
                          className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-200 disabled:opacity-50">
                          Stop adding to new Matters only
                        </button>
                        {removeMatterCount > 0 && (
                          <button onClick={() => confirmRemove(row, true)} disabled={saving}
                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-full text-[11px] font-bold hover:bg-red-100 disabled:opacity-50">
                            Also remove from all {removeMatterCount} Matters now
                          </button>
                        )}
                        <button onClick={() => setRemovingId(null)} disabled={saving}
                          className="px-3 py-1.5 text-slate-400 rounded-full text-[11px] font-bold hover:text-slate-600">
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {defaults.length === 0 && (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-6">No additional default tabs yet</p>
          )}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-500">{error}</p>}

      {!adding ? (
        <button onClick={startAdd} disabled={!availableTables.length}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
          <Plus size={13} /> Add default tab
        </button>
      ) : (
        <div className="bg-white border border-slate-200 rounded-[24px] p-5 space-y-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New default tab</p>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Table</label>
            <select value={newTableId} onChange={e => pickTable(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-full py-2.5 px-4 text-[12px] font-medium outline-none appearance-none">
              <option value="">Select a table...</option>
              {availableTables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {newTableId && (
            <>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Tab title</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Icon</label>
                <select value={newIcon} onChange={e => setNewIcon(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-full py-2.5 px-4 text-[12px] font-medium outline-none appearance-none">
                  {ICON_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              {linkCandidates.length > 1 && (
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Which field links a row to its Matter?</label>
                  <select value={newLinkFieldId} onChange={e => setNewLinkFieldId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-full py-2.5 px-4 text-[12px] font-medium outline-none appearance-none">
                    <option value="">Select a field...</option>
                    {linkCandidates.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              )}
              {linkCandidates.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  This table has no field linking back to Matters — add a Matter relation field to it first.
                </p>
              )}
            </>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={submitAdd} disabled={!newTableId || !newTitle.trim() || !newLinkFieldId || saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Create
            </button>
            <button onClick={() => setAdding(false)} disabled={saving}
              className="px-4 py-2 text-slate-400 text-[11px] font-bold hover:text-slate-600">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// components/admin/AdminDefaultViewsTab.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Pencil, Check, X, Trash2, Plus, Table2, GitBranch } from "lucide-react";

interface DefaultView {
  id: string;
  table_slug: string;
  columns: any[];
  expansion_columns: any[];
  filters: any[];
  preset_name: string;
  updated_at: string;
}

interface FilterRow {
  fieldId: string;
  operator: string;
  value: string;
}

const SYSTEM_TABLES = [
  { slug: 'projects',   label: 'Projects',   icon: '📁' },
  { slug: 'properties', label: 'Properties', icon: '🏠' },
  { slug: 'entities',   label: 'Entities',   icon: '🏢' },
];

const TREE_TABLES = [
  { slug: 'tree_projects',   label: 'Project tree',   icon: '🌲' },
  { slug: 'tree_properties', label: 'Property tree',  icon: '🌲' },
  { slug: 'tree_entities',   label: 'Entity tree',    icon: '🌲' },
];

const OPERATORS: Record<string, string> = {
  equals: 'equals', not_equals: '≠', contains: 'contains',
  not_contains: 'not contains', starts_with: 'starts with',
  is_empty: 'is empty', is_not_empty: 'is not empty',
};

interface SchemaField {
  id: string;
  label: string;
  fieldType: string;
  options?: string[];
}

interface Props { companyId: string; }

export default function AdminDefaultViewsTab({ companyId }: Props) {
  const [views, setViews] = useState<DefaultView[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDrafts, setEditDrafts] = useState<Record<string, Partial<DefaultView>>>({});
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  // Schema fields per table slug
  const [tableFields, setTableFields] = useState<Record<string, SchemaField[]>>({});

  useEffect(() => { load(); }, [companyId]);

  const load = async () => {
    setLoading(true);

    const { data } = await supabase
      .from('company_default_views')
      .select('*')
      .eq('company_id', companyId)
      .order('table_slug');
    setViews(data || []);

    // Load schema fields for each system table
    const fieldsMap: Record<string, SchemaField[]> = {};
    for (const t of SYSTEM_TABLES) {
      // Base schema columns
      const { data: schemaCols } = await supabase.rpc('get_schema_metadata', {
        target_table: t.slug,
        p_company_id: companyId,
      });
      const baseFields: SchemaField[] = (schemaCols || [])
        .filter((c: any) => !['deleted_at', 'company_id', 'import_id', 'id'].includes(c.column_name))
        .map((c: any) => ({
          id: c.column_name,
          label: c.label || c.column_name.replace(/_/g, ' '),
          fieldType: c.data_type === 'boolean' ? 'boolean'
            : c.data_type?.includes('timestamp') ? 'date'
            : ['numeric', 'integer'].includes(c.data_type) ? 'number'
            : 'text',
        }));

      // Custom fields
      const { data: customFields } = await supabase
        .from('company_custom_fields')
        .select('id, label, field_type, select_options')
        .eq('company_id', companyId)
        .eq('table_name', t.slug)
        .order('display_order');

      const cfFields: SchemaField[] = (customFields || []).map((cf: any) => ({
        id: `custom_field:${cf.id}`,
        label: cf.label,
        fieldType: cf.field_type,
        options: cf.select_options || undefined,
      }));

      fieldsMap[t.slug] = [...baseFields, ...cfFields];
    }
    setTableFields(fieldsMap);
    setLoading(false);
  };

  const startEdit = (view: DefaultView) => {
    setEditDrafts(prev => ({ ...prev, [view.table_slug]: { ...view } }));
  };

  const cancelEdit = (slug: string) => {
    setEditDrafts(prev => { const next = { ...prev }; delete next[slug]; return next; });
  };

  const saveEdit = async (slug: string) => {
    const draft = editDrafts[slug];
    if (!draft) return;
    setSavingSlug(slug);
    await supabase.from('company_default_views').upsert({
      company_id: companyId,
      table_slug: slug,
      columns: draft.columns || [],
      expansion_columns: draft.expansion_columns || [],
      filters: draft.filters || [],
      preset_name: draft.preset_name || 'Default view',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,table_slug' });
    setSavingSlug(null);
    cancelEdit(slug);
    load();
  };

  const patchDraft = (slug: string, patch: Partial<DefaultView>) => {
    setEditDrafts(prev => ({ ...prev, [slug]: { ...prev[slug], ...patch } }));
  };

  const addFilter = (slug: string) => {
    patchDraft(slug, {
      filters: [...(editDrafts[slug]?.filters || []), { fieldId: '', operator: 'contains', value: '' }],
    });
  };

  const updateFilter = (slug: string, idx: number, patch: Partial<FilterRow>) => {
    patchDraft(slug, {
      filters: (editDrafts[slug]?.filters || []).map((f: any, i: number) => i === idx ? { ...f, ...patch } : f),
    });
  };

  const removeFilter = (slug: string, idx: number) => {
    patchDraft(slug, {
      filters: (editDrafts[slug]?.filters || []).filter((_: any, i: number) => i !== idx),
    });
  };

  const deleteView = async (tableSlug: string) => {
    if (!window.confirm('Remove this default view?')) return;
    await supabase.from('company_default_views')
      .delete().eq('company_id', companyId).eq('table_slug', tableSlug);
    load();
  };

  const getView = (slug: string) => views.find(v => v.table_slug === slug);

  const renderViewCard = (slug: string, label: string, icon: string, isTree: boolean) => {
    const view = getView(slug);
    const isEditing = slug in editDrafts;
    const editDraft = editDrafts[slug] || {};

    return (
      <div key={slug} className={`bg-white border rounded-[24px] overflow-hidden transition-all ${isEditing ? 'border-indigo-200' : 'border-slate-200'}`}>
        {/* Header */}
        <div className={`flex items-center gap-3 px-5 py-4 ${isEditing ? 'bg-indigo-50' : 'bg-slate-50'} border-b border-slate-100`}>
          <span className="text-[16px]">{icon}</span>
          <div className="flex-1">
            <p className="text-[12px] font-bold text-slate-800">{label}</p>
            <p className="text-[10px] text-slate-400">
              {isTree ? 'Sidebar tree config' : 'Master table columns & filters'}
            </p>
          </div>
          {view && !isEditing && (
            <p className="text-[10px] text-slate-400">
              Updated {new Date(view.updated_at).toLocaleDateString('en-AU')}
            </p>
          )}
          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                <button onClick={() => saveEdit(slug)} disabled={savingSlug === slug}
                  className="p-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50">
                  <Check size={12} />
                </button>
                <button onClick={() => cancelEdit(slug)} className="p-1.5 text-slate-300 hover:text-slate-700">
                  <X size={12} />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => startEdit(view || { id: '', table_slug: slug, columns: [], expansion_columns: [], filters: [], preset_name: 'Default view', updated_at: '' })}
                  className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors">
                  <Pencil size={13} />
                </button>
                {view && (
                  <button onClick={() => deleteView(slug)}
                    className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Content */}
        {!view && !isEditing && (
          <div className="px-5 py-4 text-center">
            <p className="text-[11px] text-slate-300 italic mb-2">No default set — system defaults apply</p>
            <button onClick={() => startEdit({ id: '', table_slug: slug, columns: [], expansion_columns: [], filters: [], preset_name: 'Default view', updated_at: '' })}
              className="text-[11px] text-indigo-500 font-medium hover:text-indigo-700">
              + Set default
            </button>
          </div>
        )}

        {view && !isEditing && (
          <div className="px-5 py-4 space-y-3">
            {/* Columns */}
            {!isTree && view.columns?.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Columns ({view.columns.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {view.columns.map((col: string) => (
                    <span key={col} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-medium">
                      {col.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* Filters */}
            {view.filters?.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Filters ({view.filters.length})</p>
                <div className="space-y-1">
                  {view.filters.map((f: any, i: number) => (
                    <p key={i} className="text-[11px] text-slate-600">
                      <span className="font-medium">{f.fieldId?.replace(/_/g, ' ')}</span>
                      {' '}<span className="text-slate-400">{OPERATORS[f.operator] || f.operator}</span>
                      {' '}<span className="font-medium">{f.value}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
            {isTree && view.columns?.[0] && (
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tree config</p>
                <p className="text-[11px] text-slate-600">
                  Display: {view.columns[0]?.displayFields?.join(', ') || '—'}
                  {' · '}Sort: {view.columns[0]?.sortField || 'none'} {view.columns[0]?.sortDirection || ''}
                </p>
              </div>
            )}
          </div>
        )}

        {isEditing && !isTree && (
          <div className="px-5 py-4 space-y-4">
            {/* Preset name */}
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Preset name</p>
              <input value={editDraft.preset_name || ''} onChange={e => patchDraft(slug, { preset_name: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
            </div>

            {/* Filters */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Default filters</p>
                <button onClick={() => addFilter(slug)}
                  className="flex items-center gap-1 text-[11px] text-indigo-600 font-medium hover:text-indigo-800">
                  <Plus size={11} /> Add filter
                </button>
              </div>
              {(editDraft.filters || []).length === 0 && (
                <p className="text-[11px] text-slate-300 italic">No filters — click Add filter above</p>
              )}
              <div className="space-y-2">
                {(editDraft.filters || []).map((f: any, idx: number) => {
                  const fields = tableFields[slug] || [];
                  const selectedField = fields.find(field => field.id === f.fieldId);
                  const noValueOps = ['is_empty', 'is_not_empty', 'is_true', 'is_false'];
                  return (
                    <div key={idx} className="bg-slate-50 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {/* Field selector */}
                        <select value={f.fieldId || ''} onChange={e => updateFilter(slug, idx, { fieldId: e.target.value, value: '' })}
                          className="flex-1 px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-300 bg-white">
                          <option value="">— Select field —</option>
                          {fields.map(field => (
                            <option key={field.id} value={field.id}>{field.label}</option>
                          ))}
                        </select>
                        <button onClick={() => removeFilter(slug, idx)} className="p-1 text-slate-300 hover:text-red-500 shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                      {f.fieldId && (
                        <div className="flex items-center gap-2">
                          {/* Operator selector */}
                          <select value={f.operator || 'contains'} onChange={e => updateFilter(slug, idx, { operator: e.target.value, value: '' })}
                            className="flex-1 px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white">
                            {selectedField?.fieldType === 'boolean' ? (
                              <>
                                <option value="is_true">is true</option>
                                <option value="is_false">is false</option>
                              </>
                            ) : selectedField?.fieldType === 'number' || selectedField?.fieldType === 'currency' ? (
                              <>
                                <option value="equals">equals</option>
                                <option value="not_equals">not equals</option>
                                <option value="is_empty">is empty</option>
                                <option value="is_not_empty">is not empty</option>
                              </>
                            ) : (
                              Object.entries(OPERATORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)
                            )}
                          </select>
                          {/* Value input */}
                          {!noValueOps.includes(f.operator) && (
                            selectedField?.fieldType === 'select' && selectedField.options?.length ? (
                              <select value={f.value || ''} onChange={e => updateFilter(slug, idx, { value: e.target.value })}
                                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white">
                                <option value="">— Any —</option>
                                {selectedField.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            ) : selectedField?.fieldType === 'boolean' ? null : (
                              <input type={selectedField?.fieldType === 'date' ? 'date' : selectedField?.fieldType === 'number' ? 'number' : 'text'}
                                value={f.value || ''} onChange={e => updateFilter(slug, idx, { value: e.target.value })}
                                placeholder="Value..."
                                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-300" />
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic">
              Note: Column order is set by admins using the column config drawer in the master table — this panel manages filters and preset name only.
            </p>
          </div>
        )}

        {isEditing && isTree && (
          <div className="px-5 py-4">
            <p className="text-[11px] text-slate-500">
              Tree display settings (sort, display fields, filters) are set using the Tree Settings panel in the sidebar. Click "Set as company default" there to save them here.
            </p>
          </div>
        )}
      </div>
    );
  };

  if (loading) return <p className="text-[11px] text-slate-400">Loading...</p>;

  return (
    <div className="space-y-8">

      {/* Master table defaults */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Table2 size={14} className="text-indigo-500" />
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Master table defaults</p>
        </div>
        <div className="space-y-3">
          {SYSTEM_TABLES.map(t => renderViewCard(t.slug, t.label, t.icon, false))}
        </div>
      </div>

      {/* Sidebar tree defaults */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <GitBranch size={14} className="text-indigo-500" />
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sidebar tree defaults</p>
        </div>
        <div className="space-y-3">
          {TREE_TABLES.map(t => renderViewCard(t.slug, t.label, t.icon, true))}
        </div>
      </div>

    </div>
  );
}
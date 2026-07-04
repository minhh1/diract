"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getSchemaMetadata, getCompanyId, deriveLabel, type ColumnMeta } from "@/lib/services/schemaService";
import { Loader2, Eye, EyeOff, Tag, Link2, Lock, Database, Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const BASE_TABLES = ['properties', 'entities', 'projects'] as const;
type BaseTable = typeof BASE_TABLES[number];

interface CustomField {
  id: string;
  table_name: string;
  field_key: string;
  label: string;
  field_type: string;
  select_options: any;
  is_required: boolean;
  display_order: number;
}

interface RelationConfig {
  id: string;
  relation_key: string;
  label: string | null;
  is_enabled: boolean;
  display_order: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  identity: 'bg-slate-100 text-slate-500',
  metadata: 'bg-slate-50 text-slate-400',
  data: 'bg-indigo-50 text-indigo-600',
  relation: 'bg-violet-50 text-violet-600',
  sensitive: 'bg-red-50 text-red-500',
};

const CATEGORY_ICONS: Record<string, any> = {
  identity: Database,
  metadata: Tag,
  data: Database,
  relation: Link2,
  sensitive: Lock,
};

export default function SchemaVisualisation() {
  const [activeTable, setActiveTable] = useState<BaseTable>('properties');
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [relationConfigs, setRelationConfigs] = useState<RelationConfig[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCol, setExpandedCol] = useState<string | null>(null);

  // Custom field form state
  const [showAddField, setShowAddField] = useState(false);
  const [newField, setNewField] = useState({ label: '', field_type: 'text', is_required: false, select_options: '' });
  const [savingField, setSavingField] = useState(false);

  // Label override editing
  const [editingLabel, setEditingLabel] = useState<{ table: string; column: string; current: string } | null>(null);
  const [labelValue, setLabelValue] = useState('');

  useEffect(() => {
    loadAll();
  }, [activeTable]);

  const loadAll = async () => {
    setLoading(true);
    const cid = await getCompanyId();
    setCompanyId(cid);

    const [cols, { data: cf }, { data: rc }] = await Promise.all([
      getSchemaMetadata(activeTable, cid),
      supabase.from('company_custom_fields')
        .select('*')
        .eq('table_name', activeTable)
        .order('display_order'),
      supabase.from('company_relation_config')
        .select('*')
        .order('display_order'),
    ]);

    setColumns(cols);
    setCustomFields(cf || []);
    setRelationConfigs(rc || []);
    setLoading(false);
  };

  const handleToggleHidden = async (col: ColumnMeta) => {
    if (!companyId) return;
    const newHidden = !col.is_hidden;
    await supabase.from('company_field_labels').upsert({
      company_id: companyId,
      table_name: activeTable,
      column_name: col.column_name,
      label: col.label,
      is_hidden: newHidden,
    }, { onConflict: 'company_id,table_name,column_name' });

    // Invalidate cache so next schema fetch picks up the change
    const { invalidateSchemaCache } = await import('@/lib/services/schemaService');
    invalidateSchemaCache(activeTable, companyId);
    setColumns(prev => prev.map(c =>
      c.column_name === col.column_name ? { ...c, is_hidden: newHidden } : c
    ));
  };

  const handleSaveLabel = async () => {
    if (!editingLabel || !companyId) return;
    await supabase.from('company_field_labels').upsert({
      company_id: companyId,
      table_name: editingLabel.table,
      column_name: editingLabel.column,
      label: labelValue,
      is_hidden: columns.find(c => c.column_name === editingLabel.column)?.is_hidden || false,
    }, { onConflict: 'company_id,table_name,column_name' });

    const { invalidateSchemaCache } = await import('@/lib/services/schemaService');
    invalidateSchemaCache(activeTable, companyId);
    setColumns(prev => prev.map(c =>
      c.column_name === editingLabel.column ? { ...c, label: labelValue } : c
    ));
    setEditingLabel(null);
  };

  const handleAddCustomField = async () => {
    if (!companyId || !newField.label) return;
    setSavingField(true);
    const field_key = newField.label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    const selectOptions = newField.field_type === 'select' && newField.select_options
      ? newField.select_options.split('\n').map((s: string) => s.trim()).filter(Boolean)
      : null;

    await supabase.from('company_custom_fields').insert({
      company_id: companyId,
      table_name: activeTable,
      field_key,
      label: newField.label,
      field_type: newField.field_type,
      select_options: selectOptions ? JSON.stringify(selectOptions) : null,
      is_required: newField.is_required,
      display_order: customFields.length,
    });

    setNewField({ label: '', field_type: 'text', is_required: false, select_options: '' });
    setShowAddField(false);
    setSavingField(false);
    loadAll();
  };

  const handleDeleteCustomField = async (id: string) => {
    if (!window.confirm('Delete this custom field? All data stored in it will also be deleted.')) return;
    await supabase.from('company_custom_fields').delete().eq('id', id);
    loadAll();
  };

  const handleToggleRelation = async (rc: RelationConfig) => {
    if (!companyId) return;
    if (rc.id) {
      await supabase.from('company_relation_config').update({ is_enabled: !rc.is_enabled }).eq('id', rc.id);
    } else {
      await supabase.from('company_relation_config').insert({
        company_id: companyId,
        relation_key: rc.relation_key,
        is_enabled: false,
      });
    }
    loadAll();
  };

  const displayable = columns.filter(c => c.category !== 'identity' && c.category !== 'metadata');

  return (
    <div className="space-y-6 animate-in fade-in">

      {/* Table selector */}
      <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
        {BASE_TABLES.map(t => (
          <button
            key={t}
            onClick={() => setActiveTable(t)}
            className={`flex-1 py-3 rounded-xl text-xs font-bold capitalize transition-all ${activeTable === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-slate-300" size={24} />
        </div>
      ) : (
        <>
          {/* Base field list */}
          <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Base fields — {displayable.length} visible, {columns.filter(c => c.is_hidden).length} hidden
              </p>
              <p className="text-[10px] text-slate-300 font-medium">Click a field to rename it</p>
            </div>

            <div className="divide-y divide-slate-50">
              {displayable.map(col => {
                const Icon = CATEGORY_ICONS[col.category] || Database;
                const isEditing = editingLabel?.column === col.column_name;

                return (
                  <div key={col.column_name} className={`flex items-center gap-4 px-6 py-3.5 group transition-colors ${col.is_hidden ? 'opacity-40' : ''}`}>
                    <Icon size={14} className="text-slate-300 shrink-0" />

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={labelValue}
                            onChange={e => setLabelValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveLabel(); if (e.key === 'Escape') setEditingLabel(null); }}
                            className="text-[13px] font-bold text-slate-800 bg-slate-50 border border-indigo-300 rounded-lg px-3 py-1 outline-none focus:ring-2 focus:ring-indigo-100"
                          />
                          <button onClick={handleSaveLabel} className="text-[10px] font-bold text-indigo-600 hover:underline">Save</button>
                          <button onClick={() => setEditingLabel(null)} className="text-[10px] font-bold text-slate-400 hover:underline">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingLabel({ table: activeTable, column: col.column_name, current: col.label || '' }); setLabelValue(col.label || deriveLabel(col.column_name)); }}
                          className="flex items-center gap-2 group/label"
                        >
                          <span className="text-[13px] font-bold text-slate-800 group-hover/label:text-indigo-600 transition-colors">
                            {col.label || deriveLabel(col.column_name)}
                          </span>
                          <Pencil size={11} className="text-slate-300 opacity-0 group-hover/label:opacity-100 transition-opacity" />
                        </button>
                      )}
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{col.column_name} · {col.data_type}</p>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${CATEGORY_COLORS[col.category]}`}>
                      {col.category}
                    </span>

                    {col.validate_rule && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[9px] font-bold uppercase">
                        validate:{col.validate_rule}
                      </span>
                    )}

                    {col.relation_table && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        → {col.relation_table}.{col.relation_display_column}
                      </span>
                    )}

                    <button
                      onClick={() => handleToggleHidden(col)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-slate-100 transition-all text-slate-400"
                      title={col.is_hidden ? 'Show this field' : 'Hide this field'}
                    >
                      {col.is_hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </div>
                );
              })}

              {/* Hidden fields summary */}
              {columns.filter(c => c.is_hidden).length > 0 && (
                <div className="px-6 py-3 bg-slate-50/50">
                  <p className="text-[10px] text-slate-400 font-medium">
                    {columns.filter(c => c.is_hidden).length} field(s) hidden by your company:&nbsp;
                    {columns.filter(c => c.is_hidden).map(c => c.label || deriveLabel(c.column_name)).join(', ')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Custom fields */}
          <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Custom fields — {customFields.length} defined
              </p>
              <button
                onClick={() => setShowAddField(p => !p)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold transition-all hover:bg-indigo-100"
              >
                <Plus size={12} /> Add field
              </button>
            </div>

            {/* Add field form */}
            {showAddField && (
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Field label</label>
                    <input
                      value={newField.label}
                      onChange={e => setNewField(p => ({ ...p, label: e.target.value }))}
                      placeholder="e.g. Solar Capacity (kW)"
                      className="w-full bg-white border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Field type</label>
                    <select
                      value={newField.field_type}
                      onChange={e => setNewField(p => ({ ...p, field_type: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none appearance-none"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="boolean">Yes/No</option>
                      <option value="select">Dropdown</option>
                    </select>
                  </div>
                </div>

                {newField.field_type === 'select' && (
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Options (one per line)</label>
                    <textarea
                      value={newField.select_options}
                      onChange={e => setNewField(p => ({ ...p, select_options: e.target.value }))}
                      rows={3}
                      placeholder="Option A&#10;Option B&#10;Option C"
                      className="w-full bg-white border border-slate-200 rounded-2xl py-2 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[11px] font-medium text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newField.is_required}
                      onChange={e => setNewField(p => ({ ...p, is_required: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    Required field
                  </label>
                  <button
                    onClick={handleAddCustomField}
                    disabled={!newField.label || savingField}
                    className="px-5 py-2 bg-slate-900 text-white rounded-full text-[11px] font-bold disabled:opacity-40 flex items-center gap-2"
                  >
                    {savingField ? <Loader2 size={12} className="animate-spin" /> : 'Add field'}
                  </button>
                </div>
              </div>
            )}

            {customFields.length === 0 && !showAddField ? (
              <p className="px-6 py-8 text-[11px] text-slate-300 italic text-center">
                No custom fields defined for {activeTable} yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-50">
                {customFields.map(cf => (
                  <div key={cf.id} className="flex items-center gap-4 px-6 py-3.5 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-800">{cf.label}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{cf.field_key} · {cf.field_type}{cf.is_required ? ' · required' : ''}</p>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-bold uppercase">
                      custom
                    </span>
                    {cf.select_options && (
                      <span className="text-[10px] text-slate-400">
                        {(JSON.parse(cf.select_options) as string[]).length} options
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteCustomField(cf.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-red-50 hover:text-red-500 transition-all text-slate-300"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Relation config */}
          <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Relation sub-tables
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Toggle which relation panels are visible in the expand row for {activeTable}.
              </p>
            </div>
            {relationConfigs.length === 0 ? (
              <p className="px-6 py-6 text-[11px] text-slate-300 italic text-center">No relation config saved yet — all relations use default settings.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {relationConfigs.map(rc => (
                  <div key={rc.id} className="flex items-center gap-4 px-6 py-3.5">
                    <div className="flex-1">
                      <p className="text-[13px] font-bold text-slate-800">{rc.label || rc.relation_key}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{rc.relation_key}</p>
                    </div>
                    <button
                      onClick={() => handleToggleRelation(rc)}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${rc.is_enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}
                    >
                      {rc.is_enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
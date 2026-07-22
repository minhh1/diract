"use client";

// Schema editor for one owned template (see app/dashboard/marketplace/page.tsx's
// "My templates" tab). Deliberately structured like components/CustomTableBuilder.tsx
// + components/SchemaVisualisation.tsx, but reads/writes template_definition_tables /
// template_definition_table_fields / template_definition_system_fields instead of
// the live company_* tables -- this is how a template gets authored or extended
// with zero dependency on any live company table (the other way in is exporting
// a snapshot of a real table, added directly from CustomTableBuilder/SchemaVisualisation).
import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, Table2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/lib/supabase";
import { logSchemaChange } from "@/lib/services/schemaChangeLog";
import TemplateFieldConfigPanel, { type TemplateFieldDraft } from "./TemplateFieldConfigPanel";

const ICON_OPTIONS = ['Table2', 'FileText', 'Briefcase', 'Users', 'Receipt', 'Clock', 'Scale', 'CreditCard', 'Package', 'Calendar'];
const COLOR_OPTIONS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];
const SYSTEM_TABLE_TABS = [
  { key: 'projects', label: 'Projects' },
  { key: 'entities', label: 'Entities' },
  { key: 'properties', label: 'Properties' },
] as const;

interface TemplateTable { id: string; name: string; slug: string; icon: string; color: string; display_order: number }

export default function TemplateTableBuilder({ templateId, companyId, actorId }: { templateId: string; companyId: string; actorId: string | null }) {
  const [section, setSection] = useState<'tables' | 'system'>('tables');
  const [tables, setTables] = useState<TemplateTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [tableFields, setTableFields] = useState<TemplateFieldDraft[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('Table2');
  const [newColor, setNewColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);

  const [activeSystemTable, setActiveSystemTable] = useState<'projects' | 'entities' | 'properties'>('projects');
  const [systemFields, setSystemFields] = useState<TemplateFieldDraft[]>([]);
  const [selectedSystemFieldId, setSelectedSystemFieldId] = useState<string | null>(null);

  const loadTables = useCallback(async () => {
    const { data } = await supabase.from('template_definition_tables').select('*').eq('template_id', templateId).order('display_order');
    setTables(data || []);
  }, [templateId]);

  const loadTableFields = useCallback(async (tableId: string) => {
    const { data } = await supabase.from('template_definition_table_fields').select('*').eq('template_table_id', tableId).order('display_order');
    setTableFields((data || []).map((f: any) => ({
      id: f.id, field_key: f.field_key, label: f.label, field_type: f.field_type,
      select_options: f.select_options, is_required: f.is_required, is_unique: f.is_unique,
      show_in_table: f.show_in_table, section_name: f.section_name, help_text: f.help_text,
      linked_system_table: f.linked_system_table, linked_template_table_id: f.linked_template_table_id,
      linked_display_field: f.linked_display_field,
    })));
  }, []);

  const loadSystemFields = useCallback(async (tableName: string) => {
    const { data } = await supabase
      .from('template_definition_system_fields').select('*')
      .eq('template_id', templateId).eq('table_name', tableName).order('display_order');
    setSystemFields((data || []).map((f: any) => ({
      id: f.id, field_key: f.field_key, label: f.label, field_type: f.field_type,
      select_options: f.select_options, is_required: f.is_required, is_unique: f.is_unique,
      section_name: f.section_name, help_text: f.help_text,
      linked_system_table: f.linked_table, linked_template_table_id: null,
      linked_display_field: f.linked_display_column,
    })));
  }, [templateId]);

  useEffect(() => { loadTables(); }, [loadTables]);
  useEffect(() => { if (selectedTableId) loadTableFields(selectedTableId); }, [selectedTableId, loadTableFields]);
  useEffect(() => { loadSystemFields(activeSystemTable); setSelectedSystemFieldId(null); }, [activeSystemTable, loadSystemFields]);

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

  const handleCreateTable = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('template_definition_tables').insert({
      template_id: templateId, name: newName.trim(), slug: slugify(newName), icon: newIcon, color: newColor,
      display_order: tables.length,
    }).select().single();
    setSaving(false);
    if (error) { alert(error.message); return; }
    if (data) {
      logSchemaChange({ companyId, actorId, entityType: 'template_definition_table', entityId: data.id, entityLabel: data.name, action: 'create', after: data });
    }
    setCreating(false);
    setNewName('');
    loadTables();
  };

  const handleDeleteTable = async (tableId: string, name: string) => {
    if (!window.confirm(`Remove "${name}" from this template? This does not affect any table already installed by companies who took this template.`)) return;
    const { data: before } = await supabase.from('template_definition_tables').select('*').eq('id', tableId).single();
    await supabase.from('template_definition_tables').delete().eq('id', tableId);
    if (before) logSchemaChange({ companyId, actorId, entityType: 'template_definition_table', entityId: tableId, entityLabel: name, action: 'delete', before });
    if (selectedTableId === tableId) setSelectedTableId(null);
    loadTables();
  };

  const handleAddTableField = async () => {
    if (!selectedTableId) return;
    const label = 'New field';
    const field_key = `field_${Date.now()}`;
    const { data, error } = await supabase.from('template_definition_table_fields').insert({
      template_table_id: selectedTableId, field_key, label, field_type: 'text', display_order: tableFields.length,
    }).select().single();
    if (error) { alert(error.message); return; }
    if (data) {
      logSchemaChange({ companyId, actorId, entityType: 'template_definition_table_field', entityId: data.id, entityLabel: label, action: 'create', after: data });
      await loadTableFields(selectedTableId);
      setSelectedFieldId(data.id);
    }
  };

  const handleSaveTableField = async (updates: Partial<TemplateFieldDraft>) => {
    if (!selectedFieldId) return;
    const before = tableFields.find(f => f.id === selectedFieldId);
    const { error } = await supabase.from('template_definition_table_fields').update({
      label: updates.label, field_type: updates.field_type, select_options: updates.select_options,
      is_required: updates.is_required, is_unique: updates.is_unique,
      linked_system_table: updates.linked_system_table, linked_template_table_id: updates.linked_template_table_id,
      linked_display_field: updates.linked_display_field,
    }).eq('id', selectedFieldId);
    if (error) { alert(error.message); return; }
    if (before) logSchemaChange({ companyId, actorId, entityType: 'template_definition_table_field', entityId: selectedFieldId, entityLabel: updates.label ?? before.label, action: 'update', before, after: { ...before, ...updates } });
    if (selectedTableId) await loadTableFields(selectedTableId);
  };

  const handleDeleteTableField = async () => {
    if (!selectedFieldId) return;
    const before = tableFields.find(f => f.id === selectedFieldId);
    await supabase.from('template_definition_table_fields').delete().eq('id', selectedFieldId);
    if (before) logSchemaChange({ companyId, actorId, entityType: 'template_definition_table_field', entityId: selectedFieldId, entityLabel: before.label, action: 'delete', before });
    setSelectedFieldId(null);
    if (selectedTableId) await loadTableFields(selectedTableId);
  };

  const handleAddSystemField = async () => {
    const label = 'New field';
    const field_key = `field_${Date.now()}`;
    const { data, error } = await supabase.from('template_definition_system_fields').insert({
      template_id: templateId, table_name: activeSystemTable, field_key, label, field_type: 'text', display_order: systemFields.length,
    }).select().single();
    if (error) { alert(error.message); return; }
    if (data) {
      logSchemaChange({ companyId, actorId, entityType: 'template_definition_system_field', entityId: data.id, entityLabel: label, action: 'create', after: data });
      await loadSystemFields(activeSystemTable);
      setSelectedSystemFieldId(data.id);
    }
  };

  const handleSaveSystemField = async (updates: Partial<TemplateFieldDraft>) => {
    if (!selectedSystemFieldId) return;
    const before = systemFields.find(f => f.id === selectedSystemFieldId);
    const { error } = await supabase.from('template_definition_system_fields').update({
      label: updates.label, field_type: updates.field_type, select_options: updates.select_options,
      is_required: updates.is_required, is_unique: updates.is_unique,
      linked_table: updates.linked_system_table, linked_display_column: updates.linked_display_field,
    }).eq('id', selectedSystemFieldId);
    if (error) { alert(error.message); return; }
    if (before) logSchemaChange({ companyId, actorId, entityType: 'template_definition_system_field', entityId: selectedSystemFieldId, entityLabel: updates.label ?? before.label, action: 'update', before, after: { ...before, ...updates } });
    await loadSystemFields(activeSystemTable);
  };

  const handleDeleteSystemField = async () => {
    if (!selectedSystemFieldId) return;
    const before = systemFields.find(f => f.id === selectedSystemFieldId);
    await supabase.from('template_definition_system_fields').delete().eq('id', selectedSystemFieldId);
    if (before) logSchemaChange({ companyId, actorId, entityType: 'template_definition_system_field', entityId: selectedSystemFieldId, entityLabel: before.label, action: 'delete', before });
    setSelectedSystemFieldId(null);
    await loadSystemFields(activeSystemTable);
  };

  const selectedTable = tables.find(t => t.id === selectedTableId) || null;
  const selectedField = tableFields.find(f => f.id === selectedFieldId) || null;
  const selectedSystemField = systemFields.find(f => f.id === selectedSystemFieldId) || null;
  const siblingTables = tables.filter(t => t.id !== selectedTableId).map(t => ({ id: t.id, name: t.name }));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setSection('tables')} className={`px-4 py-2 rounded-full text-[11px] font-bold transition-all ${section === 'tables' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500'}`}>Tables</button>
        <button onClick={() => setSection('system')} className={`px-4 py-2 rounded-full text-[11px] font-bold transition-all ${section === 'system' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500'}`}>Matter / entity fields</button>
      </div>

      {section === 'tables' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tables in this template</p>
              <button onClick={() => setCreating(true)} className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"><Plus size={14} /></button>
            </div>
            {tables.map(table => {
              const Icon = (LucideIcons as any)[table.icon] || Table2;
              return (
                <div key={table.id} className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${selectedTableId === table.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`} onClick={() => { setSelectedTableId(table.id); setSelectedFieldId(null); }}>
                  <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${table.color}20` }}>
                    <Icon size={14} style={{ color: table.color }} />
                  </div>
                  <span className="text-[12px] font-bold text-slate-700 flex-1 truncate">{table.name}</span>
                  <button onClick={e => { e.stopPropagation(); handleDeleteTable(table.id, table.name); }} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                </div>
              );
            })}
            {tables.length === 0 && <p className="text-[11px] text-slate-300 italic py-4 text-center">No tables yet</p>}

            {creating && (
              <div className="p-3 bg-slate-50 rounded-2xl space-y-2">
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Table name" className="w-full bg-white border border-slate-200 rounded-full py-2 px-4 text-sm outline-none" />
                <div className="flex gap-1">
                  {ICON_OPTIONS.map(i => { const I = (LucideIcons as any)[i]; return <button key={i} onClick={() => setNewIcon(i)} className={`p-1.5 rounded-lg ${newIcon === i ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400'}`}><I size={14} /></button>; })}
                </div>
                <div className="flex gap-1">
                  {COLOR_OPTIONS.map(c => <button key={c} onClick={() => setNewColor(c)} className={`w-6 h-6 rounded-full ${newColor === c ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`} style={{ backgroundColor: c }} />)}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCreating(false)} className="flex-1 py-2 bg-white border border-slate-200 rounded-full text-[10px] font-bold">Cancel</button>
                  <button onClick={handleCreateTable} disabled={saving || !newName.trim()} className="flex-1 py-2 bg-slate-900 text-white rounded-full text-[10px] font-bold disabled:opacity-50">{saving ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Add'}</button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {selectedTable ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedTable.name} fields</p>
                  <button onClick={handleAddTableField} className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"><Plus size={14} /></button>
                </div>
                {tableFields.map(f => (
                  <button key={f.id} onClick={() => setSelectedFieldId(f.id)} className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-left transition-all ${selectedFieldId === f.id ? 'bg-indigo-50 border border-indigo-200' : 'bg-white border border-slate-200 hover:bg-slate-50'}`}>
                    <span className="text-[12px] font-bold text-slate-700 flex-1 truncate">{f.label}</span>
                    <span className="text-[9px] text-slate-400 uppercase">{f.field_type}</span>
                  </button>
                ))}
                {tableFields.length === 0 && <p className="text-[11px] text-slate-300 italic py-4 text-center">No fields yet</p>}
                {selectedField && (
                  <TemplateFieldConfigPanel
                    field={selectedField}
                    siblingTables={siblingTables}
                    allowTableRelation
                    onSave={handleSaveTableField}
                    onDelete={handleDeleteTableField}
                    onClose={() => setSelectedFieldId(null)}
                  />
                )}
              </>
            ) : (
              <p className="text-[11px] text-slate-300 italic py-4 text-center">Select a table to edit its fields</p>
            )}
          </div>
        </div>
      )}

      {section === 'system' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex gap-2">
              {SYSTEM_TABLE_TABS.map(t => (
                <button key={t.key} onClick={() => setActiveSystemTable(t.key)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${activeSystemTable === t.key ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500'}`}>{t.label}</button>
              ))}
              <button onClick={handleAddSystemField} className="ml-auto p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"><Plus size={14} /></button>
            </div>
            {systemFields.map(f => (
              <button key={f.id} onClick={() => setSelectedSystemFieldId(f.id)} className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-left transition-all ${selectedSystemFieldId === f.id ? 'bg-indigo-50 border border-indigo-200' : 'bg-white border border-slate-200 hover:bg-slate-50'}`}>
                <span className="text-[12px] font-bold text-slate-700 flex-1 truncate">{f.label}</span>
                <span className="text-[9px] text-slate-400 uppercase">{f.field_type}</span>
              </button>
            ))}
            {systemFields.length === 0 && <p className="text-[11px] text-slate-300 italic py-4 text-center">No fields yet</p>}
          </div>

          <div>
            {selectedSystemField ? (
              <TemplateFieldConfigPanel
                field={selectedSystemField}
                siblingTables={[]}
                allowTableRelation={false}
                onSave={handleSaveSystemField}
                onDelete={handleDeleteSystemField}
                onClose={() => setSelectedSystemFieldId(null)}
              />
            ) : (
              <p className="text-[11px] text-slate-300 italic py-4 text-center">Select a field to edit it</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, Loader2, Pencil, Check, X,
  ClipboardList, Plus, Trash2, AlertCircle
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { updateRecord as updateSystemRecord } from "@/lib/genericRecordActions";
import { updateRecord as updateCustomRecord, deleteRecord } from "@/lib/services/customTableService";

// ── Types ─────────────────────────────────────────────────────────
interface DashboardField {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  selectOptions?: string[];
  sectionName?: string;
  isRequired?: boolean;
  helpText?: string;
}

interface DashboardProps {
  // For system tables (properties/entities/projects)
  systemTable?: 'properties' | 'entities' | 'projects';
  recordId: string;
  // For custom tables
  tableId?: string;
  tableSlug?: string;
  tableName?: string;
  tableColor?: string;
  tableIcon?: string;
  // Common
  onBack: () => void;
  companyId: string;
}

// ── Inline editable field ─────────────────────────────────────────
function EditableField({
  label, value, fieldType, selectOptions, helpText, onSave,
}: {
  label: string;
  value: any;
  fieldType: string;
  selectOptions?: string[];
  helpText?: string;
  onSave: (v: any) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  };

  const displayValue = () => {
    if (value === null || value === undefined || value === '') return null;
    if (fieldType === 'boolean') return value ? 'Yes' : 'No';
    if (fieldType === 'currency') return `$${Number(value).toLocaleString()}`;
    if (fieldType === 'date') return new Date(value).toLocaleDateString('en-AU');
    return String(value);
  };

  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
        {label}
      </p>
      {helpText && (
        <p className="text-[10px] text-slate-400 mb-1">{helpText}</p>
      )}
      {editing ? (
        <div className="flex items-start gap-2">
          {fieldType === 'boolean' ? (
            <select
              autoFocus
              value={String(draft)}
              onChange={e => setDraft(e.target.value === 'true')}
              className="flex-1 bg-slate-50 border border-indigo-300 rounded-full px-4 py-2 text-[13px] outline-none"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : fieldType === 'select' && selectOptions?.length ? (
            <select
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="flex-1 bg-slate-50 border border-indigo-300 rounded-full px-4 py-2 text-[13px] outline-none"
            >
              <option value="">—</option>
              {selectOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              autoFocus
              type={
                fieldType === 'date' ? 'date'
                : fieldType === 'number' || fieldType === 'currency' ? 'number'
                : fieldType === 'email' ? 'email'
                : fieldType === 'url' ? 'url'
                : 'text'
              }
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
              className="flex-1 bg-slate-50 border border-indigo-300 rounded-full px-4 py-2 text-[13px] font-medium outline-none"
            />
          )}
          <button onClick={handleSave} disabled={saving} className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button onClick={() => { setEditing(false); setDraft(value ?? ''); }} className="p-2 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setEditing(true); setDraft(value ?? ''); }}
          className="flex items-center gap-2 group/field text-left w-full"
        >
          <span className={`text-[13px] font-medium ${displayValue() ? 'text-slate-800' : 'text-slate-300 italic'} group-hover/field:text-indigo-600 transition-colors`}>
            {displayValue() || 'Click to edit'}
          </span>
          <Pencil size={11} className="text-slate-300 opacity-0 group-hover/field:opacity-100 transition-opacity shrink-0" />
        </button>
      )}
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────
export default function GenericRecordDashboard({
  systemTable, recordId, tableId, tableSlug, tableName,
  tableColor = '#6366f1', tableIcon = 'Table2', onBack, companyId,
}: DashboardProps) {
  const router = useRouter();
  const [record, setRecord] = useState<Record<string, any> | null>(null);
  const [fields, setFields] = useState<DashboardField[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(true);

  const isCustomTable = !!tableId;
  const accentColor = tableColor;

  const fetchData = useCallback(async () => {
    setLoading(true);

    if (isCustomTable && tableId) {
      // Load custom table record
      const [{ data: flds }, { data: rec }] = await Promise.all([
        supabase.from('company_table_fields').select('*').eq('table_id', tableId).order('display_order'),
        supabase.from('company_table_records')
          .select('*, values:company_table_values(field_id, value_text, value_number, value_date, value_boolean, value_record_id)')
          .eq('id', recordId)
          .single(),
      ]);

      if (flds) {
        setFields(flds.map((f: any) => ({
          id: f.id,
          key: f.field_key,
          label: f.label,
          fieldType: f.field_type,
          selectOptions: f.select_options || undefined,
          sectionName: f.section_name || undefined,
          isRequired: f.is_required,
          helpText: f.help_text || undefined,
        })));
      }

      if (rec) {
        const fieldMap = new Map((flds || []).map((f: any) => [f.id, f.field_key]));
        const values: Record<string, any> = {};
        (rec.values || []).forEach((v: any) => {
          const key = fieldMap.get(v.field_id);
          if (key) values[key] = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? v.value_record_id ?? null;
        });
        setRecord({ id: rec.id, created_at: rec.created_at, ...values });
      }
    } else if (systemTable) {
      // Load system table record using get_schema_metadata for fields
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from('profiles').select('active_company_id').eq('id', user?.id).single();

      const [{ data: schemaCols }, { data: rec }] = await Promise.all([
        supabase.rpc('get_schema_metadata', {
          target_table: systemTable,
          p_company_id: prof?.active_company_id,
        }),
        supabase.from(systemTable).select('*').eq('id', recordId).single(),
      ]);

      if (schemaCols) {
        setFields(schemaCols
          .filter((c: any) => c.category === 'data' || c.category === 'relation')
          .filter((c: any) => !c.is_hidden)
          .map((c: any) => ({
            id: c.column_name,
            key: c.column_name,
            label: c.label || c.column_name.replace(/_/g, ' '),
            fieldType: c.category === 'relation' ? 'relation' : mapPgType(c.data_type),
            sectionName: c.section_name || undefined,
          }))
        );
      }
      if (rec) setRecord(rec);

      // Load activity log
      const { data: logData } = await supabase
        .from('audit_logs')
        .select('*, profiles:user_id(full_name)')
        .eq('parent_id', recordId)
        .order('created_at', { ascending: false })
        .limit(50);
      setLogs(logData || []);
    }

    setLoading(false);
  }, [recordId, tableId, systemTable]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFieldSave = async (fieldKey: string, value: any) => {
    if (!record) return;

    if (isCustomTable && tableId) {
      const field = fields.find(f => f.key === fieldKey);
      if (!field) return;
      await updateCustomRecord(recordId, tableId, companyId, { [fieldKey]: value }, [{
        id: field.id,
        table_id: tableId,
        field_key: field.key,
        label: field.label,
        field_type: field.fieldType,
        select_options: field.selectOptions || null,
        linked_table_id: null,
        linked_system_table: null,
        linked_display_field: null,
        is_required: field.isRequired || false,
        is_unique: false,
        show_in_table: true,
        display_order: 0,
        section_name: field.sectionName || null,
        help_text: field.helpText || null,
      }]);
    } else if (systemTable) {
      await updateSystemRecord({
        table: systemTable,
        id: recordId,
        changes: { [fieldKey]: value || null },
        parentType: systemTable.slice(0, -1) as any,
        parentId: recordId,
        companyId,
        recordLabel: record[systemTable === 'properties' ? 'street_address' : 'name'],
      });
    }

    setRecord(prev => prev ? { ...prev, [fieldKey]: value } : prev);
  };

  const handleDelete = async () => {
    const label = record?.[systemTable === 'properties' ? 'street_address' : 'name'] || 'this record';
    if (!window.confirm(`Archive "${label}"? It will be hidden but not permanently deleted.`)) return;

    if (isCustomTable) {
      await deleteRecord(recordId);
    } else if (systemTable) {
      await supabase.from(systemTable)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', recordId);
    }
    onBack();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="animate-spin text-slate-300" size={24} />
    </div>
  );

  if (!record) return (
    <div className="flex flex-col items-center justify-center h-screen gap-3">
      <AlertCircle size={32} className="text-slate-300" />
      <p className="text-slate-400 text-[11px] uppercase font-bold tracking-widest">Record not found</p>
      <button onClick={onBack} className="text-indigo-600 text-[11px] font-bold hover:underline">Go back</button>
    </div>
  );

  // Resolve icon component
  const IconComp = (LucideIcons as any)[tableIcon] || LucideIcons.Table2;

  // Group fields by section
  const sections = fields.reduce<Record<string, DashboardField[]>>((acc, f) => {
    const s = f.sectionName || 'Details';
    if (!acc[s]) acc[s] = [];
    acc[s].push(f);
    return acc;
  }, {});

  // Primary display value
  const primaryValue = systemTable === 'properties'
    ? record.street_address
    : record.name || record[fields[0]?.key] || 'Untitled';

  const tabs = [
    { id: 'details', label: 'Details' },
    { id: 'log', label: 'Activity' },
  ];

  return (
    <div className="flex flex-col h-screen bg-white font-sans antialiased overflow-hidden">
      {/* Header */}
      <header className="p-8 border-b border-slate-100 shrink-0 bg-white">
        <div className="flex items-start justify-between mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase hover:text-black transition-all tracking-widest"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <button
            onClick={handleDelete}
            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
            title="Archive record"
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Table icon with accent color */}
          <div
            className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${accentColor}20` }}
          >
            <IconComp size={22} style={{ color: accentColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-light text-slate-900 tracking-tight uppercase truncate">
              {primaryValue}
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              {tableName || systemTable}
              {record.created_at && ` · ${new Date(record.created_at).toLocaleDateString('en-AU')}`}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-6 bg-slate-100 p-1 rounded-full w-fit border border-slate-200">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 rounded-full text-[11px] font-medium transition-all ${
                activeTab === tab.id ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto bg-[#F9FAFB] p-10">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Details tab */}
          {activeTab === 'details' && (
            Object.entries(sections).map(([sectionName, sectionFields]) => (
              <div key={sectionName} className="bg-white border border-slate-200 rounded-[40px] p-8">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">
                  {sectionName}
                </p>
                <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                  {sectionFields.map(field => (
                    <EditableField
                      key={field.key}
                      label={field.label}
                      value={record[field.key]}
                      fieldType={field.fieldType}
                      selectOptions={field.selectOptions}
                      helpText={field.helpText}
                      onSave={v => handleFieldSave(field.key, v)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Activity log */}
          {activeTab === 'log' && (
            <div className="space-y-4">
              {logs.length === 0 ? (
                <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-20">
                  No activity yet
                </p>
              ) : logs.map(log => (
                <div key={log.id} className="p-6 bg-white border border-slate-200 rounded-[32px] flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] uppercase shrink-0">
                    {log.profiles?.full_name?.substring(0, 2)}
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-slate-900">
                      {log.profiles?.full_name} <span className="text-slate-400">{log.action}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                      {new Date(log.created_at).toLocaleString('en-AU')}
                    </p>
                    {log.details?.changes?.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {log.details.changes.map((c: any, i: number) => (
                          <div key={i} className="flex gap-3 text-[11px]">
                            <span className="text-slate-400 font-medium capitalize min-w-[100px]">
                              {c.field?.replace(/_/g, ' ')}
                            </span>
                            <span className="text-slate-400 line-through">{String(c.old ?? '—')}</span>
                            <span className="text-emerald-600 font-medium">{String(c.new ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function mapPgType(dataType: string): string {
  switch (dataType) {
    case 'boolean': return 'boolean';
    case 'date': return 'date';
    case 'timestamp with time zone':
    case 'timestamp without time zone': return 'date';
    case 'numeric': case 'integer': case 'bigint': return 'number';
    default: return 'text';
  }
}
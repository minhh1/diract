"use client";

import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from "react";
import { supabase } from "@/lib/supabase";
import { getCompanyId, deriveLabel } from "@/lib/services/schemaService";
import {
  Plus, Loader2, Check, AlertCircle,
  Type, Hash, Calendar, ToggleLeft, List, Link2,
  Mail, Globe, DollarSign, X, GripVertical, Copy,
  Building2
} from "lucide-react";

import RecordCreatorField from "@/components/RecordCreatorField"
import { useProgressBarWhile } from "@/components/TopProgressBar";

type BaseTable = "properties" | "entities" | "projects";

interface SpreadsheetColumn {
  id: string;
  label: string;
  type: 'base' | 'custom';
  fieldType: string; // keep as string, not a strict union
  isRequired: boolean;
  selectOptions?: string[];
  linkedTable?: string;
  width: number;
}

interface SpreadsheetRow {
  id: string;
  values: Record<string, string>;
  saving: Record<string, boolean>;
  errors: Record<string, string>;
  isNew: boolean;
  isSaving: boolean;
}

type SelectionType = 'column' | 'row' | null;
interface Selection {
  type: SelectionType;
  colId?: string;
  rowIdx?: number;
}




const FIELD_TYPES = [
  { type: 'text',     label: 'Text',        icon: Type,        color: 'text-blue-500' },
  { type: 'number',   label: 'Number',      icon: Hash,        color: 'text-purple-500' },
  { type: 'date',     label: 'Date',        icon: Calendar,    color: 'text-orange-500' },
  { type: 'boolean',  label: 'Yes/No',      icon: ToggleLeft,  color: 'text-green-500' },
  { type: 'select',   label: 'Dropdown',    icon: List,        color: 'text-yellow-500' },
  { type: 'link',     label: 'Link record', icon: Link2,       color: 'text-indigo-500' },
  { type: 'email',    label: 'Email',       icon: Mail,        color: 'text-cyan-500' },
  { type: 'url',      label: 'URL',         icon: Globe,       color: 'text-teal-500' },
  { type: 'currency', label: 'Currency',    icon: DollarSign,  color: 'text-emerald-500' },
];

const PRIMARY_COL: Record<BaseTable, string> = {
  properties: 'street_address',
  entities: 'name',
  projects: 'name',
};

const DEFAULT_COL_WIDTH = 180;
const AUTOSAVE_DELAY = 500;

function deriveFieldTypeFromPg(dataType: string): string {
  switch (dataType) {
    case 'boolean': return 'boolean';
    case 'date':
    case 'timestamp with time zone':
    case 'timestamp without time zone': return 'date';
    case 'numeric':
    case 'integer':
    case 'bigint': return 'number';
    default: return 'text';
  }
}

// ── Cell ──────────────────────────────────────────────────────────
function Cell({
  col, value, onSave, saving, error, isColSelected, isRowSelected, onOpenRecordCreator
}: {
  col: SpreadsheetColumn;
  value: string;
  onSave: (colId: string, value: string) => void;
  saving: boolean;
  error?: string;
  isColSelected: boolean;
  isRowSelected: boolean;
  onOpenRecordCreator?: (col: SpreadsheetColumn) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);

  const scheduleAutoSave = (val: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (val !== value) onSave(col.id, val);
    }, AUTOSAVE_DELAY);
  };

  const bgClass = isColSelected || isRowSelected ? 'bg-indigo-50/60' : '';
  const baseClass = `w-full h-full px-3 py-2 text-[13px] font-medium bg-transparent outline-none border-0 ${
    error ? 'text-red-500' : 'text-slate-700'
  }`;

  if (col.fieldType === 'boolean') {
    return (
      <div className={`flex items-center justify-center h-full ${bgClass}`}>
        <button
          onClick={() => {
            const v = draft === 'true' ? 'false' : 'true';
            setDraft(v);
            onSave(col.id, v);
          }}
          className={`w-10 h-6 rounded-full transition-all ${draft === 'true' ? 'bg-indigo-600' : 'bg-slate-200'}`}
        >
          <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${draft === 'true' ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>
    );
  }

  if (col.fieldType === 'select' && col.selectOptions?.length) {
    return (
      <div className={`h-full ${bgClass}`}>
        <select
          value={draft}
          onChange={e => { setDraft(e.target.value); onSave(col.id, e.target.value); }}
          className={`${baseClass} appearance-none cursor-pointer`}
        >
          <option value="">—</option>
          {col.selectOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    );
  }

  if (col.fieldType === 'property' || col.fieldType === 'entity') {
  return (
    <div className={`h-full flex items-center px-2 ${bgClass}`}>
      {value ? (
        // Already has a value — show it with edit option
        <span className="text-[12px] font-medium text-slate-700 truncate flex-1">
          {value}
        </span>
      ) : (
        // No value yet — show inline creator on click
        <button
          onClick={() => onOpenRecordCreator?.(col)}
          className="text-[11px] text-slate-300 hover:text-indigo-600 transition-colors"
        >
          + Create {col.fieldType}
        </button>
      )}
    </div>
  );
}

  return (
    <div className={`relative h-full ${bgClass}`}>
      <input
        type={
          col.fieldType === 'date' ? 'date'
          : col.fieldType === 'number' || col.fieldType === 'currency' ? 'number'
          : col.fieldType === 'email' ? 'email'
          : col.fieldType === 'url' ? 'url'
          : 'text'
        }
        value={draft}
        onChange={e => { setDraft(e.target.value); scheduleAutoSave(e.target.value); }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (timerRef.current) clearTimeout(timerRef.current);
          if (draft !== value) onSave(col.id, draft);
        }}
        className={baseClass}
        placeholder={col.isRequired ? 'Required' : '—'}
      />
      {saving && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <Loader2 size={10} className="animate-spin text-slate-300" />
        </div>
      )}
      {error && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2" title={error}>
          <AlertCircle size={12} className="text-red-400" />
        </div>
      )}
    </div>
  );
}

// ── Custom field form ──────────────────────────────────────────────
function CustomFieldForm({
  tableName, companyId, onAdd, onClose,
}: {
  tableName: BaseTable;
  companyId: string;
  onAdd: (col: SpreadsheetColumn) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [selectOptions, setSelectOptions] = useState('');
  const [linkedTable, setLinkedTable] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!label.trim()) { setError('Label is required'); return; }
    setSaving(true);

    const field_key = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    const opts = fieldType === 'select'
      ? selectOptions.split('\n').map(s => s.trim()).filter(Boolean)
      : null;

    const { data, error: err } = await supabase
      .from('company_custom_fields')
      .insert({
        company_id: companyId,
        table_name: tableName,
        field_key,
        label: label.trim(),
        field_type: fieldType,
        select_options: opts ? JSON.stringify(opts) : null,
        linked_table: linkedTable || null,
        linked_display_column: linkedTable ? 'name' : null,
        is_required: false,
        is_unique: false,
        auto_generate: false,
        display_order: 999,
        grid_width: 2,
        show_in_table: false,
      })
      .select()
      .single();

    if (err || !data) { setError(err?.message || 'Failed'); setSaving(false); return; }

    onAdd({
      id: data.id,
      label: data.label,
      type: 'custom',
      fieldType: data.field_type,
      isRequired: false,
      selectOptions: opts || undefined,
      linkedTable: linkedTable || undefined,
      width: DEFAULT_COL_WIDTH,
    });
    onClose();
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
          Column name
        </label>
        <input
          autoFocus
          value={label}
          onChange={e => { setLabel(e.target.value); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
          placeholder="e.g. Matter Number"
        />
      </div>

      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
          Field type
        </label>
        <div className="grid grid-cols-3 gap-2">
          {FIELD_TYPES.map(ft => {
            const Icon = ft.icon;
            return (
              <button
                key={ft.type}
                onClick={() => setFieldType(ft.type)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-left transition-all ${
                  fieldType === ft.type ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 hover:border-slate-300'
                }`}
              >
                <Icon size={13} className={ft.color} />
                <span className="text-[11px] font-medium text-slate-700">{ft.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {fieldType === 'select' && (
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
            Options (one per line)
          </label>
          <textarea
            value={selectOptions}
            onChange={e => setSelectOptions(e.target.value)}
            rows={4}
            placeholder={"Option A\nOption B\nOption C"}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100 resize-none"
          />
        </div>
      )}

      {fieldType === 'link' && (
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
            Link to table
          </label>
          <select
            value={linkedTable}
            onChange={e => setLinkedTable(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none appearance-none"
          >
            <option value="">Select table...</option>
            <option value="properties">Properties</option>
            <option value="entities">Entities</option>
            <option value="projects">Projects</option>
          </select>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-500 font-medium flex items-center gap-1.5">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      <button
        onClick={handleCreate}
        disabled={saving || !label.trim()}
        className="w-full py-3.5 bg-slate-900 text-white rounded-full text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : 'Add column'}
      </button>
    </div>
  );
}

// ── Property field picker (for projects table) ─────────────────────
function PropertyFieldPicker({
  companyId, existingColIds, onAdd, onClose,
}: {
  companyId: string;
  existingColIds: string[];
  onAdd: (col: SpreadsheetColumn) => void;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useProgressBarWhile(loading);

  useEffect(() => {
    supabase.rpc('get_schema_metadata', {
      target_table: 'properties',
      p_company_id: companyId,
    }).then(({ data }) => {
      setFields(
        (data || []).filter((c: any) =>
          (c.category === 'data' || c.category === 'relation') &&
          !c.is_hidden &&
          !existingColIds.includes(`property.${c.column_name}`)
        )
      );
      setLoading(false);
    });
  }, [companyId, existingColIds]);

  if (loading) return null;

  if (fields.length === 0) return (
    <p className="text-center text-[11px] text-slate-300 italic py-8">
      All property fields already added
    </p>
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Add a property field as a read/write column. Values are loaded from and saved to the linked parent property record.
      </p>
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {fields.map(field => {
          const ft = FIELD_TYPES.find(f => f.type === deriveFieldTypeFromPg(field.data_type));
          const Icon = ft?.icon || Type;
          return (
            <button
              key={field.column_name}
              onClick={() => {
                onAdd({
                  id: `property.${field.column_name}`,
                  label: `Property — ${field.label || deriveLabel(field.column_name)}`,
                  type: 'base',
                  fieldType: deriveFieldTypeFromPg(field.data_type),
                  isRequired: false,
                  width: 200,
                  linkedTable: 'properties',
                });
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all text-left"
            >
              <Icon size={14} className={ft?.color || 'text-slate-400'} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-slate-700 truncate">
                  {field.label || deriveLabel(field.column_name)}
                </p>
                <p className="text-[10px] text-slate-400">{field.column_name}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Add column modal ───────────────────────────────────────────────
function AddColumnModal({
  tableName, companyId, existingColIds, onAdd, onClose,
}: {
  tableName: BaseTable;
  companyId: string;
  existingColIds: string[];
  onAdd: (col: SpreadsheetColumn) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'custom' | 'property'>('custom');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-light uppercase tracking-wide text-slate-900">
            Add column
          </h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-black transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher — only shown for projects */}
        {tableName === 'projects' && (
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 mb-5">
            <button
              onClick={() => setMode('custom')}
              className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ${
                mode === 'custom' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Custom field
            </button>
            <button
              onClick={() => setMode('property')}
              className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                mode === 'property' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Building2 size={11} /> From property
            </button>
          </div>
        )}

        {mode === 'custom' && (
          <CustomFieldForm
            tableName={tableName}
            companyId={companyId}
            onAdd={onAdd}
            onClose={onClose}
          />
        )}

        {mode === 'property' && tableName === 'projects' && (
          <PropertyFieldPicker
            companyId={companyId}
            existingColIds={existingColIds}
            onAdd={onAdd}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

// ── Main spreadsheet ───────────────────────────────────────────────
export default function SpreadsheetEditor({
  tableName: initialTable = 'properties',
  onClose,
}: {
  tableName?: BaseTable;
  onClose?: () => void;
}) {
  const [tableName, setTableName] = useState<BaseTable>(initialTable);
  const [columns, setColumns] = useState<SpreadsheetColumn[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [rows, setRows] = useState<SpreadsheetRow[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddCol, setShowAddCol] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [resizing, setResizing] = useState<{
    colId: string; startX: number; startW: number;
  } | null>(null);
  const [savedCells, setSavedCells] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection>({ type: null });
  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const clipboard = useRef<{ type: 'column' | 'row'; data: string[] } | null>(null);
  const [clipboardLabel, setClipboardLabel] = useState<string | null>(null);
  const customFieldCache = useRef<Record<string, any>>({});
  const [recordCreatorTarget, setRecordCreatorTarget] = useState<{
  col: SpreadsheetColumn;
  rowIdx: number;
} | null>(null);

  const colMap = useMemo(
    () => new Map(columns.map(c => [c.id, c])),
    [columns]
  );

  const orderedColumns = useMemo(
    () => columnOrder.map(id => colMap.get(id)).filter(Boolean) as SpreadsheetColumn[],
    [columnOrder, colMap]
  );

  useProgressBarWhile(loading);

  // ── Effects ────────────────────────────────────────────────────────
  useEffect(() => { loadSchema(); }, [tableName]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      setColWidths(prev => ({ ...prev, [resizing.colId]: Math.max(100, resizing.startW + delta) }));
    };
    const onUp = () => setResizing(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [resizing]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      if (!cmdOrCtrl) return;

      if (e.key === 'c' && selection.type) {
        e.preventDefault();
        if (selection.type === 'column' && selection.colId) {
          const values = rows.map(r => r.values[selection.colId!] || '');
          clipboard.current = { type: 'column', data: values };
          const col = colMap.get(selection.colId);
          setClipboardLabel(`Column "${col?.label || selection.colId}" copied`);
          setTimeout(() => setClipboardLabel(null), 2000);
        } else if (selection.type === 'row' && selection.rowIdx !== undefined) {
          const row = rows[selection.rowIdx];
          if (row) {
            const values = orderedColumns.map(c => row.values[c.id] || '');
            clipboard.current = { type: 'row', data: values };
            setClipboardLabel(`Row ${selection.rowIdx + 1} copied`);
            setTimeout(() => setClipboardLabel(null), 2000);
          }
        }
      }

      if (e.key === 'v' && clipboard.current) {
        e.preventDefault();
        if (clipboard.current.type === 'column' && selection.type === 'column' && selection.colId) {
          const targetColId = selection.colId;
          clipboard.current.data.forEach((val, i) => {
            if (rows[i]) handleCellSave(i, targetColId, val);
          });
        } else if (clipboard.current.type === 'row') {
          const newValues = Object.fromEntries(
            orderedColumns.map((col, i) => [col.id, clipboard.current!.data[i] || ''])
          );
          const newRow: SpreadsheetRow = {
            id: `new_paste_${Date.now()}`,
            values: newValues,
            saving: {}, errors: {}, isNew: true, isSaving: false,
          };
          setRows(prev => {
            const next = [...prev];
            next.splice(prev.length - 1, 0, newRow);
            return next;
          });
          const primaryCol = PRIMARY_COL[tableName];
          const primaryVal = newValues[primaryCol];
          if (primaryVal) {
            setTimeout(() => handleCellSave(rows.length - 1, primaryCol, primaryVal), 100);
          }
        }
      }

      if (e.key === 'Escape') setSelection({ type: null });
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selection, rows, orderedColumns, tableName, colMap]);

  // ── Load schema ────────────────────────────────────────────────────
  const loadSchema = async () => {
  setLoading(true);
  setSelection({ type: null });

  // Always fetch fresh — never use cached company ID here
  // since the cache may be stale or not yet populated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('loadSchema: no authenticated user');
    setLoading(false);
    return;
  }
  if (!user) { setLoading(false); return; }

  const { data: prof } = await supabase
    .from('profiles')
    .select('active_company_id')
    .eq('id', user.id)
    .single();

  const cid = prof?.active_company_id || null;
  if (!cid) {
    console.error('loadSchema: no active_company_id on profile');
    setLoading(false);
    return;
  }

  setCompanyId(cid);


  // Now call get_schema_metadata with the confirmed company ID
  const { data: schemaCols, error: schemaErr } = await supabase.rpc('get_schema_metadata', {
    target_table: tableName,
    p_company_id: cid,
  });

  if (schemaErr) console.error('get_schema_metadata error:', schemaErr);

  const { data: customFields } = await supabase
    .from('company_custom_fields')
    .select('*')
    .eq('table_name', tableName)
    .is('deleted_at', null)
    .order('display_order');

    const baseCols: SpreadsheetColumn[] = (schemaCols || [])
    .filter((c: any) =>
        (c.category === 'data' || c.category === 'relation' || !c.category) &&
        !c.is_hidden
    )
    .map((c: any) => ({
        id: c.column_name,
        label: c.label || deriveLabel(c.column_name),
        type: 'base' as const,
        // Use 'relation' as fieldType for FK columns so loadRows knows to embed them
        fieldType: c.category === 'relation' ? 'relation' : deriveFieldTypeFromPg(c.data_type),
        isRequired: c.is_nullable === false,
        linkedTable: c.relation_table || undefined,
        width: DEFAULT_COL_WIDTH,
    }));

  const customCols: SpreadsheetColumn[] = (customFields || []).map((cf: any) => ({
    id: cf.id,
    label: cf.label,
    type: 'custom' as const,
    fieldType: cf.field_type,
    isRequired: cf.is_required,
    selectOptions: cf.select_options
      ? (typeof cf.select_options === 'string'
          ? JSON.parse(cf.select_options)
          : cf.select_options)
      : undefined,
    linkedTable: cf.linked_table || undefined,
    width: DEFAULT_COL_WIDTH,
  }));

  const allCols = [...baseCols, ...customCols];

  console.log('loadSchema debug:', {
    tableName,
    cid,
    schemaColsCount: schemaCols?.length,
    baseColsCount: baseCols.length,
    customColsCount: customCols.length,
  });

  setColumns(allCols);
  setColumnOrder(allCols.map(c => c.id));
  await loadRows(allCols, cid);
  setLoading(false);
};

  // ── Load rows ──────────────────────────────────────────────────────
const loadRows = async (cols: SpreadsheetColumn[], cid: string | null) => {
  const propertyCols = cols.filter(c => c.id.startsWith('property.'));
  const propertyFields = propertyCols.map(c => c.id.replace('property.', ''));

  const relationCols = cols.filter(c =>
    c.type === 'base' &&
    !c.id.startsWith('property.') &&
    c.fieldType === 'relation'
  );

  const embeds = relationCols.map(col => {
    const alias = col.id.replace(/_id$/, '');
    const displayCol = col.linkedTable === 'properties' ? 'street_address' : 'name';
    return `${alias}:${col.id}(id,${displayCol})`;
  });

  if (propertyCols.length > 0 && tableName === 'projects') {
    embeds.push(`property:property_id(id,${propertyFields.join(',')})`);
  }

  const selectStr = embeds.length > 0
    ? ['*', ...embeds].join(', ')
    : '*';

  // Check which filter/order columns actually exist on this table
  // to avoid 42703 errors on tables with different schemas
  const TABLE_HAS_DELETED_AT = ['properties', 'entities', 'projects'];
  const TABLE_ORDER_COL: Record<string, string> = {
    properties: 'id',       // properties has no created_at — use id
    entities: 'created_at',
    projects: 'created_at',
  };

  const orderCol = TABLE_ORDER_COL[tableName] || 'id';
  const hasDeletedAt = TABLE_HAS_DELETED_AT.includes(tableName);

  let query = supabase.from(tableName).select(selectStr);
  if (hasDeletedAt) query = query.is('deleted_at', null);
  query = query.order(orderCol, { ascending: false });

  const { data: records, error } = await query;

  if (error) {
    console.error('loadRows error:', error, 'selectStr:', selectStr);
    // Fallback — plain select with no embeds or filters
    let fallbackQuery = supabase.from(tableName).select('*');
    if (hasDeletedAt) fallbackQuery = fallbackQuery.is('deleted_at', null);
    const { data: fallback, error: fallbackError } = await fallbackQuery;
    if (fallbackError) {
      console.error('loadRows fallback also failed:', fallbackError);
      setRows([makeEmptyRow(cols, 0)]);
      setLoading(false);
      return;
    }
    const fallbackRows = (fallback || []).map((record: any) => ({
      id: record.id,
      values: Object.fromEntries(
        cols.filter(c => c.type === 'base').map(col => [
          col.id,
          record[col.id] != null ? String(record[col.id]) : ''
        ])
      ),
      saving: {}, errors: {}, isNew: false, isSaving: false,
    }));
    fallbackRows.push(makeEmptyRow(cols, fallbackRows.length));
    setRows(fallbackRows);
    return;
  }

  const customColIds = cols.filter(c => c.type === 'custom').map(c => c.id);
  let customValues: any[] = [];

  if (customColIds.length > 0 && records?.length) {
    const recordIds = records.map((r: any) => r.id);
    const { data: vals } = await supabase
      .from('company_custom_field_values')
      .select('field_id, record_id, value_text, value_number, value_date, value_boolean')
      .in('field_id', customColIds)
      .in('record_id', recordIds);
    customValues = vals || [];
  }

  const newRows: SpreadsheetRow[] = (records || []).map((record: any) => {
    const values: Record<string, string> = {};

    cols.filter(c => c.type === 'base' && !c.id.startsWith('property.')).forEach(col => {
      if (col.fieldType === 'relation') {
        const alias = col.id.replace(/_id$/, '');
        const embedded = record[alias];
        values[col.id] = embedded?.name ?? embedded?.street_address ?? '';
      } else {
        values[col.id] = record[col.id] != null ? String(record[col.id]) : '';
      }
    });

    if (tableName === 'projects') {
      propertyCols.forEach(col => {
        const field = col.id.replace('property.', '');
        values[col.id] = record.property?.[field] != null
          ? String(record.property[field])
          : '';
      });
    }

    cols.filter(c => c.type === 'custom').forEach(col => {
      const val = customValues.find(
        v => v.field_id === col.id && v.record_id === record.id
      );
      values[col.id] = val
        ? String(val.value_text ?? val.value_number ?? val.value_date ?? val.value_boolean ?? '')
        : '';
    });

    return { id: record.id, values, saving: {}, errors: {}, isNew: false, isSaving: false };
  });

  newRows.push(makeEmptyRow(cols, newRows.length));
  setRows(newRows);
};

  const makeEmptyRow = (cols: SpreadsheetColumn[], idx: number): SpreadsheetRow => ({
    id: `new_${idx}_${Date.now()}`,
    values: Object.fromEntries(cols.map(c => [c.id, ''])),
    saving: {}, errors: {}, isNew: true, isSaving: false,
  });

  // ── Custom field meta cache ────────────────────────────────────────
  const getCustomFieldMeta = async (fieldId: string) => {
    if (customFieldCache.current[fieldId]) return customFieldCache.current[fieldId];
    const { data } = await supabase
      .from('company_custom_fields').select('field_type').eq('id', fieldId).single();
    if (data) customFieldCache.current[fieldId] = data;
    return data;
  };

  const getValueColumn = (fieldType: string) => {
    if (['number', 'currency'].includes(fieldType)) return 'value_number';
    if (fieldType === 'date') return 'value_date';
    if (fieldType === 'boolean') return 'value_boolean';
    return 'value_text';
  };

  // ── Cell save ──────────────────────────────────────────────────────
  const handleCellSave = useCallback(async (rowIdx: number, colId: string, value: string) => {
    const row = rows[rowIdx];
    if (!row || !companyId) return;

    const col = columns.find(c => c.id === colId);
    if (!col) return;

    setRows(prev => prev.map((r, i) =>
      i === rowIdx ? { ...r, saving: { ...r.saving, [colId]: true } } : r
    ));

    try {
      // ── Property cross-column ──────────────────────────────────────
      if (colId.startsWith('property.') && !row.isNew) {
        const propertyField = colId.replace('property.', '');
        const { data: project } = await supabase
          .from('projects').select('property_id').eq('id', row.id).single();
        if (project?.property_id) {
          await supabase.from('properties')
            .update({ [propertyField]: value || null })
            .eq('id', project.property_id);
        }
        setRows(prev => prev.map((r, i) =>
          i === rowIdx
            ? { ...r, values: { ...r.values, [colId]: value }, saving: { ...r.saving, [colId]: false } }
            : r
        ));
        return;
      }

      let recordId = row.id;

      // ── New row — create the base record first ─────────────────────
      if (row.isNew) {
        const primaryCol = PRIMARY_COL[tableName];
        const primaryValue = colId === primaryCol ? value : row.values[primaryCol];

        if (!primaryValue && colId !== primaryCol) {
          setRows(prev => prev.map((r, i) =>
            i === rowIdx
              ? { ...r, values: { ...r.values, [colId]: value }, saving: { ...r.saving, [colId]: false } }
              : r
          ));
          return;
        }

        const insertData: Record<string, any> = {
          company_id: companyId,
          [primaryCol]: primaryValue || value,
        };
        columns
          .filter(c => c.type === 'base' && c.id !== primaryCol && !c.id.startsWith('property.'))
          .forEach(c => { if (row.values[c.id]) insertData[c.id] = row.values[c.id]; });
        if (colId !== primaryCol && col.type === 'base' && !colId.startsWith('property.')) {
          insertData[colId] = value;
        }

        const { data: newRecord, error } = await supabase
          .from(tableName).insert(insertData).select('id').single();
        if (error || !newRecord) throw error || new Error('Insert failed');

        recordId = newRecord.id;
        setRows(prev => {
          const updated = prev.map((r, i) =>
            i === rowIdx
              ? { ...r, id: recordId, isNew: false, values: { ...r.values, [colId]: value }, saving: { ...r.saving, [colId]: false } }
              : r
          );
          if (rowIdx === prev.length - 1) updated.push(makeEmptyRow(columns, updated.length));
          return updated;
        });

      } else {
        // ── Existing row ───────────────────────────────────────────────
        if (col.type === 'base') {
          const { error } = await supabase
            .from(tableName).update({ [colId]: value || null }).eq('id', recordId);
          if (error) throw error;
        } else {
          // Custom EAV field
            const fieldMeta = await getCustomFieldMeta(colId);
            const fieldType = fieldMeta?.field_type || 'text';
            
            // Property/entity fields store the created record's ID in value_text
            // The display value (address or name) is what we show in the cell
            const valueCol = ['number', 'currency'].includes(fieldType) ? 'value_number'
                : fieldType === 'date' ? 'value_date'
                : fieldType === 'boolean' ? 'value_boolean'
                : 'value_text'; // property, entity, text, email, url etc. all use value_text

            const { error } = await supabase
                .from('company_custom_field_values')
                .upsert({
                company_id: companyId,
                field_id: colId,
                record_id: recordId,
                table_name: tableName,
                [valueCol]: value || null,
                }, { onConflict: 'field_id,record_id' });
          if (error) throw error;
        }

        setRows(prev => prev.map((r, i) =>
          i === rowIdx
            ? { ...r, values: { ...r.values, [colId]: value }, saving: { ...r.saving, [colId]: false } }
            : r
        ));
      }

      // Flash saved indicator
      const cellKey = `${row.id}:${colId}`;
      setSavedCells(prev => new Set(prev).add(cellKey));
      setTimeout(() => setSavedCells(prev => {
        const n = new Set(prev); n.delete(cellKey); return n;
      }), 1500);

    } catch (err: any) {
      setRows(prev => prev.map((r, i) =>
        i === rowIdx
          ? { ...r, saving: { ...r.saving, [colId]: false }, errors: { ...r.errors, [colId]: err.message || 'Save failed' } }
          : r
      ));
    }
  }, [rows, columns, tableName, companyId]);

  // ── Column drag reorder ────────────────────────────────────────────
  const handleColDrop = async (targetColId: string) => {
    if (!draggedColId || draggedColId === targetColId) {
      setDraggedColId(null); setDragOverColId(null); return;
    }
    const newOrder = [...columnOrder];
    const fromIdx = newOrder.indexOf(draggedColId);
    const toIdx = newOrder.indexOf(targetColId);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedColId);
    setColumnOrder(newOrder);
    setDraggedColId(null); setDragOverColId(null);

    // Persist display_order for custom fields
    const customCols = newOrder.filter(id => colMap.get(id)?.type === 'custom');
    await Promise.all(
      customCols.map((id, i) =>
        supabase.from('company_custom_fields').update({ display_order: i }).eq('id', id)
      )
    );
  };

    const handleAddColumn = (col: SpreadsheetColumn) => {
    setColumns(prev => [...prev, col]);
    setColumnOrder(prev => [...prev, col.id]);
    setRows(prev => prev.map(r => ({
        ...r,
        values: { ...r.values, [col.id]: '' },
    })));
    // Don't reload schema — the column is already in state from the insert.
    // The next time loadSchema runs (table switch or page reload) it will
    // appear since it's persisted to company_custom_fields.
    };
  const totalWidth = orderedColumns.reduce((sum, c) => sum + (colWidths[c.id] || c.width), 0) + 52 + 48;

  if (loading) return null;

  return (
    <div className="flex flex-col h-full min-h-0 font-sans">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 mb-3 shrink-0 flex-wrap">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          {(['properties', 'entities', 'projects'] as BaseTable[]).map(t => (
            <button
              key={t}
              onClick={() => setTableName(t)}
              className={`px-4 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-all ${
                tableName === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {clipboardLabel && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-[10px] font-bold text-indigo-600">
            <Copy size={11} /> {clipboardLabel}
          </div>
        )}

        <div className="ml-auto flex items-center gap-4 text-[10px] text-slate-400 font-medium">
          <span className="hidden sm:block">
            Click column header to select · Click # to select row · ⌘C copy · ⌘V paste · Drag header to reorder
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            Auto-saving
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl select-none">
        <div style={{ minWidth: totalWidth }}>

          {/* Column headers */}
          <div className="flex sticky top-0 z-20 bg-slate-50 border-b border-slate-200">

            {/* Row number header */}
            <div className="w-12 shrink-0 border-r border-slate-200 flex items-center justify-center bg-slate-50">
              <span className="text-[9px] font-bold text-slate-300 uppercase">#</span>
            </div>

            {orderedColumns.map(col => {
              const ft = FIELD_TYPES.find(f => f.type === col.fieldType);
              const Icon = ft?.icon || Type;
              const w = colWidths[col.id] || col.width;
              const isSelected = selection.type === 'column' && selection.colId === col.id;
              const isDragOver = dragOverColId === col.id && draggedColId !== col.id;
              const isPropCol = col.id.startsWith('property.');

              return (
                <div
                  key={col.id}
                  className={`relative border-r border-slate-200 group/col cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-indigo-100'
                      : isDragOver
                      ? 'bg-indigo-50'
                      : 'bg-slate-50 hover:bg-slate-100'
                  }`}
                  style={{ width: w, minWidth: w, maxWidth: w }}
                  onClick={() => setSelection(prev =>
                    prev.type === 'column' && prev.colId === col.id
                      ? { type: null }
                      : { type: 'column', colId: col.id }
                  )}
                  draggable
                  onDragStart={e => { e.stopPropagation(); setDraggedColId(col.id); }}
                  onDragOver={e => { e.preventDefault(); if (col.id !== draggedColId) setDragOverColId(col.id); }}
                  onDrop={() => handleColDrop(col.id)}
                  onDragEnd={() => { setDraggedColId(null); setDragOverColId(null); }}
                >
                  <div className="flex items-center gap-1.5 px-3 py-2.5 h-full">
                    <GripVertical
                      size={11}
                      className="text-slate-300 opacity-0 group-hover/col:opacity-100 transition-opacity shrink-0 cursor-grab"
                    />
                    <Icon size={12} className={ft?.color || 'text-slate-400'} />
                    <span className="text-[11px] font-bold text-slate-600 truncate flex-1">
                      {col.label}
                    </span>
                    {isPropCol && (
                      <span className="text-[8px] font-bold uppercase text-amber-500 shrink-0">prop</span>
                    )}
                    {col.type === 'custom' && !isPropCol && (
                      <span className="text-[8px] font-bold uppercase text-indigo-400 shrink-0">custom</span>
                    )}
                    {isSelected && <Copy size={10} className="text-indigo-500 shrink-0" />}
                  </div>

                  {/* Drop indicator */}
                  {isDragOver && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500 z-10" />
                  )}

                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-400 opacity-0 group-hover/col:opacity-100 transition-opacity z-10"
                    onMouseDown={e => {
                      e.stopPropagation();
                      setResizing({ colId: col.id, startX: e.clientX, startW: w });
                    }}
                  />
                </div>
              );
            })}

            {/* Add column */}
            <div className="w-12 shrink-0 flex items-center justify-center bg-slate-50 border-l border-slate-200">
              <button
                onClick={() => setShowAddCol(true)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-indigo-600 transition-all"
                title="Add column"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Data rows */}
          {rows.map((row, rowIdx) => {
            const isRowSelected = selection.type === 'row' && selection.rowIdx === rowIdx;
            return (
              <div
                key={row.id}
                className={`flex border-b border-slate-100 transition-colors group/row ${
                  isRowSelected
                    ? 'bg-indigo-50/40'
                    : row.isNew
                    ? 'bg-slate-50/40'
                    : 'hover:bg-indigo-50/10'
                }`}
              >
                {/* Row number */}
                <div
                  className={`w-12 shrink-0 border-r border-slate-100 flex items-center justify-center cursor-pointer transition-colors ${
                    isRowSelected ? 'bg-indigo-100' : 'hover:bg-slate-100'
                  }`}
                  onClick={() => setSelection(prev =>
                    prev.type === 'row' && prev.rowIdx === rowIdx
                      ? { type: null }
                      : { type: 'row', rowIdx }
                  )}
                  title={row.isNew ? 'New row' : `Row ${rowIdx + 1} — ⌘C to copy`}
                >
                  {isRowSelected
                    ? <Copy size={10} className="text-indigo-500" />
                    : <span className="text-[10px] text-slate-300 font-mono select-none">
                        {row.isNew ? '+' : rowIdx + 1}
                      </span>
                  }
                </div>

                {orderedColumns.map(col => {
                  const w = colWidths[col.id] || col.width;
                  const cellKey = `${row.id}:${col.id}`;
                  const isSaved = savedCells.has(cellKey);
                  const isColSelected = selection.type === 'column' && selection.colId === col.id;

                  return (
                    <div
                      key={col.id}
                      className={`relative border-r border-slate-100 h-10 transition-colors ${
                        isSaved ? 'bg-emerald-50/50' : ''
                      }`}
                      style={{ width: w, minWidth: w, maxWidth: w }}
                    >
                      <Cell
                        col={col}
                        value={row.values[col.id] || ''}
                        onSave={(colId, value) => handleCellSave(rowIdx, colId, value)}
                        saving={row.saving[col.id] || false}
                        error={row.errors[col.id]}
                        isColSelected={isColSelected}
                        isRowSelected={isRowSelected}
                        onOpenRecordCreator={
                            (col.fieldType === 'property' || col.fieldType === 'entity')
                            ? (c) => setRecordCreatorTarget({ col: c, rowIdx })
                            : undefined }
                      />
                      {isSaved && (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">
                          <Check size={10} className="text-emerald-500" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add col spacer */}
                <div className="w-12 shrink-0" />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center gap-3 mt-2 shrink-0">
        <p className="text-[10px] text-slate-400 font-medium">
          {rows.filter(r => !r.isNew).length} records
          · {columns.filter(c => c.type === 'custom').length} custom fields
          {tableName === 'projects' && columns.filter(c => c.id.startsWith('property.')).length > 0 && (
            <span> · {columns.filter(c => c.id.startsWith('property.')).length} property fields</span>
          )}
        </p>
        <button
          onClick={() => setRows(prev => [...prev, makeEmptyRow(columns, prev.length)])}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <Plus size={12} /> Add row
        </button>
        {selection.type && (
          <button
            onClick={() => setSelection({ type: null })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-700 transition-colors ml-auto"
          >
            <X size={12} /> Clear selection (Esc)
          </button>
        )}
      </div>

      {/* ── Add column modal ── */}
      {showAddCol && companyId && (
        <AddColumnModal
          tableName={tableName}
          companyId={companyId}
          existingColIds={columns.map(c => c.id)}
          onAdd={handleAddColumn}
          onClose={() => setShowAddCol(false)}
        />
      )}
      
      {recordCreatorTarget && companyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
            <div className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-light uppercase tracking-wide text-slate-900">
                Create {recordCreatorTarget.col.fieldType}
                </h3>
                <button
                onClick={() => setRecordCreatorTarget(null)}
                className="p-2 text-slate-300 hover:text-black transition-colors"
                >
                <X size={18} />
                </button>
            </div>
            <RecordCreatorField
                fieldType={recordCreatorTarget.col.fieldType as 'property' | 'entity'}
                label={recordCreatorTarget.col.label}
                companyId={companyId}
                existingValue={rows[recordCreatorTarget.rowIdx]?.values[recordCreatorTarget.col.id] || undefined}
                onCreated={(recordId, displayValue) => {
                // Save the display value into the cell (UUID stored separately in custom field values)
                handleCellSave(recordCreatorTarget.rowIdx, recordCreatorTarget.col.id, displayValue);
                // Also store the UUID for proper linking
                handleCellSave(recordCreatorTarget.rowIdx, `${recordCreatorTarget.col.id}_id`, recordId);
                setRecordCreatorTarget(null);
                }}
      />
    </div>
  </div>
)}
    </div>
  );
}
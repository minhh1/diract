"use client";

import { useState } from "react";
import { X, Check, Loader2, Trash2 } from "lucide-react";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import type { CustomField, FieldType } from "./types";
import { getFieldTypeConfig } from "./types" 

const RELATION_TYPES: FieldType[] = ['table_relation', 'property', 'entity', 'project', 'link'];

interface Props {
  field: CustomField;
  onSave: (updates: Partial<CustomField>) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export default function FieldConfigPanel({ field, onSave, onDelete, onClose }: Props) {
  const { tables: customTables } = useCustomTables();
  const [draft, setDraft] = useState<CustomField>({ ...field });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectOptionsText, setSelectOptionsText] = useState(
    field.select_options?.join('\n') || ''
  );

  const update = (key: keyof CustomField, value: any) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    const updates = { ...draft };
    if (updates.field_type === 'select') {
      updates.select_options = selectOptionsText
        .split('\n').map(s => s.trim()).filter(Boolean);
    }
    await onSave(updates);
    setSaving(false);
  };

  const ftConfig = getFieldTypeConfig(draft.field_type);
  const FtIcon = ftConfig.icon;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${ftConfig.color}`}>
            <FtIcon size={16} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800 truncate max-w-[140px]">
              {draft.label || 'Untitled field'}
            </p>
            <p className="text-[10px] text-slate-400 uppercase font-bold">{ftConfig.label}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Config form */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Label */}
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
            Field label
          </label>
          <input
            value={draft.label}
            onChange={e => update('label', e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Help text */}
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
            Help text
          </label>
          <input
            value={draft.help_text || ''}
            onChange={e => update('help_text', e.target.value || null)}
            placeholder="Shown below the field"
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Section */}
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
            Section / group
          </label>
          <input
            value={draft.section_name || ''}
            onChange={e => update('section_name', e.target.value || null)}
            placeholder="e.g. Financial details"
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Grid width — system tables only */}
        {!field.isCustomTable && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Width
            </label>
            <div className="flex gap-2">
              {[{ v: 1, l: 'Full' }, { v: 2, l: 'Half' }, { v: 3, l: 'Third' }].map(opt => (
                <button
                  key={opt.v}
                  onClick={() => update('grid_width', opt.v)}
                  className={`flex-1 py-2 rounded-full text-[10px] font-bold transition-all ${
                    draft.grid_width === opt.v
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Select options */}
        {draft.field_type === 'select' && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Options (one per line)
            </label>
            <textarea
              value={selectOptionsText}
              onChange={e => setSelectOptionsText(e.target.value)}
              rows={5}
              placeholder={"Option A\nOption B\nOption C"}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </div>
        )}

        {/* Relation config */}
        {RELATION_TYPES.includes(draft.field_type) && (
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Link to table
              </label>
              <select
                value={draft.linked_table || draft.linked_table_id || ''}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {  // ← HERE
                  const val = e.target.value;
                  const isSystem = ['properties', 'entities', 'projects'].includes(val);
                  if (isSystem) {
                    update('linked_table', val);
                    update('linked_table_id', null);
                    update('linked_display_column',
                      val === 'properties' ? 'street_address' : 'name'
                    );
                  } else if (val) {
                    update('linked_table', null);
                    update('linked_table_id', val);
                    update('linked_display_column', 'name');
                  } else {
                    update('linked_table', null);
                    update('linked_table_id', null);
                  }

                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                <option value="">Select a table...</option>
                <optgroup label="System tables">
                  <option value="properties">Properties</option>
                  <option value="entities">Entities</option>
                  <option value="projects">Projects</option>
                </optgroup>
                {customTables.length > 0 && (
                  <optgroup label="Custom tables">
                    {customTables.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Display field
              </label>
              <input
                value={draft.linked_display_column || ''}
                onChange={e => update('linked_display_column', e.target.value || null)}
                placeholder={draft.linked_table === 'properties' ? 'street_address' : 'name'}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <p className="text-[10px] text-slate-400 mt-1 px-1">
                Which field from the linked record to display
              </p>
            </div>
          </div>
        )}

        {/* Auto ID config */}
        {draft.field_type === 'auto_id' && (
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                ID format
              </label>
              <select
                value={draft.auto_generate_type || 'sequential'}
                onChange={e => update('auto_generate_type', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                <option value="sequential">Sequential (1, 2, 3...)</option>
                <option value="custom_prefix">Custom prefix (e.g. PROP-001)</option>
                <option value="date_prefix">Date prefix (e.g. 2024-001)</option>
                <option value="uuid">UUID</option>
              </select>
            </div>
            {(['custom_prefix', 'date_prefix'] as string[]).includes(draft.auto_generate_type || '') && (
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                  Prefix
                </label>
                <input
                  value={draft.auto_generate_prefix || ''}
                  onChange={e => update('auto_generate_prefix', e.target.value || null)}
                  placeholder="e.g. PROP-"
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            )}
          </div>
        )}

        {/* Number / currency min/max */}
        {(['number', 'currency'] as FieldType[]).includes(draft.field_type) && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Min value
              </label>
              <input
                type="number"
                value={draft.validation_min ?? ''}
                onChange={e => update('validation_min', e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Max value
              </label>
              <input
                type="number"
                value={draft.validation_max ?? ''}
                onChange={e => update('validation_max', e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
        )}

        {/* Text regex validation */}
        {draft.field_type === 'text' && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Validation pattern (regex)
            </label>
            <input
              value={draft.validation_regex || ''}
              onChange={e => update('validation_regex', e.target.value || null)}
              placeholder="e.g. ^[A-Z]{2}\d{4}$"
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-mono text-[12px] outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        )}

        {/* Default value */}
        {!(['auto_id', 'link', 'boolean', 'property', 'entity', 'table_relation'] as FieldType[]).includes(draft.field_type) && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Default value
            </label>
            <input
              value={draft.default_value || ''}
              onChange={e => update('default_value', e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        )}

        {/* Constraints */}
        <div className="space-y-2">
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
            Constraints
          </label>
          {[
            { key: 'is_required',   label: 'Required — must have a value' },
            { key: 'is_unique',     label: 'Unique — no two records can share this value' },
            { key: 'show_in_table', label: 'Show in master table columns' },
          ].map(constraint => (
            <label key={constraint.key} className="flex items-center gap-3 cursor-pointer group">
              <div
                onClick={() => update(
                  constraint.key as keyof CustomField,
                  !draft[constraint.key as keyof CustomField]
                )}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${
                  draft[constraint.key as keyof CustomField]
                    ? 'bg-indigo-600 border-indigo-600'
                    : 'border-slate-200 group-hover:border-indigo-300'
                }`}
              >
                {draft[constraint.key as keyof CustomField] && (
                  <Check size={12} className="text-white" />
                )}
              </div>
              <span className="text-[12px] font-medium text-slate-600">{constraint.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-slate-100 flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3 bg-slate-900 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save field'}
        </button>
        <button
          onClick={async () => {
            if (!window.confirm('Delete this field? All data stored in it will also be deleted.')) return;
            setDeleting(true);
            await onDelete();
          }}
          disabled={deleting}
          className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
}
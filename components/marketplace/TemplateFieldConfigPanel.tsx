"use client";

// Field editor for a template's schema (see components/marketplace/TemplateTableBuilder.tsx).
// Deliberately mirrors components/schema/FieldConfigPanel.tsx's shape/callback
// pattern (onSave/onDelete) but operates on template_definition_table_fields
// or template_definition_system_fields instead of the live company_* tables —
// same idea as SchemaVisualisation.tsx serving both company_table_fields and
// company_custom_fields through one FieldConfigPanel.
import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { FIELD_TYPES } from "@/components/schema/types";
import type { FieldType } from "@/components/schema/types";

export interface TemplateFieldDraft {
  id: string;
  field_key: string;
  label: string;
  field_type: FieldType | string;
  select_options: string[] | null;
  is_required: boolean;
  is_unique: boolean;
  show_in_table?: boolean;
  section_name: string | null;
  help_text: string | null;
  linked_system_table: string | null;
  linked_template_table_id: string | null;
  linked_display_field: string | null;
}

const RELATION_TYPES: string[] = ['table_relation', 'entity', 'project', 'property'];

interface Props {
  field: TemplateFieldDraft;
  siblingTables: { id: string; name: string }[];
  allowTableRelation: boolean;
  onSave: (updates: Partial<TemplateFieldDraft>) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export default function TemplateFieldConfigPanel({ field, siblingTables, allowTableRelation, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<TemplateFieldDraft>(field);
  const [selectOptionsText, setSelectOptionsText] = useState((field.select_options || []).join('\n'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(field);
    setSelectOptionsText((field.select_options || []).join('\n'));
  }, [field.id]);

  const update = (key: keyof TemplateFieldDraft, value: any) => setDraft(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      ...draft,
      select_options: draft.field_type === 'select'
        ? selectOptionsText.split('\n').map(s => s.trim()).filter(Boolean)
        : null,
    });
    setSaving(false);
  };

  const linkValue = draft.linked_template_table_id || draft.linked_system_table || '';

  return (
    <div className="p-5 bg-white border border-slate-200 rounded-3xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Field settings</p>
        <div className="flex items-center gap-1">
          <button onClick={onDelete} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all" title="Delete field">
            <Trash2 size={13} />
          </button>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-black rounded-full transition-all">
            <X size={15} />
          </button>
        </div>
      </div>

      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Label</label>
        <input
          value={draft.label}
          onChange={e => update('label', e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Type</label>
        <select
          value={draft.field_type}
          onChange={e => update('field_type', e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
        >
          {FIELD_TYPES.filter(f => allowTableRelation || f.type !== 'table_relation').map(f => (
            <option key={f.type} value={f.type}>{f.label}</option>
          ))}
        </select>
      </div>

      {draft.field_type === 'select' && (
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Options (one per line)</label>
          <textarea
            value={selectOptionsText}
            onChange={e => setSelectOptionsText(e.target.value)}
            rows={4}
            placeholder={"Option A\nOption B"}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
          />
        </div>
      )}

      {RELATION_TYPES.includes(draft.field_type as string) && (
        <div className="space-y-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Link to</label>
            <select
              value={linkValue}
              onChange={e => {
                const val = e.target.value;
                const isSystem = ['properties', 'entities', 'projects'].includes(val);
                if (isSystem) {
                  update('linked_system_table', val);
                  update('linked_template_table_id', null);
                  update('linked_display_field', val === 'properties' ? 'street_address' : 'name');
                } else if (val) {
                  update('linked_system_table', null);
                  update('linked_template_table_id', val);
                  update('linked_display_field', 'name');
                } else {
                  update('linked_system_table', null);
                  update('linked_template_table_id', null);
                }
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
            >
              <option value="">Select...</option>
              <optgroup label="System tables">
                <option value="properties">Properties</option>
                <option value="entities">Entities</option>
                <option value="projects">Projects</option>
              </optgroup>
              {allowTableRelation && siblingTables.length > 0 && (
                <optgroup label="This template's tables">
                  {siblingTables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Display field</label>
            <input
              value={draft.linked_display_field || ''}
              onChange={e => update('linked_display_field', e.target.value || null)}
              placeholder="name"
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          <input type="checkbox" checked={draft.is_required} onChange={e => update('is_required', e.target.checked)} />
          Required
        </label>
        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          <input type="checkbox" checked={draft.is_unique} onChange={e => update('is_unique', e.target.checked)} />
          Unique
        </label>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !draft.label.trim()}
        className="w-full py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold uppercase tracking-widest disabled:opacity-50"
      >
        Save field
      </button>
    </div>
  );
}

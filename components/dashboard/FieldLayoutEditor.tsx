// components/dashboard/FieldLayoutEditor.tsx
"use client";

import { useState, useCallback } from "react";
import { GripVertical, X, Minus, Plus } from "lucide-react";

export interface FieldLayout {
  id: string;
  field_key: string;
  field_source: 'base' | 'custom';
  label: string;
  fieldType: string;
  col_start: number;
  col_span: number;
  row_order: number;
}

interface Props {
  fields: FieldLayout[];
  recordValues: Record<string, any>;
  isEditing: boolean;
  onSave: (fieldKey: string, value: any) => Promise<void>;
  onLayoutChange: (fields: FieldLayout[]) => void;
  onAddField: () => void;
  onRemoveField: (fieldKey: string) => void;
  linkedNames?: Record<string, string>;
}

// ── EditableValue ──────────────────────────────────────────────────

interface EditableValueProps {
  field: FieldLayout;
  value: any;
  onSave: (v: any) => Promise<void>;
  linkedNames?: Record<string, string>;
}

function EditableValue({ field, value, onSave, linkedNames }: EditableValueProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  };

  const display = (): string | null => {
    // Entity/property — show resolved name not raw UUID
    if (
      (field.fieldType === 'entity' || field.fieldType === 'property') &&
      linkedNames?.[field.id]
    ) {
      return linkedNames[field.id];
    }
    if (value === null || value === undefined || value === '') return null;
    if (field.fieldType === 'boolean') return value ? 'Yes' : 'No';
    if (field.fieldType === 'currency') {
      return `$${Number(value).toLocaleString('en-AU')}`;
    }
    if (field.fieldType === 'date') {
      try { return new Date(value).toLocaleDateString('en-AU'); } catch { return String(value); }
    }
    return String(value);
  };

  const displayVal = display();

  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
        {field.label}
      </p>

      {editing ? (
        <div className="flex items-center gap-2">
          {field.fieldType === 'boolean' ? (
            <select
              autoFocus
              value={String(draft)}
              onChange={e => setDraft(e.target.value === 'true')}
              className="flex-1 bg-slate-50 border border-indigo-300 rounded-full px-4 py-2 text-[13px] outline-none"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : field.fieldType === 'select' ? (
            // Select fields — could add options here if available
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') { setEditing(false); setDraft(value ?? ''); }
              }}
              className="flex-1 bg-slate-50 border border-indigo-300 rounded-full px-4 py-2 text-[13px] font-medium outline-none"
            />
          ) : (
            <input
              autoFocus
              type={
                field.fieldType === 'date' ? 'date'
                : field.fieldType === 'number' || field.fieldType === 'currency' ? 'number'
                : field.fieldType === 'email' ? 'email'
                : field.fieldType === 'url' ? 'url'
                : 'text'
              }
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') { setEditing(false); setDraft(value ?? ''); }
              }}
              placeholder={
                field.fieldType === 'entity' ? 'Entity name...'
                : field.fieldType === 'property' ? 'Street address...'
                : `Enter ${field.label.toLowerCase()}...`
              }
              className="flex-1 bg-slate-50 border border-indigo-300 rounded-full px-4 py-2 text-[13px] font-medium outline-none"
            />
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-2 bg-indigo-600 text-white rounded-full text-[10px] font-bold disabled:opacity-50 shrink-0"
          >
            {saving ? '...' : 'Save'}
          </button>
          <button
            onClick={() => { setEditing(false); setDraft(value ?? ''); }}
            className="px-3 py-2 bg-slate-50 text-slate-500 rounded-full text-[10px] font-bold shrink-0"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setEditing(true); setDraft(value ?? ''); }}
          className="flex items-center gap-2 group/field text-left w-full"
        >
          <span className={`text-[14px] font-medium transition-colors ${
            displayVal
              ? 'text-slate-800 group-hover/field:text-indigo-600'
              : 'text-slate-300 italic'
          }`}>
            {displayVal || 'Click to edit'}
          </span>
        </button>
      )}

      {/* Helper text for entity/property type */}
      {(field.fieldType === 'entity' || field.fieldType === 'property') && (
        <p className="text-[10px] text-slate-400 mt-1">
          {field.fieldType === 'entity'
            ? 'Type a name — will find or create an entity'
            : 'Type an address — will find or create a property'
          }
        </p>
      )}
    </div>
  );
}

// ── FieldLayoutEditor ──────────────────────────────────────────────

export default function FieldLayoutEditor({
  fields, recordValues, isEditing,
  onSave, onLayoutChange, onAddField, onRemoveField,
  linkedNames,
}: Props) {
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const handleDrop = (targetKey: string) => {
    if (!draggedKey || draggedKey === targetKey) {
      setDraggedKey(null); setDragOverKey(null); return;
    }
    const reordered = [...fields];
    const fromIdx = reordered.findIndex(f => f.field_key === draggedKey);
    const toIdx = reordered.findIndex(f => f.field_key === targetKey);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    onLayoutChange(reordered.map((f, i) => ({ ...f, row_order: i })));
    setDraggedKey(null); setDragOverKey(null);
  };

  const changeSpan = (fieldKey: string, delta: number) => {
    onLayoutChange(fields.map(f =>
      f.field_key === fieldKey
        ? { ...f, col_span: Math.min(12, Math.max(3, f.col_span + delta)) }
        : f
    ));
  };

  // Pack fields into 12-column rows
  const rows: FieldLayout[][] = [];
  let currentRow: FieldLayout[] = [];
  let currentWidth = 0;

  const sorted = [...fields].sort((a, b) => a.row_order - b.row_order);

  sorted.forEach(field => {
    if (currentWidth + field.col_span > 12) {
      if (currentRow.length) rows.push(currentRow);
      currentRow = [field];
      currentWidth = field.col_span;
    } else {
      currentRow.push(field);
      currentWidth += field.col_span;
    }
  });
  if (currentRow.length) rows.push(currentRow);

  // Resolve value for a field — custom fields keyed by UUID, base by column name
  const getFieldValue = (field: FieldLayout) => {
    if (field.field_source === 'custom') {
      return recordValues[field.id] ?? recordValues[field.field_key] ?? null;
    }
    return recordValues[field.field_key] ?? null;
  };

  // Save key — custom fields use UUID, base fields use column name
  const getSaveKey = (field: FieldLayout) => {
    return field.field_source === 'custom' ? field.id : field.field_key;
  };

  if (fields.length === 0 && !isEditing) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">
          No fields in this tab
        </p>
        <button
          onClick={onAddField}
          className="text-indigo-600 text-[11px] font-bold hover:underline"
        >
          Add a field
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="grid grid-cols-12 gap-5">
          {row.map(field => {
            const isDragOver = dragOverKey === field.field_key;

            return (
              <div
                key={field.field_key}
                draggable={isEditing}
                onDragStart={() => setDraggedKey(field.field_key)}
                onDragOver={e => { e.preventDefault(); setDragOverKey(field.field_key); }}
                onDrop={() => handleDrop(field.field_key)}
                onDragEnd={() => { setDraggedKey(null); setDragOverKey(null); }}
                style={{ gridColumn: `span ${field.col_span}` }}
                className={`relative group/field transition-all ${
                  isEditing
                    ? `border-2 rounded-2xl p-4 ${
                        isDragOver
                          ? 'border-indigo-500 bg-indigo-50/30'
                          : 'border-dashed border-slate-200 hover:border-slate-300'
                      }`
                    : 'py-2'
                }`}
              >
                {/* Edit mode controls */}
                {isEditing && (
                  <div className="flex items-center justify-between mb-2">
                    <GripVertical
                      size={14}
                      className="text-slate-300 cursor-grab active:cursor-grabbing"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => changeSpan(field.field_key, -3)}
                        disabled={field.col_span <= 3}
                        className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"
                        title="Make narrower"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="text-[9px] text-slate-300 font-mono w-8 text-center">
                        {field.col_span}/12
                      </span>
                      <button
                        onClick={() => changeSpan(field.field_key, 3)}
                        disabled={field.col_span >= 12}
                        className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"
                        title="Make wider"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        onClick={() => onRemoveField(field.field_key)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors ml-1"
                        title="Remove from tab"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                <EditableValue
                  field={field}
                  value={getFieldValue(field)}
                  onSave={v => onSave(getSaveKey(field), v)}
                  linkedNames={linkedNames}
                />
              </div>
            );
          })}
        </div>
      ))}

      {/* Add field button in edit mode */}
      {isEditing && (
        <button
          onClick={onAddField}
          className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-[11px] font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-all"
        >
          + Add field
        </button>
      )}
    </div>
  );
}
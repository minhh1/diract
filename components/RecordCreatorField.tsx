// components/RecordCreatorField.tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronDown, ChevronUp, Loader2, Check, AlertCircle, MapPin, Building2 } from "lucide-react";

interface RecordCreatorFieldProps {
  fieldType: 'property' | 'entity';
  label: string;
  companyId: string;
  onCreated: (recordId: string, displayValue: string) => void;
  existingValue?: string; // display value of already-created record
}

// Extra fields shown when the user expands the inline form
const PROPERTY_EXTRA_FIELDS = [
  { key: 'suburb',         label: 'Suburb',         type: 'text' },
  { key: 'state',          label: 'State',          type: 'text' },
  { key: 'postcode',       label: 'Postcode',       type: 'text' },
  { key: 'purchase_price', label: 'Purchase price', type: 'number' },
  { key: 'purchase_date',  label: 'Purchase date',  type: 'date' },
  { key: 'folio_identifier', label: 'Folio',        type: 'text' },
];

const ENTITY_EXTRA_FIELDS = [
  { key: 'entity_type', label: 'Entity type', type: 'text' },
  { key: 'abn',         label: 'ABN',         type: 'text' },
  { key: 'acn',         label: 'ACN',         type: 'text' },
];

export default function RecordCreatorField({
  fieldType, label, companyId, onCreated, existingValue,
}: RecordCreatorFieldProps) {
  const [primaryValue, setPrimaryValue] = useState('');
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(existingValue || null);

  const isProperty = fieldType === 'property';
  const extraFields = isProperty ? PROPERTY_EXTRA_FIELDS : ENTITY_EXTRA_FIELDS;
  const primaryLabel = isProperty ? 'Street address' : 'Entity name';
  const Icon = isProperty ? MapPin : Building2;
  const tableName = isProperty ? 'properties' : 'entities';
  const primaryKey = isProperty ? 'street_address' : 'name';

  const handleSave = async () => {
    if (!primaryValue.trim()) {
      setError(`${primaryLabel} is required`);
      return;
    }
    setSaving(true);
    setError(null);

    const insertData: Record<string, any> = {
      company_id: companyId,
      [primaryKey]: primaryValue.trim(),
    };

    // Add any extra fields that have values
    Object.entries(extraValues).forEach(([key, val]) => {
      if (val?.trim()) {
        if (key === 'purchase_price') {
          insertData[key] = parseFloat(val.replace(/[$,\s]/g, '')) || null;
        } else {
          insertData[key] = val.trim();
        }
      }
    });

    const { data, error: err } = await supabase
      .from(tableName)
      .insert(insertData)
      .select('id')
      .single();

    setSaving(false);

    if (err) {
      setError(err.message);
      return;
    }

    setCreated(primaryValue.trim());
    onCreated(data.id, primaryValue.trim());
  };

  // Already created — show the result
  if (created) {
    return (
      <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-2xl">
        <Check size={14} className="text-emerald-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            {label}
          </p>
          <p className="text-[13px] font-medium text-slate-800 truncate">{created}</p>
        </div>
        <span className="text-[9px] font-bold text-emerald-600 uppercase bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
          Created
        </span>
        <button
          onClick={() => setCreated(null)}
          className="text-[10px] text-slate-400 hover:text-slate-700 shrink-0"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      {/* Primary field */}
      <div className="flex items-center gap-3 p-3 bg-white">
        <Icon size={14} className="text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            {label} — {primaryLabel}
          </p>
          <input
            value={primaryValue}
            onChange={e => { setPrimaryValue(e.target.value); setError(null); }}
            placeholder={isProperty ? 'e.g. 12 Baker Street' : 'e.g. Smith Holdings Pty Ltd'}
            className="w-full text-[13px] font-medium text-slate-700 bg-transparent outline-none placeholder:text-slate-300"
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          />
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(p => !p)}
          className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors shrink-0"
          title="Add more fields"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || !primaryValue.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-full text-[10px] font-bold disabled:opacity-40 transition-all shrink-0"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Create
        </button>
      </div>

      {/* Expanded extra fields */}
      {expanded && (
        <div className="border-t border-slate-100 p-3 bg-slate-50/50 grid grid-cols-2 gap-3">
          {extraFields.map(field => (
            <div key={field.key}>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                {field.label}
              </label>
              <input
                type={field.type}
                value={extraValues[field.key] || ''}
                onChange={e => setExtraValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[12px] font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-red-50 border-t border-red-100 text-[11px] font-medium text-red-500">
          <AlertCircle size={11} /> {error}
        </div>
      )}
    </div>
  );
}
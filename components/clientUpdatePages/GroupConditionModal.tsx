// components/clientUpdatePages/GroupConditionModal.tsx
// Sets (or clears) a subgroup's condition -- when set, which matters show
// under this subgroup is computed live from a select-type column's value
// instead of being manually dragged in.
"use client";

import { useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";

interface ConditionField { id: string; label: string; field_type?: string; select_options?: string[] | null; }

export default function GroupConditionModal({ groupName, fields, currentFieldId, currentValue, onSave, onClose, onAddFieldOption }: {
  groupName: string;
  fields: ConditionField[];
  currentFieldId: string | null;
  currentValue: string | null;
  onSave: (fieldId: string | null, value: string | null) => void;
  onClose: () => void;
  onAddFieldOption?: (fieldId: string, option: string) => Promise<void>;
}) {
  const selectFields = fields.filter(f => f.field_type === "select" && f.select_options?.length);
  const [fieldId, setFieldId] = useState(currentFieldId || "");
  const [value, setValue] = useState(currentValue || "");
  const [addingOption, setAddingOption] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [savingOption, setSavingOption] = useState(false);

  const selectedField = selectFields.find(f => f.id === fieldId);

  const submitNewOption = async () => {
    if (!onAddFieldOption || !fieldId || !newOption.trim() || savingOption) return;
    setSavingOption(true);
    try {
      await onAddFieldOption(fieldId, newOption.trim());
      setValue(newOption.trim());
      setNewOption("");
      setAddingOption(false);
    } finally {
      setSavingOption(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-slate-800">Condition for "{groupName}"</h3>
          <button onClick={onClose} className="p-1 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <p className="text-[11px] text-slate-400">Show a matter here automatically when a column equals a value — instead of dragging it in manually.</p>

        {selectFields.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">No dropdown columns yet — add one (e.g. "Status") via Manage columns first.</p>
        ) : (
          <>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Column</p>
              <select value={fieldId} onChange={e => { setFieldId(e.target.value); setValue(""); }}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none bg-white">
                <option value="">— None (manual) —</option>
                {selectFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            {selectedField && (
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Equals</p>
                <select value={value} onChange={e => setValue(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none bg-white">
                  <option value="">— Select —</option>
                  {selectedField.select_options!.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {onAddFieldOption && (
                  addingOption ? (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <input value={newOption} onChange={e => setNewOption(e.target.value)} placeholder={`New ${selectedField.label} value`} autoFocus
                        onKeyDown={e => { if (e.key === "Enter") submitNewOption(); if (e.key === "Escape") setAddingOption(false); }}
                        className="flex-1 min-w-0 px-3 py-1.5 border border-indigo-300 rounded-full text-[11px] outline-none" />
                      <button onClick={submitNewOption} disabled={savingOption || !newOption.trim()}
                        className="p-1.5 text-indigo-600 hover:text-indigo-800 disabled:opacity-30 transition-colors shrink-0">
                        {savingOption ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingOption(true)}
                      className="flex items-center gap-1 mt-1.5 text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors">
                      <Plus size={11} /> Add a new {selectedField.label} value
                    </button>
                  )
                )}
              </div>
            )}
          </>
        )}

        <div className="flex gap-2">
          <button onClick={() => onSave(fieldId || null, fieldId ? value : null)} disabled={!!fieldId && !value}
            className="flex-1 py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            Save
          </button>
          {currentFieldId && (
            <button onClick={() => onSave(null, null)}
              className="px-4 py-3 border border-slate-200 text-slate-500 text-[12px] font-bold rounded-full hover:bg-slate-50 transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

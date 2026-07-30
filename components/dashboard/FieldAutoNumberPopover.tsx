// components/dashboard/FieldAutoNumberPopover.tsx
// Quick inline "Auto numbering" toggle, shown next to an eligible field
// (field_source 'custom', field_type 'text') in Record Dashboard's
// edit-layout mode (see FieldLayoutEditor.tsx) -- an admin who just wants
// to flip auto-numbering on/off for a field shouldn't have to leave the
// record and navigate to the full Schema/Custom Fields config panel to do
// it. Wraps the same AutoNumberConfig form fragment FieldConfigPanel.tsx
// uses, so behavior/options are identical either way.
"use client";

import { useState, useRef, useEffect } from "react";
import { Hash, X } from "lucide-react";
import AutoNumberConfig from "@/components/schema/AutoNumberConfig";
import { fetchHighestAssignedNumber, type AutoNumberConfigValue, type AutoNumberParentTable } from "@/lib/schema/autoNumberPresets";

interface Props {
  fieldId: string;
  // Which record table this field's values belong to -- lets "Continue
  // from latest" exclude actually-deleted records from the max-number scan
  // (an archived/Closed matter still counts -- its number was genuinely
  // issued, only a deleted one shouldn't be treated as "the latest").
  parentTable: AutoNumberParentTable;
  value: AutoNumberConfigValue;
  onSave: (next: AutoNumberConfigValue) => Promise<void>;
}

export default function FieldAutoNumberPopover({ fieldId, parentTable, value, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AutoNumberConfigValue>(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handleContinueFromLatest = async (): Promise<number | null> => {
    const valueTable = parentTable.kind === 'system' ? 'company_custom_field_values' : 'company_table_values';
    return fetchHighestAssignedNumber(fieldId, draft.prefix || '', valueTable, parentTable);
  };

  const handleClose = async () => {
    setOpen(false);
    if (draft.prefix === value.prefix && draft.start === value.start && draft.pad === value.pad) return;
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  };

  const isOn = value.prefix != null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        title={isOn ? 'Auto numbering is on' : 'Auto numbering is off'}
        className={`p-1 transition-colors ${isOn ? 'text-indigo-500 hover:text-indigo-700' : 'text-slate-300 hover:text-slate-600'}`}
      >
        <Hash size={12} />
      </button>
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute right-0 top-full mt-2 z-20 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Auto numbering</p>
            <button onClick={handleClose} className="p-1 text-slate-300 hover:text-slate-600 transition-colors">
              <X size={13} />
            </button>
          </div>
          <AutoNumberConfig
            value={draft}
            onChange={setDraft}
            onContinueFromLatest={handleContinueFromLatest}
          />
          {saving && <p className="text-[10px] text-slate-400 mt-2">Saving...</p>}
        </div>
      )}
    </div>
  );
}

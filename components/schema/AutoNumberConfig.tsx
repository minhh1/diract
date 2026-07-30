// components/schema/AutoNumberConfig.tsx
// Shared "Auto numbering" form fragment -- preset dropdown, prefix/pad/
// starting-number inputs, a "Continue from latest" button, and the live
// example preview. Used by FieldConfigPanel.tsx (the full schema/custom-
// fields config panel) and FieldAutoNumberPopover.tsx (the quick inline
// toggle next to a field in Record Dashboard's edit-layout mode) so the two
// entry points the user configures this from can never drift on behavior.
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AUTO_NUMBER_PRESETS, detectAutoNumberPreset, autoNumberExample, applyAutoNumberPreset,
  type AutoNumberConfigValue,
} from "@/lib/schema/autoNumberPresets";

interface Props {
  value: AutoNumberConfigValue;
  onChange: (next: AutoNumberConfigValue) => void;
  // Resolves the highest number already assigned under the current prefix,
  // or null when there's nothing to continue from (no existing values, or
  // none parse as a plain zero-padded counter under this prefix).
  onContinueFromLatest: () => Promise<number | null>;
}

export default function AutoNumberConfig({ value, onChange, onContinueFromLatest }: Props) {
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  const handleContinueFromLatest = async () => {
    setChecking(true);
    setCheckMsg(null);
    const max = await onContinueFromLatest();
    setChecking(false);
    if (max === null) { setCheckMsg('No existing numbers found to continue from.'); return; }
    onChange({ ...value, start: max + 1 });
    setCheckMsg(`Continuing from ${max} — next assigned will be ${max + 1}.`);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
          Auto numbering
        </label>
        <select
          value={detectAutoNumberPreset(value)}
          onChange={e => onChange(applyAutoNumberPreset(value, e.target.value))}
          className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
        >
          <option value="off">Off — typed by hand</option>
          {AUTO_NUMBER_PRESETS.map(p => (
            <option key={p.v} value={p.v}>{p.label}</option>
          ))}
          <option value="custom">Custom format</option>
        </select>
      </div>
      {value.prefix != null && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Prefix
              </label>
              <input
                value={value.prefix}
                onChange={e => onChange({ ...value, prefix: e.target.value })}
                placeholder={'e.g. LD- or {YY}'}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Counter digits
              </label>
              <select
                value={value.pad ?? 6}
                onChange={e => onChange({ ...value, pad: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                  <option key={n} value={n}>{n === 1 ? 'No padding' : `${n} digits`}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Starting number
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={value.start ?? ''}
                onChange={e => onChange({ ...value, start: e.target.value ? Number(e.target.value) : null })}
                placeholder="1"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={handleContinueFromLatest}
                disabled={checking}
                className="shrink-0 px-4 py-2.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {checking && <Loader2 size={12} className="animate-spin" />}
                Continue from latest
              </button>
            </div>
            {checkMsg && <p className="text-[10px] text-indigo-500 mt-1.5">{checkMsg}</p>}
          </div>
          <p className="text-[10px] text-slate-400 px-1">
            Next number will look like{' '}
            <span className="font-bold text-slate-600">{autoNumberExample(value)}</span>.
            Assigned when a record is created with this field left blank — an
            assigned number can still be edited (tick Unique below to block
            duplicates). The prefix understands {'{YY}'}, {'{YYYY}'} and {'{MM}'}{' '}
            date tokens; raising the starting number jumps future numbers
            forward, never backward.
          </p>
        </>
      )}
    </div>
  );
}

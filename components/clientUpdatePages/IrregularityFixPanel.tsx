// components/clientUpdatePages/IrregularityFixPanel.tsx
// One-click "fix this field" for an Irregularities board row -- shown in
// the expanded row area instead of NotesPanel/EmailsPanel (custom_table
// pages don't have those). Talks to
// app/api/client-update-pages/[id]/items/[itemId]/fix/route.ts, which
// resolves the exact flagged entity + field from the row's own
// entity/target_field_key columns (see the migration this backs) and
// writes straight onto that entity -- never onto the irregularity row
// itself, which is trigger-managed and flips to Resolved on its own once
// the underlying entity is genuinely fixed.
"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Wrench, Check } from "lucide-react";
import RelationPicker from "@/components/dashboard/RelationPicker";

interface FixTarget {
  entityId: string; entityName: string; fieldKey: string; fieldLabel: string; fieldType: string;
  selectOptions?: string[] | null; currentValue: any; currentLabel?: string | null;
}

export default function IrregularityFixPanel({ pageId, itemId, canEdit }: { pageId: string; itemId: string; canEdit: boolean }) {
  const [target, setTarget] = useState<FixTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setSaved(false);
    const json = await fetch(`/api/client-update-pages/${pageId}/items/${itemId}/fix`).then(r => r.json());
    if (json.fieldKey) {
      setTarget(json);
      setDraft(json.fieldType === "entity" ? json.currentValue : (json.currentValue ?? ""));
    }
    setLoading(false);
  }, [pageId, itemId]);

  useEffect(() => { load(); }, [load]);

  const save = async (overrideValue?: any) => {
    const value = overrideValue !== undefined ? overrideValue : draft;
    setSaving(true);
    const res = await fetch(`/api/client-update-pages/${pageId}/items/${itemId}/fix`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); load(); }
  };

  if (loading) return <div className="border-t border-slate-100 pt-3"><Loader2 size={14} className="animate-spin text-slate-300" /></div>;
  if (!target) return null;

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <p className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
        <Wrench size={11} className="text-indigo-400" /> Fix: {target.fieldLabel} on {target.entityName}
      </p>
      {!canEdit ? (
        <p className="text-[11px] text-slate-500">{target.currentLabel ?? target.currentValue ?? <span className="text-slate-300 italic">Not set</span>}</p>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          {target.fieldType === "entity" ? (
            <div className="min-w-[200px]">
              <RelationPicker linkedSystemTable="entities" value={draft} initialLabel={target.currentLabel ?? undefined}
                onSelect={(id) => { setDraft(id); save(id); }} placeholder="Search entities..." size="sm" />
            </div>
          ) : target.fieldType === "select" && target.selectOptions?.length ? (
            <select value={draft ?? ""} onChange={e => { setDraft(e.target.value); save(e.target.value); }}
              className="text-[12px] border border-slate-200 rounded-full px-3 py-1.5 outline-none bg-white">
              <option value="">— Select —</option>
              {target.selectOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : target.fieldType === "boolean" ? (
            <div className="flex gap-2">
              {["true", "false"].map(v => (
                <button key={v} onClick={() => { setDraft(v === "true"); save(v === "true"); }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${String(draft) === v ? "bg-indigo-600 text-white" : "bg-slate-50 border border-slate-200 text-slate-500"}`}>
                  {v === "true" ? "Yes" : "No"}
                </button>
              ))}
            </div>
          ) : (
            <>
              <input value={draft ?? ""} onChange={e => setDraft(e.target.value)} type={target.fieldType === "date" ? "date" : "text"}
                onKeyDown={e => { if (e.key === "Enter") save(); }}
                placeholder={target.fieldLabel} className="flex-1 min-w-[160px] px-3 py-1.5 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
              <button onClick={() => save()} disabled={saving} className="px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full disabled:opacity-40">
                {saving ? <Loader2 size={12} className="animate-spin" /> : "Save"}
              </button>
            </>
          )}
          {saved && <span className="flex items-center gap-1 text-[10px] text-emerald-600"><Check size={11} /> Saved</span>}
        </div>
      )}
    </div>
  );
}

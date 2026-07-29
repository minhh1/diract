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
//
// Duplicate Name is the one rule where "fix" doesn't mean editing a field
// (its target_field_key, 'name', is just a normal renameable native field)
// -- it means merging the two duplicate entities together, so it gets its
// own branch (fieldType 'duplicate_merge') instead of falling into the
// generic editors below.
"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Wrench, Check, GitMerge } from "lucide-react";
import RelationPicker from "@/components/dashboard/RelationPicker";

interface FixTarget {
  entityId: string; entityName: string; fieldKey: string; fieldLabel: string; fieldType: string;
  selectOptions?: string[] | null; currentValue: any; currentLabel?: string | null;
  duplicateEntityId?: string | null; duplicateEntityName?: string | null;
}

export default function IrregularityFixPanel({ pageId, itemId, canEdit, bordered = true }: { pageId: string; itemId: string; canEdit: boolean; bordered?: boolean }) {
  const [target, setTarget] = useState<FixTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [merged, setMerged] = useState(false);

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

  const merge = async () => {
    if (!target?.duplicateEntityId) return;
    if (!window.confirm(`Keep "${target.entityName}" and merge "${target.duplicateEntityName}" into it? Anything referencing "${target.duplicateEntityName}" will be repointed to "${target.entityName}", then "${target.duplicateEntityName}" will be archived.`)) return;
    setMerging(true);
    setMergeError(null);
    const res = await fetch(`/api/client-update-pages/${pageId}/items/${itemId}/fix`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mergeId: target.duplicateEntityId }),
    });
    setMerging(false);
    if (res.ok) { setMerged(true); load(); }
    else { const json = await res.json().catch(() => ({})); setMergeError(json.error || "Couldn't merge these records."); }
  };

  if (loading) return <div className={bordered ? "border-t border-slate-100 pt-3" : ""}><Loader2 size={14} className="animate-spin text-slate-300" /></div>;
  if (!target) return null;

  if (target.fieldType === "duplicate_merge") {
    return (
      <div className={`${bordered ? "border-t border-slate-100 pt-3" : ""} space-y-2`}>
        <p className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
          <Wrench size={11} className="text-indigo-400" /> Fix: Duplicate Name
        </p>
        {!target.duplicateEntityId ? (
          <p className="text-[11px] text-slate-500 italic">No other active entity shares this name anymore.</p>
        ) : !canEdit ? (
          <p className="text-[11px] text-slate-500">Duplicate of <span className="font-semibold">{target.duplicateEntityName}</span></p>
        ) : merged ? (
          <span className="flex items-center gap-1 text-[10px] text-emerald-600"><Check size={11} /> Merged</span>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-600">
              Keep <span className="font-semibold">{target.entityName}</span>, merge and archive <span className="font-semibold">{target.duplicateEntityName}</span>.
            </p>
            <button onClick={merge} disabled={merging}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full disabled:opacity-40">
              {merging ? <Loader2 size={12} className="animate-spin" /> : <GitMerge size={12} />} Merge duplicates
            </button>
            {mergeError && <p className="text-[10px] text-rose-600">{mergeError}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${bordered ? "border-t border-slate-100 pt-3" : ""} space-y-2`}>
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

"use client";

// Lets a company admin rename the three system tables (e.g. "Projects" ->
// "Matters" for a law firm) and, just as importantly, undo that rename.
// companies.table_label_overrides is otherwise only ever written by the
// marketplace template install/uninstall flow (see
// supabase/template_marketplace.sql) -- this is the one place a company can
// view and directly control it, independent of any template.
import { useState } from "react";
import { Tag, Pencil, RotateCcw, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany, type TableLabelOverride } from "@/components/CompanyContext";

const DEFAULT_LABELS: Record<string, TableLabelOverride> = {
  projects: { singular: "Project", plural: "Projects" },
  properties: { singular: "Property", plural: "Properties" },
  entities: { singular: "Entity", plural: "Entities" },
};

export default function TableLabelsPanel() {
  const { companyId, isAdmin, tableLabelOverrides, refreshTableLabelOverrides } = useCompany();
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<TableLabelOverride>({ singular: "", plural: "" });
  const [saving, setSaving] = useState<string | null>(null);

  const startEdit = (slug: string) => {
    const current = tableLabelOverrides[slug] || DEFAULT_LABELS[slug];
    setDraft({ singular: current.singular, plural: current.plural });
    setEditingSlug(slug);
  };

  const save = async (slug: string) => {
    if (!companyId || !draft.singular.trim() || !draft.plural.trim()) return;
    setSaving(slug);
    const next = { ...tableLabelOverrides, [slug]: { singular: draft.singular.trim(), plural: draft.plural.trim() } };
    const { error } = await supabase.from("companies").update({ table_label_overrides: next }).eq("id", companyId);
    setSaving(null);
    if (error) { alert(error.message); return; }
    setEditingSlug(null);
    await refreshTableLabelOverrides();
  };

  const reset = async (slug: string) => {
    if (!companyId) return;
    if (!window.confirm(`Reset "${(tableLabelOverrides[slug] || DEFAULT_LABELS[slug]).plural}" back to its default name "${DEFAULT_LABELS[slug].plural}"?`)) return;
    setSaving(slug);
    const next = { ...tableLabelOverrides };
    delete next[slug];
    const { error } = await supabase.from("companies").update({ table_label_overrides: next }).eq("id", companyId);
    setSaving(null);
    if (error) { alert(error.message); return; }
    await refreshTableLabelOverrides();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-slate-50 rounded-2xl text-slate-400"><Tag size={20} /></div>
        <div>
          <p className="text-[15px] font-medium text-slate-700">Table names</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Rename Projects/Properties/Entities for this company — e.g. "Projects" &rarr; "Matters". Renaming here only changes the label everyone sees; it never touches the underlying data.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {Object.keys(DEFAULT_LABELS).map(slug => {
          const override = tableLabelOverrides[slug];
          const effective = override || DEFAULT_LABELS[slug];
          const isEditing = editingSlug === slug;
          const isSaving = saving === slug;

          return (
            <div key={slug} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
              {isEditing ? (
                <>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      value={draft.singular}
                      onChange={e => setDraft(d => ({ ...d, singular: e.target.value }))}
                      placeholder="Singular, e.g. Matter"
                      className="px-3 py-2 text-[12px] border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400"
                    />
                    <input
                      value={draft.plural}
                      onChange={e => setDraft(d => ({ ...d, plural: e.target.value }))}
                      placeholder="Plural, e.g. Matters"
                      className="px-3 py-2 text-[12px] border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <button onClick={() => save(slug)} disabled={isSaving} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all disabled:opacity-50">
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button onClick={() => setEditingSlug(null)} disabled={isSaving} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all">
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-800">{effective.plural}</p>
                    <p className="text-[10px] text-slate-400">
                      Default: {DEFAULT_LABELS[slug].plural}{override ? ' · renamed' : ''}
                    </p>
                  </div>
                  {isAdmin && (
                    <>
                      {override && (
                        <button
                          onClick={() => reset(slug)}
                          disabled={isSaving}
                          title="Reset to default name"
                          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-500 rounded-full text-[10px] font-bold hover:border-red-300 hover:text-red-600 transition-all disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                          Reset
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(slug)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-500 rounded-full text-[10px] font-bold hover:border-indigo-300 hover:text-indigo-600 transition-all"
                      >
                        <Pencil size={11} /> Rename
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

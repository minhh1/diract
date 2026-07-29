"use client";

import { useState } from "react";
import { X, Loader2, Plus, Sparkles } from "lucide-react";
import FieldValueInput from "./FieldValueInput";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";

// Picks the fields the create prompt asks for: the table's primary field
// (or first enterable field) plus every other required field, so a record
// created here already satisfies every is_required constraint up front
// instead of being left incomplete until someone finishes it off in the
// grid. Auto-numbered and formula fields are assigned by the system, so
// they never appear here. Empty means the table has no enterable field at
// all (records for it can't be created from the master view).
export function pickCreateFields(
  fields: CustomTableField[],
  primaryFieldKey: string | null | undefined
): CustomTableField[] {
  const enterable = fields.filter(f => f.auto_number_prefix == null && !f.formula_type);
  const primary = enterable.find(f => f.field_key === primaryFieldKey) || enterable[0] || null;
  if (!primary) return [];
  const required = enterable.filter(f => f.is_required && f.id !== primary.id);
  return [primary, ...required];
}

interface Props {
  tableName: string;
  fields: CustomTableField[];
  // Returns an error message to show, or null when the record was created
  // (the caller navigates away / closes the modal on success).
  onCreate: (values: Record<string, any>) => Promise<string | null>;
  onClose: () => void;
  // Pre-fills `values` before the user touches anything (e.g. locking the
  // matter to a project the caller already knows, or seeding a description
  // from elsewhere) — omit for the plain empty-record prompt every existing
  // caller still gets.
  initialValues?: Record<string, any>;
  // Field to show a "Rewrite with AI" button under, calling
  // /api/ai/rewrite-text on that field's current value and committing the
  // result back into it — same one-shot rewrite MyTasksButtonWidget uses,
  // just inline in the full field list instead of a separate drafts panel.
  aiRewriteFieldKey?: string;
}

// Asks for the primary field plus every other required field before
// anything is persisted, so the "New record" flows can never leave empty OR
// incomplete-required rows behind (createRecord in
// lib/services/customTableService.ts refuses valueless/invalid creates
// outright — this just surfaces that requirement up front instead of after
// a failed submit).
export default function NewRecordModal({ tableName, fields, onCreate, onClose, initialValues, aiRewriteFieldKey }: Props) {
  const [values, setValues] = useState<Record<string, any>>(initialValues || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  // FieldValueInput's text control is an uncontrolled <input defaultValue={...}> (commits
  // onBlur, not on every keystroke, so typing doesn't fight external updates) — bumping this
  // remounts just that one field after a rewrite so the new text actually shows on screen;
  // setValues alone updates what gets submitted but never what's rendered.
  const [rewriteVersion, setRewriteVersion] = useState(0);

  const handleRewrite = async () => {
    if (!aiRewriteFieldKey) return;
    setRewriting(true);
    setRewriteError(null);
    try {
      const res = await fetch('/api/ai/rewrite-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: values[aiRewriteFieldKey] || '' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Rewrite failed');
      setValues(p => ({ ...p, [aiRewriteFieldKey]: json.text }));
      setRewriteVersion(v => v + 1);
    } catch (err) {
      setRewriteError(err instanceof Error ? err.message : 'Rewrite failed');
    } finally {
      setRewriting(false);
    }
  };

  const isEmpty = (v: any) => v === null || v === undefined || v === '';
  const missingCount = fields.filter(f => isEmpty(values[f.field_key])).length;

  // Not a native `disabled` button (see below) -- text/number fields in
  // FieldValueInput commit onBlur, not on every keystroke, so `values` (and
  // therefore missingCount) lags one field behind while it still has focus.
  // A disabled button can't receive the click that would blur that field,
  // so the first click did nothing and the user had to click twice. This
  // still refuses to submit incomplete -- it just does that check here,
  // AFTER the click's own blur has already flushed the real value in, not
  // via an attribute that blocks the click from happening at all.
  const handleCreate = async () => {
    if (missingCount || saving) return;
    setSaving(true);
    setError(null);
    const err = await onCreate(values);
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm mx-4 p-8 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[13px] font-bold uppercase tracking-tight text-slate-800">
            New {tableName} record
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          {fields.map(field => (
            <div key={field.id}>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                {field.label}{field.is_required && <span className="text-red-400 ml-1">*</span>}
              </label>
              <FieldValueInput
                key={field.field_key === aiRewriteFieldKey ? `${field.id}-${rewriteVersion}` : field.id}
                field={field}
                value={values[field.field_key] ?? null}
                onCommit={v => setValues(p => ({ ...p, [field.field_key]: v }))}
                isPrimaryField={field.id === fields[0]?.id}
              />
              {field.field_key === aiRewriteFieldKey && (
                <>
                  <button
                    onClick={handleRewrite}
                    disabled={rewriting}
                    className="mt-1.5 flex items-center gap-1 py-1 px-2.5 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold hover:bg-slate-100 disabled:opacity-50 transition-all"
                  >
                    {rewriting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Rewrite with AI
                  </button>
                  {rewriteError && <p className="text-[10px] text-red-500 font-medium mt-1">{rewriteError}</p>}
                </>
              )}
            </div>
          ))}
        </div>
        {error && <p className="text-[11px] text-red-500 mt-3 px-1">{error}</p>}
        <button
          onClick={handleCreate}
          aria-disabled={!!missingCount || saving}
          className={`w-full mt-6 py-3 bg-slate-900 text-white rounded-full text-[11px] font-bold flex items-center justify-center gap-2 transition-colors ${
            missingCount || saving ? 'opacity-40 cursor-default' : 'hover:bg-slate-700'
          }`}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Create
        </button>
      </div>
    </div>
  );
}

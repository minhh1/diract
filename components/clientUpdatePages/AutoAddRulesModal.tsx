// components/clientUpdatePages/AutoAddRulesModal.tsx
// Staff-only config for client_update_auto_add_rules -- see
// supabase/migrations/20260729300000_client_update_auto_add_rules.sql for
// the trigger that actually applies these against new records.
"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Plus, Trash2 } from "lucide-react";

interface RuleField { id: string; label: string; field_type: string; }
interface Rule { id: string; field_id: string; operator: string; value: string | null; is_active: boolean; fieldLabel: string; }

const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  select: [
    { value: "equals", label: "is" },
    { value: "not_equals", label: "is not" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  email: [
    { value: "contains", label: "contains" },
    { value: "equals", label: "is exactly" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  default: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "equals", label: "is exactly" },
    { value: "not_equals", label: "is not" },
    { value: "starts_with", label: "starts with" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
};

function operatorsFor(fieldType: string) {
  return OPERATORS_BY_TYPE[fieldType] || OPERATORS_BY_TYPE.default;
}

function operatorLabel(op: string) {
  return OPERATORS_BY_TYPE.default.find(o => o.value === op)?.label || op;
}

export default function AutoAddRulesModal({ pageId, recordLabel, onClose }: { pageId: string; recordLabel: string; onClose: () => void }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [fields, setFields] = useState<RuleField[]>([]);
  const [fieldId, setFieldId] = useState("");
  const [operator, setOperator] = useState("equals");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/client-update-pages/${pageId}/auto-add-rules`).then(r => r.json()).then(json => {
      setRules(json.rules || []);
      setFields(json.fields || []);
    });
  }, [pageId]);

  const selectedField = fields.find(f => f.id === fieldId);
  useEffect(() => {
    if (selectedField) setOperator(operatorsFor(selectedField.field_type)[0].value);
  }, [fieldId]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsValue = !["is_empty", "is_not_empty"].includes(operator);

  const addRule = async () => {
    if (!fieldId || (needsValue && !value.trim()) || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/client-update-pages/${pageId}/auto-add-rules`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId, operator, value: needsValue ? value.trim() : null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { window.alert(json.error || "Couldn't add that rule"); return; }
      setRules(prev => [...(prev || []), json.rule]);
      setFieldId("");
      setValue("");
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (ruleId: string) => {
    setDeletingId(ruleId);
    const prevRules = rules;
    setRules(prev => (prev || []).filter(r => r.id !== ruleId));
    const res = await fetch(`/api/client-update-pages/${pageId}/auto-add-rules/${ruleId}`, { method: "DELETE" });
    if (!res.ok) { setRules(prevRules); window.alert("Couldn't remove that rule"); }
    setDeletingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Auto-add rules</h3>
          <button onClick={onClose} title="Close" className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          <p className="text-[11px] text-slate-400">
            When a new {recordLabel} is created with a matching field value, it's added here automatically. Doesn't apply retroactively to existing {recordLabel}s.
          </p>

          {rules === null ? (
            <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
          ) : rules.length > 0 && (
            <div className="space-y-2">
              {rules.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 rounded-2xl text-[12px]">
                  <span className="text-slate-600 truncate">
                    <span className="font-bold text-slate-800">{r.fieldLabel}</span> {operatorLabel(r.operator)} {r.value ? `"${r.value}"` : ""}
                  </span>
                  <button onClick={() => removeRule(r.id)} disabled={deletingId === r.id} title="Remove this rule"
                    className="p-1 text-slate-300 hover:text-red-600 disabled:opacity-40 transition-colors shrink-0">
                    {deletingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Add a rule</p>
            {fields.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">No additional fields on this table yet.</p>
            ) : (
              <select value={fieldId} onChange={e => setFieldId(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none bg-white">
                <option value="">- Select a field -</option>
                {fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            )}
            {fieldId && (
              <>
                <select value={operator} onChange={e => setOperator(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none bg-white">
                  {operatorsFor(selectedField?.field_type || "default").map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {needsValue && (
                  <input value={value} onChange={e => setValue(e.target.value)} placeholder="Value"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none" />
                )}
                <button onClick={addRule} disabled={saving || !fieldId || (needsValue && !value.trim())}
                  className="w-full flex items-center justify-center gap-1.5 py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add rule
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

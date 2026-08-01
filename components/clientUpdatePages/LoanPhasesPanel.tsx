// components/clientUpdatePages/LoanPhasesPanel.tsx
// Interest Only/Amortizing phase sequence for a loan, shown inline in an
// expanded row on the Niksen Loans board (see MatterBoard.tsx's
// LOAN_PHASES_BASE_TABLE_ID gate) -- the same
// app/api/finance-model/loan-phases route the per-project LoansSubtab's
// own phase editor already talks to, just a standalone, edit-in-place
// version so phases can be fixed up without leaving the portfolio-wide
// table for the per-project Finance Model tab. Every phase row is
// editable directly (not just add/delete), since most existing phases
// were derived from messy free text on import and often need correcting.
"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Loader2, CalendarRange } from "lucide-react";

interface Phase {
  id: string;
  phase_order: number;
  repayment_type: string | null;
  start_date: string | null;
  end_date: string | null;
  payment_frequency: string | null;
  notes: string | null;
}

const REPAYMENT_TYPES = ["Interest Only", "Amortizing"];
const FREQUENCIES = ["Monthly", "Quarterly", "Six-Monthly", "Annually", "At Maturity"];

export default function LoanPhasesPanel({ loanId, canEdit }: { loanId: string; canEdit: boolean }) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newPhase, setNewPhase] = useState({ repaymentType: "Interest Only", startDate: "", endDate: "", paymentFrequency: "Monthly" });

  const load = useCallback(async () => {
    setLoading(true);
    const json = await fetch(`/api/finance-model/loan-phases?loanId=${loanId}`).then(r => r.json());
    setPhases((json.phases || []).sort((a: Phase, b: Phase) => (a.phase_order ?? 0) - (b.phase_order ?? 0)));
    setLoading(false);
  }, [loanId]);

  useEffect(() => { load(); }, [load]);

  const patchPhase = async (id: string, updates: Record<string, any>) => {
    setPhases(prev => prev.map(p => (p.id === id ? { ...p, ...toPhaseShape(updates) } : p)));
    await fetch("/api/finance-model/loan-phases", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }),
    });
  };

  const deletePhase = async (id: string) => {
    setPhases(prev => prev.filter(p => p.id !== id));
    await fetch(`/api/finance-model/loan-phases?id=${id}`, { method: "DELETE" });
  };

  const addPhase = async () => {
    if (!newPhase.startDate || !newPhase.endDate || saving) return;
    setSaving(true);
    await fetch("/api/finance-model/loan-phases", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loanId, ...newPhase }),
    });
    setNewPhase({ repaymentType: "Interest Only", startDate: "", endDate: "", paymentFrequency: "Monthly" });
    setAdding(false);
    setSaving(false);
    load();
  };

  if (loading) return <div className="border-t border-slate-100 pt-3"><Loader2 size={14} className="animate-spin text-slate-300" /></div>;

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <p className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
        <CalendarRange size={11} className="text-indigo-400" /> Loan Phases
      </p>
      {phases.length === 0 && <p className="text-[11px] text-slate-300 italic">No phases yet.</p>}
      <div className="space-y-1.5">
        {phases.map(p => (
          <div key={p.id} className="flex items-center gap-1.5 flex-wrap bg-slate-50 rounded-xl px-2.5 py-1.5">
            {canEdit ? (
              <>
                <select value={p.repayment_type || ""} onChange={e => patchPhase(p.id, { repaymentType: e.target.value })}
                  className="text-[11px] font-bold text-slate-700 border border-slate-200 rounded-lg px-1.5 py-1 bg-white outline-none">
                  {REPAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="date" value={p.start_date || ""} onChange={e => patchPhase(p.id, { startDate: e.target.value })}
                  className="text-[11px] text-slate-600 border border-slate-200 rounded-lg px-1.5 py-1 bg-white outline-none" />
                <span className="text-slate-300">→</span>
                <input type="date" value={p.end_date || ""} onChange={e => patchPhase(p.id, { endDate: e.target.value })}
                  className="text-[11px] text-slate-600 border border-slate-200 rounded-lg px-1.5 py-1 bg-white outline-none" />
                <select value={p.payment_frequency || ""} onChange={e => patchPhase(p.id, { paymentFrequency: e.target.value })}
                  className="text-[11px] text-slate-500 border border-slate-200 rounded-lg px-1.5 py-1 bg-white outline-none">
                  {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <input value={p.notes || ""} onChange={e => setPhases(prev => prev.map(x => (x.id === p.id ? { ...x, notes: e.target.value } : x)))}
                  onBlur={e => patchPhase(p.id, { notes: e.target.value })} placeholder="Notes"
                  className="flex-1 min-w-[120px] text-[11px] text-slate-500 border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none" />
                <button onClick={() => deletePhase(p.id)} className="text-slate-300 hover:text-rose-500 shrink-0"><X size={12} /></button>
              </>
            ) : (
              <>
                <span className="font-bold text-slate-700 text-[11px]">{p.repayment_type}</span>
                <span className="text-slate-500 text-[11px]">{p.start_date} → {p.end_date}</span>
                <span className="text-slate-400 text-[11px]">{p.payment_frequency}</span>
                {p.notes && <span className="text-slate-400 text-[11px] italic truncate">{p.notes}</span>}
              </>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        adding ? (
          <div className="flex items-center gap-1.5 flex-wrap bg-slate-50/60 rounded-xl px-2.5 py-1.5">
            <select value={newPhase.repaymentType} onChange={e => setNewPhase(p => ({ ...p, repaymentType: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white">
              {REPAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="date" value={newPhase.startDate} onChange={e => setNewPhase(p => ({ ...p, startDate: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white" />
            <input type="date" value={newPhase.endDate} onChange={e => setNewPhase(p => ({ ...p, endDate: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white" />
            <select value={newPhase.paymentFrequency} onChange={e => setNewPhase(p => ({ ...p, paymentFrequency: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white">
              {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <button onClick={addPhase} disabled={saving || !newPhase.startDate || !newPhase.endDate}
              className="text-[11px] font-bold bg-indigo-600 text-white rounded-lg px-2.5 py-1 disabled:opacity-40">
              {saving ? <Loader2 size={11} className="animate-spin" /> : "Add"}
            </button>
            <button onClick={() => setAdding(false)} className="text-[11px] text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors">
            <Plus size={12} /> Add phase
          </button>
        )
      )}
    </div>
  );
}

// Optimistic local update uses the same camelCase keys the PATCH body
// does; the phase rows themselves are snake_case (mirrors the API's own
// response shape), so map before merging into local state.
function toPhaseShape(updates: Record<string, any>): Partial<Phase> {
  const out: Partial<Phase> = {};
  if (updates.repaymentType !== undefined) out.repayment_type = updates.repaymentType;
  if (updates.startDate !== undefined) out.start_date = updates.startDate;
  if (updates.endDate !== undefined) out.end_date = updates.endDate;
  if (updates.paymentFrequency !== undefined) out.payment_frequency = updates.paymentFrequency;
  if (updates.notes !== undefined) out.notes = updates.notes;
  return out;
}

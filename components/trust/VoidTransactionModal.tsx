"use client";

// Void a trust transaction -- Trust Transactions is append-only (Legal
// Profession Uniform General Rules 2015 r40), so this can never edit or
// delete the row. void_trust_transaction() (see
// supabase/migrations/20260804030000_void_trust_transaction.sql) creates a
// reversing entry instead and marks the original as voided -- a reason is
// mandatory, and only a company admin can call it (server-enforced, this
// modal is only ever reachable from a button already gated on isAdmin).
import { useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

function voidErrorMessage(raw: string): string | null {
  if (raw.includes('VOID_ADMIN_ONLY')) return 'Only a company admin can void a trust transaction.';
  if (raw.includes('VOID_ALREADY')) return 'This transaction has already been voided.';
  if (raw.includes('VOID_REASON_REQUIRED')) return 'Enter a reason for voiding this transaction.';
  if (raw.includes('LEDGER_OVERDRAW')) return "Voiding this would overdraw the matter's trust ledger -- the funds have already moved elsewhere.";
  return null;
}

export default function VoidTransactionModal({
  tableId, recordId, description, onClose, onVoided,
}: {
  tableId: string;
  recordId: string;
  description: string;
  onClose: () => void;
  onVoided: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!reason.trim()) { setError('Enter a reason for voiding this transaction.'); return; }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('void_trust_transaction', {
      p_table_id: tableId, p_record_id: recordId, p_reason: reason.trim(),
    });
    setSaving(false);
    if (rpcError) {
      setError(voidErrorMessage(rpcError.message) || rpcError.message);
      return;
    }
    onVoided();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
              <AlertTriangle size={15} className="text-rose-600" />
            </div>
            <h3 className="text-[15px] font-bold text-slate-800">Void Transaction</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-black"><X size={16} /></button>
        </div>

        <p className="text-[12px] text-slate-500 leading-relaxed">
          This can't be undone. Trust records are append-only, so voiding <span className="font-semibold text-slate-700">{description}</span> creates a reversing entry rather than deleting it.
        </p>

        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Reason for voiding (required)</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-sm font-medium outline-none resize-none"
            placeholder="e.g. Entered against the wrong matter" />
        </div>

        {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !reason.trim()} className="flex-1 py-3 bg-rose-600 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Void Transaction
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

// Protect Funds -- a hold on part of a matter's trust balance, NOT a ledger
// movement (no debit/credit, no Trust Transactions row): it only reduces
// "Available" in the Trust Account page's stat header while the hold is
// active. Writes to the Trust Protected Funds table (a plain, non-ledger
// custom table) directly.
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { createRecord as createCustomRecord } from "@/lib/services/customTableService";
import RelationPicker from "../dashboard/RelationPicker";

export default function ProtectFundsModal({
  companyId, userId, trustAccountId, availableBalance, onClose, onProtected,
}: {
  companyId: string; userId: string; trustAccountId: string; availableBalance: number;
  onClose: () => void;
  onProtected: () => void;
}) {
  const protectedTable = useCustomTable('trust-protected-funds');
  const [matterId, setMatterId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const amt = parseFloat(amount) || 0;
    if (!matterId) { setError('Select a matter.'); return; }
    if (amt <= 0) { setError('Enter an amount to protect.'); return; }
    if (!reason.trim()) { setError('A reason is required.'); return; }
    if (amt > availableBalance) { setError(`Cannot protect more than the available balance (${availableBalance.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}).`); return; }
    if (!protectedTable.tableDef) { setError('Still loading, try again in a moment.'); return; }

    setSaving(true);
    const result = await createCustomRecord(protectedTable.tableDef.id, companyId, userId, {
      matter: matterId, trust_account: trustAccountId, amount: amt, reason: reason.trim(), date_protected: date,
    }, protectedTable.fields);
    setSaving(false);
    if (!result || 'error' in result) {
      setError((result && 'error' in result && result.error) || 'Could not protect these funds, please try again.');
      return;
    }
    onProtected();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-slate-800">Protect Funds</h3>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-black"><X size={16} /></button>
        </div>

        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Matter</label>
          <RelationPicker linkedSystemTable="projects" displayField="name" value={matterId} onSelect={id => setMatterId(id)} placeholder="Select a matter..." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Amount</label>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
        </div>

        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Reason</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Disputed settlement funds"
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
        </div>

        {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-amber-600 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Protect Funds
          </button>
        </div>
      </div>
    </div>
  );
}

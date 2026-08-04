"use client";

// Transfer Funds -- moves part of one matter's trust balance to another
// matter within the SAME trust account (a Journal Transfer). Two paired
// ledger rows (withdrawal on the source, deposit on the destination); each
// gets its own receipt number -- unlike a deposit, there's no physical
// banking event to consolidate onto one shared number.
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createRecord as createCustomRecord } from "@/lib/services/customTableService";
import type { useCustomTable } from "@/lib/hooks/useCustomTable";
import RelationPicker from "../dashboard/RelationPicker";

export default function TransferFundsModal({
  companyId, userId, trustAccountId, trustTable, onClose, onTransferred,
}: {
  companyId: string; userId: string; trustAccountId: string;
  trustTable: ReturnType<typeof useCustomTable>;
  onClose: () => void;
  onTransferred: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fromMatterId, setFromMatterId] = useState<string | null>(null);
  const [fromMatterLabel, setFromMatterLabel] = useState<string | null>(null);
  const [toMatterId, setToMatterId] = useState<string | null>(null);
  const [toMatterLabel, setToMatterLabel] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const amt = parseFloat(amount) || 0;
    if (!fromMatterId || !toMatterId) { setError('Select both a from and a to matter.'); return; }
    if (fromMatterId === toMatterId) { setError('From and to matters must be different.'); return; }
    if (amt <= 0) { setError('Enter an amount to transfer.'); return; }

    setSaving(true);
    const out = await createCustomRecord(trustTable.tableDef!.id, companyId, userId, {
      date, trust_account: trustAccountId, type: 'Journal Transfer',
      matter: fromMatterId, amount_out: amt, payor_payee: toMatterLabel, purpose: reason.trim() || `Transfer to ${toMatterLabel}`,
    }, trustTable.fields);
    if (!out || 'error' in out) {
      setError((out && 'error' in out && out.error) || 'Could not record the transfer, please try again.');
      setSaving(false);
      return;
    }
    const inRes = await createCustomRecord(trustTable.tableDef!.id, companyId, userId, {
      date, trust_account: trustAccountId, type: 'Journal Transfer',
      matter: toMatterId, amount_in: amt, payor_payee: fromMatterLabel, purpose: reason.trim() || `Transfer from ${fromMatterLabel}`,
    }, trustTable.fields);
    setSaving(false);
    if (!inRes || 'error' in inRes) {
      setError((inRes && 'error' in inRes && inRes.error) || 'Withdrawal recorded, but the matching deposit failed. Please check the ledger.');
      return;
    }
    onTransferred();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-slate-800">Transfer Funds</h3>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-black"><X size={16} /></button>
        </div>

        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">From matter</label>
          <RelationPicker linkedSystemTable="projects" displayField="name" value={fromMatterId}
            onSelect={(id, label) => { setFromMatterId(id); setFromMatterLabel(label); }} placeholder="Select a matter..." />
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">To matter</label>
          <RelationPicker linkedSystemTable="projects" displayField="name" value={toMatterId}
            onSelect={(id, label) => { setToMatterId(id); setToMatterLabel(label); }} placeholder="Select a matter..." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Amount</label>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
          <div className="min-w-0">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
        </div>

        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Reason</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional"
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
        </div>

        {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-teal-700 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Transfer
          </button>
        </div>
      </div>
    </div>
  );
}

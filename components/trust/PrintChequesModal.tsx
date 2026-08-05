"use client";

// Print Cheques -- a trust withdrawal by cheque. cheque_number is a SECOND
// auto-numbered field on Trust Transactions (receipt_number already claims
// insert_ledger_record's own auto-fill slot), so it's assigned here
// directly via next_field_sequence() before the ledger insert -- see
// supabase/migrations/20260731100000_trust_account_page.sql's header
// comment on why that's safe independent of ledger context.
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createRecord as createCustomRecord } from "@/lib/services/customTableService";
import { auTodayStr } from "@/lib/companyLocalDate";
import type { useCustomTable } from "@/lib/hooks/useCustomTable";
import RelationPicker from "../dashboard/RelationPicker";
import PdfPreviewModal from "../dashboard/PdfPreviewModal";

export default function PrintChequesModal({
  companyId, userId, trustAccountId, trustTable, onClose, onPrinted,
}: {
  companyId: string; userId: string; trustAccountId: string;
  trustTable: ReturnType<typeof useCustomTable>;
  onClose: () => void;
  onPrinted: () => void;
}) {
  const [matterId, setMatterId] = useState<string | null>(null);
  const [payTo, setPayTo] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(auTodayStr());
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printedRecordId, setPrintedRecordId] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const amt = parseFloat(amount) || 0;
    if (!matterId) { setError('Select a matter.'); return; }
    if (!payTo.trim()) { setError('Enter who this cheque is payable to.'); return; }
    if (amt <= 0) { setError('Enter an amount.'); return; }
    const chequeField = trustTable.fields.find(f => f.field_key === 'cheque_number');
    if (!chequeField || !trustTable.tableDef) { setError('Still loading, try again in a moment.'); return; }

    setSaving(true);
    const { data: chequeNumber } = await supabase.rpc('next_field_sequence', { p_field_id: chequeField.id });
    const result = await createCustomRecord(trustTable.tableDef.id, companyId, userId, {
      date, trust_account: trustAccountId, type: 'Withdrawal - Cheque', payment_method: 'Cheque',
      matter: matterId, payor_payee: payTo.trim(), purpose: memo.trim() || undefined,
      amount_out: amt, cheque_number: chequeNumber || undefined, bank_reference: chequeNumber || undefined,
    }, trustTable.fields);
    setSaving(false);
    if (!result || 'error' in result) {
      setError((result && 'error' in result && result.error) || 'Could not record this cheque, please try again.');
      return;
    }
    setPrintedRecordId(result.id);
  };

  if (printedRecordId) {
    return (
      <PdfPreviewModal
        src={`/api/trust-cheques/${printedRecordId}/pdf`}
        downloadSrc={`/api/trust-cheques/${printedRecordId}/pdf?download=1`}
        title="Trust cheque"
        onClose={onPrinted}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-slate-800">Print Cheques</h3>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-black"><X size={16} /></button>
        </div>

        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Matter</label>
          <RelationPicker linkedSystemTable="projects" displayField="name" value={matterId} onSelect={id => setMatterId(id)} placeholder="Select a matter..." />
        </div>

        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Pay to</label>
          <input value={payTo} onChange={e => setPayTo(e.target.value)} placeholder="Payee name"
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
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
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Memo</label>
          <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="Optional"
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
        </div>

        {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-slate-900 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Generate cheque
          </button>
        </div>
      </div>
    </div>
  );
}

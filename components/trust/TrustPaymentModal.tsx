"use client";

// Trust Payment -- a general trust withdrawal, broader than Print Cheques
// (which only ever produces a Withdrawal - Cheque paid by 'Cheque'). Covers
// Bank Cheque / Bank Transfer / Direct Debit / Trust Cheque, each mapping
// onto the existing type taxonomy (Cheque-flavoured types -> 'Withdrawal -
// Cheque', EFT-flavoured types -> 'Withdrawal - EFT'); insert_ledger_record
// auto-assigns payment_number for both (see
// supabase/migrations/20260802160000_trust_split_payment_journal_numbers.sql),
// so this never calls next_field_sequence itself the way PrintChequesModal
// does for cheque_number.
import { useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createRecord as createCustomRecord } from "@/lib/services/customTableService";
import type { useCustomTable, CustomTableRecord } from "@/lib/hooks/useCustomTable";
import RelationPicker from "../dashboard/RelationPicker";
import PdfPreviewModal from "../dashboard/PdfPreviewModal";

const PAYMENT_TYPES = ['Bank Cheque', 'Bank Transfer', 'Direct Debit', 'Trust Cheque'];
const TRANSFER_TYPES = ['Direct Deposit', 'BPAY'];

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function ledgerTypeFor(paymentType: string): 'Withdrawal - Cheque' | 'Withdrawal - EFT' {
  return paymentType === 'Bank Cheque' || paymentType === 'Trust Cheque' ? 'Withdrawal - Cheque' : 'Withdrawal - EFT';
}

export default function TrustPaymentModal({
  companyId, userId, trustAccountId, trustAccounts, trustTable, fixedMatterId, fixedMatterLabel, onClose, onProcessed,
}: {
  companyId: string; userId: string; trustAccountId: string; trustAccounts: CustomTableRecord[];
  trustTable: ReturnType<typeof useCustomTable>;
  fixedMatterId?: string; fixedMatterLabel?: string;
  onClose: () => void;
  onProcessed: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(trustAccountId);
  const [matterId, setMatterId] = useState<string | null>(fixedMatterId ?? null);
  const [payToId, setPayToId] = useState<string | null>(null);
  const [payToLabel, setPayToLabel] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState(PAYMENT_TYPES[1]); // 'Bank Transfer' -- most common
  const [transferType, setTransferType] = useState(TRANSFER_TYPES[0]);
  const [accountName, setAccountName] = useState('');
  const [payeeBsb, setPayeeBsb] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [reason, setReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [openPdfAfter, setOpenPdfAfter] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processedRecordId, setProcessedRecordId] = useState<string | null>(null);
  const [processedNumber, setProcessedNumber] = useState<string | null>(null);

  const isEft = paymentType === 'Bank Transfer' || paymentType === 'Direct Debit';

  // Matter's current balance in this trust account -- same running-balance
  // math insert_ledger_record itself does server-side (sum of amount_in -
  // amount_out scoped by matter + trust_account), not a read of the last
  // row's stored running_balance, since ledger rows aren't guaranteed to be
  // in date order (a backdated entry would make "last by date" wrong).
  const matterBalance = useMemo(() => {
    if (!matterId) return null;
    return trustTable.records
      .filter(r => String(r.values.matter || '') === matterId && (r.values.trust_account || null) === accountId)
      .reduce((s, r) => s + (Number(r.values.amount_in) || 0) - (Number(r.values.amount_out) || 0), 0);
  }, [trustTable.records, matterId, accountId]);

  const amt = parseFloat(amount) || 0;
  const availableAfter = matterBalance != null ? matterBalance - amt : null;

  const handleSubmit = async () => {
    setError(null);
    if (!matterId) { setError('Select a matter.'); return; }
    if (!payToLabel) { setError('Select who this payment is to.'); return; }
    if (amt <= 0) { setError('Enter an amount.'); return; }
    if (!trustTable.tableDef) { setError('Still loading, try again in a moment.'); return; }

    setSaving(true);
    const result = await createCustomRecord(trustTable.tableDef.id, companyId, userId, {
      date, trust_account: accountId, type: ledgerTypeFor(paymentType), payment_method: paymentType,
      matter: matterId, payor_payee: payToLabel, purpose: reason.trim() || undefined,
      amount_out: amt,
      transfer_type: isEft ? transferType : undefined,
      account_name: accountName.trim() || undefined,
      payee_bsb: payeeBsb.trim() || undefined,
      account_number: accountNumber.trim() || undefined,
      internal_note: internalNote.trim() || undefined,
    }, trustTable.fields);
    setSaving(false);
    if (!result || 'error' in result) {
      setError((result && 'error' in result && result.error) || 'Could not record this payment, please try again.');
      return;
    }
    setProcessedRecordId(result.id);
    setProcessedNumber(result.number || null);
    if (!openPdfAfter) onProcessed();
  };

  if (processedRecordId && openPdfAfter) {
    return (
      <PdfPreviewModal
        src={`/api/trust-payments/${processedRecordId}/pdf`}
        downloadSrc={`/api/trust-payments/${processedRecordId}/pdf?download=1`}
        title={processedNumber ? `Payment ${processedNumber}` : 'Trust payment'}
        onClose={onProcessed}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl p-6 space-y-4 my-8">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-slate-800">Trust Payment</h3>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-black"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Date processed</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Matter</label>
            {fixedMatterId ? (
              <div className="w-full bg-slate-100 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium text-slate-500">{fixedMatterLabel}</div>
            ) : (
              <RelationPicker linkedSystemTable="projects" displayField="name" value={matterId} onSelect={id => setMatterId(id)} placeholder="Select a matter..." />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Account</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none">
              {trustAccounts.map(a => <option key={a.id} value={a.id}>{a.values.account_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Paid to</label>
            <RelationPicker linkedSystemTable="entities" displayField="name" value={payToId}
              onSelect={(id, label) => { setPayToId(id); setPayToLabel(label); }} placeholder="Select a contact..." allowCreateEntity />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 pl-7 pr-4 text-sm font-medium outline-none" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Available after payment</label>
            <div className={`w-full bg-slate-100 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-bold ${availableAfter != null && availableAfter < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
              {matterId ? money(availableAfter ?? 0) : '—'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Type</label>
            <select value={paymentType} onChange={e => setPaymentType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none">
              {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Reference</label>
            <div className="w-full bg-slate-100 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium text-slate-400">
              {processedNumber || 'AUTO GENERATED'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {isEft ? (
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Transfer type</label>
              <select value={transferType} onChange={e => setTransferType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none">
                {TRANSFER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ) : <div />}
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Account name</label>
            <input value={accountName} onChange={e => setAccountName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" placeholder="Optional" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">BSB</label>
            <input value={payeeBsb} onChange={e => setPayeeBsb(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" placeholder="Optional" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Account number</label>
            <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" placeholder="Optional" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Reason</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-sm font-medium outline-none resize-none" placeholder="Optional" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Internal note</label>
            <textarea value={internalNote} onChange={e => setInternalNote(e.target.value)} rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-sm font-medium outline-none resize-none" placeholder="Office-only, not printed" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-500 cursor-pointer">
          <input type="checkbox" checked={openPdfAfter} onChange={e => setOpenPdfAfter(e.target.checked)} className="rounded" />
          Open PDF payment detail now
        </label>

        {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-slate-900 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Process
          </button>
        </div>
      </div>
    </div>
  );
}

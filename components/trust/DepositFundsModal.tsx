"use client";

// Deposit Funds -- can allocate one deposit across multiple matters, each
// its own ledger row (insert_ledger_record is matter-scoped, so a single
// row can't cover more than one matter's balance), but every row shares ONE
// receipt number: the first insert leaves receipt_number blank (server
// auto-assigns it), every subsequent row passes that same value back in
// explicitly. Matches Smokeball's "one receipt indicates payments across
// multiple matters" behaviour (confirmed via their own support docs) and
// needs zero backend changes -- insert_ledger_record only auto-fills a
// field that arrives empty.
import { useState } from "react";
import { X, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createRecord as createCustomRecord } from "@/lib/services/customTableService";
import type { useCustomTable, CustomTableRecord } from "@/lib/hooks/useCustomTable";
import RelationPicker from "../dashboard/RelationPicker";

const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cheque', 'Credit Card'];

interface MatterRow { id: number; matterId: string | null; matterLabel: string | null; amount: string; }
let nextRowId = 1;

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

export default function DepositFundsModal({
  companyId, userId, trustAccountId, trustAccounts, trustTable, fixedMatterId, fixedMatterLabel, onClose, onDeposited,
}: {
  companyId: string; userId: string; trustAccountId: string; trustAccounts: CustomTableRecord[];
  trustTable: ReturnType<typeof useCustomTable>;
  fixedMatterId?: string; fixedMatterLabel?: string;
  onClose: () => void;
  onDeposited: (receiptNumber: string) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(trustAccountId);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [entityLabel, setEntityLabel] = useState<string | null>(null);
  const [entityAddress, setEntityAddress] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [checkingAddress, setCheckingAddress] = useState(false);
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<MatterRow[]>([{ id: nextRowId++, matterId: fixedMatterId ?? null, matterLabel: fixedMatterLabel ?? null, amount: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const handleSelectEntity = async (id: string | null, label: string | null) => {
    setEntityId(id);
    setEntityLabel(label);
    setEntityAddress(null);
    setAddressInput('');
    if (!id) return;
    setCheckingAddress(true);
    const { data } = await supabase.from('entities').select('registered_address_text').eq('id', id).maybeSingle();
    setCheckingAddress(false);
    setEntityAddress(data?.registered_address_text || null);
  };

  const updateRow = (id: number, patch: Partial<MatterRow>) => setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  const addRow = () => setRows(prev => [...prev, { id: nextRowId++, matterId: null, matterLabel: null, amount: '' }]);
  const removeRow = (id: number) => setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);

  const handleSubmit = async () => {
    setError(null);
    if (!entityId) { setError('Select who the funds were received from.'); return; }
    // r47: trust receipts must record the payor's identifying details --
    // an address is required, filled in on the entity itself if missing.
    const address = entityAddress || addressInput.trim();
    if (!address) { setError("This contact has no address on file. Enter one to record the deposit."); return; }
    const validRows = rows.filter(r => r.matterId && (parseFloat(r.amount) || 0) > 0);
    if (!validRows.length) { setError('Allocate the deposit to at least one matter.'); return; }

    setSaving(true);

    if (!entityAddress && addressInput.trim()) {
      await supabase.from('entities').update({ registered_address_text: addressInput.trim() }).eq('id', entityId);
    }

    let sharedReceiptNumber: string | undefined;
    for (const row of validRows) {
      const values: Record<string, any> = {
        date, trust_account: accountId, type: 'Deposit', payment_method: paymentMethod,
        payor_payee: entityLabel, purpose: reason.trim() || undefined,
        matter: row.matterId, amount_in: parseFloat(row.amount) || 0,
      };
      if (sharedReceiptNumber) values.receipt_number = sharedReceiptNumber;
      const result = await createCustomRecord(trustTable.tableDef!.id, companyId, userId, values, trustTable.fields);
      if (!result || 'error' in result) {
        setError((result && 'error' in result && result.error) || 'Could not record this deposit, please try again.');
        setSaving(false);
        return;
      }
      if (!sharedReceiptNumber && result.number) sharedReceiptNumber = result.number;
    }

    setSaving(false);
    if (sharedReceiptNumber) onDeposited(sharedReceiptNumber); else onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl p-6 space-y-4 my-8">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-slate-800">Deposit Funds</h3>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-black"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* min-w-0 -- a native date input's intrinsic width (room for
              "DD/MM/YYYY" + the calendar icon) can exceed half the modal
              width and push this grid column wider than its 50% share,
              overlapping the field next to it, unless it's allowed to
              shrink below that. */}
          <div className="min-w-0">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Date deposited</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Account</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 pl-4 pr-8 text-sm font-medium outline-none appearance-none truncate">
              {trustAccounts.map(a => <option key={a.id} value={a.id}>{a.values.account_name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Type</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Received from</label>
            <RelationPicker linkedSystemTable="entities" displayField="name" value={entityId} onSelect={handleSelectEntity} placeholder="Select a contact..." allowCreateEntity />
          </div>
        </div>

        {entityId && !checkingAddress && !entityAddress && (
          <div>
            <label className="text-[9px] font-bold text-amber-600 uppercase tracking-widest block mb-1.5">Sender's address (required for the trust receipt)</label>
            <input value={addressInput} onChange={e => setAddressInput(e.target.value)} placeholder="Street, suburb, state, postcode"
              className="w-full bg-amber-50 border border-amber-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
        )}

        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Reason</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Settlement funds"
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
        </div>

        <div className="space-y-2">
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Allocated matters</label>
          {rows.map(row => (
            <div key={row.id} className="flex items-center gap-2">
              <div className="flex-1">
                {fixedMatterId ? (
                  <div className="w-full bg-slate-100 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium text-slate-500">{fixedMatterLabel}</div>
                ) : (
                  <RelationPicker linkedSystemTable="projects" displayField="name" value={row.matterId}
                    onSelect={(id, label) => updateRow(row.id, { matterId: id, matterLabel: label })} placeholder="Select a matter..." />
                )}
              </div>
              <div className="w-36 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input type="number" step="0.01" value={row.amount} onChange={e => updateRow(row.id, { amount: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 pl-7 pr-4 text-sm font-medium outline-none" placeholder="0.00" />
              </div>
              {!fixedMatterId && (
                <button onClick={() => removeRow(row.id)} disabled={rows.length === 1} className="p-2 text-slate-300 hover:text-rose-500 disabled:opacity-30">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {!fixedMatterId && (
            <button onClick={addRow} className="flex items-center gap-1.5 text-[11px] font-bold text-teal-700 hover:text-teal-900">
              <Plus size={12} /> Add matter
            </button>
          )}
        </div>

        <div className="bg-slate-50 rounded-2xl px-4 py-3 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total amount</span>
          <span className="text-[14px] font-bold text-slate-800">{money(total)}</span>
        </div>

        {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-teal-700 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Process / Open Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

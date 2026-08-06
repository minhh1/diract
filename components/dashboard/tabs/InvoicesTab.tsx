"use client";

// The "Invoices" matter tab -- bespoke, not a generic custom_dashboard grid+
// quick-add tab (see lib/dashboardWidgets/defaultRecordDashboardTabs.ts's
// tab_type: 'invoice_dashboard'), since it needs a PDF-preview action per
// row, a "Create invoice" trigger instead of a plain quick-add form, and
// status/date filtering the generic DashboardFilterBar doesn't support
// (multi-select and date-range are both new here, not just unwired).
import { useState, useEffect, useCallback } from "react";
import { Maximize2, Minimize2, Plus, Eye, Download, FileText, Pencil, Ban, Loader2, X, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createRecord as createCustomRecord, updateRecord as updateCustomRecord } from "@/lib/services/customTableService";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import CreateInvoiceModal from "../CreateInvoiceModal";
import PdfPreviewModal from "../PdfPreviewModal";
import { useCompany } from "@/components/CompanyContext";
import { companyTodayStr } from "@/lib/companyLocalDate";

interface Props {
  linkedTableId: string; // this company's Invoices table id
  recordId: string; // matter id
  companyId: string;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  debtorName: string;
  debtorIds: string[];
  issueDate: string | null;
  dueDate: string | null;
  status: string;
  totalIncGst: number;
  amountDue: number;
  payments: number;
  trustApplied: number;
  waivedAmount: number;
  discountAmount: number;
}

const STATUS_OPTIONS = ['Under Review', 'Sent', 'Paid', 'Overdue', 'Void'];
// Excludes 'Void' -- EditInvoiceModal's status dropdown used to let 'Void'
// be picked like any other status, silently skipping the release-line-
// items-back-to-unbilled cleanup only the dedicated Void (Ban icon) button
// actually does. Voiding now only ever happens through handleVoid.
const EDIT_STATUS_OPTIONS = STATUS_OPTIONS.filter(s => s !== 'Void');
const STATUS_BADGE: Record<string, string> = {
  'Under Review': 'bg-slate-100 text-slate-600',
  Sent: 'bg-sky-50 text-sky-700',
  Paid: 'bg-emerald-50 text-emerald-700',
  Overdue: 'bg-rose-50 text-rose-700',
  Void: 'bg-slate-100 text-slate-400',
};

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

export default function InvoicesTab({ linkedTableId, recordId, companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceFields, setInvoiceFields] = useState<CustomTableField[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [receiptPreviewId, setReceiptPreviewId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    const { data: fields } = await supabase.from('company_table_fields').select('*').eq('table_id', linkedTableId).is('deleted_at', null);
    const fieldList = (fields || []) as CustomTableField[];
    setInvoiceFields(fieldList);
    const matterField = fieldList.find(f => f.field_key === 'matter');
    if (!matterField) { setInvoices([]); setLoading(false); return; }

    const { data: matterLinks } = await supabase
      .from('company_table_values').select('record_id')
      .eq('field_id', matterField.id).eq('value_record_id', recordId);
    const candidateIds = [...new Set((matterLinks || []).map(l => l.record_id))];
    if (!candidateIds.length) { setInvoices([]); setLoading(false); return; }

    const { data: aliveRecs } = await supabase.from('company_table_records').select('id').in('id', candidateIds).is('deleted_at', null);
    const aliveIds = (aliveRecs || []).map(r => r.id);
    if (!aliveIds.length) { setInvoices([]); setLoading(false); return; }

    const { data: valueRows } = await supabase
      .from('company_table_values')
      .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
      .in('record_id', aliveIds);

    const fieldById = new Map(fieldList.map(f => [f.id, f]));
    const byRecord = new Map<string, Record<string, any>>();
    (valueRows || []).forEach(v => {
      const field = fieldById.get(v.field_id);
      if (!field) return;
      if (!byRecord.has(v.record_id)) byRecord.set(v.record_id, {});
      byRecord.get(v.record_id)![field.field_key] = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? v.value_record_id ?? null;
    });

    // Debtor allows more than one entity (see supabase/invoices_debtor_multi.sql),
    // so unlike every other single-entity field above it lives in
    // company_table_value_links, not company_table_values.
    const debtorField = fieldList.find(f => f.field_key === 'debtor');
    const { data: debtorLinkRows } = debtorField
      ? await supabase.from('company_table_value_links').select('record_id, value_record_id').eq('field_id', debtorField.id).in('record_id', aliveIds)
      : { data: [] as { record_id: string; value_record_id: string }[] };
    const debtorIdsByRecord = new Map<string, string[]>();
    (debtorLinkRows || []).forEach(l => {
      if (!debtorIdsByRecord.has(l.record_id)) debtorIdsByRecord.set(l.record_id, []);
      debtorIdsByRecord.get(l.record_id)!.push(l.value_record_id);
    });
    const allDebtorIds = [...new Set((debtorLinkRows || []).map(l => l.value_record_id))];
    const { data: debtorRows } = allDebtorIds.length
      ? await supabase.from('entities').select('id, name').in('id', allDebtorIds)
      : { data: [] as { id: string; name: string }[] };
    const debtorNameById = new Map((debtorRows || []).map(d => [d.id, d.name]));

    const rows: InvoiceRow[] = [...byRecord.entries()].map(([id, row]) => ({
      id,
      invoiceNumber: row.invoice_number || '',
      debtorName: (debtorIdsByRecord.get(id) || []).map(did => debtorNameById.get(did)).filter(Boolean).join(', ') || '-',
      debtorIds: debtorIdsByRecord.get(id) || [],
      issueDate: row.issue_date || null,
      dueDate: row.due_date || null,
      status: row.status || 'Under Review',
      totalIncGst: Number(row.total_inc_gst) || 0,
      amountDue: Number(row.amount_due) || 0,
      payments: Number(row.payments) || 0,
      trustApplied: Number(row.trust_applied) || 0,
      waivedAmount: Number(row.waived_amount) || 0,
      discountAmount: Number(row.discount_amount) || 0,
    }));
    rows.sort((a, b) => String(b.issueDate || '').localeCompare(String(a.issueDate || '')));
    setInvoices(rows);
    setLoading(false);
  }, [linkedTableId, recordId]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  // Receipts (operating-account ledger, see supabase/migrations/
  // 20260730120000_receipts_ledger.sql) -- resolved once per company since
  // Record Payment needs its table id + fields to call createRecord.
  const [receiptsTableId, setReceiptsTableId] = useState<string | null>(null);
  const [receiptsFields, setReceiptsFields] = useState<CustomTableField[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: table } = await supabase.from('company_tables').select('id').eq('company_id', companyId).eq('slug', 'receipts').is('deleted_at', null).maybeSingle();
      if (cancelled || !table) return;
      setReceiptsTableId(table.id);
      const { data: fields } = await supabase.from('company_table_fields').select('*').eq('table_id', table.id).is('deleted_at', null);
      if (!cancelled) setReceiptsFields((fields || []) as CustomTableField[]);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id || ''));
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const toggleStatus = (s: string) => setStatusFilter(prev => {
    const next = new Set(prev); next.has(s) ? next.delete(s) : next.add(s); return next;
  });

  const filtered = invoices.filter(inv => {
    if (statusFilter.size > 0 && !statusFilter.has(inv.status)) return false;
    if (dateFrom && (!inv.issueDate || inv.issueDate < dateFrom)) return false;
    if (dateTo && (!inv.issueDate || inv.issueDate > dateTo)) return false;
    return true;
  });

  const handleVoid = async (invoiceId: string) => {
    if (!window.confirm('Void this invoice? Its fees and disbursements become unbilled again and can be re-invoiced.')) return;

    // Optimistic: flip the row to Void the instant the admin confirms,
    // rather than leaving it showing its old status until the line-item
    // unbilling + status write round trip below finishes -- that could take
    // a visible moment on an invoice with several entries. Rolled back if
    // the write actually fails.
    const previousInvoices = invoices;
    setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, status: 'Void' } : i));
    setVoidingId(invoiceId);

    const { data: lineItems } = await supabase
      .from('invoice_line_items').select('source_record_id').eq('invoice_record_id', invoiceId);
    const sourceRecordIds = [...new Set((lineItems || []).map(li => li.source_record_id))];

    let firstError: string | null = null;
    if (sourceRecordIds.length) {
      // Batched + parallel -- this used to do 2-3 sequential round trips PER
      // line item (one to look up its table_id, one to re-fetch that
      // table's fields from scratch even when every fee entry shares the
      // same table, one to actually update it), which is exactly why
      // voiding an invoice with several entries visibly took "a bit" before
      // they showed back up as unbilled. Now: one query for every source
      // record's table_id, one company_table_fields query per DISTINCT
      // table_id (fees and disbursements are at most 2), and every record's
      // own update running concurrently instead of one at a time.
      const { data: recs } = await supabase.from('company_table_records').select('id, table_id').in('id', sourceRecordIds);
      const tableIdByRecordId = new Map((recs || []).map(r => [r.id, r.table_id]));
      const distinctTableIds = [...new Set((recs || []).map(r => r.table_id))];
      const fieldsByTableId = new Map<string, CustomTableField[]>();
      await Promise.all(distinctTableIds.map(async tableId => {
        const { data: sourceFields } = await supabase.from('company_table_fields').select('*').eq('table_id', tableId).is('deleted_at', null);
        fieldsByTableId.set(tableId, (sourceFields || []) as CustomTableField[]);
      }));

      const results = await Promise.all(sourceRecordIds.map(recordId => {
        const tableId = tableIdByRecordId.get(recordId);
        if (!tableId) return Promise.resolve(null);
        return updateCustomRecord(recordId, tableId, companyId, { invoice: null, invoiced_amount: null, invoiced_gst_amount: null }, fieldsByTableId.get(tableId) || []);
      }));
      firstError = (results.find(r => r && 'error' in r) as { error: string } | undefined)?.error || null;
    }
    const statusResult = await updateCustomRecord(invoiceId, linkedTableId, companyId, { status: 'Void' }, invoiceFields);
    if (statusResult && 'error' in statusResult && !firstError) firstError = statusResult.error;
    setVoidingId(null);

    if (firstError) {
      setInvoices(previousInvoices);
      window.alert(`Could not void this invoice: ${firstError}`);
      return;
    }
    loadInvoices();
  };

  const editingInvoice = invoices.find(i => i.id === editingId) || null;
  const payingInvoice = invoices.find(i => i.id === payingId) || null;

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-slate-50 overflow-y-auto p-8 space-y-4" : "space-y-4"}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                statusFilter.has(s) ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-600'
              }`}
            >
              {s}
            </button>
          ))}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-full py-1.5 px-3 text-[11px] outline-none" />
            <span>–</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-full py-1.5 px-3 text-[11px] outline-none" />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setFullscreen(p => !p)}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
            className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all"
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all"
          >
            <Plus size={14} /> Create invoice
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-[12px] text-slate-400 py-12">
          {invoices.length === 0 ? 'No invoices yet for this matter.' : 'No invoices match the current filters.'}
        </p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                <th className="text-left px-4 py-2.5">Invoice</th>
                <th className="text-left px-4 py-2.5">Debtor</th>
                <th className="text-left px-4 py-2.5">Issued</th>
                <th className="text-left px-4 py-2.5">Due</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Total</th>
                <th className="text-right px-4 py-2.5">Amount due</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{inv.invoiceNumber}</td>
                  <td className="px-4 py-2.5 text-slate-600">{inv.debtorName}</td>
                  <td className="px-4 py-2.5 text-slate-500">{inv.issueDate || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{inv.dueDate || '-'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[inv.status] || 'bg-slate-100 text-slate-500'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-700">{money(inv.totalIncGst)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-800">{money(inv.amountDue)}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setPreviewId(inv.id)} title="Preview PDF" className="p-1.5 text-slate-300 hover:text-indigo-600"><Eye size={14} /></button>
                      <a href={`/api/invoices/${inv.id}/pdf?download=1`} title="Download PDF" className="p-1.5 text-slate-300 hover:text-indigo-600"><Download size={14} /></a>
                      <a href={`/api/invoices/${inv.id}/docx?download=1`} title="Download Word" className="p-1.5 text-slate-300 hover:text-indigo-600"><FileText size={14} /></a>
                      <button onClick={() => setEditingId(inv.id)} title="Edit" className="p-1.5 text-slate-300 hover:text-slate-700"><Pencil size={14} /></button>
                      {inv.status !== 'Void' && inv.amountDue > 0 && receiptsTableId && (
                        <button
                          onClick={() => setPayingId(inv.id)}
                          className="px-3 py-1 rounded-full text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all whitespace-nowrap"
                        >
                          Record payment
                        </button>
                      )}
                      {inv.status !== 'Void' && (
                        <button onClick={() => handleVoid(inv.id)} title="Void" disabled={voidingId === inv.id} className="p-1.5 text-slate-300 hover:text-rose-500 disabled:opacity-50">
                          {voidingId === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateInvoiceModal
          matterId={recordId}
          companyId={companyId}
          userId={userId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadInvoices(); }}
        />
      )}

      {previewId && (
        <PdfPreviewModal
          src={`/api/invoices/${previewId}/pdf`}
          downloadSrc={`/api/invoices/${previewId}/pdf?download=1`}
          wordDownloadSrc={`/api/invoices/${previewId}/docx?download=1`}
          title={invoices.find(i => i.id === previewId)?.invoiceNumber}
          onClose={() => setPreviewId(null)}
        />
      )}

      {editingInvoice && (
        <EditInvoiceModal
          invoice={editingInvoice}
          invoiceTableId={linkedTableId}
          companyId={companyId}
          invoiceFields={invoiceFields}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); loadInvoices(); }}
        />
      )}

      {payingInvoice && receiptsTableId && (
        <RecordPaymentModal
          invoice={payingInvoice}
          matterId={recordId}
          companyId={companyId}
          invoiceTableId={linkedTableId}
          invoiceFields={invoiceFields}
          receiptsTableId={receiptsTableId}
          receiptsFields={receiptsFields}
          onClose={() => setPayingId(null)}
          onSaved={(receiptId) => { setPayingId(null); setReceiptPreviewId(receiptId); loadInvoices(); }}
        />
      )}

      {receiptPreviewId && (
        <PdfPreviewModal
          src={`/api/receipts/${receiptPreviewId}/pdf`}
          downloadSrc={`/api/receipts/${receiptPreviewId}/pdf?download=1`}
          title="Receipt"
          onClose={() => setReceiptPreviewId(null)}
        />
      )}
    </div>
  );
}

// Small residual-fields editor -- status/due date/payments/trust applied
// aren't part of the create flow (those are set once at creation, or
// derived from apportioned line items), so they get a lightweight edit
// surface here instead of a second big modal.
function EditInvoiceModal({
  invoice, invoiceTableId, companyId, invoiceFields, onClose, onSaved,
}: {
  invoice: InvoiceRow; invoiceTableId: string; companyId: string; invoiceFields: CustomTableField[];
  onClose: () => void; onSaved: () => void;
}) {
  const [status, setStatus] = useState(invoice.status);
  const [dueDate, setDueDate] = useState(invoice.dueDate || '');
  const [payments, setPayments] = useState(String(invoice.payments || ''));
  const [trustApplied, setTrustApplied] = useState(String(invoice.trustApplied || ''));
  const [waived, setWaived] = useState(String(invoice.waivedAmount || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    // amount_due isn't a formula field -- recompute it here from the
    // invoice's own (formula-computed, so already-current) total_inc_gst
    // minus whatever payments/trust applied/waived are being saved.
    const paymentsNum = parseFloat(payments) || 0;
    const trustAppliedNum = parseFloat(trustApplied) || 0;
    const waivedNum = parseFloat(waived) || 0;
    // This used to ignore updateCustomRecord's result entirely -- a failed
    // save (a required/unique-field validation error, a ledger refusal,
    // any DB error) still closed the modal via onSaved() below with no
    // indication anything went wrong, silently discarding the edit.
    const result = await updateCustomRecord(invoice.id, invoiceTableId, companyId, {
      status, due_date: dueDate || null,
      payments: paymentsNum, trust_applied: trustAppliedNum, waived_amount: waivedNum,
      amount_due: invoice.totalIncGst - invoice.discountAmount - trustAppliedNum - paymentsNum - waivedNum,
    }, invoiceFields);
    setSaving(false);
    if (result && 'error' in result) { setError(result.error); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-slate-800">{invoice.invoiceNumber}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-black"><X size={16} /></button>
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Status</label>
          {status === 'Void' ? (
            <p className="text-[12px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4">
              Void. Use the Ban icon to void an invoice (releases its fees/disbursements back to unbilled)
            </p>
          ) : (
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none">
              {EDIT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Due date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Payments</label>
            <input type="number" step="0.01" value={payments} onChange={e => setPayments(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Trust applied</label>
            <input type="number" step="0.01" value={trustApplied} onChange={e => setTrustApplied(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Waived</label>
            <input type="number" step="0.01" value={waived} onChange={e => setWaived(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
        </div>
        {error && (
          <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>
        )}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-indigo-600 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

const PAYMENT_METHODS = ['Cash', 'EFT', 'Cheque', 'Card', 'Other'];

// Records a part-payment and/or a balance waiver against one invoice as a
// single immutable Receipts ledger row (see supabase/migrations/
// 20260730120000_receipts_ledger.sql) -- that row IS the receipt: creating
// it is what earns the consecutive operating-account receipt number, and
// onSaved hands the new row's id back so the caller can open its PDF.
// Deliberately one combined form rather than three separate actions/buttons
// -- a single receipt can be part payment, part waiver, or both at once,
// and every path needs the same invoice-total update afterward anyway.
function RecordPaymentModal({
  invoice, matterId, companyId, invoiceTableId, invoiceFields, receiptsTableId, receiptsFields, onClose, onSaved,
}: {
  invoice: InvoiceRow; matterId: string; companyId: string;
  invoiceTableId: string; invoiceFields: CustomTableField[];
  receiptsTableId: string; receiptsFields: CustomTableField[];
  onClose: () => void; onSaved: (receiptId: string) => void;
}) {
  const { companyType } = useCompany();
  const [date, setDate] = useState(companyTodayStr(companyType));
  const [amountReceived, setAmountReceived] = useState(String(invoice.amountDue.toFixed(2)));
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [bankReference, setBankReference] = useState('');
  const [waiveRest, setWaiveRest] = useState(false);
  const [waivedAmount, setWaivedAmount] = useState('0');
  const [waivedReason, setWaivedReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receivedNum = parseFloat(amountReceived) || 0;
  // Waiving "the rest" tracks whatever's left as amountReceived changes,
  // rather than freezing the waived figure at whatever it was when the
  // checkbox was first ticked.
  const waivedNum = waiveRest ? Math.max(0, invoice.amountDue - receivedNum) : (parseFloat(waivedAmount) || 0);
  const balanceAfter = invoice.amountDue - receivedNum - waivedNum;

  const handleSubmit = async () => {
    setError(null);
    if (receivedNum < 0 || waivedNum < 0) { setError('Amounts cannot be negative.'); return; }
    if (balanceAfter < -0.004) { setError('Amount received + waived cannot exceed the amount due.'); return; }
    if (waivedNum > 0 && !waivedReason.trim()) { setError('A reason is required when waiving an amount.'); return; }
    if (receivedNum === 0 && waivedNum === 0) { setError('Enter an amount received or waived.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle() : { data: null };

    const receiptValues: Record<string, any> = {
      date,
      invoice: invoice.id,
      matter: matterId,
      amount_received: receivedNum,
      payment_method: paymentMethod,
      bank_reference: bankReference.trim() || undefined,
      waived_amount: waivedNum,
      waived_reason: waivedNum > 0 ? waivedReason.trim() : undefined,
      received_by: profile?.full_name || undefined,
      balance_after: Math.max(0, balanceAfter),
    };
    if (invoice.debtorIds[0]) receiptValues.payor = invoice.debtorIds[0];

    const result = await createCustomRecord(receiptsTableId, companyId, user?.id || '', receiptValues, receiptsFields);
    if (!result || 'error' in result) {
      setError((result && 'error' in result && result.error) || 'Could not record this receipt. Please try again.');
      setSaving(false);
      return;
    }

    await updateCustomRecord(invoice.id, invoiceTableId, companyId, {
      payments: invoice.payments + receivedNum,
      waived_amount: invoice.waivedAmount + waivedNum,
      amount_due: Math.max(0, balanceAfter),
    }, invoiceFields);

    setSaving(false);
    onSaved(result.id);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-slate-800">Record payment</h3>
            <p className="text-[11px] text-slate-400">{invoice.invoiceNumber} · Amount due {money(invoice.amountDue)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-black"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Amount received</label>
            <input type="number" step="0.01" value={amountReceived} onChange={e => setAmountReceived(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Payment method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Reference</label>
            <input value={bankReference} onChange={e => setBankReference(e.target.value)} placeholder="Cheque / EFT ref"
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-600 cursor-pointer">
          <input type="checkbox" checked={waiveRest} onChange={e => setWaiveRest(e.target.checked)} className="rounded" />
          Waive the remaining balance
        </label>

        {waiveRest && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Waiver reason</label>
            <input value={waivedReason} onChange={e => setWaivedReason(e.target.value)} placeholder="e.g. Goodwill discount"
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          </div>
        )}

        <div className="bg-slate-50 rounded-2xl px-4 py-3 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Balance remaining</span>
          <span className="text-[14px] font-bold text-slate-800">{money(Math.max(0, balanceAfter))}</span>
        </div>

        {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-emerald-600 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Generate receipt
          </button>
        </div>
      </div>
    </div>
  );
}

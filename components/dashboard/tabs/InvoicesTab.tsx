"use client";

// The "Invoices" matter tab -- bespoke, not a generic custom_dashboard grid+
// quick-add tab (see lib/dashboardWidgets/defaultRecordDashboardTabs.ts's
// tab_type: 'invoice_dashboard'), since it needs a PDF-preview action per
// row, a "Create invoice" trigger instead of a plain quick-add form, and
// status/date filtering the generic DashboardFilterBar doesn't support
// (multi-select and date-range are both new here, not just unwired).
import { useState, useEffect, useCallback } from "react";
import { Maximize2, Minimize2, Plus, Eye, Download, Pencil, Ban, Loader2, X, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { updateRecord as updateCustomRecord } from "@/lib/services/customTableService";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import CreateInvoiceModal from "../CreateInvoiceModal";
import PdfPreviewModal from "../PdfPreviewModal";

interface Props {
  linkedTableId: string; // this company's Invoices table id
  recordId: string; // matter id
  companyId: string;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  debtorName: string;
  issueDate: string | null;
  dueDate: string | null;
  status: string;
  totalIncGst: number;
  amountDue: number;
  payments: number;
  trustApplied: number;
}

const STATUS_OPTIONS = ['Under Review', 'Sent', 'Paid', 'Overdue', 'Void'];
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

    const debtorIds = new Set<string>();
    byRecord.forEach(row => { if (row.debtor) debtorIds.add(row.debtor); });
    const { data: debtorRows } = debtorIds.size
      ? await supabase.from('entities').select('id, name').in('id', [...debtorIds])
      : { data: [] as { id: string; name: string }[] };
    const debtorNameById = new Map((debtorRows || []).map(d => [d.id, d.name]));

    const rows: InvoiceRow[] = [...byRecord.entries()].map(([id, row]) => ({
      id,
      invoiceNumber: row.invoice_number || '',
      debtorName: debtorNameById.get(row.debtor) || '—',
      issueDate: row.issue_date || null,
      dueDate: row.due_date || null,
      status: row.status || 'Under Review',
      totalIncGst: Number(row.total_inc_gst) || 0,
      amountDue: Number(row.amount_due) || 0,
      payments: Number(row.payments) || 0,
      trustApplied: Number(row.trust_applied) || 0,
    }));
    rows.sort((a, b) => String(b.issueDate || '').localeCompare(String(a.issueDate || '')));
    setInvoices(rows);
    setLoading(false);
  }, [linkedTableId, recordId]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

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
    setVoidingId(invoiceId);
    const { data: lineItems } = await supabase
      .from('invoice_line_items').select('source_record_id').eq('invoice_record_id', invoiceId);
    for (const li of lineItems || []) {
      const { data: rec } = await supabase.from('company_table_records').select('table_id').eq('id', li.source_record_id).maybeSingle();
      if (!rec) continue;
      const { data: sourceFields } = await supabase.from('company_table_fields').select('*').eq('table_id', rec.table_id).is('deleted_at', null);
      await updateCustomRecord(li.source_record_id, rec.table_id, companyId, { invoice: null, invoiced_amount: null }, (sourceFields || []) as CustomTableField[]);
    }
    await updateCustomRecord(invoiceId, linkedTableId, companyId, { status: 'Void' }, invoiceFields);
    setVoidingId(null);
    loadInvoices();
  };

  const editingInvoice = invoices.find(i => i.id === editingId) || null;

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
                  <td className="px-4 py-2.5 text-slate-500">{inv.issueDate || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{inv.dueDate || '—'}</td>
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
                      <a href={`/api/invoices/${inv.id}/pdf?download=1`} title="Download" className="p-1.5 text-slate-300 hover:text-indigo-600"><Download size={14} /></a>
                      <button onClick={() => setEditingId(inv.id)} title="Edit" className="p-1.5 text-slate-300 hover:text-slate-700"><Pencil size={14} /></button>
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
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // amount_due isn't a formula field -- recompute it here from the
    // invoice's own (formula-computed, so already-current) total_inc_gst
    // minus whatever payments/trust applied are being saved.
    const paymentsNum = parseFloat(payments) || 0;
    const trustAppliedNum = parseFloat(trustApplied) || 0;
    await updateCustomRecord(invoice.id, invoiceTableId, companyId, {
      status, due_date: dueDate || null,
      payments: paymentsNum, trust_applied: trustAppliedNum,
      amount_due: invoice.totalIncGst - trustAppliedNum - paymentsNum,
    }, invoiceFields);
    setSaving(false);
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
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none">
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Due date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
        </div>
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

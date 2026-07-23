"use client";

// Per-matter trust ledger statement -- every transaction for one matter, in
// date order, with its running balance (already computed per-matter at
// insert time -- see insert_ledger_record in supabase/company_table_ledger.sql,
// so this widget just displays running_balance rather than recomputing it).
// The kind of statement a client asks for, or that goes on the matter file.
// A dashboard widget like any other (see lib/dashboardWidgets/types.ts's
// TrustLedgerStatementWidget) -- reads whatever table the dashboard is
// bound to via the same date/matter/client/amount_in/amount_out/
// running_balance field_key convention as the other trust widgets.
import { useState, useMemo } from "react";
import { FileText, Printer } from "lucide-react";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export default function TrustLedgerStatementWidget({ records }: { records: CustomTableRecord[] }) {
  const matterIds = useMemo(() => [...new Set(records.map(r => String(r.values.matter || '')).filter(Boolean))], [records]);
  const matterNames = useRecordNames('projects', matterIds);
  const [selectedMatter, setSelectedMatter] = useState('');

  const sortedMatterIds = useMemo(
    () => [...matterIds].sort((a, b) => (matterNames.get(a) || '').localeCompare(matterNames.get(b) || '')),
    [matterIds, matterNames]
  );

  const entries = useMemo(() => {
    if (!selectedMatter) return [];
    return records
      .filter(r => String(r.values.matter || '') === selectedMatter)
      .slice()
      .sort((a, b) => String(a.values.date || '').localeCompare(String(b.values.date || '')));
  }, [records, selectedMatter]);

  const clientId = entries.length ? String(entries[entries.length - 1].values.client || '') : '';
  const clientNames = useRecordNames('entities', clientId ? [clientId] : []);

  const totals = entries.reduce((acc, r) => ({
    in: acc.in + (Number(r.values.amount_in) || 0),
    out: acc.out + (Number(r.values.amount_out) || 0),
  }), { in: 0, out: 0 });
  const closingBalance = entries.length ? Number(entries[entries.length - 1].values.running_balance) || 0 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-50 flex items-center justify-center">
            <FileText size={18} className="text-violet-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Trust Ledger Statement</p>
            <p className="text-[11px] text-slate-400">Every transaction for one matter, with running balance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedMatter}
            onChange={e => setSelectedMatter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-violet-100 appearance-none min-w-[200px]"
          >
            <option value="">Select a matter...</option>
            {sortedMatterIds.map(id => <option key={id} value={id}>{matterNames.get(id) || id.slice(0, 8)}</option>)}
          </select>
          {selectedMatter && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-black transition-all"
            >
              <Printer size={12} /> Print
            </button>
          )}
        </div>
      </div>

      {!selectedMatter ? (
        <p className="text-center text-[11px] text-slate-300 italic py-10">Select a matter above to view its trust ledger statement</p>
      ) : (
        <div className="space-y-3">
          <div className="hidden print:block">
            <p className="text-lg font-bold text-slate-900">Trust Ledger Statement</p>
            <p className="text-[13px] text-slate-600">Matter: {matterNames.get(selectedMatter) || selectedMatter}</p>
            {clientNames.get(clientId) && <p className="text-[13px] text-slate-600">Client: {clientNames.get(clientId)}</p>}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                  <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Receipt No.</th>
                  <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Type</th>
                  <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Particulars</th>
                  <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">In</th>
                  <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Out</th>
                  <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Balance</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(r => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="px-4 py-2 text-slate-500">{r.values.date || '—'}</td>
                    <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{r.values.receipt_number || '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{r.values.type || '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{r.values.payor_payee || r.values.purpose || '—'}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{r.values.amount_in ? aud.format(Number(r.values.amount_in)) : ''}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{r.values.amount_out ? aud.format(Number(r.values.amount_out)) : ''}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-900">{aud.format(Number(r.values.running_balance) || 0)}</td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-[11px] text-slate-300 italic">No trust transactions for this matter</td></tr>
                )}
              </tbody>
              {entries.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={4}>Totals</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">{aud.format(totals.in)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">{aud.format(totals.out)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">{aud.format(closingBalance)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

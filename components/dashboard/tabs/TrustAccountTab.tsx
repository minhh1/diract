"use client";

// The "Trust Account" tab on a matter -- that matter's own trust ledger
// statement (every transaction against it, in date order, with its running
// balance), the per-matter equivalent of the company-wide Payments/Receipts
// Cash Books on /dashboard/trust-account. Auto-seeded onto every Matter for
// companies that have the Law Firm template's Trust Transactions table (see
// RecordDashboard.tsx's loadTabs, gated the same way Finance Model is) --
// replaces the earlier generic 'custom_dashboard' grid version of this tab
// (see supabase/migrations/20260802170000_trust_account_tab.sql, which
// migrated any matter that already had that grid over to this tab_type).
import { useMemo } from "react";
import { Landmark, ExternalLink } from "lucide-react";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { formatDateAU } from "@/lib/formatDate";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export default function TrustAccountTab({ recordId }: { recordId: string }) {
  const { records, recordsLoading } = useCustomTable('trust-transactions');

  const entries = useMemo(() => {
    return records
      .filter(r => String(r.values.matter || '') === recordId)
      .slice()
      .sort((a, b) => String(a.values.date || '').localeCompare(String(b.values.date || '')));
  }, [records, recordId]);

  const clientId = entries.length ? String(entries[entries.length - 1].values.client || '') : '';
  const clientNames = useRecordNames('entities', clientId ? [clientId] : []);

  const totals = entries.reduce((acc, r) => ({
    in: acc.in + (Number(r.values.amount_in) || 0),
    out: acc.out + (Number(r.values.amount_out) || 0),
  }), { in: 0, out: 0 });
  const closingBalance = entries.length ? Number(entries[entries.length - 1].values.running_balance) || 0 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-teal-50 flex items-center justify-center">
            <Landmark size={18} className="text-teal-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Trust Account</p>
            <p className="text-[11px] text-slate-400">Every trust transaction for this matter, with running balance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 rounded-full px-3 py-1.5 uppercase tracking-wider">
              Balance {aud.format(closingBalance)}
            </span>
          )}
          <a
            href={`/api/trust-ledger/${recordId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[12px] font-semibold hover:border-teal-300 transition-all"
          >
            <ExternalLink size={13} /> Print ledger
          </a>
        </div>
      </div>

      {clientNames.get(clientId) && (
        <p className="text-[11px] text-slate-400">Client: <span className="text-slate-600 font-medium">{clientNames.get(clientId)}</span></p>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Date</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">No.</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Type</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Particulars</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">In</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Out</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Balance</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(r => (
              <tr key={r.id} className="border-b border-slate-50">
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{formatDateAU(r.values.date)}</td>
                <td className="px-4 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                  {r.values.receipt_number || r.values.payment_number || r.values.journal_number || '—'}
                </td>
                <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{r.values.type || '—'}</td>
                <td className="px-4 py-2 text-slate-600">{r.values.payor_payee || r.values.purpose || '—'}</td>
                <td className="px-4 py-2 text-right text-slate-700 whitespace-nowrap">{r.values.amount_in ? aud.format(Number(r.values.amount_in)) : ''}</td>
                <td className="px-4 py-2 text-right text-slate-700 whitespace-nowrap">{r.values.amount_out ? aud.format(Number(r.values.amount_out)) : ''}</td>
                <td className="px-4 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">{aud.format(Number(r.values.running_balance) || 0)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-[11px] text-slate-300 italic">
                  {recordsLoading ? '' : 'No trust transactions for this matter'}
                </td>
              </tr>
            )}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={4}>Totals</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{aud.format(totals.in)}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{aud.format(totals.out)}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{aud.format(closingBalance)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

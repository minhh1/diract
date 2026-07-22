"use client";

// Monthly three-way trust reconciliation (Legal Profession Uniform General
// Rules 2015 r 48): reconciles (1) the trust cash book, (2) a trial balance
// of every matter's trust ledger, and (3) the trust bank account statement.
// A dashboard widget like any other (see lib/dashboardWidgets/types.ts's
// TrustReconciliationWidget) -- it reads whatever table the dashboard is
// bound to, using the same date/matter/amount_in/amount_out field_key
// convention the Trust Transactions ledger table installs with (see
// supabase/company_table_ledger.sql). On a table without those fields it
// just renders an empty reconciliation, same as any widget bound to the
// wrong shape of table.
import { useState, useMemo, useEffect } from "react";
import { Landmark, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

// r 48(3): reconciliation statements must be prepared within 15 working
// days after the end of the month. Working days approximated as Mon-Fri
// (public holidays vary by state -- the real deadline can only be earlier
// than this, never later, so showing the weekday-only date is safe).
function reconciliationDeadline(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1)); // first day of the following month
  let remaining = 15;
  while (remaining > 0) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) remaining -= 1;
    if (remaining > 0) d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

export default function TrustReconciliationWidget({ records }: { records: CustomTableRecord[] }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [bankBalance, setBankBalance] = useState('');
  const [matterNames, setMatterNames] = useState<Map<string, string>>(new Map());

  const monthEnd = `${month}-31`; // string compare on ISO dates -- safe upper bound

  const { receipts, payments, cashBookClosing, ledgers } = useMemo(() => {
    let receipts = 0, payments = 0, cashBookClosing = 0;
    const ledgers = new Map<string, { balance: number; entries: number }>();
    for (const r of records) {
      const date = String(r.values.date || '').slice(0, 10);
      if (!date || date > monthEnd) continue;
      const inAmt = Number(r.values.amount_in) || 0;
      const outAmt = Number(r.values.amount_out) || 0;
      cashBookClosing += inAmt - outAmt;
      if (date.slice(0, 7) === month) { receipts += inAmt; payments += outAmt; }
      const matter = String(r.values.matter || '');
      if (matter) {
        const entry = ledgers.get(matter) || { balance: 0, entries: 0 };
        entry.balance += inAmt - outAmt;
        entry.entries += 1;
        ledgers.set(matter, entry);
      }
    }
    return { receipts, payments, cashBookClosing, ledgers };
  }, [records, month, monthEnd]);

  useEffect(() => {
    const ids = [...ledgers.keys()].filter(id => !matterNames.has(id));
    if (!ids.length) return;
    supabase.from('projects').select('id, name').in('id', ids).then(({ data }) => {
      if (!data?.length) return;
      setMatterNames(prev => {
        const next = new Map(prev);
        data.forEach(p => next.set(p.id, p.name));
        return next;
      });
    });
  }, [ledgers, matterNames]);

  const trialBalanceTotal = [...ledgers.values()].reduce((s, l) => s + l.balance, 0);
  const ledgersReconcile = Math.abs(trialBalanceTotal - cashBookClosing) < 0.005;
  const bank = bankBalance === '' ? null : Number(bankBalance);
  const bankVariance = bank === null || Number.isNaN(bank) ? null : bank - cashBookClosing;
  const deadline = reconciliationDeadline(month);
  const trustYearEndYear = Number(month.slice(0, 4)) + (month.slice(5, 7) > '03' ? 1 : 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-teal-50 flex items-center justify-center">
            <Landmark size={18} className="text-teal-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Trust Reconciliation</p>
            <p className="text-[11px] text-slate-400">Three-way reconciliation under Uniform General Rules 2015 r 48</p>
          </div>
        </div>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-teal-100"
        />
      </div>

      <div className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2">
        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
        <span>
          This statement must be prepared within 15 working days of month end — by{' '}
          <strong>{deadline.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong> at the latest.
          The trust year ends 31 March {trustYearEndYear}; the external examiner's report is due to the Law Society by 31 May {trustYearEndYear}.
        </span>
      </div>

      {/* 1. Cash book */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">1 · Trust cash book — {month}</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] text-slate-400">Receipts this month</p>
            <p className="text-lg font-semibold text-slate-900">{aud.format(receipts)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">Payments this month</p>
            <p className="text-lg font-semibold text-slate-900">{aud.format(payments)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">Cash book closing balance</p>
            <p className="text-lg font-semibold text-slate-900">{aud.format(cashBookClosing)}</p>
          </div>
        </div>
      </div>

      {/* 2. Trial balance of matter ledgers (r 48(2): name, reference, balance, matter description) */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">2 · Trial balance of trust ledgers (as at end of {month})</p>
          {ledgersReconcile ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600"><CheckCircle2 size={12} /> Matches cash book</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600"><AlertTriangle size={12} /> Does not match cash book</span>
          )}
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Matter</th>
              <th className="text-left px-5 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ledger reference</th>
              <th className="text-right px-5 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Entries</th>
              <th className="text-right px-5 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Balance</th>
            </tr>
          </thead>
          <tbody>
            {[...ledgers.entries()].sort((a, b) => (matterNames.get(a[0]) || '').localeCompare(matterNames.get(b[0]) || '')).map(([matterId, ledger]) => (
              <tr key={matterId} className="border-b border-slate-50">
                <td className="px-5 py-2 font-medium text-slate-700">{matterNames.get(matterId) || 'Unknown matter'}</td>
                <td className="px-5 py-2 text-slate-400 font-mono text-[10px]">{matterId.slice(0, 8).toUpperCase()}</td>
                <td className="px-5 py-2 text-right text-slate-500">{ledger.entries}</td>
                <td className={`px-5 py-2 text-right font-semibold ${ledger.balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {aud.format(ledger.balance)}
                </td>
              </tr>
            ))}
            {ledgers.size === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-[11px] text-slate-300 italic">No trust transactions up to this month</td></tr>
            )}
          </tbody>
          {ledgers.size > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-5 py-2.5 font-bold text-slate-700" colSpan={3}>Total of all trust ledgers</td>
                <td className="px-5 py-2.5 text-right font-bold text-slate-900">{aud.format(trialBalanceTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 3. Bank statement */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">3 · Trust bank statement</p>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Statement closing balance at end of {month}</label>
            <input
              type="number"
              step="0.01"
              value={bankBalance}
              onChange={e => setBankBalance(e.target.value)}
              placeholder="0.00"
              className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-teal-100 w-56"
            />
          </div>
          {bankVariance !== null && (
            Math.abs(bankVariance) < 0.005 ? (
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-600 pb-2"><CheckCircle2 size={14} /> Reconciles with the cash book</p>
            ) : (
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-rose-600 pb-2">
                <AlertTriangle size={14} /> Variance of {aud.format(bankVariance)} vs cash book — identify unpresented cheques / outstanding deposits, or investigate
              </p>
            )
          )}
        </div>
        <p className="text-[10px] text-slate-400">
          Any deficiency or irregularity must be reported to the regulator as soon as practicable, with the cause and rectification steps.
        </p>
      </div>
    </div>
  );
}

"use client";

// Trust Trial Balance report -- one row per matter that's ever had a trust
// transaction (including matters that have since gone back to zero), as at
// a chosen date OR the end of a chosen month (for firms that issue one
// routinely rather than picking a date each time -- see dateMode/monthEndStr
// below; a month still in progress is capped at today rather than claiming
// to report on days that haven't happened yet), plus the statutory summary
// block: total trust ledger accounts, any statutory deposit account, and
// the variance against the reconciled trust cash book balance -- the core
// "do the ledgers agree with the bank" check (r 47). Statutory deposit /
// reconciled cash book balance aren't ledger data, so they're plain inputs
// on this report rather than persisted fields -- filled in immediately
// before printing. "Prepared by" defaults from the signed-in staff
// member's own signoff block (Settings > Precedents > Staff signoffs) but
// stays fully editable; "Reviewed by" has no default since it's someone
// else (the reviewing principal), not the person printing the report.
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Scale, Printer, Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import { useMatterTypes } from "@/lib/hooks/useMatterTypes";
import { formatDateAU } from "@/lib/formatDate";
import { generateTrustTrialBalancePdf } from "@/lib/trust/generateTrustTrialBalancePdf";
import PdfPreviewModal from "./PdfPreviewModal";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";
import { auTodayStr } from "@/lib/companyLocalDate";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

function today(): string {
  return auTodayStr();
}

// Pure calendar math (no "now"/timezone involved, unlike auTodayStr et al
// in lib/companyLocalDate.ts, which is specifically about resolving
// Sydney's current wall-clock day) -- day 0 of the following month is the
// last day of this one.
function monthEndStr(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}
function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function TrustTrialBalanceWidget({ records, trustAccountName }: { records: CustomTableRecord[]; trustAccountName?: string }) {
  const router = useRouter();
  const { companyName, userId } = useCompany();
  // 'date' -- pick any single as-at date (unchanged default behaviour).
  // 'month' -- issue a trial balance as at the end of a chosen month (still
  // capped at today for the current/a future month, so it never claims to
  // report on days that haven't happened yet), for firms that want to
  // routinely issue one per month rather than pick a date each time.
  const [dateMode, setDateMode] = useState<'date' | 'month'>('date');
  const [asOf, setAsOf] = useState(today());
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const effectiveAsOf = useMemo(() => {
    if (dateMode !== 'month') return asOf;
    const end = monthEndStr(month);
    return end > today() ? today() : end;
  }, [dateMode, asOf, month]);
  const [statutoryDeposit, setStatutoryDeposit] = useState('0');
  const [reconciledBalance, setReconciledBalance] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [preparedDate, setPreparedDate] = useState(today());
  const [reviewedBy, setReviewedBy] = useState('');
  const [reviewedDate, setReviewedDate] = useState('');
  const [printing, setPrinting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Default "Prepared by" to this staff member's own signoff block (set
  // once in Settings > Precedents > Staff signoffs, see
  // app/api/precedents/staff-signoffs/route.ts -- falls back to their
  // account name there if they've never set one) -- prev || ... so it never
  // clobbers something they've already typed here this session.
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const res = await fetch('/api/precedents/staff-signoffs');
        const json = await res.json().catch(() => ({}));
        const mine = (json.staff || []).find((s: { userId: string }) => s.userId === userId);
        if (mine?.name) setPreparedBy((prev: string) => prev || mine.name);
      } catch { /* best-effort default -- still fully editable either way */ }
    })();
  }, [userId]);

  const matters = useMemo(() => {
    const byMatter = new Map<string, { balance: number; lastDate: string; clientId: string }>();
    for (const r of records) {
      const matterId = String(r.values.matter || '');
      if (!matterId) continue;
      const date = String(r.values.date || '').slice(0, 10);
      if (date && date > effectiveAsOf) continue;
      const inAmt = Number(r.values.amount_in) || 0;
      const outAmt = Number(r.values.amount_out) || 0;
      const entry = byMatter.get(matterId) || { balance: 0, lastDate: '', clientId: '' };
      entry.balance += inAmt - outAmt;
      if (date > entry.lastDate) { entry.lastDate = date; entry.clientId = String(r.values.client || entry.clientId); }
      byMatter.set(matterId, entry);
    }
    return [...byMatter.entries()]
      .map(([matterId, v]) => ({ matterId, ...v }))
      .sort((a, b) => a.lastDate < b.lastDate ? 1 : -1);
  }, [records, effectiveAsOf]);

  const matterIds = useMemo(() => matters.map(m => m.matterId), [matters]);
  const clientIds = useMemo(() => [...new Set(matters.map(m => m.clientId).filter(Boolean))], [matters]);
  const matterNames = useRecordNames('projects', matterIds);
  const matterNumbers = useMatterNumbers(matterIds);
  const matterTypes = useMatterTypes(matterIds);
  const clientNames = useRecordNames('entities', clientIds);

  const totalLedgerAccounts = useMemo(() => matters.reduce((sum, m) => sum + m.balance, 0), [matters]);
  const statutoryDepositNum = Number(statutoryDeposit) || 0;
  const total = totalLedgerAccounts + statutoryDepositNum;
  const reconciledNum = reconciledBalance === '' ? total : Number(reconciledBalance) || 0;
  const variance = total - reconciledNum;

  const handlePrint = async () => {
    setPrinting(true);
    const bytes = await generateTrustTrialBalancePdf({
      companyName: companyName || '',
      trustAccountName: trustAccountName || 'Trust Account',
      asOf: effectiveAsOf,
      periodLabel: dateMode === 'month' ? `Monthly Trial Balance -- ${monthLabel(month)}` : undefined,
      rows: matters.map(m => ({
        matterNumber: matterNumbers.get(m.matterId) || null,
        description: matterNames.get(m.matterId) || m.matterId.slice(0, 8),
        matterType: matterTypes.get(m.matterId) || null,
        clientName: clientNames.get(m.clientId) || null,
        lastTransactionDate: m.lastDate || null,
        balance: m.balance,
      })),
      totalLedgerAccounts,
      statutoryDeposit: statutoryDepositNum,
      total,
      reconciledCashBookBalance: reconciledNum,
      variance,
      preparedBy, preparedDate, reviewedBy, reviewedDate,
    });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    setPreviewUrl(URL.createObjectURL(blob));
    setPrinting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center">
            <Scale size={18} className="text-amber-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Trial Balance</p>
            <p className="text-[11px] text-slate-400">Every matter's trust ledger balance as at a chosen date or month-end, reconciled to the cash book</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
            <button onClick={() => setDateMode('date')}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${dateMode === 'date' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>
              Date
            </button>
            <button onClick={() => setDateMode('month')}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${dateMode === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>
              Month
            </button>
          </div>
          {dateMode === 'date' ? (
            <>
              <span className="text-slate-300 text-[11px]">as at</span>
              <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-amber-100" />
            </>
          ) : (
            // Effective as-at date (month end, capped at today) shown next
            // to the picker so it's clear exactly which snapshot this will
            // issue for the current/an in-progress month, not just the
            // month name.
            <>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-amber-100" />
              <span className="text-slate-300 text-[11px] whitespace-nowrap">as at {formatDateAU(effectiveAsOf)}</span>
            </>
          )}
          <button onClick={handlePrint} disabled={printing} title="Print"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[12px] font-semibold hover:border-amber-300 transition-all disabled:opacity-50">
            {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Print
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Matter Ref</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Description</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Type</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Client(s)</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Last Transaction Date</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Balance</th>
            </tr>
          </thead>
          <tbody>
            {matters.map(m => (
              <tr key={m.matterId} className="border-b border-slate-50">
                <td className="px-4 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">{matterNumbers.get(m.matterId) || '-'}</td>
                <td className="px-4 py-2 text-slate-600">
                  <button onClick={() => router.push(`/dashboard/projects?id=${m.matterId}&tab=trust_account`)} className="text-teal-700 hover:underline text-left">
                    {matterNames.get(m.matterId) || '-'}
                  </button>
                </td>
                <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{matterTypes.get(m.matterId) || '-'}</td>
                <td className="px-4 py-2 text-slate-600">{clientNames.get(m.clientId) || '-'}</td>
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{formatDateAU(m.lastDate)}</td>
                <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${m.balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{aud.format(m.balance)}</td>
              </tr>
            ))}
            {matters.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-[11px] text-slate-300 italic">No trust transactions as at this date</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={5}>Total Trust Ledger Accounts</td>
              <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{aud.format(totalLedgerAccounts)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Reconciliation summary</p>
          <div className="space-y-2 text-[12px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total Trust Ledger Accounts</span>
              <span className="font-semibold text-slate-900">{aud.format(totalLedgerAccounts)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Statutory Deposit</span>
              <input type="number" step="0.01" value={statutoryDeposit} onChange={e => setStatutoryDeposit(e.target.value)}
                className="w-32 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-right text-sm outline-none focus:ring-4 focus:ring-amber-100" />
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-2">
              <span className="text-slate-700 font-semibold">Total</span>
              <span className="font-bold text-slate-900">{aud.format(total)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Reconciled Trust Cash Book Balance</span>
              <input type="number" step="0.01" placeholder={total.toFixed(2)} value={reconciledBalance} onChange={e => setReconciledBalance(e.target.value)}
                className="w-32 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-right text-sm outline-none focus:ring-4 focus:ring-amber-100" />
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-2">
              <span className="text-slate-700 font-semibold">Variance</span>
              <span className={`font-bold ${Math.abs(variance) >= 0.005 ? 'text-rose-600' : 'text-emerald-600'}`}>{aud.format(variance)}</span>
            </div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sign-off (for print)</p>
            <button onClick={() => router.push('/dashboard/settings?view=precedents')} title="Set your default name/position for 'Prepared by'"
              className="text-[10px] font-semibold text-amber-700 hover:underline">
              Set default
            </button>
          </div>
          <div className="space-y-2 text-[12px]">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 w-24 shrink-0">Prepared by</span>
              <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="Name"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-sm outline-none focus:ring-4 focus:ring-amber-100" />
              <input type="date" value={preparedDate} onChange={e => setPreparedDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-sm outline-none focus:ring-4 focus:ring-amber-100" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 w-24 shrink-0">Reviewed by</span>
              <input value={reviewedBy} onChange={e => setReviewedBy(e.target.value)} placeholder="Principal name"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-sm outline-none focus:ring-4 focus:ring-amber-100" />
              <input type="date" value={reviewedDate} onChange={e => setReviewedDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-sm outline-none focus:ring-4 focus:ring-amber-100" />
            </div>
          </div>
        </div>
      </div>

      {previewUrl && (
        <PdfPreviewModal
          src={previewUrl}
          downloadSrc={previewUrl}
          title="Trial Balance"
          onClose={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
        />
      )}
    </div>
  );
}

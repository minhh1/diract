"use client";

// Bespoke Trust Account page -- deliberately NOT a company_dashboards row /
// generic widget canvas (see supabase/migrations/20260731100000_trust_account_page.sql's
// header comment for why the old generic "Trust Account" dashboard was
// retired). Structured like RecordDashboard.tsx: a fixed header + tab bar,
// just scoped to the whole trust ledger instead of one record. Reuses the
// EXISTING Trust Transactions ledger table (useCustomTable('trust-transactions'))
// and its insert_ledger_record() mechanics throughout -- this page is new UI
// over old data, not a new data structure.
import { useState, useMemo } from "react";
import { Landmark, Plus, X, Check, Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { createRecord as createCustomRecord } from "@/lib/services/customTableService";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import TrustTransactionsTab from "@/components/trust/TrustTransactionsTab";
import ProtectedFundsTab from "@/components/trust/ProtectedFundsTab";
import BankReconciliationTab from "@/components/trust/BankReconciliationTab";
import TrustReportsTab from "@/components/trust/TrustReportsTab";

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

type Tab = 'transactions' | 'protected' | 'reconciliation' | 'reports';
const TABS: { id: Tab; label: string }[] = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'protected', label: 'Protected Funds' },
  { id: 'reconciliation', label: 'Bank Reconciliation' },
  { id: 'reports', label: 'Reports' },
];

export default function TrustAccountPage() {
  const { companyId, userId, isAdmin } = useCompany();
  const accountsTable = useCustomTable('trust-accounts');
  const trustTable = useCustomTable('trust-transactions');
  const protectedTable = useCustomTable('trust-protected-funds');

  const [activeTab, setActiveTab] = useState<Tab>('transactions');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [addingAccount, setAddingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBsb, setNewAccountBsb] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  const loading = accountsTable.loading || trustTable.loading;
  useProgressBarWhile(loading);

  const activeAccounts = useMemo(
    () => accountsTable.records.filter(r => r.values.is_active !== false).sort((a, b) => (a.values.account_name || '').localeCompare(b.values.account_name || '')),
    [accountsTable.records]
  );

  const currentAccountId = selectedAccountId ?? activeAccounts[0]?.id ?? null;
  const currentAccount = activeAccounts.find(a => a.id === currentAccountId) || null;

  // Records for the selected account -- entries created before the
  // trust_account field existed have no value here, so a company with
  // exactly one account (the common case) still sees everything even
  // though old rows are unattributed.
  const accountRecords = useMemo(() => {
    if (!currentAccountId) return trustTable.records;
    return trustTable.records.filter(r => (r.values.trust_account || null) === currentAccountId || (activeAccounts.length <= 1 && !r.values.trust_account));
  }, [trustTable.records, currentAccountId, activeAccounts.length]);

  const total = useMemo(
    () => accountRecords.reduce((s, r) => s + (Number(r.values.amount_in) || 0) - (Number(r.values.amount_out) || 0), 0),
    [accountRecords]
  );
  const protectedRecords = useMemo(
    () => protectedTable.records.filter(r => !r.values.released_at && (!currentAccountId || (r.values.trust_account || null) === currentAccountId)),
    [protectedTable.records, currentAccountId]
  );
  const protectedTotal = useMemo(() => protectedRecords.reduce((s, r) => s + (Number(r.values.amount) || 0), 0), [protectedRecords]);
  const available = total - protectedTotal;

  const handleAddAccount = async () => {
    if (!companyId || !userId || !accountsTable.tableDef || !newAccountName.trim()) return;
    setSavingAccount(true);
    const result = await createCustomRecord(accountsTable.tableDef.id, companyId, userId, {
      account_name: newAccountName.trim(),
      bsb: newAccountBsb.trim() || null,
      account_number: newAccountNumber.trim() || null,
      is_active: true,
    }, accountsTable.fields);
    setSavingAccount(false);
    if (result && 'id' in result) {
      setSelectedAccountId(result.id);
      setAddingAccount(false);
      setNewAccountName(''); setNewAccountBsb(''); setNewAccountNumber('');
      accountsTable.refetch();
    }
  };

  if (loading && activeAccounts.length === 0) {
    return (
      <div className="px-8 pt-16 md:pt-7">
        <div className="h-8 w-48 bg-slate-100 rounded-full animate-pulse mb-6" />
        <div className="h-32 bg-slate-50 border border-slate-100 rounded-[28px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-8 pt-16 md:pt-7 pb-0 border-b border-slate-100 shrink-0 bg-white">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-7 h-7 rounded-lg bg-teal-700 flex items-center justify-center shrink-0">
            <Landmark size={14} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Trust Account</h1>
        </div>

        {activeAccounts.length === 0 && !addingAccount ? (
          <div className="mb-5 px-5 py-4 bg-amber-50 border border-amber-200 rounded-2xl text-[12px] text-amber-700 flex items-center justify-between">
            <span>No trust accounts set up yet.</span>
            <button onClick={() => setAddingAccount(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-full text-[11px] font-bold">
              <Plus size={12} /> Add trust account
            </button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div className="flex flex-wrap gap-2 items-center">
              {activeAccounts.map(a => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAccountId(a.id)}
                  className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all border ${
                    currentAccountId === a.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
                  }`}
                >
                  {a.values.account_name}
                </button>
              ))}
              {isAdmin && (
                <button onClick={() => setAddingAccount(true)} title="Add trust account" className="p-1.5 text-slate-300 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-all">
                  <Plus size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-6">
              {/* Confirmed live (cold mobile Safari load): these read as a
                  confidently-wrong $0.00 for ~1s before trustTable/
                  protectedTable's records actually land, since total/
                  protectedTotal/available are computed straight from them.
                  An em dash while still loading is honest without needing a
                  spinner -- the page's own progress bar already covers
                  "still working". */}
              <div className="text-right">
                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Protected</p>
                <p className="text-[14px] font-bold text-slate-800">{trustTable.recordsLoading || protectedTable.recordsLoading ? '-' : money(protectedTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Available</p>
                <p className="text-[14px] font-bold text-slate-800">{trustTable.recordsLoading || protectedTable.recordsLoading ? '-' : money(available)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total</p>
                <p className="text-[14px] font-bold text-slate-800">{trustTable.recordsLoading ? '-' : money(total)}</p>
              </div>
            </div>
          </div>
        )}

        {currentAccount && (
          <p className="text-[11px] font-medium text-slate-400 mb-4">
            BSB: {currentAccount.values.bsb || '-'} · Acc: {currentAccount.values.account_number || '-'}
          </p>
        )}

        {addingAccount && (
          <div className="mb-5 px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Account name</label>
              <input value={newAccountName} onChange={e => setNewAccountName(e.target.value)} placeholder="e.g. Huynh Lawyers Law Practice Trust Account"
                className="bg-white border border-slate-200 rounded-full py-2 px-4 text-[12px] font-medium outline-none w-72" />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">BSB</label>
              <input value={newAccountBsb} onChange={e => setNewAccountBsb(e.target.value)} placeholder="062468"
                className="bg-white border border-slate-200 rounded-full py-2 px-4 text-[12px] font-medium outline-none w-28" />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Account number</label>
              <input value={newAccountNumber} onChange={e => setNewAccountNumber(e.target.value)} placeholder="10839764"
                className="bg-white border border-slate-200 rounded-full py-2 px-4 text-[12px] font-medium outline-none w-36" />
            </div>
            <button onClick={handleAddAccount} disabled={savingAccount || !newAccountName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white rounded-full text-[11px] font-bold disabled:opacity-50">
              {savingAccount ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
            </button>
            <button onClick={() => setAddingAccount(false)} className="p-2 text-slate-300 hover:text-slate-600"><X size={14} /></button>
          </div>
        )}

        <div className="flex items-center gap-1 -mb-px">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-all ${
                activeTab === t.id ? 'border-teal-700 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6 bg-slate-50">
        {!currentAccountId ? (
          <p className="text-center text-[12px] text-slate-400 py-16">Add a trust account above to get started.</p>
        ) : activeTab === 'transactions' ? (
          <TrustTransactionsTab
            companyId={companyId!}
            userId={userId!}
            trustAccountId={currentAccountId}
            trustAccounts={activeAccounts}
            trustTable={trustTable}
            protectedTable={protectedTable}
            records={accountRecords}
            availableBalance={available}
            isAdmin={isAdmin}
          />
        ) : activeTab === 'protected' ? (
          <ProtectedFundsTab
            companyId={companyId!}
            userId={userId!}
            trustAccountId={currentAccountId}
            protectedTable={protectedTable}
            trustTable={trustTable}
            protectedRecords={protectedRecords}
            allProtectedRecords={protectedTable.records.filter(r => !currentAccountId || (r.values.trust_account || null) === currentAccountId)}
          />
        ) : activeTab === 'reconciliation' ? (
          <BankReconciliationTab
            companyId={companyId!}
            userId={userId!}
            trustAccountId={currentAccountId}
            trustAccount={currentAccount}
            trustTable={trustTable}
            records={accountRecords}
          />
        ) : (
          <TrustReportsTab records={accountRecords} trustAccountName={currentAccount?.values.account_name} />
        )}
      </div>
    </div>
  );
}

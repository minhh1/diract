"use client";

// Bespoke "Run Pay" page -- new UI over the Pay Runs/Payslips/Timesheets
// custom tables (see supabase/migrations/20260805090000_niksen_payroll_tables.sql),
// same "dedicated route, not a generic company_dashboards widget canvas"
// pattern app/dashboard/trust-account/page.tsx already set for statutory
// record-keeping. Starting a run just creates a Draft Pay Runs record
// (plain createRecord -- Pay Runs isn't a ledger table); the actual
// gross/tax/super/net numbers are computed server-side by
// app/api/pay-runs/run/route.ts (GET = dry-run preview, POST = commit),
// never here, since that's where the withholding engine and the
// employee/timesheet lookups live.
import { useState, useMemo } from "react";
import { Wallet, Plus, X, Check, Loader2, AlertCircle } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { createRecord as createCustomRecord } from "@/lib/services/customTableService";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import CoefficientsWarningBanner from "@/components/payroll/CoefficientsWarningBanner";

function money(n: number): string {
  return (n ?? 0).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

interface PreviewLine {
  employeeId: string;
  employeeName: string;
  hours: number;
  hourlyRate: number;
  grossPay: number;
  taxWithheld: number;
  superAmount: number;
  netPay: number;
  missingRate: boolean;
}

interface RunResult {
  employeeId: string;
  employeeName: string;
  ok: boolean;
  error?: string;
}

export default function PayRunPage() {
  const { companyId, userId } = useCompany();
  const payRunsTable = useCustomTable("pay-runs");

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [newPeriodStart, setNewPeriodStart] = useState("");
  const [newPeriodEnd, setNewPeriodEnd] = useState("");
  const [creating, setCreating] = useState(false);

  const [preview, setPreview] = useState<PreviewLine[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<RunResult[] | null>(null);

  useProgressBarWhile(payRunsTable.loading);

  const runs = useMemo(
    () => [...payRunsTable.records].sort((a, b) => (b.values.period_start || "").localeCompare(a.values.period_start || "")),
    [payRunsTable.records]
  );
  const selectedRun = runs.find(r => r.id === selectedRunId) || null;

  const startNewRun = async () => {
    if (!companyId || !userId || !payRunsTable.tableDef || !newPeriodStart || !newPeriodEnd) return;
    setCreating(true);
    const result = await createCustomRecord(
      payRunsTable.tableDef.id,
      companyId,
      userId,
      { period_start: newPeriodStart, period_end: newPeriodEnd, status: "Draft" },
      payRunsTable.fields
    );
    setCreating(false);
    if (result && "id" in result) {
      setStarting(false);
      setNewPeriodStart("");
      setNewPeriodEnd("");
      payRunsTable.refetch();
      setSelectedRunId(result.id);
      loadPreview(result.id);
    }
  };

  const loadPreview = async (payRunId: string) => {
    setPreview(null);
    setPreviewError(null);
    setResults(null);
    setPreviewLoading(true);
    const res = await fetch(`/api/pay-runs/run?payRunId=${payRunId}`);
    const json = await res.json();
    setPreviewLoading(false);
    if (!res.ok) {
      setPreviewError(json.error || "Could not compute a preview for this pay run");
      return;
    }
    setPreview(json.lines || []);
  };

  const selectRun = (id: string) => {
    setSelectedRunId(id);
    loadPreview(id);
  };

  const processRun = async () => {
    if (!selectedRunId) return;
    setProcessing(true);
    const res = await fetch("/api/pay-runs/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payRunId: selectedRunId }),
    });
    const json = await res.json();
    setProcessing(false);
    if (!res.ok) {
      setPreviewError(json.error || "Could not process this pay run");
      return;
    }
    setResults(json.results || []);
    payRunsTable.refetch();
  };

  const totalGross = (preview || []).reduce((s, l) => s + l.grossPay, 0);
  const totalTax = (preview || []).reduce((s, l) => s + l.taxWithheld, 0);
  const totalSuper = (preview || []).reduce((s, l) => s + l.superAmount, 0);
  const totalNet = (preview || []).reduce((s, l) => s + l.netPay, 0);
  const isProcessed = selectedRun?.values.status === "Processed" || selectedRun?.values.status === "Finalized";

  return (
    <div className="flex flex-col h-full">
      <header className="px-8 pt-16 md:pt-7 pb-0 border-b border-slate-100 shrink-0 bg-white">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-7 h-7 rounded-lg bg-cyan-700 flex items-center justify-center shrink-0">
            <Wallet size={14} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Run Pay</h1>
        </div>
      </header>

      <CoefficientsWarningBanner />

      <div className="flex-1 overflow-y-auto px-8 py-6 bg-slate-50">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Pay run list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Pay Runs</p>
              <button onClick={() => setStarting(true)} className="p-1.5 text-slate-300 hover:text-cyan-600 hover:bg-cyan-50 rounded-full transition-all">
                <Plus size={14} />
              </button>
            </div>

            {starting && (
              <div className="mb-3 p-4 bg-white border border-slate-200 rounded-2xl space-y-2.5">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Period start</label>
                  <input type="date" value={newPeriodStart} onChange={e => setNewPeriodStart(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-[12px] outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Period end</label>
                  <input type="date" value={newPeriodEnd} onChange={e => setNewPeriodEnd(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-[12px] outline-none" />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={startNewRun}
                    disabled={creating || !newPeriodStart || !newPeriodEnd}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700 text-white rounded-full text-[11px] font-bold disabled:opacity-50"
                  >
                    {creating ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Create
                  </button>
                  <button onClick={() => setStarting(false)} className="p-1.5 text-slate-300 hover:text-slate-600"><X size={13} /></button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {runs.length === 0 && !starting ? (
                <p className="text-[11px] text-slate-300 italic py-4">No pay runs yet.</p>
              ) : (
                runs.map(r => (
                  <button
                    key={r.id}
                    onClick={() => selectRun(r.id)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[12px] transition-all border ${
                      selectedRunId === r.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-cyan-300"
                    }`}
                  >
                    <p className="font-semibold">{r.values.period_start} → {r.values.period_end}</p>
                    <p className={`text-[10px] mt-0.5 ${selectedRunId === r.id ? "text-slate-300" : "text-slate-400"}`}>{r.values.status || "Draft"}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Review / results */}
          <div>
            {!selectedRun ? (
              <p className="text-center text-[12px] text-slate-400 py-16">Select or start a pay run to review it.</p>
            ) : previewLoading ? (
              <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
            ) : previewError ? (
              <p className="flex items-center gap-1.5 text-[12px] text-red-500 py-4"><AlertCircle size={13} /> {previewError}</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-[13px] font-bold text-slate-800">
                    {selectedRun.values.period_start} → {selectedRun.values.period_end}
                  </p>
                  {!isProcessed && !results && (preview?.length ?? 0) > 0 && (
                    <button
                      onClick={processRun}
                      disabled={processing}
                      className="flex items-center gap-1.5 px-4 py-2 bg-cyan-700 text-white rounded-full text-[11px] font-bold disabled:opacity-50"
                    >
                      {processing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Process pay run
                    </button>
                  )}
                </div>

                {results ? (
                  <div className="divide-y divide-slate-50">
                    {results.map(r => (
                      <div key={r.employeeId} className="px-5 py-3 flex items-center justify-between">
                        <span className="text-[12px] font-medium text-slate-700">{r.employeeName}</span>
                        {r.ok ? (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-600"><Check size={11} /> Paid</span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] text-red-500"><AlertCircle size={11} /> {r.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : !preview?.length ? (
                  <p className="text-center text-[12px] text-slate-400 py-10">No unpaid timesheet hours found in this period.</p>
                ) : (
                  <>
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          <th className="text-left px-5 py-2">Employee</th>
                          <th className="text-right px-3 py-2">Hours</th>
                          <th className="text-right px-3 py-2">Gross</th>
                          <th className="text-right px-3 py-2">Tax</th>
                          <th className="text-right px-3 py-2">Super</th>
                          <th className="text-right px-5 py-2">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {preview.map(l => (
                          <tr key={l.employeeId}>
                            <td className="px-5 py-2.5 font-medium text-slate-700">
                              {l.employeeName}
                              {l.missingRate && (
                                <span className="ml-1.5 text-[10px] text-amber-600" title="No hourly rate set">⚠</span>
                              )}
                            </td>
                            <td className="text-right px-3 py-2.5 text-slate-500">{l.hours}</td>
                            <td className="text-right px-3 py-2.5 text-slate-700">{money(l.grossPay)}</td>
                            <td className="text-right px-3 py-2.5 text-slate-700">{money(l.taxWithheld)}</td>
                            <td className="text-right px-3 py-2.5 text-slate-700">{money(l.superAmount)}</td>
                            <td className="text-right px-5 py-2.5 font-bold text-slate-900">{money(l.netPay)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 font-bold text-slate-900">
                          <td className="px-5 py-2.5">Total</td>
                          <td />
                          <td className="text-right px-3 py-2.5">{money(totalGross)}</td>
                          <td className="text-right px-3 py-2.5">{money(totalTax)}</td>
                          <td className="text-right px-3 py-2.5">{money(totalSuper)}</td>
                          <td className="text-right px-5 py-2.5">{money(totalNet)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    {isProcessed && (
                      <p className="px-5 py-3 text-[11px] text-emerald-600 border-t border-slate-100 flex items-center gap-1.5">
                        <Check size={12} /> This pay run has already been processed.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

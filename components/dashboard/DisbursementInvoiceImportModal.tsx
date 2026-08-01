// components/dashboard/DisbursementInvoiceImportModal.tsx
// Upload a supplier tax invoice PDF (InfoTrack-style: many matters' worth
// of search/certificate/VOI charges, grouped under a "<matter number>
// Matter Total = ..." heading per group) and review the extracted line
// items before anything is written -- see the header comment on
// app/api/disbursements/parse-invoice/route.ts for why this can't safely
// auto-commit: a matter number that doesn't resolve to an existing matter
// needs a human decision (skip it, or go create the matter first), not a
// guess. Matched groups default to included; unmatched groups can't be
// committed at all (no matter to attach them to) and are shown only so
// staff know what was left out and why.
"use client";

import { useState } from "react";
import { X, Loader2, Upload, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";

interface LineItem { description: string; exGstAmount: number; gstAmount: number; totalAmount: number; }
interface MatterGroup { matterNumber: string; projectId: string | null; projectName: string | null; lineItems: LineItem[]; }
interface ParsedInvoice { supplierName: string; invoiceNumber: string; invoiceDate: string; matters: MatterGroup[]; }

const EXPENSE_CODES = [
  "E101 Copying", "E102 Outside Printing", "E103 Word Processing", "E104 Facsimile", "E105 Telephone",
  "E106 Online Research", "E107 Delivery Services/Messengers", "E108 Postage", "E109 Local Travel",
  "E110 Out-of-Town Travel", "E111 Meals", "E112 Court Fees", "E113 Subpoena Fees", "E114 Witness Fees",
  "E115 Deposition Transcripts", "E116 Trial Transcripts", "E117 Trial Exhibits", "E118 Litigation Support Vendors",
  "E119 Experts", "E120 Private Investigators", "E121 Arbitrators/Mediators", "E122 Local Counsel",
  "E123 Other Professionals", "E124 Other",
];

// Best-effort default -- staff can change it per line before committing.
function guessExpenseCode(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("verification of identity") || d.includes("aml onboarding")) return "E124 Other";
  return "E106 Online Research";
}

interface ReviewLineItem extends LineItem {
  included: boolean;
  expenseCode: string;
}
interface ReviewGroup extends Omit<MatterGroup, "lineItems"> {
  lineItems: ReviewLineItem[];
}

export default function DisbursementInvoiceImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<ParsedInvoice | null>(null);
  const [groups, setGroups] = useState<ReviewGroup[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [date, setDate] = useState("");
  const [result, setResult] = useState<number | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/disbursements/parse-invoice", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read this invoice");
      const parsed = json as ParsedInvoice;
      setInvoice(parsed);
      setSupplierName(parsed.supplierName);
      setDate(parsed.invoiceDate);
      setGroups(parsed.matters.map((m: MatterGroup) => ({
        ...m,
        lineItems: m.lineItems.map(li => ({ ...li, included: !!m.projectId, expenseCode: guessExpenseCode(li.description) })),
      })));
    } catch (e: any) {
      setError(e?.message || "Couldn't read this invoice");
    } finally {
      setParsing(false);
    }
  };

  const toggleGroup = (matterNumber: string, included: boolean) => {
    setGroups(prev => prev.map(g => g.matterNumber === matterNumber ? { ...g, lineItems: g.lineItems.map(li => ({ ...li, included: !!g.projectId && included })) } : g));
  };
  const toggleLine = (matterNumber: string, index: number, included: boolean) => {
    setGroups(prev => prev.map(g => g.matterNumber !== matterNumber ? g : { ...g, lineItems: g.lineItems.map((li, i) => i === index ? { ...li, included } : li) }));
  };
  const updateLine = (matterNumber: string, index: number, patch: Partial<ReviewLineItem>) => {
    setGroups(prev => prev.map(g => g.matterNumber !== matterNumber ? g : { ...g, lineItems: g.lineItems.map((li, i) => i === index ? { ...li, ...patch } : li) }));
  };

  const includedCount = groups.reduce((sum, g) => sum + g.lineItems.filter(li => li.included).length, 0);
  const includedTotal = groups.reduce((sum, g) => sum + g.lineItems.filter(li => li.included).reduce((s, li) => s + li.exGstAmount, 0), 0);

  const commit = async () => {
    const items = groups.flatMap(g =>
      g.projectId
        ? g.lineItems.filter(li => li.included).map(li => ({
            projectId: g.projectId!, description: li.description, amount: li.exGstAmount,
            date, supplierName, expenseCode: li.expenseCode,
          }))
        : []
    );
    if (!items.length) { setError("Nothing selected to add"); return; }
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch("/api/disbursements/commit", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't add these disbursements");
      setResult(json.created);
      onImported();
    } catch (e: any) {
      setError(e?.message || "Couldn't add these disbursements");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Import disbursements from invoice</h3>
          <button onClick={onClose} title="Close" className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {result !== null ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <CheckCircle2 size={32} className="text-emerald-500" />
              <p className="text-[13px] font-bold text-slate-800">Added {result} disbursement{result === 1 ? "" : "s"}</p>
              <button onClick={onClose} className="mt-2 px-5 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-800 transition-colors">Done</button>
            </div>
          ) : !invoice ? (
            <label className="flex flex-col items-center justify-center gap-3 py-16 border-2 border-dashed border-slate-200 rounded-3xl cursor-pointer hover:border-indigo-300 hover:bg-slate-50 transition-colors">
              <input type="file" accept="application/pdf" className="hidden" disabled={parsing}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {parsing ? (
                <>
                  <Loader2 size={24} className="animate-spin text-indigo-500" />
                  <p className="text-[12px] text-slate-500">Reading the invoice...</p>
                </>
              ) : (
                <>
                  <Upload size={24} className="text-slate-300" />
                  <p className="text-[12px] font-bold text-slate-600">Click to choose a PDF invoice</p>
                  <p className="text-[11px] text-slate-400">Disbursements will be grouped by matter number for review before anything is added.</p>
                </>
              )}
            </label>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Supplier</p>
                  <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[12px] outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Invoice number</p>
                  <p className="px-3 py-2 text-[12px] text-slate-500">{invoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date to record</p>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[12px] outline-none focus:border-indigo-400" />
                </div>
              </div>

              <div className="space-y-4">
                {groups.map(g => (
                  <div key={g.matterNumber} className={`border rounded-2xl overflow-hidden ${g.projectId ? "border-slate-200" : "border-amber-200 bg-amber-50/40"}`}>
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50/60">
                      <div className="flex items-center gap-2 min-w-0">
                        {g.projectId ? (
                          <input type="checkbox" checked={g.lineItems.every(li => li.included)} onChange={e => toggleGroup(g.matterNumber, e.target.checked)}
                            className="shrink-0" />
                        ) : (
                          <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                        )}
                        <p className="text-[12px] font-bold text-slate-700 truncate">
                          {g.matterNumber}{g.projectName ? ` — ${g.projectName}` : ""}
                        </p>
                      </div>
                      {!g.projectId && (
                        <span className="text-[10px] font-bold text-amber-600 shrink-0">No matching matter, can&apos;t be added</span>
                      )}
                    </div>
                    <div className="divide-y divide-slate-50">
                      {g.lineItems.map((li, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                          <input type="checkbox" checked={li.included} disabled={!g.projectId}
                            onChange={e => toggleLine(g.matterNumber, i, e.target.checked)} className="shrink-0 disabled:opacity-30" />
                          <input value={li.description} disabled={!g.projectId} onChange={e => updateLine(g.matterNumber, i, { description: e.target.value })}
                            className="flex-1 min-w-0 px-2 py-1 text-[11px] text-slate-700 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded-lg outline-none disabled:opacity-40 disabled:hover:border-transparent" />
                          <select value={li.expenseCode} disabled={!g.projectId} onChange={e => updateLine(g.matterNumber, i, { expenseCode: e.target.value })}
                            className="shrink-0 w-40 px-2 py-1 text-[10px] border border-slate-200 rounded-lg outline-none disabled:opacity-40">
                            {EXPENSE_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input type="number" step="0.01" value={li.exGstAmount} disabled={!g.projectId}
                            onChange={e => updateLine(g.matterNumber, i, { exGstAmount: Number(e.target.value) })}
                            className="shrink-0 w-24 px-2 py-1 text-[11px] text-right border border-slate-200 rounded-lg outline-none disabled:opacity-40" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-[11px] text-red-500">{error}</p>}
        </div>

        {invoice && result === null && (
          <div className="flex items-center justify-between px-8 py-5 border-t border-slate-100 shrink-0">
            <p className="text-[11px] text-slate-400">
              {includedCount} line{includedCount === 1 ? "" : "s"} selected · ${includedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ex GST
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => { setInvoice(null); setGroups([]); setResult(null); }} disabled={committing}
                className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40">
                <Trash2 size={12} /> Start over
              </button>
              <button onClick={commit} disabled={committing || !includedCount}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                {committing ? <Loader2 size={13} className="animate-spin" /> : null}
                Add {includedCount || ""} disbursement{includedCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

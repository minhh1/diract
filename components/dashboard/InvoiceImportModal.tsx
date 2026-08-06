// components/dashboard/InvoiceImportModal.tsx
// Upload a generic PDF invoice/receipt and review the extracted line items
// before anything is written -- a flatter, table-agnostic sibling to
// DisbursementInvoiceImportModal.tsx: no matter-grouping, no duplicate
// detection (there's no fixed table shape to check duplicates against
// here), just one flat list of line items the viewer can include/edit
// before committing.
"use client";

import { useState } from "react";
import { X, Loader2, Upload, CheckCircle2, Trash2 } from "lucide-react";

interface ParsedLineItem { description: string; amount: number; }
interface ParsedInvoice {
  supplierName: string; invoiceNumber: string; invoiceDate: string;
  subtotal: number | null; tax: number | null; total: number | null;
  lineItems: ParsedLineItem[];
}
interface ReviewLineItem extends ParsedLineItem { included: boolean; }

interface Props {
  dashboardId: string;
  widgetId: string;
  onClose: () => void;
  onImported: () => void;
}

export default function InvoiceImportModal({ dashboardId, widgetId, onClose, onImported }: Props) {
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<ParsedInvoice | null>(null);
  const [items, setItems] = useState<ReviewLineItem[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [result, setResult] = useState<number | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/generic-invoice-import/parse", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read this invoice");
      const parsed = json as ParsedInvoice;
      setInvoice(parsed);
      setSupplierName(parsed.supplierName || "");
      setInvoiceNumber(parsed.invoiceNumber || "");
      setInvoiceDate(parsed.invoiceDate || "");
      setItems(parsed.lineItems.map(li => ({ ...li, included: true })));
    } catch (e: any) {
      setError(e?.message || "Couldn't read this invoice");
    } finally {
      setParsing(false);
    }
  };

  const toggleItem = (i: number, included: boolean) => setItems(prev => prev.map((li, idx) => idx === i ? { ...li, included } : li));
  const updateItem = (i: number, patch: Partial<ReviewLineItem>) => setItems(prev => prev.map((li, idx) => idx === i ? { ...li, ...patch } : li));
  const toggleAll = (included: boolean) => setItems(prev => prev.map(li => ({ ...li, included })));

  const includedCount = items.filter(li => li.included).length;
  const includedTotal = items.filter(li => li.included).reduce((s, li) => s + li.amount, 0);

  const commit = async () => {
    const lineItems = items.filter(li => li.included).map(li => ({
      description: li.description, amount: li.amount,
      supplierName: supplierName || null, invoiceNumber: invoiceNumber || null, invoiceDate: invoiceDate || null,
    }));
    if (!lineItems.length) { setError("Nothing selected to add"); return; }
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch("/api/generic-invoice-import/commit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboardId, widgetId, lineItems }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't add these line items");
      setResult(json.created);
      onImported();
    } catch (e: any) {
      setError(e?.message || "Couldn't add these line items");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Import invoice from PDF</h3>
          <button onClick={onClose} title="Close" className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {result !== null ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <CheckCircle2 size={32} className="text-emerald-500" />
              <p className="text-[13px] font-bold text-slate-800">Added {result} line item{result === 1 ? "" : "s"}</p>
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
                  <p className="text-[11px] text-slate-400">Line items will be extracted for review before anything is added.</p>
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
                  <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[12px] outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date</p>
                  <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[12px] outline-none focus:border-indigo-400" />
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/60">
                  <input type="checkbox" checked={items.every(li => li.included)} onChange={e => toggleAll(e.target.checked)} className="shrink-0" />
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Line items</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {items.map((li, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <input type="checkbox" checked={li.included} onChange={e => toggleItem(i, e.target.checked)} className="shrink-0" />
                      <input value={li.description} onChange={e => updateItem(i, { description: e.target.value })}
                        className="flex-1 min-w-0 px-2 py-1 text-[11px] text-slate-700 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded-lg outline-none" />
                      <input type="number" step="0.01" value={li.amount}
                        onChange={e => updateItem(i, { amount: Number(e.target.value) })}
                        className="shrink-0 w-24 px-2 py-1 text-[11px] text-right border border-slate-200 rounded-lg outline-none" />
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-center py-8 text-[11px] text-slate-300 italic">No line items found</p>}
                </div>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-[11px] text-red-500">{error}</p>}
        </div>

        {invoice && result === null && (
          <div className="flex items-center justify-between px-8 py-5 border-t border-slate-100 shrink-0">
            <p className="text-[11px] text-slate-400">
              {includedCount} item{includedCount === 1 ? "" : "s"} selected · {includedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => { setInvoice(null); setItems([]); setResult(null); }} disabled={committing}
                className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40">
                <Trash2 size={12} /> Start over
              </button>
              <button onClick={commit} disabled={committing || !includedCount}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                {committing ? <Loader2 size={13} className="animate-spin" /> : null}
                Add {includedCount || ""} item{includedCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

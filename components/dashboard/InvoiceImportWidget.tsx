"use client";

// Dashboard-embedded entry point for InvoiceImportModal.tsx -- a button
// that opens the upload/review/commit flow, following the same "widget
// renders a launcher, modal does the work" shape as
// DisbursementInvoiceImportModal's own host (the standalone Disbursements
// table toolbar / a matter's Disbursements tab).
import { useState } from "react";
import { FileUp, Settings2 } from "lucide-react";
import InvoiceImportModal from "./InvoiceImportModal";
import type { InvoiceImportWidget as InvoiceImportWidgetConfig } from "@/lib/dashboardWidgets/types";

interface Props {
  config: InvoiceImportWidgetConfig["config"];
  dashboardId?: string;
  widgetId: string;
  onChanged?: () => void;
}

export default function InvoiceImportWidget({ config, dashboardId, widgetId, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const configured = !!(config.descriptionFieldId && config.amountFieldId);

  if (!dashboardId) {
    return <p className="text-center text-[11px] text-slate-300 italic py-4">Save this dashboard to enable imports</p>;
  }
  if (!configured) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
        <Settings2 size={13} className="shrink-0" />
        Needs its description/amount fields mapped -- open settings (gear icon) first.
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full h-full min-h-[56px] flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[12px] font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-all"
      >
        <FileUp size={16} /> Import invoice (PDF)
      </button>
      {open && (
        <InvoiceImportModal
          dashboardId={dashboardId}
          widgetId={widgetId}
          onClose={() => setOpen(false)}
          onImported={() => onChanged?.()}
        />
      )}
    </>
  );
}

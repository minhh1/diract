"use client";

// Generic per-row "export PDF" widget for ANY custom table (see
// lib/dashboardWidgets/types.ts's DocumentExportWidget) -- same shape as
// LedesExportWidget.tsx (list the dashboard's bound records, one download
// link per row) but not tied to a fixed field_key contract: which fields
// feed the document is this widget's own config, set via the AI's
// add_widget tool or the gear-icon settings panel.
import { FileOutput, Settings2 } from "lucide-react";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";
import type { DocumentExportWidget as DocumentExportWidgetConfig } from "@/lib/dashboardWidgets/types";

interface Props {
  records: CustomTableRecord[];
  config: DocumentExportWidgetConfig["config"];
  dashboardId?: string;
  widgetId: string;
  primaryFieldKey?: string | null;
}

export default function DocumentExportWidget({ records, config, dashboardId, widgetId, primaryFieldKey }: Props) {
  const isLetter = config.style === "letter";
  const configured = isLetter
    ? !!(config.letter?.bodyFieldId)
    : !!(config.invoice?.descriptionFieldId || config.invoice?.amountFieldId || config.invoice?.totalFieldId);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center">
          <FileOutput size={18} className="text-indigo-700" />
        </div>
        <div>
          <p className="text-[13px] font-bold text-slate-800">Document export ({isLetter ? "letter" : "invoice"} style)</p>
          <p className="text-[11px] text-slate-400">
            {isLetter ? "Renders each record onto the company's letterhead" : "Renders each record as a generic invoice-style PDF"}
          </p>
        </div>
      </div>

      {!dashboardId ? (
        <p className="text-center text-[11px] text-slate-300 italic py-8">Save this dashboard to enable exports</p>
      ) : !configured ? (
        <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          <Settings2 size={13} className="shrink-0" />
          This widget needs its fields mapped before it can export anything -- open its settings (gear icon) to pick which fields to use.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-[12px]">
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-2.5 font-medium text-slate-700 truncate max-w-0 w-full">
                    {String((primaryFieldKey && r.values[primaryFieldKey]) || r.id.slice(0, 8))}
                  </td>
                  <td className="px-3 py-2.5 text-right shrink-0">
                    <a
                      href={`/api/document-export/${dashboardId}/${widgetId}/${r.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-bold hover:bg-indigo-100 transition-all"
                    >
                      <FileOutput size={11} /> Export PDF
                    </a>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={2} className="text-center py-10 text-[11px] text-slate-300 italic">No records yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

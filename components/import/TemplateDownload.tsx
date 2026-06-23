"use client";
import { FileSpreadsheet, Download } from "lucide-react";

export default function TemplateDownload({ mode }: { mode: string }) {

const templates: any = {
  properties: "full_address,entity_name,entity_type,folio_identifier,purchase_price,purchase_date,insurer_name,policy_number,insurance_expiry,project_manager"
};
  const onDownload = () => {
    const blob = new Blob([templates[mode]], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = `niksen_${mode}_template.csv`;
    a.click();
  };

  return (
    <div className="p-6 bg-slate-50 border border-slate-100 rounded-[32px] flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-indigo-600 shadow-sm"><FileSpreadsheet size={18}/></div>
        <div>
          <p className="text-sm font-medium text-slate-700 uppercase leading-none">Required {mode} template</p>
          <p className="text-[10px] text-slate-400 font-medium mt-1">Download and fill the headers exactly as shown.</p>
        </div>
      </div>
      <button onClick={onDownload} className="px-6 py-2 bg-white border border-slate-200 rounded-full text-[11px] font-bold text-slate-600 hover:bg-slate-900 hover:text-white transition-all">
        Download
      </button>
    </div>
  );
}
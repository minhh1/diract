"use client";
import { useState, useEffect } from "react";
import { FileSpreadsheet, Download, Loader2, ChevronDown } from "lucide-react";
import { buildAllSections, type ImportSection } from "@/lib/import/buildTemplate";

export default function TemplateDownload({ mode }: { mode: "properties" | "entities" | "projects" }) {
  const [sections, setSections] = useState<ImportSection[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>(mode);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    buildAllSections(mode).then(s => {
      setSections(s);
      setSelectedKey(mode);
      setLoading(false);
    });
  }, [mode]);

  const onDownload = () => {
    const section = sections.find(s => s.key === selectedKey);
    if (!section) return;

    // For linked sections, prepend a reference column so each row can be
    // matched back to its parent property/entity/project on import.
    const referenceCol = section.targetTable === mode ? [] : ['property_street_address'];
    const headerLine = [...referenceCol, ...section.headers].join(',');

    const blob = new Blob([headerLine], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = `niksen_${section.key}_template.csv`;
    a.click();
  };

  return (
    <div className="p-6 bg-slate-50 border border-slate-100 rounded-[32px] space-y-4">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-indigo-600 shadow-sm shrink-0"><FileSpreadsheet size={18}/></div>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-700 uppercase leading-none">Choose what you're importing</p>
          <p className="text-[10px] text-slate-400 font-medium mt-1">Each section is its own file — download, fill in, then import separately.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-[12px] py-2"><Loader2 size={14} className="animate-spin" /> Loading sections...</div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none appearance-none cursor-pointer"
            >
              {sections.map(s => <option key={s.key} value={s.key}>{s.title}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <button onClick={onDownload} className="px-6 py-3 bg-white border border-slate-200 rounded-full text-[11px] font-bold text-slate-600 hover:bg-slate-900 hover:text-white transition-all whitespace-nowrap">
            Download template
          </button>
        </div>
      )}
    </div>
  );
}
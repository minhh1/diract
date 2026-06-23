"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, Wand2, Check, Search, Loader2 } from "lucide-react";

type CaseType = "first-letter" | "lower" | "upper";

export default function DataFormattingTool({ isOpen, onClose, onRefresh }: any) {
  const [step, setStep] = useState<"setup" | "discovery" | "preview">("setup");
  const [loading, setLoading] = useState(false);
  const [table, setTable] = useState<"properties" | "entities" | "projects">("properties");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [targetCase, setTargetCase] = useState<CaseType>("first-letter");
  
  const [candidates, setCandidates] = useState<string[]>([]);
  const [protectedAcronyms, setProtectedAcronyms] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);

  if (!isOpen) return null;

  const tableFields: Record<string, { id: string; label: string }[]> = {
    properties: [
      { id: "street_address", label: "Street name" },
      { id: "suburb", label: "Suburb" }
    ],
    entities: [{ id: "name", label: "Entity name" }],
    projects: [{ id: "name", label: "Project name" }]
  };

  const discoverAcronyms = async () => {
    if (selectedFields.length === 0) return alert("Select fields to analyze.");
    setLoading(true);
    
    const { data } = await supabase.from(table).select("*").is('deleted_at', null);
    const potential = new Set<string>();
    const vowelRegex = /[aeiou]/i;

    data?.forEach(row => {
      selectedFields.forEach(col => {
        const text = row[col] || "";
        text.split(/\s+/).forEach((word: string) => {
          const clean = word.replace(/[^a-zA-Z]/g, "");
          if (clean.length < 2 || clean.length > 6) return;
          if (clean === clean.toUpperCase() || !vowelRegex.test(clean)) {
            potential.add(clean.toUpperCase());
          }
        });
      });
    });

    setCandidates(Array.from(potential));
    setStep("discovery");
    setLoading(false);
  };

  const transformText = (str: string) => {
    if (!str) return "";
    return str.split(" ").map(word => {
      const clean = word.replace(/[^a-zA-Z]/g, "").toUpperCase();
      if (protectedAcronyms.includes(clean)) return clean;

      if (targetCase === "upper") return word.toUpperCase();
      if (targetCase === "lower") return word.toLowerCase();
      
      // LOGIC: Each First Letter is Cap
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(" ");
  };

  const showPreview = async () => {
    setLoading(true);
    const { data } = await supabase.from(table).select("*").is('deleted_at', null).limit(8);
    
    const previews = data?.map(row => {
      const entry: any = { id: row.id, changes: [] };
      selectedFields.forEach(field => {
        entry.changes.push({
          field: tableFields[table].find(f => f.id === field)?.label,
          old: row[field],
          new: transformText(row[field])
        });
      });
      return entry;
    }) || [];

    setPreviewData(previews);
    setStep("preview");
    setLoading(false);
  };

  const commitChanges = async () => {
    setLoading(true);
    const { data } = await supabase.from(table).select("*").is('deleted_at', null);
    
    if (data) {
      for (const row of data) {
        const updateObj: any = {};
        selectedFields.forEach(field => {
          updateObj[field] = transformText(row[field]);
        });
        await supabase.from(table).update(updateObj).eq("id", row.id);
      }
    }
    
    onRefresh();
    onClose();
    setStep("setup");
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md font-sans antialiased text-slate-600">
      <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl flex flex-col max-h-[90vh]">
        
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div>
            <h2 className="text-xl font-light text-slate-900 tracking-tight leading-none uppercase">Case normalization</h2>
            <p className="text-[11px] text-slate-400 mt-2 font-medium">Standardize property and entity records</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-black transition-colors"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          
          {step === "setup" && (
            <div className="space-y-8 animate-in fade-in">
              <section>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2 mb-4">1. Data source</p>
                <div className="grid grid-cols-3 gap-3">
                  {['properties', 'entities', 'projects'].map(t => (
                    <button key={t} onClick={() => { setTable(t as any); setSelectedFields([]); }} className={`py-3 rounded-2xl border font-medium text-xs capitalize transition-all ${table === t ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>{t}</button>
                  ))}
                </div>
              </section>

              <section>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2 mb-4">2. Fields to standardize</p>
                <div className="flex flex-wrap gap-3">
                  {tableFields[table].map(f => (
                    <button 
                      key={f.id} 
                      onClick={() => setSelectedFields(prev => prev.includes(f.id) ? prev.filter(i => i !== f.id) : [...prev, f.id])}
                      className={`px-6 py-3 rounded-2xl border text-sm font-medium transition-all ${selectedFields.includes(f.id) ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2 mb-4">3. Target case style</p>
                <div className="grid grid-cols-1 gap-2">
                  <button onClick={() => setTargetCase("first-letter")} className={`p-5 rounded-2xl border text-left text-sm font-medium transition-all ${targetCase === "first-letter" ? "bg-indigo-600 border-indigo-600 text-white shadow-xl" : "bg-white border-slate-100 text-slate-400"}`}>Each First Letter is Cap</button>
                  <button onClick={() => setTargetCase("lower")} className={`p-5 rounded-2xl border text-left text-sm font-medium transition-all ${targetCase === "lower" ? "bg-indigo-600 border-indigo-600 text-white shadow-xl" : "bg-white border-slate-100 text-slate-400"}`}>all words are not cap</button>
                  <button onClick={() => setTargetCase("upper")} className={`p-5 rounded-2xl border text-left text-sm font-medium transition-all ${targetCase === "upper" ? "bg-indigo-600 border-indigo-600 text-white shadow-xl" : "bg-white border-slate-100 text-slate-400"}`}>ALL CAP</button>
                </div>
              </section>
            </div>
          )}

          {step === "discovery" && (
            <div className="space-y-6 animate-in fade-in">
              <div className="p-6 bg-slate-50 border border-slate-100 rounded-[32px]">
                <p className="text-sm font-medium text-slate-800 leading-tight">Verify acronym protection</p>
                <p className="text-[11px] text-slate-400 mt-1 font-medium">Selected words will be ignored by the case logic and kept in all-caps.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {candidates.map(word => (
                  <button 
                    key={word} 
                    onClick={() => setProtectedAcronyms(prev => prev.includes(word) ? prev.filter(w => w !== word) : [...prev, word])}
                    className={`px-5 py-2.5 rounded-full text-[11px] font-medium border transition-all ${protectedAcronyms.includes(word) ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-600'}`}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-6 animate-in fade-in">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">Audit preview</p>
              <div className="space-y-3">
                {previewData.map((item, i) => (
                  <div key={i} className="p-6 bg-slate-50 border border-slate-100 rounded-[32px] space-y-4">
                    {item.changes.map((c: any, ci: number) => (
                      <div key={ci} className="grid grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">{c.field} original</span>
                          <p className="text-[12px] text-slate-400 line-through truncate">{c.old}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] text-indigo-500 font-bold uppercase">Standardized</span>
                          <p className="text-[14px] font-medium text-slate-900 truncate">{c.new}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-8 border-t border-slate-50 bg-white">
          {step === "setup" && <button onClick={discoverAcronyms} className="w-full py-4 bg-slate-900 text-white rounded-full font-medium text-sm transition-all hover:bg-black">Analyze database</button>}
          {step === "discovery" && <button onClick={showPreview} className="w-full py-4 bg-slate-900 text-white rounded-full font-medium text-sm transition-all hover:bg-black">Generate results preview</button>}
          {step === "preview" && (
            <div className="flex gap-4">
              <button onClick={() => setStep("setup")} className="flex-1 py-4 border border-slate-200 rounded-full font-medium text-sm hover:bg-slate-50">Back</button>
              <button onClick={commitChanges} disabled={loading} className="flex-1 py-4 bg-indigo-600 text-white rounded-full font-medium text-sm shadow-xl shadow-indigo-100 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="animate-spin" size={18} /> : "Finalize changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
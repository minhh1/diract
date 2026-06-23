"use client";

import React, { useState, useEffect, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Database, Clock, Copy, ArrowLeft, Loader2, 
  CheckCircle2, RotateCcw, ChevronRight, AlertCircle, 
  Trash2, Building2, MapPin, LayoutGrid, Upload, FileText, Wand2
} from "lucide-react";
import ImportModal from "@/components/ImportModal";
import DataFormattingTool from "@/components/DataFormattingTool";

type SettingsView = "menu" | "history" | "duplicates_menu" | "duplicates_view";
type DupType = "properties" | "entities" | "projects";

export default function SettingsPage() {
  const [view, setView] = useState<SettingsView>("menu");
  const [activeDupType, setActiveDupType] = useState<DupType>("properties");
  const [items, setItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFormatterOpen, setIsFormatterOpen] = useState(false);

  useEffect(() => {
    if (view === "history") fetchHistory();
    if (view === "duplicates_view") fetchDuplicates();
  }, [view, activeDupType]);

  const fetchHistory = async () => {
    setLoading(true);
    const { data } = await supabase.from("import_history").select(`*, profiles:user_id(full_name)`).order('created_at', { ascending: false });
    setHistory(data || []);
    setLoading(false);
  };

  const fetchDuplicates = async () => {
    setLoading(true);
    const { data: prof } = await supabase.from("profiles").select("company_id").single();
    const rpcName = activeDupType === 'properties' ? 'find_potential_duplicates' : activeDupType === 'entities' ? 'find_entity_duplicates' : 'find_project_duplicates';
    const { data } = await supabase.rpc(rpcName, { similarity_threshold: 0.4, target_company_id: prof?.company_id });
    setItems(data || []);
    setLoading(false);
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.length} records?`)) return;
    await supabase.from(activeDupType).update({ deleted_at: new Date().toISOString() }).in("id", selected);
    setSelected([]);
    fetchDuplicates();
  };

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white p-8 border-b border-slate-100 shrink-0 flex items-center gap-6">
        {view !== "menu" && <button onClick={() => setView(view === 'duplicates_view' ? 'duplicates_menu' : 'menu')} className="p-2 hover:bg-slate-50 rounded-full transition-all text-slate-400"><ArrowLeft size={20}/></button>}
        <div>
          <h1 className="text-3xl font-light text-slate-900 tracking-tight capitalize">{view === 'menu' ? 'Settings' : view.replace('_', ' ')}</h1>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest mt-1">Management administration</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-4 pb-20">
          {view === "menu" && (
            <div className="grid grid-cols-1 gap-4">
              <button onClick={() => setIsImportOpen(true)} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                <div className="flex items-center gap-5"><div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-indigo-600 transition-colors"><Upload size={20} /></div><span className="text-[15px] font-medium text-slate-700">Mass data synchronization engine</span></div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
              </button>

              <button onClick={() => setIsFormatterOpen(true)} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                <div className="flex items-center gap-5"><div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-indigo-600 transition-colors"><Wand2 size={20} /></div><span className="text-[15px] font-medium text-slate-700">Database case standardizer</span></div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
              </button>

              <button onClick={() => setView("duplicates_menu")} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                <div className="flex items-center gap-5"><div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-amber-600 transition-colors"><Copy size={20} /></div><span className="text-[15px] font-medium text-slate-700">Reconciliation tool (Duplicates)</span></div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
              </button>
            </div>
          )}

          {view === "duplicates_menu" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in">
              {[{ id: 'properties', label: 'Assets', icon: MapPin }, { id: 'entities', label: 'Entities', icon: Building2 }, { id: 'projects', label: 'Projects', icon: LayoutGrid }].map((cat) => (
                <button key={cat.id} onClick={() => { setActiveDupType(cat.id as DupType); setView("duplicates_view"); }} className="p-10 bg-white border border-slate-200 rounded-[48px] flex flex-col items-center gap-5 hover:border-indigo-500 hover:shadow-xl transition-all group">
                  <div className="p-5 bg-slate-50 rounded-[24px] text-slate-400 group-hover:text-indigo-600 transition-all"><cat.icon size={40} /></div>
                  <span className="font-medium text-slate-700 uppercase text-[11px] tracking-widest">{cat.label}</span>
                </button>
              ))}
            </div>
          )}

          {view === "duplicates_view" && (
            <div className="space-y-8 animate-in fade-in">
              {items.map((pair, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-[48px] overflow-hidden shadow-sm mb-6 transition-all hover:border-slate-300">
                  <div className="bg-slate-50 px-8 py-3 border-b border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <span>Reason: {pair.match_reason}</span>
                    <span className="text-indigo-600">Points: {pair.match_score}</span>
                  </div>
                  <div className="flex flex-col md:flex-row">
                    {[1, 2].map(n => (
                      <div key={pair[`id${n}`]} onClick={() => setSelected(prev => selected.includes(pair[`id${n}`]) ? prev.filter(x => x !== pair[`id${n}`]) : [...prev, pair[`id${n}`]])} className={`flex-1 p-10 flex items-start gap-6 cursor-pointer transition-all ${n === 1 ? 'border-r border-slate-100' : ''} ${selected.includes(pair[`id${n}`]) ? 'bg-red-50/50' : 'hover:bg-slate-50/30'}`}>
                        <div className={`mt-1 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${selected.includes(pair[`id${n}`]) ? 'bg-red-500 border-red-500 shadow-md' : 'border-slate-200'}`}>{selected.includes(pair[`id${n}`]) && <CheckCircle2 size={14} className="text-white"/>}</div>
                        <div className="flex-1">
                          <p className="text-[16px] font-medium text-slate-900 leading-tight uppercase">{pair[`address${n}`] || pair[`name${n}`]}</p>
                          <div className="mt-6 grid grid-cols-2 gap-y-5 gap-x-12">
                             {activeDupType === 'properties' ? (
                               <>
                                 <div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Price</p><p className="text-[13px] font-medium text-slate-700">${pair[`price${n}`]?.toLocaleString() || '0'}</p></div>
                                 <div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Owner</p><p className="text-[13px] font-medium text-slate-700 truncate">{pair[`entity${n}`] || 'Unassigned'}</p></div>
                                 <div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Date</p><p className="text-[13px] font-medium text-slate-700">{pair[`date${n}`] || '—'}</p></div>
                               </>
                             ) : (
                               <>
                                 <div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Type</p><p className="text-[13px] font-medium text-slate-700">{pair[`type${n}`] || '-'}</p></div>
                                 <div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">ABN</p><p className="text-[13px] font-medium text-slate-700">{pair[`abn${n}`] || '-'}</p></div>
                               </>
                             )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onRefresh={fetchHistory} />
      <DataFormattingTool isOpen={isFormatterOpen} onClose={() => setIsFormatterOpen(false)} onRefresh={() => {}} />
    </div>
  );
}
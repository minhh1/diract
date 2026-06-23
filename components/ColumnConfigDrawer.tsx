"use client";

import { X, Link as LinkIcon } from "lucide-react";

export default function ColumnConfigDrawer({ 
  isOpen, onClose, sections, tableCols, expandCols, onToggle 
}: any) {
  if (!isOpen) return null;

  return (
    <div className="fixed top-0 right-0 w-[550px] h-screen bg-slate-50 border-l border-slate-200 shadow-2xl z-[600] flex flex-col animate-in slide-in-from-right duration-300 font-sans">
      <div className="p-8 border-b border-slate-200 bg-white flex justify-between items-center">
        <div>
          <h3 className="text-xl font-light text-slate-900 tracking-tight leading-none">Workspace setup</h3>
          <p className="text-[11px] text-slate-400 font-medium mt-3 uppercase tracking-widest leading-none">Map database schema to view</p>
        </div>
        <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24}/></button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
        {sections && sections.map((section: any) => (
          <div key={section.title} className="bg-white border border-slate-200 rounded-[32px] p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              {/* Safety check for Icon */}
              {section.icon && (
                <div className="p-2 bg-slate-50 rounded-xl text-indigo-600">
                  <section.icon size={16} />
                </div>
              )}
              <p className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">{section.title}</p>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {section.fields.map((f: any) => {
                const current = tableCols.includes(f.id) ? 'table' : expandCols.includes(f.id) ? 'expand' : 'none';
                return (
                  <div key={f.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl transition-all group">
                    <div className="flex items-center gap-3">
                      {f.id.includes('.') && <LinkIcon size={12} className="text-indigo-400" />}
                      <span className="text-[13px] font-medium text-slate-600 group-hover:text-slate-900">{f.label}</span>
                    </div>
                    <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                      {['none', 'table', 'expand'].map(t => (
                        <button
                          key={t}
                          onClick={() => onToggle(f.id, t)}
                          className={`px-4 py-1.5 text-[9px] rounded-md font-bold uppercase transition-all ${
                            current === t ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400'
                          }`}
                        >
                          {t === 'none' ? 'Hide' : t}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="p-8 bg-white border-t border-slate-100">
        <button onClick={onClose} className="w-full py-5 bg-slate-900 text-white rounded-full font-medium text-xs uppercase tracking-widest active:scale-95 transition-all">
          Sync workspace view
        </button>
      </div>
    </div>
  );
}
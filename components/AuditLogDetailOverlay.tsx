"use client";

import { X, FileText, Activity, Database } from "lucide-react";

export default function AuditLogDetailOverlay({ isOpen, onClose, log }: any) {
  if (!isOpen || !log) return null;

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-end p-0 bg-slate-900/40 backdrop-blur-sm font-sans antialiased">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />
      
      {/* Side Panel (The Big Space) */}
      <div className="relative w-full max-w-2xl h-full bg-white shadow-2xl animate-in slide-in-from-right duration-500 flex flex-col">
        
        {/* Header */}
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600"><Activity size={20}/></div>
            <div>
              <h2 className="text-xl font-light text-slate-900 uppercase tracking-widest">Entry inspection</h2>
              <p className="text-[11px] text-slate-400 font-medium mt-1">Detailed database snapshot for this event</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-all text-slate-300 hover:text-black"><X size={24}/></button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
          {/* Metadata Section */}
          <section>
            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em] mb-4">Event Context</p>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Action performed</p>
                <p className="text-sm font-medium text-slate-700 mt-1">{log.action}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Timestamp</p>
                <p className="text-sm font-medium text-slate-700 mt-1">{new Date(log.created_at).toLocaleString('en-AU')}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Authorized by</p>
                <p className="text-sm font-medium text-slate-700 mt-1">{log.profiles?.full_name || 'System'}</p>
              </div>
            </div>
          </section>

          {/* Data Payload Section */}
          <section className="bg-slate-50 rounded-[32px] p-8 border border-slate-100">
            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <Database size={12}/> Record values
            </p>
            
            <div className="space-y-4">
              {log.details && Object.entries(log.details)
                .filter(([k]) => !['company_id', 'import_id'].includes(k))
                .map(([key, val]: any) => (
                <div key={key} className="flex justify-between items-start py-3 border-b border-slate-200/50 last:border-0">
                  <span className="text-[11px] font-medium text-slate-400 capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-[13px] font-medium text-slate-800 text-right max-w-[300px]">
                    {String(val || '—')}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-100 mt-auto">
          <button onClick={onClose} className="w-full py-4 bg-white border border-slate-200 text-slate-500 rounded-full text-xs font-medium uppercase tracking-widest hover:border-black hover:text-black transition-all">
            Close inspection view
          </button>
        </div>
      </div>
    </div>
  );
}
"use client";

import { useState } from "react";
import { History, Eye } from "lucide-react";
import AuditLogDetailOverlay from "./AuditLogDetailOverlay";

export default function AuditLogTimeline({ logs, title }: { logs: any[], title: string }) {
  const [selectedLog, setSelectedLog] = useState<any>(null);

  return (
    <div className="space-y-8 py-6 font-sans">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-3xl font-light text-slate-900 tracking-tight">{title}</h3>
      </div>

      {logs.map((log) => (
        <div key={log.id} className="relative pl-12 group">
          <div className="absolute left-5 top-2 bottom-0 w-0.5 bg-slate-100 group-last:bg-transparent" />
          <div className="absolute left-0 top-2 w-10 h-10 rounded-2xl bg-white border-2 border-slate-100 flex items-center justify-center shadow-sm z-10 group-hover:border-indigo-500 transition-colors">
            <span className="text-[10px] font-bold text-slate-400 uppercase">{log.profiles?.full_name?.substring(0, 2)}</span>
          </div>

          <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm group-hover:shadow-md transition-all">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[14px] text-slate-600 font-medium">
                  <span className="text-slate-900 font-bold">{log.profiles?.full_name}</span>
                  <span className="mx-2 text-slate-400 font-normal lowercase">{log.action}</span>
                </p>
                <p className="text-[10px] text-slate-300 font-bold uppercase mt-1">
                  {new Date(log.created_at).toLocaleString('en-AU')}
                </p>
              </div>
              
              {/* NEW: OPEN DETAIL VIEW BUTTON */}
              <button 
                onClick={() => setSelectedLog(log)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-100 rounded-full text-[10px] font-bold uppercase text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all"
              >
                <Eye size={12}/> View details
              </button>
            </div>
          </div>
        </div>
      ))}

      <AuditLogDetailOverlay 
        isOpen={!!selectedLog} 
        log={selectedLog} 
        onClose={() => setSelectedLog(null)} 
      />
    </div>
  );
}
"use client";
import { RotateCcw, AlertCircle, CheckCircle2, XCircle } from "lucide-react";

export default function ImportResultsTable({ results, onReverse }: any) {
  if (!results || results.length === 0) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-4">
        <h3 className="text-sm font-medium text-slate-900 uppercase tracking-widest">Audit review</h3>
        <div className="flex gap-4">
          <span className="text-[10px] font-bold text-emerald-600 uppercase">Success: {results.filter((r:any) => r.status !== 'failed').length}</span>
          <span className="text-[10px] font-bold text-red-600 uppercase">Failed: {results.filter((r:any) => r.status === 'failed').length}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] overflow-x-auto shadow-sm">
        <table className="w-full text-left text-[12px] border-collapse min-w-max">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-400">
            <tr>
              <th className="p-4 font-bold uppercase text-[9px] tracking-widest">Status</th>
              <th className="p-4 font-bold uppercase text-[9px] tracking-widest">Identifier</th>
              {/* Dynamic Data Headers */}
              {results[0]?.details && Object.keys(results[0].details)
                .filter(k => !['company_id', 'import_id'].includes(k))
                .map(key => (
                  <th key={key} className="p-4 font-bold uppercase text-[9px] border-l border-slate-100">{key.replace(/_/g, ' ')}</th>
                ))
              }
              <th className="p-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {results.map((res: any, i: number) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="p-4">
                  <div className="flex flex-col gap-1">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase w-fit ${
                      res.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {res.status}
                    </span>
                    {/* CRITICAL: ERROR MESSAGE DISPLAY */}
                    {res.status === 'failed' && (
                      <span className="text-[10px] text-red-500 font-bold leading-tight max-w-[200px]">
                        {res.message}
                      </span>
                    )}
                  </div>
                </td>
                <td className={`p-4 font-bold text-slate-700 uppercase ${res.status === 'reversed' ? 'line-through opacity-30' : ''}`}>
                  {res.identifier}
                </td>
                {/* Render Snapshot Data */}
                {res.details && Object.entries(res.details)
                  .filter(([k]) => !['company_id', 'import_id'].includes(k))
                  .map(([k, v]: any, idx) => (
                    <td key={idx} className={`p-4 text-slate-500 border-l border-slate-50 ${res.status === 'reversed' ? 'line-through opacity-30' : ''}`}>
                      {String(v || '-')}
                    </td>
                ))}
                <td className="p-4 text-center">
                  {res.status !== 'failed' && res.status !== 'reversed' && (
                    <button 
                      onClick={() => onReverse(res.id, i)} 
                      className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                      title="Archive entry"
                    >
                      <RotateCcw size={14}/>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
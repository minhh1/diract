"use client";

import { Save, LayoutGrid, X } from "lucide-react";

export default function ViewPresets({ presets, activePreset, onSelect, onSaveNew, onDelete, isBusy }: any) {
  return (
    <div className="flex items-center gap-3 mt-4 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full">
        <LayoutGrid size={12} className="text-slate-400" />
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Saved views</span>
      </div>
      
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {presets.map((p: any) => (
          <div
            key={p.preset_name}
            className={`flex items-center gap-1.5 rounded-full border transition-all whitespace-nowrap ${
              activePreset === p.preset_name 
              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100" 
              : "bg-white border-slate-200 text-slate-500 hover:border-slate-400"
            }`}
          >
            <button
              disabled={isBusy}
              onClick={() => onSelect(p)}
              className={`pl-4 py-1.5 text-[11px] font-medium disabled:opacity-50 ${
                presets.length > 1 ? "" : "pr-4"
              }`}
            >
              {p.preset_name}
            </button>

            {/* Don't allow deleting the last remaining preset */}
            {presets.length > 1 && (
              <button
                disabled={isBusy}
                onClick={(e) => { e.stopPropagation(); onDelete(p); }}
                title={`Delete "${p.preset_name}"`}
                className={`p-1.5 mr-1.5 rounded-full transition-all disabled:opacity-50 ${
                  activePreset === p.preset_name
                    ? "text-white/70 hover:text-white hover:bg-white/10"
                    : "text-slate-300 hover:text-red-500 hover:bg-red-50"
                }`}
              >
                <X size={11} strokeWidth={3} />
              </button>
            )}
          </div>
        ))}
        
        <button 
          disabled={isBusy}
          onClick={onSaveNew}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-dashed border-slate-300 text-slate-400 hover:text-indigo-600 hover:border-indigo-600 transition-all text-[11px] font-medium whitespace-nowrap disabled:opacity-50"
        >
          <Save size={12} />
          Save current as new
        </button>
      </div>
    </div>
  );
}
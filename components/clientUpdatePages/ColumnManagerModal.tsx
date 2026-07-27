// components/clientUpdatePages/ColumnManagerModal.tsx
// Reorder (drag), remove, and add columns -- same native HTML5 drag
// pattern components/dashboard/FieldLayoutEditor.tsx already uses for
// field reordering elsewhere in this app.
"use client";

import { useState, useEffect } from "react";
import { X, GripVertical, Trash2 } from "lucide-react";

interface FieldDef { id: string; field_source: string; field_key: string; label: string; }
interface CatalogOption { field_key: string; label: string; }

export default function ColumnManagerModal({ pageId, currentFields, onClose, onChanged }: {
  pageId: string; currentFields: FieldDef[]; onClose: () => void; onChanged: () => void;
}) {
  const [order, setOrder] = useState(currentFields);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<{ base: CatalogOption[]; custom: CatalogOption[] } | null>(null);
  const [adhocLabel, setAdhocLabel] = useState("");

  useEffect(() => { setOrder(currentFields); }, [currentFields]);
  useEffect(() => {
    fetch(`/api/client-update-pages/${pageId}/fields`).then(r => r.json()).then(setCatalog);
  }, [pageId]);

  const usedKeys = new Set(order.filter(f => f.field_source !== "adhoc").map(f => f.field_key));

  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }
    const reordered = [...order];
    const fromIdx = reordered.findIndex(f => f.id === draggedId);
    const toIdx = reordered.findIndex(f => f.id === targetId);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setOrder(reordered);
    setDraggedId(null); setDragOverId(null);
    fetch(`/api/client-update-pages/${pageId}/fields/reorder`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldIds: reordered.map(f => f.id) }),
    }).then(() => onChanged());
  };

  const removeField = async (fieldId: string) => {
    setOrder(prev => prev.filter(f => f.id !== fieldId));
    await fetch(`/api/client-update-pages/${pageId}/fields/${fieldId}`, { method: "DELETE" });
    onChanged();
  };

  const addField = async (fieldSource: "base" | "custom" | "adhoc", fieldKey: string | undefined, label: string) => {
    await fetch(`/api/client-update-pages/${pageId}/fields`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldSource, fieldKey, label }),
    });
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Manage columns</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">On this page — drag to reorder</p>
            <div className="space-y-1">
              {order.map(f => (
                <div key={f.id} draggable
                  onDragStart={() => setDraggedId(f.id)}
                  onDragOver={e => { e.preventDefault(); setDragOverId(f.id); }}
                  onDrop={() => handleDrop(f.id)}
                  onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                  className={`flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl cursor-grab active:cursor-grabbing transition-colors ${dragOverId === f.id ? "ring-2 ring-indigo-300" : ""}`}>
                  <GripVertical size={13} className="text-slate-300 shrink-0" />
                  <span className="flex-1 text-[12px] text-slate-700">{f.label}</span>
                  <button onClick={() => removeField(f.id)} className="p-1 text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Matter fields</p>
            <div className="flex flex-wrap gap-2">
              {catalog?.base.filter(o => !usedKeys.has(o.field_key)).map(o => (
                <button key={o.field_key} onClick={() => addField("base", o.field_key, o.label)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                  + {o.label}
                </button>
              ))}
              {catalog?.custom.filter(o => !usedKeys.has(o.field_key)).map(o => (
                <button key={o.field_key} onClick={() => addField("custom", o.field_key, o.label)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                  + {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Add a report-only column</p>
            <p className="text-[11px] text-slate-400 mb-2">Doesn't exist on the matter record — just a note field for this report.</p>
            <div className="flex items-center gap-2">
              <input value={adhocLabel} onChange={e => setAdhocLabel(e.target.value)} placeholder="e.g. Special conditions"
                className="flex-1 px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
              <button onClick={() => { if (adhocLabel.trim()) { addField("adhoc", undefined, adhocLabel.trim()); setAdhocLabel(""); } }}
                className="px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full">Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

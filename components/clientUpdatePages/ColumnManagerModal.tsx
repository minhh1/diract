// components/clientUpdatePages/ColumnManagerModal.tsx
// Reorder (drag), remove, and add columns -- same native HTML5 drag
// pattern components/dashboard/FieldLayoutEditor.tsx already uses for
// field reordering elsewhere in this app.
"use client";

import { useState, useEffect } from "react";
import { X, GripVertical, Trash2, Loader2 } from "lucide-react";

interface FieldDef { id: string; field_source: string; field_key: string; label: string; group_id?: string | null; }
interface CatalogOption { field_key: string; label: string; }

export default function ColumnManagerModal({ pageId, groupId, currentFields, groupName, isCustomized, onCustomize, onRevert, onClose, onChanged }: {
  pageId: string; groupId: string | null; currentFields: FieldDef[];
  groupName: string | null; isCustomized: boolean;
  onCustomize?: () => Promise<void>; onRevert?: () => Promise<void>;
  onClose: () => void; onChanged: () => void;
}) {
  const [order, setOrder] = useState(currentFields);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<{ base: CatalogOption[]; custom: CatalogOption[] } | null>(null);
  const [adhocLabel, setAdhocLabel] = useState("");
  const [adhocIsSelect, setAdhocIsSelect] = useState(false);
  const [adhocOptions, setAdhocOptions] = useState("");
  const [switching, setSwitching] = useState(false);

  const handleCustomize = async () => {
    if (!onCustomize || switching) return;
    setSwitching(true);
    try { await onCustomize(); onChanged(); } catch (e: any) { window.alert(e?.message || "Couldn't customize columns"); } finally { setSwitching(false); }
  };
  const handleRevert = async () => {
    if (!onRevert || switching) return;
    if (!window.confirm(`Revert "${groupName}" to the shared columns? Its own customized columns will be removed.`)) return;
    setSwitching(true);
    try { await onRevert(); onChanged(); } catch (e: any) { window.alert(e?.message || "Couldn't revert columns"); } finally { setSwitching(false); }
  };

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
    const prevOrder = order;
    setOrder(prev => prev.filter(f => f.id !== fieldId));
    const res = await fetch(`/api/client-update-pages/${pageId}/fields/${fieldId}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setOrder(prevOrder);
      window.alert(json.error || "Couldn't remove that column");
      return;
    }
    onChanged();
  };

  const addField = async (fieldSource: "base" | "custom" | "adhoc", fieldKey: string | undefined, label: string, selectOptions?: string[]) => {
    await fetch(`/api/client-update-pages/${pageId}/fields`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldSource, fieldKey, label, selectOptions, groupId }),
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
        {groupName && (onCustomize || onRevert) && (
          <div className="flex items-center justify-between gap-3 px-8 py-3 bg-slate-50 border-b border-slate-100 shrink-0">
            <p className="text-[11px] text-slate-500">
              {isCustomized ? <>Customized for <span className="font-bold text-slate-700">{groupName}</span></> : <>Using the <span className="font-bold text-slate-700">shared</span> columns</>}
            </p>
            {isCustomized ? (
              onRevert && (
                <button onClick={handleRevert} disabled={switching} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-indigo-600 disabled:opacity-40 transition-colors shrink-0">
                  {switching && <Loader2 size={11} className="animate-spin" />} Revert to shared
                </button>
              )
            ) : (
              onCustomize && (
                <button onClick={handleCustomize} disabled={switching} className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition-colors shrink-0">
                  {switching && <Loader2 size={11} className="animate-spin" />} Customize for {groupName} only
                </button>
              )
            )}
          </div>
        )}
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
            <p className="text-[11px] text-slate-400 mb-2">Doesn't exist on the matter record — just a field for this report. Can be a dropdown, e.g. a Status column subgroups can filter on.</p>
            <div className="space-y-2">
              <input value={adhocLabel} onChange={e => setAdhocLabel(e.target.value)} placeholder="e.g. Status"
                className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={adhocIsSelect} onChange={e => setAdhocIsSelect(e.target.checked)} />
                <span className="text-[11px] text-slate-500">Dropdown with fixed options</span>
              </label>
              {adhocIsSelect && (
                <input value={adhocOptions} onChange={e => setAdhocOptions(e.target.value)} placeholder="Option one, Option two, Option three"
                  className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
              )}
              <button onClick={() => {
                if (!adhocLabel.trim()) return;
                const options = adhocIsSelect ? adhocOptions.split(",").map(o => o.trim()).filter(Boolean) : undefined;
                addField("adhoc", undefined, adhocLabel.trim(), options);
                setAdhocLabel(""); setAdhocIsSelect(false); setAdhocOptions("");
              }} className="px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full">Add column</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// components/clientUpdatePages/ColumnManagerModal.tsx
// Reorder (drag), remove, and add columns -- same native HTML5 drag
// pattern components/dashboard/FieldLayoutEditor.tsx already uses for
// field reordering elsewhere in this app.
"use client";

import { useState, useEffect } from "react";
import { X, GripVertical, Trash2, Loader2, ChevronUp, ChevronDown, ChevronRight, DatabaseZap } from "lucide-react";

interface FieldDef { id: string; field_source: string; field_key: string; label: string; field_type?: string; group_id?: string | null; }

const PROMOTE_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "select", label: "Dropdown" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / No" },
];
// Only these two -- a promoted field becomes "a real custom field value
// for a specific record", which only makes sense for a table where every
// matter on this page actually has (at most a handful of) real rows to
// write onto: the matter's own projects row, or its linked properties
// row(s) (project_properties). Nothing else in this app's data model has
// that shape for a matter -- see the promote route's header comment for
// the server-side validation this pairs with.
const PROMOTE_TABLE_OPTIONS = [
  { value: "projects", label: "Matter" },
  { value: "properties", label: "Property" },
];
interface CatalogOption { field_key: string; label: string; }
interface RelatedTableOption { linkFieldId: string; linkLabel: string; columns: { key: string; label: string }[]; }

export default function ColumnManagerModal({ pageId, groupId, currentFields, groupName, isCustomized, onCustomize, onRevert, onReorderFields, onClose, onChanged }: {
  pageId: string; groupId: string | null; currentFields: FieldDef[];
  groupName: string | null; isCustomized: boolean;
  onCustomize?: () => void; onRevert?: () => Promise<void>;
  onReorderFields?: (fieldIds: string[]) => void;
  onClose: () => void; onChanged: () => void;
}) {
  const [order, setOrder] = useState(currentFields);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<{ base: CatalogOption[]; custom: CatalogOption[]; relatedTables: RelatedTableOption[]; propertyBase: CatalogOption[]; propertyCustom: CatalogOption[] } | null>(null);
  const [expandedLink, setExpandedLink] = useState<string | null>(null);
  const [adhocLabel, setAdhocLabel] = useState("");
  const [adhocIsSelect, setAdhocIsSelect] = useState(false);
  const [adhocOptions, setAdhocOptions] = useState("");
  const [switching, setSwitching] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteChooserId, setPromoteChooserId] = useState<string | null>(null);
  const [promoteType, setPromoteType] = useState("text");
  const [promoteTable, setPromoteTable] = useState<"projects" | "properties">("projects");

  // Optimistic -- onCustomize applies the new columns to local state and
  // fires the request itself (see PublicClientUpdateContent.tsx), so
  // there's nothing to await here; the "Customize" button flips to
  // "Revert to shared" the instant isCustomized recomputes, no spinner
  // needed. This used to await the request (and then a full board
  // reload) before anything visibly changed, which is what made it feel
  // slow.
  const handleCustomize = () => onCustomize?.();
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
    setDraggedId(null); setDragOverId(null);
    persistOrder(reordered);
  };

  // Goes through the same onReorderFields callback SpreadsheetView's
  // column-header drag uses (page.tsx's reorderFields -- updates board
  // state optimistically, then persists) instead of this modal doing its
  // own fetch-then-full-reload. Reloading after every single reorder click
  // was the actual bug behind "reordering keeps resetting": several quick
  // successive moves (dragging more than one column, or repeated up/down
  // clicks) fire their own reload each, and an earlier reload landing
  // after a later move's optimistic update would visually snap it back to
  // a stale order -- the database write itself was never the problem.
  const persistOrder = (reordered: FieldDef[]) => {
    setOrder(reordered);
    onReorderFields?.(reordered.map(f => f.id));
  };

  const moveField = (index: number, dir: -1 | 1) => {
    const targetIndex = index + dir;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    const reordered = [...order];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    persistOrder(reordered);
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

  const addField = async (fieldSource: "base" | "custom" | "adhoc" | "related_entity" | "property", fieldKey: string | undefined, label: string, selectOptions?: string[]) => {
    await fetch(`/api/client-update-pages/${pageId}/fields`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldSource, fieldKey, label, selectOptions, groupId }),
    });
    onChanged();
  };

  // Only ever offered for adhoc (report-only) columns -- base/custom/
  // related_entity are already real matter fields, there's nothing to
  // promote. See the promote route's header comment for what this does --
  // notably, the real field's type is picked here rather than silently
  // inherited from the adhoc column (adhoc is only ever 'text' or
  // 'select', which is rarely the type you actually want on the real
  // matter record).
  const openPromoteChooser = (field: FieldDef) => {
    setPromoteChooserId(field.id);
    setPromoteType(field.field_type === "select" ? "select" : "text");
    setPromoteTable("projects");
  };

  const confirmPromote = async (field: FieldDef) => {
    setPromotingId(field.id);
    try {
      const res = await fetch(`/api/client-update-pages/${pageId}/fields/${field.id}/promote`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldType: promoteType, table: promoteTable }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { window.alert(json.error || "Couldn't save that as a custom field"); return; }
      setPromoteChooserId(null);
      onChanged();
    } finally {
      setPromotingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Manage columns</h3>
          <button onClick={onClose} title="Close" className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
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
                <button onClick={handleCustomize} className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors shrink-0">
                  Customize for {groupName} only
                </button>
              )
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">On this page — drag to reorder</p>
            <div className="space-y-1">
              {order.map((f, i) => (
                <div key={f.id}>
                  <div draggable
                    onDragStart={() => setDraggedId(f.id)}
                    onDragOver={e => { e.preventDefault(); setDragOverId(f.id); }}
                    onDrop={() => handleDrop(f.id)}
                    onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                    className={`flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl cursor-grab active:cursor-grabbing transition-colors ${dragOverId === f.id ? "ring-2 ring-indigo-300" : ""}`}>
                    <GripVertical size={13} className="text-slate-300 shrink-0" />
                    <span className="flex-1 text-[12px] text-slate-700">{f.label}</span>
                    {f.field_source === "adhoc" && (
                      <button onClick={() => openPromoteChooser(f)} disabled={promotingId === f.id} title="Save as a real custom field on the Matter or its linked Property"
                        className="p-1 text-slate-300 hover:text-indigo-600 disabled:opacity-40 transition-colors shrink-0">
                        {promotingId === f.id ? <Loader2 size={13} className="animate-spin" /> : <DatabaseZap size={13} />}
                      </button>
                    )}
                    <div className="flex items-center shrink-0">
                      <button onClick={() => moveField(i, -1)} disabled={i === 0} title="Move up"
                        className="p-1 text-slate-300 hover:text-indigo-600 disabled:opacity-20 disabled:hover:text-slate-300 transition-colors"><ChevronUp size={13} /></button>
                      <button onClick={() => moveField(i, 1)} disabled={i === order.length - 1} title="Move down"
                        className="p-1 text-slate-300 hover:text-indigo-600 disabled:opacity-20 disabled:hover:text-slate-300 transition-colors"><ChevronDown size={13} /></button>
                    </div>
                    <button onClick={() => removeField(f.id)} title="Remove this column from the page" className="p-1 text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
                  </div>
                  {promoteChooserId === f.id && (
                    <div className="mt-1 ml-5 p-3 border border-indigo-200 bg-indigo-50/50 rounded-xl space-y-2">
                      <p className="text-[11px] text-slate-600">
                        Save "{f.label}" as a real custom field on {promoteTable === "properties" ? "the linked property" : "Matters"}.
                        {promoteTable === "properties"
                          ? " It'll then vary per property on a matter with 2+, same as Property Address; only entries whose matter has a linked property carry over."
                          : " It'll then show on the normal matter dashboard too, and any values already entered here carry over."}
                      </p>
                      <div className="flex items-center gap-2">
                        <select value={promoteTable} onChange={e => setPromoteTable(e.target.value as "projects" | "properties")}
                          className="w-24 shrink-0 px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white">
                          {PROMOTE_TABLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select value={promoteType} onChange={e => setPromoteType(e.target.value)}
                          className="flex-1 min-w-0 px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white">
                          {PROMOTE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setPromoteChooserId(null)} className="text-[10px] font-bold text-slate-400 shrink-0">Cancel</button>
                        <button onClick={() => confirmPromote(f)} disabled={promotingId === f.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full disabled:opacity-40 transition-colors shrink-0">
                          {promotingId === f.id && <Loader2 size={11} className="animate-spin" />} Save
                        </button>
                      </div>
                    </div>
                  )}
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

          {(!!catalog?.propertyBase.length || !!catalog?.propertyCustom.length) && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Property fields</p>
              <p className="text-[11px] text-slate-400 mb-2">Lives on the linked property, not the matter -- a matter with 2+ properties shows one row/card per property, each with its own value for this column.</p>
              <div className="flex flex-wrap gap-2">
                {catalog?.propertyBase.filter(o => !usedKeys.has(o.field_key)).map(o => (
                  <button key={o.field_key} onClick={() => addField("property", o.field_key, o.label)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                    + {o.label}
                  </button>
                ))}
                {catalog?.propertyCustom.filter(o => !usedKeys.has(o.field_key)).map(o => (
                  <button key={o.field_key} onClick={() => addField("property", o.field_key, o.label)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                    + {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!!catalog?.relatedTables.length && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">From a related record</p>
              <p className="text-[11px] text-slate-400 mb-2">Pull a column from the entity linked through one of the matter's own fields (e.g. the client entity's ABN).</p>
              <div className="space-y-1">
                {catalog.relatedTables.map(rt => (
                  <div key={rt.linkFieldId} className="border border-slate-200 rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedLink(expandedLink === rt.linkFieldId ? null : rt.linkFieldId)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 text-[12px] font-medium text-slate-700 hover:bg-slate-100 transition-colors">
                      {expandedLink === rt.linkFieldId ? <ChevronDown size={13} className="text-slate-400 shrink-0" /> : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
                      {rt.linkLabel}
                    </button>
                    {expandedLink === rt.linkFieldId && (
                      <div className="flex flex-wrap gap-2 p-3">
                        {rt.columns.filter(c => !usedKeys.has(`${rt.linkFieldId}:${c.key}`)).map(c => (
                          <button key={c.key} onClick={() => addField("related_entity", `${rt.linkFieldId}:${c.key}`, `${rt.linkLabel}: ${c.label}`)}
                            className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                            + {c.label}
                          </button>
                        ))}
                        {rt.columns.every(c => usedKeys.has(`${rt.linkFieldId}:${c.key}`)) && (
                          <p className="text-[11px] text-slate-300 italic px-1">All columns already added</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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

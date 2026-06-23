"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Search, ChevronDown, ChevronUp, GripVertical, Settings2, MapPin, Building2 } from "lucide-react";

import PropertyDashboard from "./PropertyDashboard";
import ColumnConfigDrawer from "@/components/ColumnConfigDrawer";
import UniversalSelectionModal from "@/components/UniversalSelectionModal";
import DeleteAction from "@/components/actions/DeleteAction";

function PropertyMaster() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Layout States
  const [dbSections, setDbSections] = useState<any[]>([]);
  const [tableCols, setTableCols] = useState<string[]>(['street_address', 'suburb', 'holding_entity_id', 'holding_entity.entity_type']);
  const [expandCols, setExpandCols] = useState<string[]>([]);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [sortConfig, setSortConfig] = useState({ key: 'street_address', direction: 'asc' });

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => { if (!id) initWorkspace(); }, [id]);

  const initWorkspace = async () => {
    setLoading(true);
    
    // 1. Fetch Schema
    const { data: pCols } = await supabase.rpc('get_table_columns', { table_name_input: 'properties' });
    const { data: eCols } = await supabase.rpc('get_table_columns', { table_name_input: 'entities' });
    const formatLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    setDbSections([
      { title: "Property", icon: MapPin, fields: pCols?.map((c: any) => ({ id: c.col_name, label: formatLabel(c.col_name) })) || [] },
      { title: "Holding Entity", icon: Building2, fields: eCols?.map((c: any) => ({ id: `holding_entity.${c.col_name}`, label: `Owner ${formatLabel(c.col_name)}` })) || [] }
    ]);

    // 2. Fetch User Prefs
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prefs } = await supabase.from("user_column_preferences").select("*").eq("user_id", user?.id).eq("table_slug", "properties").single();
    if (prefs) {
      setTableCols(prefs.columns || ['street_address', 'holding_entity_id']);
      setExpandCols(prefs.expansion_columns || []);
      setColWidths(prefs.column_widths || {});
    }

    // 3. Fetch Data with Deep Relational Join
    const { data } = await supabase.from("properties").select(`
      *, 
      holding_entity:holding_entity_id(*)
    `).is('deleted_at', null);
    
    setItems(data || []);
    setLoading(false);
  };

  // REINFORCED RESOLVER: Handles nested Entity Type and Names
  const resolveValue = (item: any, path: string) => {
    if (!path || !item) return "";
    
    // Shortcut for the primary holding entity name
    if (path === 'holding_entity_id') return item.holding_entity?.name || "";

    // Deep path resolution (e.g. holding_entity.entity_type)
    const value = path.split('.').reduce((obj, key) => obj?.[key], item);
    
    if (path.includes('date') || path.includes('expiry')) return value ? new Date(value).toLocaleDateString('en-AU') : '-';
    if (path.includes('price')) return value ? `$${Number(value).toLocaleString()}` : '-';
    
    // Safety check: Don't render objects
    if (typeof value === 'object' && value !== null) return value.name || "";
    
    return value;
  };

  const savePrefs = async (t: string[], e: string[], w: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("user_column_preferences").upsert({
      user_id: user?.id, table_slug: "properties", columns: t, expansion_columns: e, column_widths: w
    }, { onConflict: 'user_id,table_slug' });
  };

  const startResizing = (colId: string, e: React.MouseEvent) => {
    const startX = e.pageX;
    const startWidth = colWidths[colId] || 250;
    const onMouseMove = (mE: MouseEvent) => {
      setColWidths(prev => ({ ...prev, [colId]: Math.max(120, startWidth + (mE.pageX - startX)) }));
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      savePrefs(tableCols, expandCols, colWidths);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const sortedItems = useMemo(() => {
    let filtered = items.filter(i => (i.street_address || "").toLowerCase().includes(search.toLowerCase()));
    return filtered.sort((a, b) => {
      const aVal = String(resolveValue(a, sortConfig.key) || "");
      const bVal = String(resolveValue(b, sortConfig.key) || "");
      return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [items, search, sortConfig]);

  if (id) return <PropertyDashboard propertyId={id} onBack={() => router.push('/dashboard/properties')} />;

  const getLabel = (fid: string) => dbSections.flatMap(s => s.fields).find(f => f.id === fid)?.label || fid;

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white p-8 border-b border-slate-200 shrink-0">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-light text-slate-900 tracking-tight uppercase leading-none">Properties</h1>
          <button onClick={() => setIsConfigOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold"><Settings2 size={16}/> Configuration</button>
        </div>
        <div className="relative"><Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} /><input placeholder="Search records..." className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4.5 pl-14 pr-8 text-sm font-medium outline-none focus:ring-8 focus:ring-black/5" value={search} onChange={e => setSearch(e.target.value)} /></div>
      </header>

      <ColumnConfigDrawer isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} sections={dbSections} tableCols={tableCols} expandCols={expandCols} onToggle={(fid: string, target: string) => {
        const nt = tableCols.filter(c => c !== fid); const ne = expandCols.filter(c => c !== fid);
        if (target === 'table') nt.push(fid); if (target === 'expand') ne.push(fid);
        setTableCols(nt); setExpandCols(ne); savePrefs(nt, ne, colWidths);
      }} />

      <main className="flex-1 overflow-auto p-8 custom-scrollbar">
        <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm inline-block min-w-full overflow-hidden">
          <table className="w-full table-fixed border-collapse text-left text-[13px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400">
              <tr>
                {tableCols.map((colId, idx) => (
                  <th key={colId} style={{ width: colWidths[colId] || 250, minWidth: '150px' }} className="relative border-r border-slate-100 group/header select-none p-0">
                    <div className="flex items-center h-full">
                      <div draggable onDragStart={() => setDraggedIdx(idx)} onDragOver={e => e.preventDefault()} onDrop={() => {
                        const next = [...tableCols]; const [moved] = next.splice(draggedIdx!, 1);
                        next.splice(idx, 0, moved); setTableCols(next); savePrefs(next, expandCols, colWidths);
                      }} className="p-4 cursor-move opacity-0 group-hover/header:opacity-100 transition-opacity"><GripVertical size={14}/></div>
                      <div onClick={() => setSortConfig({ key: colId, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })} className="flex-1 py-5 cursor-pointer hover:text-slate-900 transition-colors uppercase tracking-widest text-[10px] font-bold flex items-center justify-between pr-4">
                        {getLabel(colId)}
                      </div>
                      <div onMouseDown={(e) => startResizing(colId, e)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500 z-10" />
                    </div>
                  </th>
                ))}
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map(item => (
                <React.Fragment key={item.id}>
                    <tr className="border-b border-slate-50 hover:bg-indigo-50/20 transition-all cursor-pointer">
                    {tableCols.map(colId => (
                        <td key={colId} className="p-6 border-r border-slate-50 truncate font-medium text-slate-700" onClick={() => router.push(`/dashboard/properties?id=${item.id}`)}>
                        {String(resolveValue(item, colId) || '-')}
                        </td>
                    ))}
                    <td className="p-6 text-center">
                        <div className="flex items-center gap-2 justify-center">
                        <button onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)} className="text-slate-300">
                            {expandedRow === item.id ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                        </button>
                        {/* DELETE ICON ADDED HERE */}
                        <DeleteAction table="properties" id={item.id} identifier={item.street_address} onRefresh={initWorkspace} />
                        </div>
                    </td>
                    </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </main>
      <UniversalSelectionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Asset" table="properties" onSelect={() => { initWorkspace(); setIsModalOpen(false); }} />
    </div>
  );
}

export default function Page() { return <Suspense fallback={null}><PropertyMaster /></Suspense>; }
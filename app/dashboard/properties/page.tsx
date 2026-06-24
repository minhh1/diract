"use client";

import React, { useState, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { propertyService } from "@/lib/services/propertyService";
import { Search, Settings2, MapPin, Building2 } from "lucide-react";

import PropertyDashboard from "./PropertyDashboard";
import ColumnConfigDrawer from "@/components/ColumnConfigDrawer";
import ViewPresets from "@/components/ViewPresets";
import MasterTable from "@/components/MasterTable";
import UniversalSelectionModal from "@/components/UniversalSelectionModal";
import { usePresetTable } from "@/lib/hooks/usePresetTable";
import { buildPropertySections } from "@/lib/columnDefinitions";
  import { PROPERTY_RELATIONS } from "@/lib/relationDefinitions";

export const dynamic = "force-dynamic";

// Every column belonging to the properties table itself navigates to that
// property's dashboard — per requirement: "anything in property table
// link to properties." Holding-entity columns are the exception.
const PROPERTY_OWN_COLS = new Set([
  'street_address', 'suburb', 'state', 'postcode', 'country',
  'folio_identifier', 'purchase_price', 'purchase_date', 'insurer_name',
  'insurance_expiry', 'policy_number', 'project_manager', 'project_owner',
  'last_coc_date', 'is_sold', 'sold_date', 'sold_price',
]);

function PropertyMaster() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [search, setSearch] = useState("");
  const [dbSections, setDbSections] = useState<any[]>([]);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);


    const fetchItems = useCallback(async () => {
        setDbSections(buildPropertySections());
        return propertyService.getAll();
    }, []);

  const t = usePresetTable({
    tableSlug: "properties",
    defaultCols: ['street_address', 'suburb', 'holding_entity_id'],
    fetchItems,
  });

  const resolveValue = (item: any, path: string) => {
    if (path === 'holding_entity_id') return item.holding_entity?.name || "";
    const value = path.split('.').reduce((obj, key) => obj?.[key], item);
    return typeof value === 'object' ? "" : value;
  };

  const getLinkTarget = (colId: string, item: any): string | null => {
    if (PROPERTY_OWN_COLS.has(colId)) return `/dashboard/properties?id=${item.id}`;
    if (colId === 'holding_entity_id' || colId.startsWith('holding_entity.')) {
      const entityId = item.holding_entity?.id || item.holding_entity_id;
      return entityId ? `/dashboard/entities?id=${entityId}` : null;
    }
    return null;
  };

  const sortedItems = [...t.items]
    .filter(i => (i.street_address || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => String(resolveValue(a, t.tableCols[0])).localeCompare(String(resolveValue(b, t.tableCols[0]))));

  if (id) return <PropertyDashboard propertyId={id} onBack={() => { t.refresh(); router.push('/dashboard/properties'); }} />;

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white p-8 border-b border-slate-100 shrink-0">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-light uppercase tracking-tight text-slate-900">Properties</h1>
          <div className="flex gap-2">
            <button onClick={() => setIsConfigOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold transition-all hover:bg-slate-100">
              <Settings2 size={16} /> Setup
            </button>
            <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-6 py-2 rounded-full text-[11px] font-bold shadow-sm">+ New asset</button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
          <input placeholder="Search records..." className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-14 pr-8 text-sm font-medium outline-none focus:ring-8 focus:ring-black/5 transition-all" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <ViewPresets
          presets={t.presets}
          activePreset={t.activePreset}
          onSelect={t.handleSelectPreset}
          onSaveNew={t.handleSaveAsNew}
          onDelete={t.handleDeletePreset}
          isBusy={t.isBusy}
        />
      </header>

      <ColumnConfigDrawer
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        sections={dbSections}
        tableCols={t.tableCols}
        expandCols={t.expandCols}
        activePresetName={t.activePreset}
        onToggle={t.handleToggleColumn}
        relations={PROPERTY_RELATIONS}
        expandRelations={t.expandRelations}
        onToggleRelation={t.handleToggleRelation}
      />

      <main className="flex-1 overflow-auto p-8">
        <MasterTable
          items={sortedItems}
          tableCols={t.tableCols}
          expandCols={t.expandCols}
          colWidths={t.colWidths}
          draggedIdx={t.draggedIdx}
          setDraggedIdx={t.setDraggedIdx}
          onReorder={t.handleReorder}
          startResizing={t.startResizing}
          expandedRow={t.expandedRow}
          toggleExpandRow={t.toggleExpandRow}
          resolveValue={resolveValue}
          getLinkTarget={getLinkTarget}
          minWidth={1400}
        relations={PROPERTY_RELATIONS}
        expandRelations={t.expandRelations}
        />
      </main>

      <UniversalSelectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={() => { setIsModalOpen(false); t.refresh(); }}
        title="New Property"
        table="properties"
      />
    </div>
  );
}

export default function Page() { return <Suspense fallback={null}><PropertyMaster /></Suspense>; }
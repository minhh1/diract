// components/GenericMasterTable.tsx
"use client";

import React, { useState, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Search, Settings2 } from "lucide-react";

import MasterTable from "@/components/MasterTable";
import ColumnConfigDrawer from "@/components/ColumnConfigDrawer";
import ViewPresets from "@/components/ViewPresets";
import UniversalSelectionModal from "@/components/UniversalSelectionModal";

import { usePresetTable } from "@/lib/hooks/usePresetTable";
import { useTableSchema } from "@/lib/hooks/useTableSchema";
import { useRelationalEditFields } from "@/lib/hooks/useRelationalEditFields";
import { useTableRealtime } from "@/lib/hooks/useTableRealtime";
import { deriveLabel } from "@/lib/services/schemaService";
import { propertyService } from "@/lib/services/propertyService";
import { buildCredentialColumnSections } from "@/lib/columnDefinitions";
import { PROPERTY_RELATIONS, ENTITY_RELATIONS } from "@/lib/relationDefinitions";

interface GenericMasterTableProps {
  tableName: "properties" | "entities" | "projects";
  pageTitle: string;
  newButtonLabel: string;
  renderDashboard?: (id: string, onBack: () => void) => React.ReactNode;
}

type SortDirection = 'asc' | 'desc';
type SortMode = 'name' | 'number';

interface SortState {
  colId: string;
  direction: SortDirection;
  mode?: SortMode;
}

const PROPERTY_CATEGORY_KEYS = ['council', 'electricity', 'water', 'land_tax', 'gas'];

function getCategoryKeyForColumn(colId: string): string | null {
  for (const key of PROPERTY_CATEGORY_KEYS) {
    if (colId.startsWith(`${key}_`)) return key;
  }
  return null;
}

const RELATIONS_BY_TABLE: Record<string, any[]> = {
  properties: PROPERTY_RELATIONS,
  entities: ENTITY_RELATIONS,
  projects: [],
};

const TABLE_AREA_CLASS = "bg-[#F9FAFB] p-8";

function buildSelectQuery(tableName: string, columns: any[]): string {
  const relationCols = columns.filter(c => c.category === 'relation' && c.relation_table);
  const embeds = relationCols.map(col => {
    const alias = col.column_name.replace(/_id$/, '');
    const displayCol = col.relation_display_column || 'name';
    return `${alias}:${col.column_name}(id,${displayCol})`;
  });
  return ['*', ...embeds].join(', ');
}

function extractStreetNumber(address: string): number {
  if (!address) return Infinity;
  const clean = address.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const words = clean.split(' ');

  // Handle "3/12" slash format — take the number after the slash
  if (words[0] && /^\d+[a-z]?\/(\d+)/.test(words[0])) {
    const match = words[0].match(/\/(\d+)/);
    return match ? parseInt(match[1]) : Infinity;
  }

  let idx = 0;
  // Skip unit/lot prefix (consumes 2 tokens: keyword + number)
  if (words[0] && ['unit', 'lot', 'suite', 'shop', 'apartment', 'apt', 'villa', 'level'].includes(words[0])) {
    idx = 2;
  }

  // The real street number starts here
  if (idx < words.length && /^\d+/.test(words[idx])) {
    return parseInt(words[idx]);
  }
  return Infinity;
}

function extractStreetName(address: string): string {
  if (!address) return '';
  const clean = address.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const words = clean.split(' ');

  let idx = 0;
  if (words[0] && ['unit', 'lot', 'suite', 'shop', 'apartment', 'apt', 'villa', 'level'].includes(words[0])) {
    idx = 2;
  }
  // Skip the street number
  if (idx < words.length && /^\d+/.test(words[idx])) idx++;

  return words.slice(idx).join(' ');
}

function GenericMasterTableInner({
  tableName, pageTitle, newButtonLabel, renderDashboard,
}: GenericMasterTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");

  const [search, setSearch] = useState("");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);
  const [addressSortOpen, setAddressSortOpen] = useState(false);

  const schema = useTableSchema(tableName);
  const relationalEditCols = useRelationalEditFields(schema.relationalEditCols);
  const fetchedCategoriesRef = useRef<Set<string>>(new Set());

  const fetchItems = useCallback(async (visibleColumns: string[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase
    .from("profiles")
    .select("active_company_id")
    .eq("id", user?.id)
    .single();
    setCompanyId(prof?.active_company_id || null);

    if (tableName === 'properties') {
      fetchedCategoriesRef.current = new Set(
        visibleColumns.map(getCategoryKeyForColumn).filter((k): k is string => k !== null)
      );
      return propertyService.getAll(visibleColumns);
    }

    const selectQuery = buildSelectQuery(tableName, schema.all);
    const { data, error } = await supabase
      .from(tableName)
      .select(selectQuery)
      .is('deleted_at', null);

    if (error) { console.error(`fetchItems(${tableName}):`, error); return []; }
    return data || [];
  }, [tableName, schema.all]);

  const t = usePresetTable({
    tableSlug: tableName,
    defaultCols: schema.defaultTableCols,
    fetchItems,
  });

  // ── Realtime ───────────────────────────────────────────────────────

  const handleRealtimeInsert = useCallback((row: Record<string, any>) => {
    t.setItems(prev => {
      if (prev.some(item => item.id === row.id)) return prev;
      return [row, ...prev];
    });
  }, [t.setItems]);

  const handleRealtimeUpdate = useCallback(async (row: Record<string, any>) => {
    const relationColNames = schema.all
      .filter(c => c.category === 'relation')
      .map(c => c.column_name);

    const hasRelationChange = relationColNames.some(col => col in row);

    if (hasRelationChange) {
      const selectQuery = buildSelectQuery(tableName, schema.all);
      const { data, error } = await supabase
        .from(tableName)
        .select(selectQuery)
        .eq('id', row.id)
        .single();

      if (!error && data && typeof data === 'object' && 'id' in data) {
        t.setItems(prev => prev.map(item =>
          item.id === (data as any).id ? { ...item, ...(data as any) } : item
        ));
      }
    } else {
      t.setItems(prev => prev.map(item =>
        item.id === row.id ? { ...item, ...row } : item
      ));
    }
  }, [tableName, schema.all, t.setItems]);

  const handleRealtimeDelete = useCallback((id: string) => {
    t.setItems(prev => prev.filter(item => item.id !== id));
  }, [t.setItems]);

  useTableRealtime({
    tableName,
    companyId,
    onInsert: handleRealtimeInsert,
    onUpdate: handleRealtimeUpdate,
    onDelete: handleRealtimeDelete,
  });

  // ── Sort ───────────────────────────────────────────────────────────

  const handleSort = useCallback((colId: string, direction: SortDirection, mode?: SortMode) => {
    setSort(prev => {
      if (prev?.colId === colId && prev?.direction === direction && prev?.mode === mode) {
        return null;
      }
      return { colId, direction, mode };
    });
    setAddressSortOpen(false);
  }, []);

  // ── Column toggle ──────────────────────────────────────────────────

  const handleToggleColumnWithRefetch = async (
    fieldId: string, target: 'table' | 'expand' | 'none'
  ) => {
    t.handleToggleColumn(fieldId, target);
    if (tableName !== 'properties' || target === 'none') return;
    const categoryKey = getCategoryKeyForColumn(fieldId);
    if (!categoryKey || fetchedCategoriesRef.current.has(categoryKey)) return;
    fetchedCategoriesRef.current.add(categoryKey);
    const nextCols = [...new Set([...t.tableCols, ...t.expandCols, fieldId])];
    const data = await propertyService.getAll(nextCols);
    t.setItems(data);
  };

  // ── Value resolution ───────────────────────────────────────────────

  const resolveValue = useCallback((item: any, path: string): any => {
    const col = schema.all.find(c => c.column_name === path);
    if (col?.category === 'relation' && col.relation_display_column) {
      const alias = path.replace(/_id$/, '');
      return item[alias]?.[col.relation_display_column]
        ?? item[alias]?.name
        ?? '';
    }
    const value = path.split('.').reduce((obj: any, key: string) => obj?.[key], item);
    return typeof value === 'object' ? '' : (value ?? '');
  }, [schema.all]);

  const getLinkTarget = useCallback((colId: string, item: any): string | null => {
    const primaryCol = tableName === 'properties' ? 'street_address' : 'name';
    if (colId === primaryCol) return `/dashboard/${tableName}?id=${item.id}`;
    const col = schema.all.find(c => c.column_name === colId);
    if (col?.category === 'relation' && col.relation_table) {
      const alias = colId.replace(/_id$/, '');
      const linkedId = item[alias]?.id || item[colId];
      if (!linkedId) return null;
      const pageMap: Record<string, string> = {
        properties: 'properties',
        entities: 'entities',
        projects: 'projects',
      };
      const target = pageMap[col.relation_table];
      return target ? `/dashboard/${target}?id=${linkedId}` : null;
    }
    return null;
  }, [tableName, schema.all]);

  // ── Derived data ───────────────────────────────────────────────────

  const drawerSections = useMemo(() => {
    if (tableName === 'properties') {
      return [...schema.sections, ...buildCredentialColumnSections()];
    }
    return schema.sections;
  }, [tableName, schema.sections]);

  const tableContentWidth = useMemo(() => {
    const baseWidth = t.tableCols.reduce((sum, colId) => {
      return sum + (t.colWidths[colId] || 250);
    }, 0);
    return baseWidth + 96;
  }, [t.tableCols, t.colWidths]);

  const filteredItems = useMemo(() => {
    const primaryCol = tableName === 'properties' ? 'street_address' : 'name';
    const filtered = [...t.items].filter(item =>
      String(resolveValue(item, primaryCol) || '').toLowerCase()
        .includes(search.toLowerCase())
    );

    if (!sort) {
      // Default: properties sort by street number asc, others by first col
      if (tableName === 'properties') {
        return filtered.sort((a, b) =>
          extractStreetNumber(a.street_address || '') - extractStreetNumber(b.street_address || '')
        );
      }
      return filtered.sort((a, b) => {
        const va = String(resolveValue(a, t.tableCols[0]) || '');
        const vb = String(resolveValue(b, t.tableCols[0]) || '');
        return va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' });
      });
    }

    return filtered.sort((a, b) => {
      let va: any;
      let vb: any;

      if (sort.colId === 'street_address' && sort.mode === 'number') {
        const diff = extractStreetNumber(a.street_address || '') - extractStreetNumber(b.street_address || '');
        return sort.direction === 'asc' ? diff : -diff;
      }

      if (sort.colId === 'street_address' && sort.mode === 'name') {
        va = extractStreetName(a.street_address || '');
        vb = extractStreetName(b.street_address || '');
      } else {
        va = String(resolveValue(a, sort.colId) ?? '');
        vb = String(resolveValue(b, sort.colId) ?? '');
      }

      const cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' });
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [t.items, search, t.tableCols, resolveValue, tableName, sort]);

  // ── Early returns ──────────────────────────────────────────────────

  if (selectedId && renderDashboard) {
    return <>{renderDashboard(selectedId, () => {
      t.refresh();
      router.push(`/dashboard/${tableName}`);
    })}</>;
  }

  if (schema.loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-400 text-[11px] uppercase font-bold tracking-widest">
          Loading schema...
        </p>
      </div>
    );
  }
  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white border-b border-slate-100 shrink-0">
        <div className="p-8 pb-4">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-light uppercase tracking-tight text-slate-900">
              {pageTitle}
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => setIsConfigOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold transition-all hover:bg-slate-100"
              >
                <Settings2 size={16} /> Setup
              </button>
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-slate-900 text-white px-6 py-2 rounded-full text-[11px] font-bold shadow-sm"
              >
                {newButtonLabel}
              </button>
            </div>
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input
              placeholder={`Search ${pageTitle.toLowerCase()}...`}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-14 pr-8 text-sm font-medium outline-none focus:ring-8 focus:ring-black/5 transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <ViewPresets
            presets={t.presets}
            activePreset={t.activePreset}
            onSelect={t.handleSelectPreset}
            onSaveNew={t.handleSaveAsNew}
            onDelete={t.handleDeletePreset}
            isBusy={t.isBusy}
          />
        </div>
      </header>

      <ColumnConfigDrawer
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        sections={drawerSections}
        tableCols={t.tableCols}
        expandCols={t.expandCols}
        activePresetName={t.activePreset}
        onToggle={handleToggleColumnWithRefetch}
      />

      <main className={`flex-1 flex flex-col min-h-0 overflow-x-auto ${TABLE_AREA_CLASS}`}>
        <MasterTable
          items={filteredItems}
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
          relations={RELATIONS_BY_TABLE[tableName]}
          expandRelations={t.expandRelations}
          minWidth={tableContentWidth}
          baseTable={tableName}
          parentType={schema.parentType ?? undefined}
          companyId={companyId ?? undefined}
          editableCols={schema.editableCols}
          relationalEditCols={relationalEditCols}
          onRowMutated={t.refresh}
          sort={sort}
          onSort={handleSort}
          addressSortOpen={addressSortOpen}
          onAddressSortOpenChange={setAddressSortOpen}
        />
      </main>

      <UniversalSelectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={() => { setIsModalOpen(false); t.refresh(); }}
        title={`New ${deriveLabel(tableName).slice(0, -1)}`}
        table={tableName}
      />
    </div>
  );
}

export default function GenericMasterTable(props: GenericMasterTableProps) {
  return (
    <Suspense fallback={null}>
      <GenericMasterTableInner {...props} />
    </Suspense>
  );
}
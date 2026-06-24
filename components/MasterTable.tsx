"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import DataTable from "@/components/DataTable";
import RelationSubTable from "@/components/RelationSubTable";
import type { RelationDef } from "@/lib/relationDefinitions";

export interface MasterTableProps {
  items: any[];
  tableCols: string[];
  expandCols: string[];
  colWidths: Record<string, number>;
  draggedIdx: number | null;
  setDraggedIdx: (i: number | null) => void;
  onReorder: (next: string[]) => void;
  startResizing: (colId: string, e: React.MouseEvent) => void;
  expandedRow: string | null;
  toggleExpandRow: (id: string) => void;
  resolveValue: (item: any, path: string) => any;
  /**
   * Returns a route to navigate to if this column's text in this row is a
   * "link", or null if clicking it should just expand the row like any
   * other cell. Centralizes all per-table link routing in one place.
   */
  getLinkTarget: (colId: string, item: any) => string | null;
  /** One-to-many related tables available for this table (valuations, bills, officeholders, owned properties, etc). */
  relations?: RelationDef[];
  /** Which relation keys are currently toggled on via Column Config. */
  expandRelations?: string[];
  minWidth?: number;
  rowKey?: (item: any) => string;
}

export default function MasterTable({
  items, tableCols, expandCols, colWidths,
  draggedIdx, setDraggedIdx, onReorder, startResizing,
  expandedRow, toggleExpandRow, resolveValue, getLinkTarget,
  relations = [], expandRelations = [],
  minWidth = 1200, rowKey = (item) => item.id,
}: MasterTableProps) {
  const router = useRouter();

  const activeRelations = relations.filter(rel => expandRelations.includes(rel.key));

  return (
    <DataTable minWidth={minWidth}>
      <thead className="bg-slate-50 border-b border-slate-200 text-slate-400">
        <tr>
          {tableCols.map((colId, idx) => (
            <th key={colId} style={{ width: colWidths[colId] || 250 }} className="relative border-r border-slate-100 group/header select-none p-0">
              <div className="flex items-center h-full">
                <div
                  draggable
                  onDragStart={() => setDraggedIdx(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedIdx === null) return;
                    const next = [...tableCols];
                    const [moved] = next.splice(draggedIdx, 1);
                    next.splice(idx, 0, moved);
                    onReorder(next);
                    setDraggedIdx(null);
                  }}
                  className="p-4 cursor-move opacity-0 group-hover/header:opacity-100 transition-opacity"
                >
                  <GripVertical size={14} />
                </div>
                <div className="flex-1 py-5 uppercase text-[10px] font-bold tracking-widest px-4">
                  {colId.replace('_id', '').replace('.', ' ')}
                </div>
                <div onMouseDown={(e) => startResizing(colId, e)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500 z-10" />
              </div>
            </th>
          ))}
          <th className="w-24"></th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => {
          const key = rowKey(item);
          const isExpanded = expandedRow === key;
          return (
            <React.Fragment key={key}>
              <tr
                className="border-b border-slate-50 hover:bg-indigo-50/20 transition-all cursor-pointer"
                onClick={() => toggleExpandRow(key)}
              >
                {tableCols.map(colId => {
                  const linkTarget = getLinkTarget(colId, item);
                  return (
                    <td key={colId} className="p-6 border-r border-slate-50 truncate font-medium text-slate-700">
                      {linkTarget ? (
                        <span
                          className="hover:text-indigo-600 hover:underline transition-colors cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); router.push(linkTarget); }}
                        >
                          {String(resolveValue(item, colId) || '-')}
                        </span>
                      ) : (
                        String(resolveValue(item, colId) || '-')
                      )}
                    </td>
                  );
                })}
                <td className="p-6 flex items-center justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpandRow(key); }}
                    className="p-1.5 rounded-full text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </td>
              </tr>

              {isExpanded && (expandCols.length > 0 || activeRelations.length > 0) && (
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <td colSpan={tableCols.length + 1} className="p-8 space-y-8">
                    {expandCols.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {expandCols.map(colId => (
                          <div key={colId}>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                              {colId.replace('_id', '').replace('.', ' ')}
                            </p>
                            <p className="text-[13px] font-medium text-slate-800 truncate">
                              {String(resolveValue(item, colId) || '—')}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeRelations.map(rel => (
                      <div key={rel.key}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                          {rel.label}
                        </p>
                        <RelationSubTable relation={rel} parentId={item.id} />
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </DataTable>
  );
}
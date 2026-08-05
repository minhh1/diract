// components/MasterTable.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GripVertical, Trash2, ExternalLink, ChevronsUpDown, Baby, CornerDownRight, Lightbulb, X } from "lucide-react";
import DataTable from "@/components/DataTable";
import RelationSubTable from "@/components/RelationSubTable";
import UniversalSelectionModal from "@/components/UniversalSelectionModal";
import RecordEditModal from "@/components/RecordEditModal";
import { updateRecord, softDeleteRecord } from "@/lib/genericRecordActions";
import { createArchiveRequest, usePendingArchiveRequests, type ArchiveEntityTable } from "@/lib/archiveRequests";
import type { RelationDef } from "@/lib/relationDefinitions";
import type { LogParentType } from "@/lib/logging";
import { checkNameQuality, type NameSuggestion } from "@/lib/smartValidation/nameQuality";

export interface RelationalEditConfig {
  table: "entities" | "projects" | "properties";
  title: string;
  editParentType: LogParentType;
  editFields: {
    id: string;
    label: string;
    type?: 'text' | 'date' | 'number' | 'checkbox' | 'select';
    options?: any[];
    fetchOptions?: () => Promise<any[]>;
  }[];
}

// Sub-project (projects.parent_project_id) grouping, computed by the caller
// -- MasterTable just renders whatever it's handed, it doesn't know how to
// build the hierarchy itself.
export interface SubProjectHierarchy {
  childrenByParentId: Map<string, any[]>;
  expandedParentIds: Set<string>;
  onToggleExpand: (id: string) => void;
  parentNameById: Map<string, string>;
}

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
  getLinkTarget: (colId: string, item: any) => string | null;
  relations?: RelationDef[];
  expandRelations?: string[];
  minWidth?: number;
  rowKey?: (item: any) => string;
  baseTable?: string;
  parentType?: LogParentType;
  companyId?: string;
  isAdmin?: boolean;
  editableCols?: string[];
  relationalEditCols?: Record<string, RelationalEditConfig>;
  onRowMutated?: () => void;
  sort?: { colId: string; direction: 'asc' | 'desc'; mode?: string } | null;
  onSort?: (colId: string, direction: 'asc' | 'desc', mode?: 'name' | 'number') => void;
  addressSortOpen?: boolean;
  onAddressSortOpenChange?: (open: boolean) => void;
  resolveColLabel?: (colId: string) => string;
  resolveColTooltip?: (colId: string) => string;
  subProjects?: SubProjectHierarchy;
}

function errorMessage(code: string): string {
  switch (code) {
    case '23505': return "A record with this value already exists. This field must be unique.";
    case '23503': return "This value references a record that doesn't exist.";
    case '23514': return "This value isn't valid for this field (check format or allowed values).";
    case '42501': return "You don't have permission to edit this field.";
    default: return "Couldn't save this change. Please try again.";
  }
}

// One <tr> (plus its optional expand-panel <tr>) -- pulled out of MasterTable's
// old inline `.map(item => ...)` so the exact same rendering/editing logic
// can be invoked once per top-level item and, for a parent row's expanded
// sub-projects, once per child, without duplicating ~180 lines of JSX.
interface MasterTableRowProps {
  item: any;
  depth: 0 | 1;
  rowKeyStr: string;
  isExpanded: boolean;
  tableCols: string[];
  resolveValue: (item: any, path: string) => any;
  getLinkTarget: (colId: string, item: any) => string | null;
  resolveColLabel?: (colId: string) => string;
  resolveColTooltip?: (colId: string) => string;
  baseTable?: string;
  canEdit: boolean;
  editableCols?: string[];
  relationalEditCols?: Record<string, RelationalEditConfig>;
  editingCell: { rowId: string; colId: string } | null;
  savingCell: { rowId: string; colId: string } | null;
  cellErrors: Map<string, string>;
  setEditingCell: (v: { rowId: string; colId: string } | null) => void;
  clearCellError: (rowId: string, colId: string) => void;
  handleCellSave: (item: any, colId: string, newValue: string) => void;
  // Smart name-quality suggestions -- see lib/smartValidation/nameQuality.ts.
  // Keyed and rendered the same way as cellErrors above (a friendly amber
  // variant, never blocking), scoped to whichever column is this table's
  // name/title field (nameColId).
  nameColId: string;
  cellSuggestions: Map<string, NameSuggestion[]>;
  checkCellNameQuality: (rowId: string, colId: string, value: string) => void;
  applyCellSuggestion: (item: any, colId: string, suggestion: NameSuggestion) => void;
  dismissCellSuggestion: (rowId: string, colId: string, suggestionId: string) => void;
  setRelationalPicker: (v: { item: any; colId: string } | null) => void;
  setRecordEditTarget: (v: { config: RelationalEditConfig; recordId: string; currentValues: Record<string, any> } | null) => void;
  toggleExpandRow: (id: string) => void;
  expandCols: string[];
  activeRelations: RelationDef[];
  parentType?: LogParentType;
  companyId?: string;
  onRowMutated?: () => void;
  pendingArchive: boolean;
  handleRowDelete: (item: any, e: React.MouseEvent) => void;
  colCount: number;
  // Sub-project affordances -- only set on depth-0 rows.
  childCount?: number;
  childrenExpanded?: boolean;
  onToggleChildren?: () => void;
  // Set on a depth-0 row that's a sub-project whose parent isn't in the
  // current result set (filtered out, archived, or a grandchild) -- still
  // gets the child styling/glyph, just with a label instead of nesting.
  parentLabel?: string;
}

function MasterTableRow({
  item, depth, rowKeyStr, isExpanded, tableCols, resolveValue, getLinkTarget,
  resolveColLabel, resolveColTooltip, baseTable, canEdit, editableCols, relationalEditCols,
  editingCell, savingCell, cellErrors, setEditingCell, clearCellError, handleCellSave,
  nameColId, cellSuggestions, checkCellNameQuality, applyCellSuggestion, dismissCellSuggestion,
  setRelationalPicker, setRecordEditTarget, toggleExpandRow, expandCols, activeRelations,
  parentType, companyId, onRowMutated, pendingArchive, handleRowDelete, colCount,
  childCount, childrenExpanded, onToggleChildren, parentLabel,
}: MasterTableRowProps) {
  const router = useRouter();
  const key = rowKeyStr;
  const hasExpandContent = expandCols.length > 0 || activeRelations.length > 0;
  const isChildStyled = depth === 1 || !!parentLabel;

  return (
    <React.Fragment>
      <tr
        className={`border-b border-slate-50 transition-all cursor-pointer group ${
          isChildStyled ? 'bg-slate-50/40 hover:bg-indigo-50/30' : 'hover:bg-indigo-50/20'
        }`}
        onClick={() => { if (baseTable) router.push(`/dashboard/${baseTable}?id=${item.id}`); }}
      >
        {tableCols.map((colId, idx) => {
          const linkTarget = getLinkTarget(colId, item);
          const relationalConfig = relationalEditCols?.[colId];
          const canEditThisCol = canEdit && editableCols!.includes(colId);
          const isEditing = editingCell?.rowId === key && editingCell?.colId === colId;
          const isSaving = savingCell?.rowId === key && savingCell?.colId === colId;
          const rawValue = resolveValue(item, colId);
          const cellError = cellErrors.get(`${key}:${colId}`);
          const cellSuggestion = colId === nameColId ? cellSuggestions.get(`${key}:${colId}`) : undefined;

          const startEdit = (e: React.MouseEvent) => {
            e.stopPropagation();
            clearCellError(key, colId);
            if (relationalConfig) {
              const linkedId = item[colId];
              if (!linkedId) return;
              const alias = colId.replace(/_id$/, '');
              setRecordEditTarget({
                config: relationalConfig,
                recordId: linkedId,
                currentValues: item[alias] || {},
              });
            } else {
              setEditingCell({ rowId: key, colId });
            }
          };

          const openRelinkPicker = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (relationalConfig) {
              setRelationalPicker({ item, colId });
            } else if (linkTarget) {
              router.push(linkTarget);
            }
          };

          const cellValue = isEditing && !relationalConfig ? (
            <input
              autoFocus
              defaultValue={rawValue ?? ''}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => { handleCellSave(item, colId, e.target.value); checkCellNameQuality(key, colId, e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingCell(null); }}
              className="w-full p-1.5 -m-1.5 border border-indigo-300 rounded-lg text-sm outline-none"
            />
          ) : cellError ? (
            // Error state -- original value stays, shown red with tooltip
            <div className="relative group/error">
              <span
                onClick={canEditThisCol ? startEdit : undefined}
                className={`block truncate text-red-500 border-b border-dashed border-red-300 ${canEditThisCol ? 'cursor-text' : ''}`}
              >
                {String(rawValue || '-')}
              </span>
              <div className="absolute bottom-full left-0 mb-2 z-50 hidden group-hover/error:block pointer-events-none">
                <div className="bg-red-600 text-white text-[10px] font-medium rounded-xl px-3 py-2 max-w-[240px] leading-relaxed shadow-lg whitespace-normal">
                  {cellError}
                </div>
                <div className="w-2 h-2 bg-red-600 rotate-45 ml-4 -mt-1" />
              </div>
            </div>
          ) : cellSuggestion && cellSuggestion.length > 0 ? (
            // Friendly amber variant of the cellError tooltip just above --
            // a suggestion, never a blocking error, so it stays interactive
            // (Apply/dismiss) rather than pointer-events-none informational
            // text. See lib/smartValidation/nameQuality.ts.
            <div className="relative group/hint">
              <span
                onClick={canEditThisCol ? startEdit : undefined}
                className={`block truncate text-slate-700 border-b border-dashed border-amber-300 ${canEditThisCol ? 'cursor-text' : ''}`}
              >
                {String(rawValue || '-')}
              </span>
              <div className="absolute bottom-full left-0 mb-2 z-50 hidden group-hover/hint:block">
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 max-w-[260px] shadow-lg space-y-1.5">
                  {cellSuggestion.map(s => (
                    <div key={s.id} className="flex items-center gap-1.5">
                      <Lightbulb size={11} className="shrink-0 text-amber-500" />
                      <span className="flex-1 min-w-0 text-[10px] font-medium text-amber-800 leading-relaxed whitespace-normal">{s.message}</span>
                      {s.apply && s.actionLabel && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); applyCellSuggestion(item, colId, s); }}
                          className="shrink-0 px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full hover:bg-indigo-700 transition-colors">
                          {s.actionLabel}
                        </button>
                      )}
                      <button type="button" onClick={(e) => { e.stopPropagation(); dismissCellSuggestion(key, colId, s.id); }}
                        title="Dismiss" className="shrink-0 text-amber-400 hover:text-amber-700 transition-colors">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="w-2 h-2 bg-amber-50 border-l border-b border-amber-200 rotate-45 ml-4 -mt-1" />
              </div>
            </div>
          ) : linkTarget ? (
            <span className="flex items-center justify-between gap-2 group/cell">
              <span
                className={`truncate ${canEditThisCol ? 'cursor-text hover:bg-slate-100 -m-1.5 p-1.5 rounded-lg' : ''} ${isSaving ? 'opacity-40' : ''}`}
                onClick={canEditThisCol ? startEdit : undefined}
              >
                {String(rawValue || '-')}
              </span>
              <ExternalLink
                size={11}
                className="text-slate-300 hover:text-indigo-500 shrink-0 transition-all cursor-pointer"
                onClick={openRelinkPicker}
              />
            </span>
          ) : canEditThisCol ? (
            <span
              onClick={startEdit}
              className={`hover:bg-slate-100 -m-1.5 p-1.5 rounded-lg block cursor-text ${isSaving ? 'opacity-40' : ''}`}
            >
              {String(rawValue || '-')}
            </span>
          ) : (
            String(rawValue || '-')
          );

          // Expand toggle lives inside the first column, to the right of its
          // value. The sub-project baby icon/indent glyph/parent label (also
          // first-column-only) sit to the LEFT of the value instead, in
          // their own wrapper, so the two unrelated affordances never
          // compete for the same side of a narrow column.
          const showExpandToggle = idx === 0 && hasExpandContent;
          const needsFirstColWrapper = idx === 0 && (showExpandToggle || !!childCount || isChildStyled || !!parentLabel);

          return (
            <td
              key={colId}
              title={!isEditing && rawValue != null && rawValue !== '' ? String(rawValue) : undefined}
              className={`p-6 truncate font-medium text-slate-700 ${idx === 0 && isChildStyled ? 'pl-12' : ''}`}
            >
              {needsFirstColWrapper ? (
                <span className="flex items-center gap-2 min-w-0">
                  {!!childCount && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleChildren?.(); }}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full shrink-0 transition-all ${
                        childrenExpanded ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                      title={childrenExpanded ? 'Collapse sub-projects' : `${childCount} sub-project${childCount === 1 ? '' : 's'}, click to expand`}
                    >
                      <Baby size={13} />
                      <span className="text-[9px] font-bold">{childCount}</span>
                    </button>
                  )}
                  {isChildStyled && <CornerDownRight size={12} className="subproject-corner-icon text-slate-300 shrink-0" />}
                  <span className="min-w-0 flex-1 flex items-center justify-between gap-2 group/expand">
                    <span className="min-w-0 truncate flex-1">{cellValue}</span>
                    {showExpandToggle && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExpandRow(key); }}
                        className="p-1 -m-1 rounded-full text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 shrink-0 transition-all"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                  </span>
                  {parentLabel && (
                    <span
                      className="text-[9px] font-medium text-slate-400 shrink-0 truncate max-w-[120px]"
                      title={`Sub-project of ${parentLabel}`}
                    >
                      in {parentLabel}
                    </span>
                  )}
                </span>
              ) : cellValue}
            </td>
          );
        })}
        <td className="p-6 flex items-center justify-center gap-1">
          {pendingArchive && (
            <span className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase bg-amber-50 text-amber-600 whitespace-nowrap">
              Archive requested
            </span>
          )}
          {canEdit && (
            <button
              onClick={(e) => handleRowDelete(item, e)}
              className="p-1.5 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
              title="Archive this record"
            >
              <Trash2 size={14} />
            </button>
          )}
        </td>
      </tr>

      {isExpanded && (expandCols.length > 0 || activeRelations.length > 0) && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={colCount} className="p-8 space-y-8">
            {expandCols.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {expandCols.map(colId => {
                  const expandValue = resolveValue(item, colId);
                  return (
                    <div key={colId}>
                      <p
                        title={resolveColTooltip ? resolveColTooltip(colId) : undefined}
                        className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 truncate"
                      >
                        {resolveColLabel ? resolveColLabel(colId) : colId.replace('_id', '').replace('.', ' ')}
                      </p>
                      <p
                        title={expandValue ? String(expandValue) : undefined}
                        className="text-[13px] font-medium text-slate-800 truncate"
                      >
                        {String(expandValue || '-')}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {activeRelations.map(rel => (
              <div key={rel.key}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                  {rel.label}
                </p>
                <RelationSubTable
                  relation={rel}
                  parentId={item.id}
                  parentType={parentType}
                  companyId={companyId}
                  onMutated={onRowMutated}
                />
              </div>
            ))}
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

export default function MasterTable({
  items, tableCols, expandCols, colWidths,
  draggedIdx, setDraggedIdx, onReorder, startResizing,
  expandedRow, toggleExpandRow, resolveValue, getLinkTarget,
  relations = [], expandRelations = [],
  minWidth = 1200, rowKey = (item) => item.id,
  baseTable, parentType, companyId, isAdmin = false, editableCols, relationalEditCols, onRowMutated,
  sort, onSort, addressSortOpen, onAddressSortOpenChange, resolveColLabel, resolveColTooltip,
  subProjects,
}: MasterTableProps) {
  const router = useRouter();
  const { pendingIds: pendingArchiveIds, refreshPendingArchiveRequests } = usePendingArchiveRequests(
    (baseTable || "projects") as ArchiveEntityTable, companyId || null
  );
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [savingCell, setSavingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map());
  const [cellSuggestions, setCellSuggestions] = useState<Map<string, NameSuggestion[]>>(new Map());
  // Same convention as GenericMasterTable.tsx's own primaryCol -- properties
  // are named by their street address, everything else by `name`.
  const nameColId = baseTable === 'properties' ? 'street_address' : 'name';
  const [relationalPicker, setRelationalPicker] = useState<{ item: any; colId: string } | null>(null);
  const [recordEditTarget, setRecordEditTarget] = useState<{
    config: RelationalEditConfig;
    recordId: string;
    currentValues: Record<string, any>;
  } | null>(null);

  const activeRelations = relations.filter(rel => expandRelations.includes(rel.key));
  const canEdit = !!(baseTable && parentType && companyId && editableCols);

  // Close address sort dropdown on outside click
  useEffect(() => {
    if (!addressSortOpen) return;
    const handleClick = () => onAddressSortOpenChange?.(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [addressSortOpen, onAddressSortOpenChange]);

  const setCellError = (rowId: string, colId: string, message: string) => {
    const key = `${rowId}:${colId}`;
    setCellErrors(prev => { const next = new Map(prev); next.set(key, message); return next; });
    setTimeout(() => {
      setCellErrors(prev => { const next = new Map(prev); next.delete(key); return next; });
    }, 6000);
  };

  const clearCellError = (rowId: string, colId: string) => {
    setCellErrors(prev => { const next = new Map(prev); next.delete(`${rowId}:${colId}`); return next; });
  };

  // Smart name-quality suggestions -- see lib/smartValidation/nameQuality.ts.
  // Kept as their own keyed Map, same shape as cellErrors above, since
  // handleCellSave below already exits edit mode (setEditingCell(null)) the
  // instant blur fires -- unlike every other surface this rule engine is
  // wired into, there's no still-open input left to show the hint under, so
  // it has to persist as a display-mode affordance on the cell itself
  // instead (an amber dashed-underline + tooltip, mirroring cellError's own
  // red one) rather than reusing SmartFieldHint's inline block.
  const checkCellNameQuality = (rowId: string, colId: string, val: string) => {
    if (colId !== nameColId) return;
    const key = `${rowId}:${colId}`;
    const suggestions = checkNameQuality(val);
    setCellSuggestions(prev => {
      const next = new Map(prev);
      if (suggestions.length) next.set(key, suggestions); else next.delete(key);
      return next;
    });
  };

  const dismissCellSuggestion = (rowId: string, colId: string, suggestionId: string) => {
    const key = `${rowId}:${colId}`;
    setCellSuggestions(prev => {
      const next = new Map(prev);
      const remaining = (next.get(key) || []).filter(s => s.id !== suggestionId);
      if (remaining.length) next.set(key, remaining); else next.delete(key);
      return next;
    });
  };

  const applyCellSuggestion = (item: any, colId: string, suggestion: NameSuggestion) => {
    if (suggestion.apply) {
      const result = suggestion.apply();
      if ("correctedValue" in result && result.correctedValue) handleCellSave(item, colId, result.correctedValue);
    }
    dismissCellSuggestion(rowKey(item), colId, suggestion.id);
  };

  const handleCellSave = async (item: any, colId: string, newValue: string) => {
    if (!canEdit) return;
    setEditingCell(null);

    const originalValue = resolveValue(item, colId);
    if (String(originalValue ?? '') === String(newValue ?? '')) return;

    setSavingCell({ rowId: rowKey(item), colId });

    const { error } = await updateRecord({
      table: baseTable!,
      id: item.id,
      changes: { [colId]: newValue },
      parentType: parentType!,
      parentId: item.id,
      companyId: companyId!,
      recordLabel: item.street_address || item.name || undefined,
    });

    setSavingCell(null);

    if (error) {
      setCellError(rowKey(item), colId, errorMessage((error as any).code || ''));
      return;
    }

    clearCellError(rowKey(item), colId);
    onRowMutated?.();
  };

  const handleRelationalSave = async (id: string, name: string) => {
    if (!relationalPicker || !canEdit) return;
    const { item, colId } = relationalPicker;
    setRelationalPicker(null);
    setSavingCell({ rowId: rowKey(item), colId });

    const { error } = await updateRecord({
      table: baseTable!,
      id: item.id,
      changes: { [colId]: id },
      parentType: parentType!,
      parentId: item.id,
      companyId: companyId!,
      recordLabel: item.street_address || item.name || undefined,
    });

    setSavingCell(null);

    if (error) {
      setCellError(rowKey(item), colId, errorMessage((error as any).code || ''));
      return;
    }

    clearCellError(rowKey(item), colId);
    onRowMutated?.();
  };

  const handleRowDelete = async (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    const label = item.street_address || item.name || 'this record';

    if (!isAdmin) {
      if (!window.confirm(`Request archiving ${label}? A company admin will need to approve it.`)) return;
      const result = await createArchiveRequest(baseTable as ArchiveEntityTable, item.id, label, companyId!);
      if (!result.ok) { alert(result.error); return; }
      alert(result.alreadyPending ? "Already requested, waiting on admin review." : "Archive requested, a company admin will review it.");
      refreshPendingArchiveRequests();
      onRowMutated?.();
      return;
    }

    if (!window.confirm(`Archive ${label}? It will be hidden from lists but not permanently deleted.`)) return;

    await softDeleteRecord({
      table: baseTable!,
      id: item.id,
      parentType: parentType!,
      parentId: item.id,
      companyId: companyId!,
      recordLabel: label,
    });

    onRowMutated?.();
  };

  const renderRow = (rowItem: any, depth: 0 | 1, extra?: Partial<MasterTableRowProps>) => {
    const rowKeyStr = rowKey(rowItem);
    return (
      <MasterTableRow
        key={rowKeyStr}
        item={rowItem}
        depth={depth}
        rowKeyStr={rowKeyStr}
        isExpanded={expandedRow === rowKeyStr}
        tableCols={tableCols}
        resolveValue={resolveValue}
        getLinkTarget={getLinkTarget}
        resolveColLabel={resolveColLabel}
        resolveColTooltip={resolveColTooltip}
        baseTable={baseTable}
        canEdit={canEdit}
        editableCols={editableCols}
        relationalEditCols={relationalEditCols}
        editingCell={editingCell}
        savingCell={savingCell}
        cellErrors={cellErrors}
        setEditingCell={setEditingCell}
        clearCellError={clearCellError}
        handleCellSave={handleCellSave}
        nameColId={nameColId}
        cellSuggestions={cellSuggestions}
        checkCellNameQuality={checkCellNameQuality}
        applyCellSuggestion={applyCellSuggestion}
        dismissCellSuggestion={dismissCellSuggestion}
        setRelationalPicker={setRelationalPicker}
        setRecordEditTarget={setRecordEditTarget}
        toggleExpandRow={toggleExpandRow}
        expandCols={expandCols}
        activeRelations={activeRelations}
        parentType={parentType}
        companyId={companyId}
        onRowMutated={onRowMutated}
        pendingArchive={pendingArchiveIds.has(rowItem.id)}
        handleRowDelete={handleRowDelete}
        colCount={tableCols.length + 1}
        {...extra}
      />
    );
  };

  return (
    <>
      <DataTable minWidth={minWidth}>
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-400">
          <tr>
            {tableCols.map((colId, idx) => {
              const isAddressCol = colId === 'street_address';
              const isActiveSortCol = sort?.colId === colId;

              return (
                <th key={colId} style={{ width: colWidths[colId] || 250 }} className="relative group/header select-none p-0">
                  <div className="relative flex items-center h-full">
                    {isAdmin && (
                      // Absolutely positioned so it overlays the label's own
                      // left padding on hover instead of taking up flex space -
                      // otherwise this being admin-only shifted the header
                      // label out of alignment with its data cells below,
                      // and admin/non-admin views ended up with different
                      // column alignment entirely.
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
                        // Dimmed rather than fully hidden at rest -- opacity-0
                        // relied on hover to ever become visible/reachable at
                        // all, which doesn't exist on touch devices (iPad
                        // Safari). Full opacity on hover still gives desktop
                        // users the same "fades in" affordance as before.
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded cursor-move opacity-40 group-hover/header:opacity-100 hover:bg-slate-200 transition-opacity z-10"
                        title="Reorder column (admin only)"
                      >
                        <GripVertical size={13} />
                      </div>
                    )}

                    <div
                      title={resolveColTooltip ? resolveColTooltip(colId) : resolveColLabel ? resolveColLabel(colId) : undefined}
                      className={`flex-1 py-5 pl-6 pr-2 uppercase text-[10px] font-bold tracking-widest truncate ${isActiveSortCol ? 'text-indigo-600' : ''}`}
                    >
                      {resolveColLabel ? resolveColLabel(colId) : colId.replace('_id', '').replace('.', ' ')}
                    </div>

                    {onSort && (
                      isAddressCol ? (
                        <div className="relative mr-2 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => onAddressSortOpenChange?.(!addressSortOpen)}
                            className={`p-1.5 rounded-lg transition-all ${isActiveSortCol ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                            title="Sort options"
                          >
                            <ChevronsUpDown size={13} />
                          </button>

                          {addressSortOpen && (
                            <div className="absolute top-full left-0 mt-1 bg-white rounded-2xl shadow-lg border border-slate-100 z-50 py-1 min-w-[172px]">
                              {([
                                { label: '# Number (asc)', direction: 'asc' as const, mode: 'number' as const },
                                { label: '# Number (desc)', direction: 'desc' as const, mode: 'number' as const },
                                { label: 'A–Z Street name', direction: 'asc' as const, mode: 'name' as const },
                                { label: 'Z–A Street name', direction: 'desc' as const, mode: 'name' as const },
                              ]).map(opt => {
                                const isActive = sort?.colId === 'street_address' && sort?.direction === opt.direction && sort?.mode === opt.mode;
                                return (
                                  <button
                                    key={opt.label}
                                    onClick={() => onSort('street_address', opt.direction, opt.mode)}
                                    className={`w-full text-left px-4 py-2.5 text-[11px] font-medium transition-colors ${isActive ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600 hover:bg-slate-50'}`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isActiveSortCol) onSort(colId, 'asc');
                            else if (sort?.direction === 'asc') onSort(colId, 'desc');
                            else onSort(colId, 'asc');
                          }}
                          className={`p-1.5 rounded-lg mr-2 shrink-0 transition-all ${isActiveSortCol ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                          title={isActiveSortCol ? (sort?.direction === 'asc' ? 'Sort descending' : 'Sort ascending') : 'Sort'}
                        >
                          {isActiveSortCol
                            ? sort?.direction === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                            : <ChevronsUpDown size={13} />
                          }
                        </button>
                      )
                    )}

                    {isAdmin && (
                      <div onMouseDown={(e) => startResizing(colId, e)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500 z-10" title="Resize column (admin only)" />
                    )}
                  </div>
                </th>
              );
            })}
            <th className="w-24"></th>
          </tr>
        </thead>
        <tbody>
          {items.flatMap(item => {
            const children = subProjects?.childrenByParentId.get(item.id);
            const isParent = !!children && children.length > 0;
            const childrenExpanded = isParent && subProjects!.expandedParentIds.has(item.id);
            const parentLabel = !isParent && subProjects && item.parent_project_id
              ? subProjects.parentNameById.get(item.parent_project_id)
              : undefined;

            const rows = [
              renderRow(item, 0, isParent ? {
                childCount: children!.length,
                childrenExpanded,
                onToggleChildren: () => subProjects!.onToggleExpand(item.id),
              } : parentLabel ? { parentLabel } : undefined),
            ];

            if (isParent && childrenExpanded) {
              rows.push(...children!.map(child => renderRow(child, 1)));
            }

            return rows;
          })}
        </tbody>
      </DataTable>

      {relationalPicker && relationalEditCols && (
        <UniversalSelectionModal
          isOpen={true}
          onClose={() => setRelationalPicker(null)}
          onSelect={handleRelationalSave}
          title={relationalEditCols[relationalPicker.colId].title}
          table={relationalEditCols[relationalPicker.colId].table}
        />
      )}

      {recordEditTarget && companyId && (
        <RecordEditModal
          title={recordEditTarget.config.title.replace('Select ', '')}
          table={recordEditTarget.config.table}
          recordId={recordEditTarget.recordId}
          fields={recordEditTarget.config.editFields}
          currentValues={recordEditTarget.currentValues}
          parentType={recordEditTarget.config.editParentType}
          companyId={companyId}
          onClose={() => setRecordEditTarget(null)}
          onSaved={() => { setRecordEditTarget(null); onRowMutated?.(); }}
        />
      )}
    </>
  );
}
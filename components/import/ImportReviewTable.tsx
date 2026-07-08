"use client";

import { AlertTriangle, Check } from "lucide-react";
import type { ParsedRow } from "@/lib/import/parseImportFile";
import type { StagingFlag } from "@/lib/import/stagingCheck";
import type { RowAction } from "@/lib/import/commitImport";

interface Props {
  parsedRows: ParsedRow[];
  isBaseSection: boolean;
  rowActions: Map<number, RowAction>;
  rowUpdateTarget: Map<number, string>;
  rowParentWarnings: Map<number, string>;
  flagsByRow: Map<number, StagingFlag[]>;
  editingCell: { row: number; field: string } | null;
  onCycleAction: (rowIndex: number) => void;
  onStartEdit: (row: number, field: string) => void;
  onCommitEdit: (rowIndex: number, field: string, value: string) => void;
  // Optional: map of custom field id → label for header display
  customFieldLabels?: Map<string, string>;
}

// ── Derive all columns from the first row ──────────────────────────
// Includes both base parsed fields AND custom fields
function deriveAllColumns(
  rows: ParsedRow[],
  customFieldLabels?: Map<string, string>
): { key: string; label: string; isCustom: boolean }[] {
  if (!rows[0]) return [];

  const cols: { key: string; label: string; isCustom: boolean }[] = [];
  const seen = new Set<string>();

  // Base parsed fields — skip internal address sub-fields and nulls
  const SKIP = new Set([
    'property_suburb', 'property_state', 'property_postcode', 'property_country',
  ]);

  Object.keys(rows[0].parsed).forEach(key => {
    if (SKIP.has(key) || seen.has(key)) return;
    seen.add(key);
    cols.push({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      isCustom: false,
    });
  });

  // Custom fields from all rows (union of all field IDs)
  const customFieldIds = new Set<string>();
  rows.forEach(row => {
    Object.keys(row.customFields || {}).forEach(id => customFieldIds.add(id));
  });

  customFieldIds.forEach(fieldId => {
    if (seen.has(`cf:${fieldId}`)) return;
    seen.add(`cf:${fieldId}`);
    const label = customFieldLabels?.get(fieldId) || `Custom: ${fieldId.slice(0, 8)}`;
    cols.push({ key: `cf:${fieldId}`, label, isCustom: true });
  });

  return cols;
}

// ── Get value for a column from a row ─────────────────────────────
function getCellValue(row: ParsedRow, colKey: string): string {
  if (colKey.startsWith('cf:')) {
    const fieldId = colKey.replace('cf:', '');
    const val = row.customFields?.[fieldId];
    if (val === null || val === undefined || val === '') return '';
    return String(val);
  }
  const val = row.parsed[colKey];
  if (val === null || val === undefined || val === '') return '';
  return String(val);
}

export default function ImportReviewTable({
  parsedRows, isBaseSection, rowActions, rowUpdateTarget, rowParentWarnings,
  flagsByRow, editingCell, onCycleAction, onStartEdit, onCommitEdit,
  customFieldLabels,
}: Props) {
  const columns = deriveAllColumns(parsedRows, customFieldLabels);

  const baseColumns = columns.filter(c => !c.isCustom);
  const customColumns = columns.filter(c => c.isCustom);

  return (
    <div className="border border-slate-200 rounded-[28px] overflow-auto max-h-[500px] custom-scrollbar">
      <table className="w-full text-left text-[12px] border-collapse min-w-max">
        <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
          <tr>
            {/* Action button */}
            {isBaseSection && (
              <th className="p-3 w-24 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                Action
              </th>
            )}

            {/* Row number */}
            <th className="p-3 w-12 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              #
            </th>

            {/* Base columns */}
            {baseColumns.map(col => (
              <th
                key={col.key}
                className="p-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-l border-slate-100 whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}

            {/* Custom field columns — visually separated */}
            {customColumns.length > 0 && (
              <th
                className="p-3 text-[9px] font-bold text-violet-400 uppercase tracking-widest border-l-2 border-violet-200 whitespace-nowrap bg-violet-50/40"
                colSpan={customColumns.length}
              >
                Custom Fields
              </th>
            )}

            {/* Flags */}
            <th className="p-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest border-l border-slate-100">
              Flags
            </th>
          </tr>

          {/* Second header row for custom field labels */}
          {customColumns.length > 0 && (
            <tr className="border-b border-slate-100">
              {isBaseSection && <th className="bg-slate-50" />}
              <th className="bg-slate-50" />
              {baseColumns.map(col => (
                <th key={col.key} className="bg-slate-50 border-l border-slate-100" />
              ))}
              {customColumns.map(col => (
                <th
                  key={col.key}
                  className="p-2 text-[9px] font-bold text-violet-500 uppercase tracking-widest border-l border-violet-100 whitespace-nowrap bg-violet-50/40"
                >
                  {col.label}
                </th>
              ))}
              <th className="bg-slate-50 border-l border-slate-100" />
            </tr>
          )}
        </thead>

        <tbody>
          {parsedRows.map(row => {
            const action = rowActions.get(row.rowIndex) || 'include';
            const rowFlags = flagsByRow.get(row.rowIndex) || [];
            const hasExistingMatch = rowUpdateTarget.has(row.rowIndex);
            const parentWarning = rowParentWarnings.get(row.rowIndex);

            const rowClass = [
              'border-b border-slate-50',
              action === 'skip' ? 'opacity-40 bg-slate-50' : '',
              action === 'update' ? 'bg-blue-50/40' : '',
              action === 'include' && rowFlags.length > 0 ? 'bg-amber-50/30' : '',
            ].filter(Boolean).join(' ');

            return (
              <tr key={row.rowIndex} className={rowClass}>

                {/* Action button */}
                {isBaseSection && (
                  <td className="p-3 text-center">
                    <button
                      onClick={() => onCycleAction(row.rowIndex)}
                      title={
                        action === 'include' ? 'Click to skip'
                        : action === 'skip' ? (hasExistingMatch ? 'Click to update existing' : 'Click to include as new')
                        : 'Click to include as new'
                      }
                      className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-all w-full ${
                        action === 'include'
                          ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          : action === 'skip'
                          ? 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                    >
                      {action === 'include' ? '+ New'
                        : action === 'skip' ? 'Skip'
                        : '↑ Update'}
                    </button>
                  </td>
                )}

                {/* Row number */}
                <td className="p-3 font-bold text-slate-400 text-[11px]">
                  {row.rowIndex}
                </td>

                {/* Base columns */}
                {baseColumns.map(col => {
                  const val = getCellValue(row, col.key);
                  const isEditing =
                    editingCell?.row === row.rowIndex &&
                    editingCell?.field === col.key;

                  return (
                    <td key={col.key} className="p-1 border-l border-slate-50 max-w-[180px]">
                      {isEditing ? (
                        <input
                          autoFocus
                          defaultValue={val}
                          onBlur={e => onCommitEdit(row.rowIndex, col.key, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') onCommitEdit(row.rowIndex, col.key, val);
                          }}
                          className="w-full p-2 border border-indigo-300 rounded-lg text-[12px] outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => onStartEdit(row.rowIndex, col.key)}
                          className="w-full text-left p-2 hover:bg-slate-50 rounded-lg truncate"
                        >
                          {val
                            ? <span className="text-slate-700 font-medium truncate block">{val}</span>
                            : <span className="text-slate-300 italic">—</span>
                          }
                        </button>
                      )}
                    </td>
                  );
                })}

                {/* Custom field columns */}
                {customColumns.map(col => {
                  const val = getCellValue(row, col.key);
                  const fieldId = col.key.replace('cf:', '');
                  const isEditing =
                    editingCell?.row === row.rowIndex &&
                    editingCell?.field === col.key;

                  return (
                    <td
                      key={col.key}
                      className="p-1 border-l border-violet-100 bg-violet-50/20 max-w-[180px]"
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          defaultValue={val}
                          onBlur={e => {
                            // Custom field edits update customFields not parsed
                            onCommitEdit(row.rowIndex, col.key, e.target.value);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className="w-full p-2 border border-violet-300 rounded-lg text-[12px] outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => onStartEdit(row.rowIndex, col.key)}
                          className="w-full text-left p-2 hover:bg-violet-50 rounded-lg truncate"
                        >
                          {val
                            ? <span className="text-slate-700 font-medium truncate block">{val}</span>
                            : <span className="text-slate-300 italic">—</span>
                          }
                        </button>
                      )}
                    </td>
                  );
                })}

                {/* Flags */}
                <td className="p-3 border-l border-slate-50 max-w-[220px]">
                  {rowFlags.map((f, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-amber-600 mb-1">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                      <span className="text-[10px] font-medium leading-tight">
                        {f.match_reason}
                        {f.matched_against === 'existing'
                          ? ` (existing: ${f.matched_identifier})`
                          : ` (${f.matched_identifier})`}
                      </span>
                    </div>
                  ))}
                  {parentWarning && (
                    <div className="flex items-start gap-1.5 text-blue-600">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                      <span className="text-[10px] font-medium leading-tight">
                        {parentWarning}
                      </span>
                    </div>
                  )}
                  {action === 'update' && !rowFlags.length && !parentWarning && (
                    <div className="flex items-center gap-1.5 text-blue-600">
                      <Check size={11} className="shrink-0" />
                      <span className="text-[10px] font-medium">
                        Matched existing record
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
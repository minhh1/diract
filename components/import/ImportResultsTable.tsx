"use client";

import { RotateCcw, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import type { ImportRowResult } from "@/lib/import/commitImport";

interface Props {
  results: (ImportRowResult & { customFields?: Record<string, string> })[];
  onReverse: (id: string, index: number) => void;
  customFieldLabels?: Map<string, string>;
}

const SKIP_DETAIL_KEYS = new Set([
  'company_id', 'import_id', 'property_street_address',
  'property_suburb', 'property_state', 'property_postcode',
  'property_country', 'deleted_at',
]);

export default function ImportResultsTable({ results, onReverse, customFieldLabels }: Props) {
  if (!results || results.length === 0) return null;

  const succeeded = results.filter(r => r.status === 'new' || r.status === 'updated');
  const failed = results.filter(r => r.status === 'failed');
  const skipped = results.filter(r => r.status === 'reversed');

  // Derive base columns from first result with details
  const firstWithDetails = results.find(r => r.details && Object.keys(r.details).length > 0);
  const baseKeys = firstWithDetails
    ? Object.keys(firstWithDetails.details).filter(k => !SKIP_DETAIL_KEYS.has(k))
    : [];

  // Derive custom field IDs from all results
  const customFieldIds = new Set<string>();
  results.forEach(r => {
    Object.keys(r.customFields || {}).forEach(id => customFieldIds.add(id));
  });
  const customIds = [...customFieldIds];

  const hasCustom = customIds.length > 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Summary */}
      <div className="flex items-center justify-between px-2">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
          Import results
        </h3>
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase">
            <CheckCircle2 size={12} />
            {succeeded.length} succeeded
          </span>
          {failed.length > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 uppercase">
              <XCircle size={12} />
              {failed.length} failed
            </span>
          )}
          {skipped.length > 0 && (
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              {skipped.length} archived
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-[28px] overflow-auto max-h-[500px] custom-scrollbar">
        <table className="w-full text-left text-[12px] border-collapse min-w-max">
          <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
            <tr>
              {/* Status */}
              <th className="p-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest w-28">
                Status
              </th>

              {/* Identifier */}
              <th className="p-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest border-l border-slate-100">
                Record
              </th>

              {/* Base detail columns */}
              {baseKeys.map(key => (
                <th
                  key={key}
                  className="p-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest border-l border-slate-100 whitespace-nowrap"
                >
                  {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </th>
              ))}

              {/* Custom field columns */}
              {hasCustom && (
                <th
                  className="p-3 text-[9px] font-bold text-violet-400 uppercase tracking-widest border-l-2 border-violet-200 whitespace-nowrap bg-violet-50/40"
                  colSpan={customIds.length}
                >
                  Custom Fields
                </th>
              )}

              {/* Action */}
              <th className="p-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest border-l border-slate-100 text-center w-16">
                Undo
              </th>
            </tr>

            {/* Second header row for custom field labels */}
            {hasCustom && (
              <tr className="border-b border-slate-100">
                <th className="bg-slate-50" />
                <th className="bg-slate-50 border-l border-slate-100" />
                {baseKeys.map(k => (
                  <th key={k} className="bg-slate-50 border-l border-slate-100" />
                ))}
                {customIds.map(fieldId => (
                  <th
                    key={fieldId}
                    className="p-2 text-[9px] font-bold text-violet-500 uppercase tracking-widest border-l border-violet-100 whitespace-nowrap bg-violet-50/40"
                  >
                    {customFieldLabels?.get(fieldId) || fieldId.slice(0, 8)}
                  </th>
                ))}
                <th className="bg-slate-50 border-l border-slate-100" />
              </tr>
            )}
          </thead>

          <tbody>
            {results.map((res, i) => {
              const isFailed = res.status === 'failed';
              const isReversed = res.status === 'reversed';
              const isNew = res.status === 'new';
              const isUpdated = res.status === 'updated';

              return (
                <tr
                  key={i}
                  className={[
                    'border-b border-slate-50 transition-colors',
                    isFailed ? 'bg-red-50/30' : '',
                    isReversed ? 'opacity-40' : '',
                    isUpdated ? 'bg-blue-50/20' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {/* Status badge */}
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase w-fit ${
                        isFailed ? 'bg-red-100 text-red-600'
                        : isReversed ? 'bg-slate-100 text-slate-400'
                        : isUpdated ? 'bg-blue-100 text-blue-700'
                        : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {res.status === 'new' ? '+ New'
                          : res.status === 'updated' ? '↑ Updated'
                          : res.status === 'reversed' ? 'Archived'
                          : 'Failed'}
                      </span>
                      {isFailed && res.message && (
                        <span className="text-[10px] text-red-500 font-medium leading-tight max-w-[180px]">
                          {res.message}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Identifier */}
                  <td className={`p-3 font-bold text-slate-700 border-l border-slate-50 ${isReversed ? 'line-through' : ''}`}>
                    {res.identifier}
                  </td>

                  {/* Base detail columns */}
                  {baseKeys.map(key => (
                    <td
                      key={key}
                      className={`p-3 text-slate-500 border-l border-slate-50 max-w-[200px] truncate ${isReversed ? 'line-through' : ''}`}
                    >
                      {res.details?.[key] != null && res.details[key] !== ''
                        ? String(res.details[key])
                        : <span className="text-slate-300">—</span>
                      }
                    </td>
                  ))}

                  {/* Custom field columns */}
                  {customIds.map(fieldId => (
                    <td
                      key={fieldId}
                      className={`p-3 text-slate-500 border-l border-violet-100 bg-violet-50/20 max-w-[200px] truncate ${isReversed ? 'line-through' : ''}`}
                    >
                      {res.customFields?.[fieldId] != null && res.customFields[fieldId] !== ''
                        ? String(res.customFields[fieldId])
                        : <span className="text-slate-300">—</span>
                      }
                    </td>
                  ))}

                  {/* Undo */}
                  <td className="p-3 text-center border-l border-slate-50">
                    {!isFailed && !isReversed && (
                      <button
                        onClick={() => onReverse(res.id, i)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                        title="Archive this record"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
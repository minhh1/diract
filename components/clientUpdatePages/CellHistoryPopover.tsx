// components/clientUpdatePages/CellHistoryPopover.tsx
// One cell's own change history -- what it changed from/to, when, who by,
// and (for staff edits) why. Shown to BOTH staff and the client viewing a
// Client Update Page, unlike ActivityLogModal (the whole-page log, staff
// only) -- onFetch is supplied by the caller so this component doesn't need
// to know whether it's talking to the staff logs route or the public
// PIN-gated cell-logs route (see PublicClientUpdateContent.tsx).
"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Sparkles } from "lucide-react";
import { formatDate } from "./dateFormat";

export interface CellLogEntry { id: string; actor_name: string | null; action?: string; old_value: string | null; new_value: string | null; reason: string | null; created_at: string; }

interface HistoryField { field_type?: string; field_key: string }

function isDateField(field: HistoryField): boolean {
  return field.field_type === "date" || field.field_key.includes("date") || field.field_key === "estimated_completion_date";
}

function displayValue(raw: string | null, field: HistoryField, dateFormat: string): string {
  if (raw == null || raw === "") return "(blank)";
  if (isDateField(field) && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDate(raw, dateFormat);
  if (field.field_type === "currency" && !isNaN(Number(raw))) return `$${Number(raw).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return raw;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-AU');
}

export default function CellHistoryPopover({ field, fieldLabel, dateFormat, onFetch, onClose }: {
  field: HistoryField; fieldLabel: string; dateFormat: string; onFetch: () => Promise<CellLogEntry[]>; onClose: () => void;
}) {
  const [logs, setLogs] = useState<CellLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onFetch().then(setLogs).catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load history"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per mount; a new popover instance is mounted whenever the target cell changes (see historyTarget in MatterBoard.tsx)
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-[14px] font-bold text-slate-800">{fieldLabel}</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Change history</p>
          </div>
          <button onClick={onClose} title="Close" className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {error ? (
            <p className="text-center text-red-400 text-[12px] py-10">{error}</p>
          ) : logs === null ? (
            <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
          ) : logs.length === 0 ? (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-10">No changes yet</p>
          ) : (
            <div className="space-y-4">
              {logs.map(l => (
                <div key={l.id} className="text-[12px] border-b border-slate-50 last:border-0 pb-4 last:pb-0">
                  {l.action === "field_status" || l.action === "settlement_status" ? (
                    // An AI status check (agreed/change requested/followed
                    // up/not yet agreed/no discussion) -- old_value/new_value
                    // are both null since nothing on the cell actually
                    // changed, so there's no real "X → Y" to show; the
                    // reasoning itself IS the entry. 'settlement_status' is
                    // the older action name, from before this covered every
                    // field rather than just Settlement Date.
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-slate-600">
                        <Sparkles size={11} className="text-purple-400 shrink-0" /> {l.reason}
                      </p>
                      <span className="text-slate-300 shrink-0">{timeAgo(l.created_at)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-700">
                          <span className="text-slate-400">{displayValue(l.old_value, field, dateFormat)}</span>
                          {" → "}
                          <span className="font-bold">{displayValue(l.new_value, field, dateFormat)}</span>
                        </span>
                        <span className="text-slate-300 shrink-0">{timeAgo(l.created_at)}</span>
                      </div>
                      <p className="text-slate-400 mt-1">
                        {l.actor_name || "Someone"}
                        {l.reason && <span> (&ldquo;{l.reason}&rdquo;)</span>}
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

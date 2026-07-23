// components/admin/HeartbeatStatusList.tsx
// Shared "is this background job still alive" list, extracted from
// AdminGmailSyncTab's health section so the same Live/Down pill UI can be
// reused for the cross-cutting Platform Health tab without duplicating it.
"use client";

import { Radio } from "lucide-react";

export interface HeartbeatDef {
  label: string;
  intervalMs: number;
}

export interface HeartbeatRow {
  name: string;
  last_run_at: string;
  last_result: Record<string, unknown> | null;
}

export function isHeartbeatLive(hb: HeartbeatRow | undefined, def: HeartbeatDef): boolean {
  const lastRunMs = hb ? new Date(hb.last_run_at).getTime() : 0;
  return lastRunMs > 0 && (Date.now() - lastRunMs) < def.intervalMs * 2;
}

export default function HeartbeatStatusList({
  defs,
  heartbeats,
}: {
  defs: Record<string, HeartbeatDef>;
  heartbeats: HeartbeatRow[];
}) {
  return (
    <div className="space-y-3">
      {Object.entries(defs).map(([name, def]) => {
        const hb = heartbeats.find(h => h.name === name);
        const isLive = isHeartbeatLive(hb, def);
        const resultEntries = hb?.last_result && typeof hb.last_result === "object"
          ? Object.entries(hb.last_result)
          : [];
        return (
          <div key={name} className="bg-white border border-slate-100 rounded-[28px] p-5">
            <div className="flex items-center gap-4">
              <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${isLive ? "bg-emerald-50" : "bg-red-50"}`}>
                <Radio size={16} className={isLive ? "text-emerald-600" : "text-red-500"} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-slate-800">{def.label}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {hb ? `Last ran ${new Date(hb.last_run_at).toLocaleString()}` : "Never ran"}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                isLive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
              }`}>
                {isLive ? "Live" : "Down"}
              </span>
            </div>
            {resultEntries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
                {resultEntries.map(([key, value]) => (
                  <span key={key} className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-50 text-slate-500">
                    <span className="text-slate-400">{key}:</span> {String(value)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

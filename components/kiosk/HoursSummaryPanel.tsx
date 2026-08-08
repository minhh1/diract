// components/kiosk/HoursSummaryPanel.tsx
// Read-only "hours worked" table for the kiosk's Weekly/Monthly views --
// talks to app/api/kiosk/checkins/summary/route.ts, re-fetched whenever
// the visible date range changes (see calendar/page.tsx's kiosk branch).
"use client";

import { useState, useEffect } from "react";
import { Loader2, Clock } from "lucide-react";

interface StaffHours {
  staff_entity_id: string;
  name: string;
  hours: number;
}

export default function HoursSummaryPanel({ start, end }: { start: string; end: string }) {
  const [summary, setSummary] = useState<StaffHours[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    fetch(`/api/kiosk/checkins/summary?start=${start}&end=${end}`)
      .then((res) => res.json())
      .then((json) => { if (!cancelled) setSummary(json.summary ?? []); })
      .catch(() => { if (!cancelled) setSummary([]); });
    return () => { cancelled = true; };
  }, [start, end]);

  return (
    <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 bg-slate-50 border-b border-slate-100">
        <Clock size={13} className="text-slate-400" />
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Hours worked</p>
      </div>
      {summary === null ? (
        <div className="flex items-center justify-center py-8"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
      ) : summary.length === 0 ? (
        <p className="text-center text-[11px] text-slate-300 italic py-8">No check-ins recorded in this period.</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {summary.map((s) => (
            <div key={s.staff_entity_id} className="flex items-center justify-between px-5 py-3">
              <span className="text-[12px] font-medium text-slate-700">{s.name}</span>
              <span className="text-[12px] font-bold text-slate-800">{s.hours.toFixed(1)}h</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

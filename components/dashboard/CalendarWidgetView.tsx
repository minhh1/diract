"use client";
// The 'calendar' dashboard widget's own small, self-contained month grid --
// deliberately NOT sharing markup with the full-page Calendar
// (app/(app)/dashboard/calendar/page.tsx), which is tightly coupled to
// page-local rostering/booking state that has nothing to do with a plain
// "this dashboard's own records, grouped by one date field" view. Events are
// computed by lib/dashboardWidgets/compute.ts's computeCalendarEvents, kept
// here purely presentational, matching how SummaryTile/DashboardActivityChart
// take already-computed values rather than records+config.
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent } from "@/lib/dashboardWidgets/compute";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS_PER_DAY = 3;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Every day cell for a full-weeks month view, Monday-start (matching
// lib/dashboardWidgets/compute.ts's own bucketKey week convention) --
// includes the leading/trailing days from adjacent months needed to fill
// complete weeks, same as any standard month calendar.
function monthGridDays(viewMonth: Date): Date[] {
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Mon=0..Sun=6
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - startOffset);

  const days: Date[] = [];
  const cursor = new Date(gridStart);
  // 6 rows always -- a fixed-height grid avoids the widget's card jumping
  // size between a 4-week and 6-week month.
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export default function CalendarWidgetView({ label, events }: { label: string; events: CalendarEvent[] }) {
  const [viewMonth, setViewMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    if (!eventsByDay.has(ev.date)) eventsByDay.set(ev.date, []);
    eventsByDay.get(ev.date)!.push(ev);
  }

  const days = monthGridDays(viewMonth);
  const todayKey = toDateKey(new Date());
  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        {label && <p className="text-[11px] font-bold text-slate-700">{label}</p>}
        <div className="flex items-center gap-2 ml-auto">
          <p className="text-[11px] font-bold text-slate-500">{monthLabel}</p>
          <button
            onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 shrink-0">
        {WEEKDAY_LABELS.map(w => (
          <p key={w} className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center py-1.5">{w}</p>
        ))}
      </div>

      <div className="grid grid-cols-7 flex-1 min-h-0">
        {days.map(day => {
          const key = toDateKey(day);
          const dayEvents = eventsByDay.get(key) || [];
          const inMonth = day.getMonth() === viewMonth.getMonth();
          const isToday = key === todayKey;
          return (
            <div key={key} className="border-t border-l border-slate-100 last:border-r p-1.5 flex flex-col gap-1 min-h-0 overflow-hidden">
              <span className={`text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full shrink-0 ${
                isToday ? "bg-indigo-600 text-white" : inMonth ? "text-slate-600" : "text-slate-300"
              }`}>
                {day.getDate()}
              </span>
              <div className="space-y-0.5 min-h-0 overflow-hidden">
                {dayEvents.slice(0, MAX_CHIPS_PER_DAY).map(ev => (
                  <p key={ev.id} className="text-[9px] font-medium text-indigo-700 bg-indigo-50 rounded px-1 py-0.5 truncate">{ev.label}</p>
                ))}
                {dayEvents.length > MAX_CHIPS_PER_DAY && (
                  <p className="text-[9px] font-bold text-slate-400 px-1">+{dayEvents.length - MAX_CHIPS_PER_DAY} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

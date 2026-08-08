"use client";

// Fixed nav-linked calendar page (like /dashboard/ai, /dashboard/schema --
// not a dashboard-widget-builder instantiation, since a full rostering/
// booking calendar doesn't fit the generic per-table widget model).
// Phase 1: month/week/day shell + staff rostering. Event booking,
// invitations, reminders, and Google Calendar sync are a deferred phase 2.
import { useState, useEffect, useCallback } from "react";
import { CalendarDays, Loader2, ChevronLeft, ChevronRight, Copy, Send } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useCalendarNav, toDateStr, type CalendarView } from "@/lib/hooks/useCalendarNav";
import RosterWeekView, { type RosterShift, type RosterStaff } from "@/components/calendar/RosterWeekView";

interface CalendarSettings {
  enabled: boolean;
  rostering_enabled: boolean;
}

export default function CalendarPage() {
  const { isAdmin } = useCompany();
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const { view, setView, viewDate, handlePrev, handleNext, goToday, weekDays, monthDays } = useCalendarNav("week");
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [staff, setStaff] = useState<RosterStaff[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    fetch("/api/calendar/settings").then((res) => res.json()).then((json) => {
      setSettings(json.settings);
      setLoadingSettings(false);
    });
  }, []);

  const rangeStart = view === "month" ? toDateStr(monthDays.find((d): d is Date => !!d) || viewDate) : toDateStr(weekDays[0]);
  const rangeEnd = view === "month" ? toDateStr(monthDays.filter((d): d is Date => !!d).slice(-1)[0] || viewDate) : toDateStr(weekDays[6]);

  const loadShifts = useCallback(async () => {
    if (!settings?.rostering_enabled) return;
    setLoadingShifts(true);
    const res = await fetch(`/api/calendar/roster/shifts?start=${rangeStart}&end=${rangeEnd}`);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setShifts(json.shifts ?? []);
      setStaff(json.staff ?? []);
    }
    setLoadingShifts(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.rostering_enabled, rangeStart, rangeEnd]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  const handleCopyLastWeek = async () => {
    setActing(true);
    setActionMessage(null);
    const fromWeekStart = (() => { const d = new Date(weekDays[0]); d.setDate(d.getDate() - 7); return toDateStr(d); })();
    const res = await fetch("/api/calendar/roster/copy-week", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromWeekStart, toWeekStart: toDateStr(weekDays[0]) }),
    });
    const json = await res.json().catch(() => null);
    setActing(false);
    if (!res.ok) { setActionMessage(json?.error || "Could not copy last week"); return; }
    setActionMessage(`Copied ${json.copied} shift${json.copied !== 1 ? "s" : ""} as draft${json.skipped ? ` (${json.skipped} skipped -- no longer active staff)` : ""}.`);
    loadShifts();
  };

  const handlePublishWeek = async () => {
    setActing(true);
    setActionMessage(null);
    const res = await fetch("/api/calendar/roster/publish", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: toDateStr(weekDays[0]) }),
    });
    const json = await res.json().catch(() => null);
    setActing(false);
    if (!res.ok) { setActionMessage(json?.error || "Could not publish week"); return; }
    setActionMessage(`Published ${json.published} shift${json.published !== 1 ? "s" : ""}.`);
    loadShifts();
  };

  if (loadingSettings) {
    return <div className="flex items-center justify-center h-full py-24"><Loader2 size={20} className="animate-spin text-slate-300" /></div>;
  }

  if (!settings?.enabled) {
    return (
      <div className="max-w-xl mx-auto p-8">
        <div className="bg-white border border-slate-200 rounded-[32px] p-10 text-center">
          <CalendarDays size={22} className="mx-auto text-slate-300 mb-3" />
          <p className="text-[13px] font-medium text-slate-600">Calendar isn&apos;t turned on for this company yet.</p>
          <p className="text-[12px] text-slate-400 mt-1">
            {isAdmin ? "Turn it on in Admin → Calendar." : "Ask a company admin to turn it on in Admin → Calendar."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays size={22} className="text-indigo-600" />
        <div>
          <h1 className="text-xl font-light uppercase tracking-tight text-slate-900">Calendar</h1>
          <p className="text-[11px] text-slate-400">{settings.rostering_enabled ? "Staff rostering" : "Event booking is coming soon"}</p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h2 className="text-[15px] font-bold text-slate-700">
            {viewDate.toLocaleString("en-AU", { month: "long", year: "numeric", day: view === "day" ? "numeric" : undefined })}
          </h2>
          <div className="flex bg-slate-100 rounded-full p-1">
            {(["day", "week", "month"] as CalendarView[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-1.5 text-[10px] font-bold uppercase rounded-full transition-all ${view === v ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="px-3 py-1.5 rounded-full border border-slate-200 text-[10px] font-bold hover:bg-slate-50">Today</button>
          <button onClick={handlePrev} className="p-2 rounded-full border border-slate-200 hover:bg-slate-50"><ChevronLeft size={14} /></button>
          <button onClick={handleNext} className="p-2 rounded-full border border-slate-200 hover:bg-slate-50"><ChevronRight size={14} /></button>
        </div>
      </div>

      {settings.rostering_enabled && view === "week" && isAdmin && (
        <div className="flex items-center gap-2">
          <button onClick={handleCopyLastWeek} disabled={acting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 disabled:opacity-50 transition-all"
            title="Duplicates last week's shifts into this week as draft. Running it more than once will duplicate -- clean up manually if needed.">
            <Copy size={12} /> Copy last week
          </button>
          <button onClick={handlePublishWeek} disabled={acting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all">
            <Send size={12} /> Publish week
          </button>
          {actionMessage && <span className="text-[11px] text-slate-400">{actionMessage}</span>}
        </div>
      )}

      {!settings.rostering_enabled ? (
        <p className="text-center text-[12px] text-slate-300 italic py-16">
          {isAdmin ? "Turn on staff rostering in Admin → Calendar to start building a roster." : "Rostering isn't turned on for this company yet."}
        </p>
      ) : loadingShifts ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
      ) : view === "week" ? (
        <RosterWeekView weekDays={weekDays} shifts={shifts} staff={staff} isAdmin={isAdmin} onChanged={loadShifts} />
      ) : view === "day" ? (
        <div className="space-y-2 max-w-lg">
          {shifts.filter((s) => s.shift_date === toDateStr(viewDate)).length === 0 ? (
            <p className="text-center text-[11px] text-slate-300 italic py-10">No shifts this day.</p>
          ) : (
            shifts.filter((s) => s.shift_date === toDateStr(viewDate)).map((s) => {
              const member = staff.find((m) => m.id === s.staff_entity_id);
              return (
                <div key={s.id} className={`border rounded-2xl p-4 ${s.status === "draft" ? "border-dashed border-indigo-300 bg-indigo-50/40" : "border-indigo-200 bg-indigo-50"}`}>
                  <p className="text-[12px] font-bold text-slate-700">{member?.name || "Unknown"}</p>
                  <p className="text-[11px] text-slate-500">{s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}{s.role_note ? ` · ${s.role_note}` : ""}</p>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-[9px] font-black text-slate-300 uppercase tracking-widest">{d}</div>
          ))}
          {monthDays.map((date, i) => {
            const count = date ? shifts.filter((s) => s.shift_date === toDateStr(date)).length : 0;
            const isToday = date && toDateStr(date) === toDateStr(new Date());
            return (
              <div key={i} className={`rounded-2xl border p-2.5 min-h-[64px] ${date ? "bg-white border-slate-100" : "border-transparent"} ${isToday ? "ring-2 ring-indigo-500" : ""}`}>
                {date && (
                  <>
                    <span className={`text-[11px] font-black ${isToday ? "text-indigo-600" : "text-slate-400"}`}>{date.getDate()}</span>
                    {count > 0 && <p className="text-[9px] font-bold text-indigo-500 mt-1">{count} shift{count !== 1 ? "s" : ""}</p>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

// Fixed nav-linked calendar page (like /dashboard/ai, /dashboard/schema --
// not a dashboard-widget-builder instantiation, since a full rostering/
// booking calendar doesn't fit the generic per-table widget model).
// Month/week/day shell, staff rostering, and event booking (invitations,
// reminders, opt-in two-way Google Calendar sync) all live here.
import { useState, useEffect, useCallback, Suspense } from "react";
import { CalendarDays, Loader2, ChevronLeft, ChevronRight, Copy, Send, Plus, RefreshCw } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useKioskView, useKioskAccountId } from "@/lib/hooks/useKioskView";
import { useCalendarNav, toDateStr, type CalendarView } from "@/lib/hooks/useCalendarNav";
import RosterWeekView, { type RosterShift, type RosterStaff, type RosterTeam, type TeamMembership } from "@/components/calendar/RosterWeekView";
import ShiftModal, { shiftToModalState, type ShiftModalState } from "@/components/calendar/ShiftModal";
import { StaffAvatar, staffColor } from "@/components/calendar/StaffAvatar";
import EventModal, { type CalendarEventData, type EventInvite, type StaffOption } from "@/components/calendar/EventModal";
import CheckInPanel from "@/components/kiosk/CheckInPanel";
import HoursSummaryPanel from "@/components/kiosk/HoursSummaryPanel";

interface CalendarSettings {
  enabled: boolean;
  rostering_enabled: boolean;
  booking_enabled: boolean;
}

interface DateEvent {
  source_id: string; label: string; color: string;
  record_id: string; name: string; date: string;
  table_name: string | null; table_id: string | null;
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageInner />
    </Suspense>
  );
}

function CalendarPageInner() {
  const { isAdmin, userId } = useCompany();
  const kioskView = useKioskView();
  const kioskAccountId = useKioskAccountId();
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const { view, setView, viewDate, setViewDate, handlePrev, handleNext, goToday, weekDays, monthDays } = useCalendarNav("week");
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [staff, setStaff] = useState<RosterStaff[]>([]);
  const [teams, setTeams] = useState<RosterTeam[]>([]);
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  // Whether the viewer can edit/publish the roster -- isAdmin OR a granted
  // roster.edit/roster.publish custom-role permission (a non-admin
  // "manager"), computed server-side (see /api/calendar/roster/shifts'
  // GET) since hasPermission() isn't exposed client-side. A plain staff
  // member gets neither, and the API has already scoped shifts/staff down
  // to just their own row before this even renders.
  const [canEditRoster, setCanEditRoster] = useState(false);
  const [canPublishRoster, setCanPublishRoster] = useState(false);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [dateEvents, setDateEvents] = useState<DateEvent[]>([]);
  const [shiftModal, setShiftModal] = useState<ShiftModalState | null>(null);

  const openDay = (date: Date) => { setViewDate(date); setView("day"); };

  const [events, setEvents] = useState<CalendarEventData[]>([]);
  const [eventInvites, setEventInvites] = useState<EventInvite[]>([]);
  const [bookingStaff, setBookingStaff] = useState<StaffOption[]>([]);
  const [eventModal, setEventModal] = useState<{ event?: CalendarEventData; defaultDate?: Date } | null>(null);

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
      setTeams(json.teams ?? []);
      setMemberships(json.memberships ?? []);
      setCanEditRoster(!!json.canEdit);
      setCanPublishRoster(!!json.canPublish);
    }
    setLoadingShifts(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.rostering_enabled, rangeStart, rangeEnd]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  // Independent of rostering -- a company can have date-sourced events
  // (task due dates, etc.) on the calendar with rostering off entirely.
  const loadDateEvents = useCallback(async () => {
    if (!settings?.enabled || kioskView) return;
    const res = await fetch(`/api/calendar/date-events?start=${rangeStart}&end=${rangeEnd}`);
    const json = await res.json().catch(() => null);
    if (res.ok) setDateEvents(json.events ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.enabled, kioskView, rangeStart, rangeEnd]);

  useEffect(() => { loadDateEvents(); }, [loadDateEvents]);

  // Per-user (not company-wide) opt-in for two-way Google Calendar sync --
  // only shown once, near the top, when booking is on and the viewer has a
  // Gmail connection to piggyback on (see app/api/calendar/google-sync).
  const [googleSync, setGoogleSync] = useState<{ connected: boolean; enabled: boolean } | null>(null);
  useEffect(() => {
    if (!settings?.booking_enabled || kioskView) return;
    fetch("/api/calendar/google-sync").then((res) => res.json()).then((json) => setGoogleSync(json)).catch(() => {});
  }, [settings?.booking_enabled, kioskView]);
  const toggleGoogleSync = async () => {
    if (!googleSync) return;
    const next = !googleSync.enabled;
    setGoogleSync({ ...googleSync, enabled: next });
    await fetch("/api/calendar/google-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
  };

  const loadEvents = useCallback(async () => {
    if (!settings?.booking_enabled || kioskView) return;
    const res = await fetch(`/api/calendar/events?start=${rangeStart}&end=${rangeEnd}`);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setEvents(json.events ?? []);
      setEventInvites(json.invites ?? []);
      setBookingStaff(json.staff ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.booking_enabled, kioskView, rangeStart, rangeEnd]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const canManageEvents = isAdmin; // custom-role calendar.book_events holders can still act via the API even without this button showing -- see EventModal's own header comment on this convention, matching Copy last week/Publish week above.
  const invitesForEvent = (eventId: string) => eventInvites.filter((i) => i.event_id === eventId);

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

  // A kiosk session gets a restricted screen: Today's check-in panel, plus
  // read-only Weekly/Monthly roster views for anyone walking up to glance
  // at the schedule. No admin controls render here -- Copy last week/
  // Publish week only exist in the non-kiosk branch below, and
  // RosterWeekView itself goes fully read-only with canEdit={false} (no
  // edit/add affordances). See components/KioskAppShell.tsx for the rest
  // of the kiosk lockdown (no Sidebar, redirected off any other route).
  if (kioskView) {
    return (
      <div className="max-w-6xl mx-auto p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-light uppercase tracking-tight text-slate-900">
              {view === "day"
                ? new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })
                : viewDate.toLocaleString("en-AU", { month: "long", year: "numeric" })}
            </h1>
            <p className="text-[11px] text-slate-400 mt-1">
              {view === "day" ? "Tap your name to check in or out" : "Staff roster"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-full p-1">
              {(["day", "week", "month"] as CalendarView[]).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-4 py-1.5 text-[10px] font-bold uppercase rounded-full transition-all ${view === v ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
                  {v === "day" ? "Today" : v === "week" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>
            {view !== "day" && (
              <>
                <button onClick={goToday} className="px-3 py-1.5 rounded-full border border-slate-200 text-[10px] font-bold hover:bg-slate-50">Today</button>
                <button onClick={handlePrev} className="p-2 rounded-full border border-slate-200 hover:bg-slate-50"><ChevronLeft size={14} /></button>
                <button onClick={handleNext} className="p-2 rounded-full border border-slate-200 hover:bg-slate-50"><ChevronRight size={14} /></button>
              </>
            )}
          </div>
        </div>

        {!settings.rostering_enabled ? (
          <p className="text-center text-[12px] text-slate-300 italic py-12">Rostering isn&apos;t turned on for this company yet.</p>
        ) : view === "day" ? (
          <CheckInPanel kioskAccountId={kioskAccountId} />
        ) : loadingShifts ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
        ) : view === "week" ? (
          <>
            <RosterWeekView weekDays={weekDays} shifts={shifts} staff={staff} teams={teams} memberships={memberships} canEdit={false} onChanged={() => {}} />
            <HoursSummaryPanel start={rangeStart} end={rangeEnd} />
          </>
        ) : (
          <>
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
            <HoursSummaryPanel start={rangeStart} end={rangeEnd} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays size={22} className="text-indigo-600" />
          <div>
            <h1 className="text-xl font-light uppercase tracking-tight text-slate-900">Calendar</h1>
            <p className="text-[11px] text-slate-400">
              {[settings.rostering_enabled && "Staff rostering", settings.booking_enabled && "Event booking"].filter(Boolean).join(" · ") || "Nothing turned on yet"}
            </p>
          </div>
        </div>
        {googleSync?.connected && (
          <label className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-600 cursor-pointer">
            <RefreshCw size={12} className="text-slate-400" />
            Sync my events with Google Calendar
            <input type="checkbox" checked={googleSync.enabled} onChange={toggleGoogleSync} className="accent-indigo-600" />
          </label>
        )}
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

      {((settings.rostering_enabled && view === "week" && (canEditRoster || canPublishRoster)) || (settings.booking_enabled && canManageEvents)) && (
        <div className="flex items-center gap-2 flex-wrap">
          {settings.rostering_enabled && view === "week" && canEditRoster && (
            <button onClick={handleCopyLastWeek} disabled={acting}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 disabled:opacity-50 transition-all"
              title="Duplicates last week's shifts into this week as draft. Running it more than once will duplicate -- clean up manually if needed.">
              <Copy size={12} /> Copy last week
            </button>
          )}
          {settings.rostering_enabled && view === "week" && canPublishRoster && (
            <button onClick={handlePublishWeek} disabled={acting}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all">
              <Send size={12} /> Publish week
            </button>
          )}
          {settings.booking_enabled && canManageEvents && (
            <button onClick={() => setEventModal({ defaultDate: viewDate })}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 transition-all">
              <Plus size={12} /> New event
            </button>
          )}
          {actionMessage && <span className="text-[11px] text-slate-400">{actionMessage}</span>}
        </div>
      )}

      {!settings.rostering_enabled && !settings.booking_enabled ? (
        <p className="text-center text-[12px] text-slate-300 italic py-16">
          {isAdmin ? "Turn on staff rostering or event booking in Admin → Calendar to get started." : "Nothing is turned on for this company's calendar yet."}
        </p>
      ) : loadingShifts ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
      ) : view === "week" ? (
        <>
          {settings.rostering_enabled && <RosterWeekView weekDays={weekDays} shifts={shifts} staff={staff} teams={teams} memberships={memberships} canEdit={canEditRoster} onChanged={loadShifts} />}
          {settings.booking_enabled && (
            <EventsList events={events} onOpen={(e) => setEventModal({ event: e })} />
          )}
          <DateEventsList events={dateEvents} />
        </>
      ) : view === "day" ? (
        <div className="space-y-4 max-w-lg">
          {settings.rostering_enabled && (
            <div className="space-y-2">
              {shifts.filter((s) => s.shift_date === toDateStr(viewDate)).length === 0 ? (
                <p className="text-center text-[11px] text-slate-300 italic py-10">No shifts this day.</p>
              ) : (
                shifts.filter((s) => s.shift_date === toDateStr(viewDate)).map((s) => {
                  const member = staff.find((m) => m.id === s.staff_entity_id);
                  const team = teams.find((t) => t.id === s.team_id);
                  const color = staffColor(s.staff_entity_id);
                  return (
                    <button key={s.id} onClick={() => setShiftModal(shiftToModalState(s, member?.name || "Unknown"))}
                      className="relative w-full text-left border rounded-2xl p-4 transition-opacity hover:opacity-90"
                      style={{ borderStyle: s.status === "draft" ? "dashed" : "solid", borderColor: color, backgroundColor: `${color}0d` }}>
                      {s.status === "draft" && (
                        <span className="absolute top-3 right-4 text-[9px] font-black uppercase tracking-widest opacity-70" style={{ color }}>Draft</span>
                      )}
                      <div className="flex items-center gap-2 mb-1.5">
                        {member && <StaffAvatar staff={member} size={22} />}
                        <p className="text-[12px] font-bold text-slate-600 truncate">{member?.name || "Unknown"}</p>
                      </div>
                      <p className="text-[14px] font-bold leading-none" style={{ color }}>
                        {s.start_time.slice(0, 5)} <span className="opacity-50">&ndash;</span> {s.end_time.slice(0, 5)}
                      </p>
                      {team && <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mt-1.5">{team.team_name}</p>}
                      {s.role_note && <p className="text-[11px] font-medium text-slate-500 mt-0.5">{s.role_note}</p>}
                    </button>
                  );
                })
              )}
            </div>
          )}
          {settings.booking_enabled && (
            <EventsList events={events.filter((e) => toDateStr(new Date(e.start_at)) === toDateStr(viewDate))} onOpen={(e) => setEventModal({ event: e })} />
          )}
          <DateEventsList events={dateEvents.filter((e) => e.date === toDateStr(viewDate))} />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-[9px] font-black text-slate-300 uppercase tracking-widest">{d}</div>
          ))}
          {monthDays.map((date, i) => {
            const dateStr = date ? toDateStr(date) : null;
            const dayShifts = dateStr ? shifts.filter((s) => s.shift_date === dateStr) : [];
            const dayEvents = dateStr ? dateEvents.filter((e) => e.date === dateStr) : [];
            const dayBookedEvents = dateStr ? events.filter((e) => toDateStr(new Date(e.start_at)) === dateStr) : [];
            const isToday = dateStr === toDateStr(new Date());
            const SHIFT_CAP = 4;
            const visibleShifts = dayShifts.slice(0, SHIFT_CAP);
            const hiddenShiftCount = dayShifts.length - visibleShifts.length;
            return (
              <div
                key={i}
                onClick={() => date && openDay(date)}
                className={`rounded-2xl border p-2 min-h-[130px] flex flex-col gap-1 transition-colors ${date ? "bg-white border-slate-100 cursor-pointer hover:border-indigo-200" : "border-transparent"} ${isToday ? "ring-2 ring-indigo-500" : ""}`}
              >
                {date && (
                  <>
                    <span className={`text-[11px] font-black ${isToday ? "text-indigo-600" : "text-slate-400"}`}>{date.getDate()}</span>
                    {settings.rostering_enabled && visibleShifts.map((s) => {
                      const member = staff.find((m) => m.id === s.staff_entity_id);
                      const color = staffColor(s.staff_entity_id);
                      return (
                        <button
                          key={s.id}
                          onClick={(ev) => { ev.stopPropagation(); setShiftModal(shiftToModalState(s, member?.name || "Unknown")); }}
                          className="flex items-center gap-1 w-full text-left px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                          style={{ backgroundColor: `${color}1a`, color, border: `1px ${s.status === "draft" ? "dashed" : "solid"} ${color}` }}
                        >
                          {member && <StaffAvatar staff={member} size={12} />}
                          <span className="truncate">{s.start_time.slice(0, 5)} {member?.name || "Unknown"}</span>
                        </button>
                      );
                    })}
                    {hiddenShiftCount > 0 && (
                      <span className="text-[9px] font-bold text-slate-400 px-1.5">+{hiddenShiftCount} more</span>
                    )}
                    {settings.booking_enabled && dayBookedEvents.slice(0, 2).map((e) => (
                      <button key={e.id} onClick={(ev) => { ev.stopPropagation(); setEventModal({ event: e }); }}
                        className={`block w-full text-left truncate px-1.5 py-0.5 rounded-md text-[9px] font-bold ${e.status === "cancelled" ? "bg-slate-100 text-slate-400 line-through" : "bg-indigo-100 text-indigo-700"}`}>
                        {e.title}
                      </button>
                    ))}
                    {dayEvents.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-auto pt-1">
                        {dayEvents.slice(0, 6).map((e) => (
                          <span key={e.source_id + e.record_id} title={`${e.label}: ${e.name}`} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: e.color }} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {shiftModal && (
        <ShiftModal modal={shiftModal} staffList={staff} teams={teams} canEdit={canEditRoster} onClose={() => setShiftModal(null)} onSaved={() => { setShiftModal(null); loadShifts(); }} />
      )}

      {eventModal && (
        <EventModal
          event={eventModal.event}
          invites={eventModal.event ? invitesForEvent(eventModal.event.id) : undefined}
          staff={bookingStaff}
          currentUserId={userId || ""}
          canManage={canManageEvents || eventModal.event?.created_by === userId}
          defaultDate={eventModal.defaultDate}
          onClose={() => setEventModal(null)}
          onSaved={() => { setEventModal(null); loadEvents(); }}
        />
      )}
    </div>
  );
}

function EventsList({ events, onOpen }: { events: CalendarEventData[]; onOpen: (e: CalendarEventData) => void }) {
  if (events.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Events</p>
      {events.map((e) => (
        <button key={e.id} onClick={() => onOpen(e)}
          className={`w-full text-left flex items-center gap-2.5 px-4 py-2.5 bg-white border rounded-2xl transition-colors ${e.status === "cancelled" ? "border-slate-200 opacity-50" : "border-indigo-200 hover:border-indigo-300"}`}>
          <span className="text-[12px] font-bold text-slate-700 truncate flex-1">{e.title}{e.status === "cancelled" ? " (cancelled)" : ""}</span>
          <span className="text-[11px] text-slate-400 shrink-0">
            {new Date(e.start_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
          </span>
        </button>
      ))}
    </div>
  );
}

function DateEventsList({ events }: { events: DateEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Due dates</p>
      {events.map((e) => (
        <div key={e.source_id + e.record_id} className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-slate-200 rounded-2xl">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide shrink-0">{e.label}</span>
          <span className="text-[12px] text-slate-700 truncate">{e.name}</span>
        </div>
      ))}
    </div>
  );
}

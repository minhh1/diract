"use client";

// Staff (rows) x day-of-week (columns) roster grid -- the actual feature
// requested, modeled visually on cafe-kiosk's weekly grid layout
// (/Users/minhhuynh/cafe-kiosk's app/page.tsx) since that's the only part
// of its rostering genuinely reusable (its draft/publish/copy-week logic
// doesn't exist there -- that project outsources rostering to Deputy).
// Dashed border = draft, solid = final -- one grid, not two separate views,
// since an admin needs to see both at once while building the week. Shift
// chips are color-coded per staff (see StaffAvatar.staffColor) and carry
// the staff member's avatar, consistent with the month/day views.
//
// Divided into one grid per team (cafe-kiosk's Front of House/Back of House
// idea, generalised to the app's own pre-existing teams -- see
// components/admin/AdminTeamsTab.tsx, NOT a roster-specific team list) plus
// a trailing "Unassigned" grid that always lists every staff member. A
// team's section lists its actual members (team_members, "one person can
// be part of multiple teams" -- the same person's row can legitimately
// appear in more than one section), showing only the shifts tagged for
// that team; Unassigned always shows everyone, both as the landing place
// for shifts with no team tag and as the entry point for a brand new
// person's first shift.
import { useState } from "react";
import { Plus } from "lucide-react";
import { toDateStr } from "@/lib/hooks/useCalendarNav";
import { StaffAvatar, staffColor } from "./StaffAvatar";
import ShiftModal, { shiftToModalState, type RosterShift, type RosterTeam, type ShiftModalState } from "./ShiftModal";

export type { RosterShift, RosterTeam } from "./ShiftModal";

export interface RosterStaff {
  id: string;
  name: string;
  avatar_url?: string | null;
  linked_profile_id?: string | null;
}

export interface TeamMembership {
  team_id: string;
  profile_id: string;
}

interface Props {
  weekDays: Date[];
  shifts: RosterShift[];
  staff: RosterStaff[];
  teams: RosterTeam[];
  memberships: TeamMembership[];
  canEdit: boolean;
  onChanged: () => void;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function timeLabel(t: string): string {
  return t.slice(0, 5);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function DayHeader({ weekDays }: { weekDays: Date[] }) {
  return (
    <div className="grid grid-cols-[160px_repeat(7,1fr)] gap-1.5 mb-1.5">
      <div />
      {weekDays.map((d, i) => (
        <div key={i} className={`text-center py-2 rounded-2xl ${toDateStr(d) === toDateStr(new Date()) ? "bg-indigo-50" : ""}`}>
          <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{DAY_LABELS[i]}</p>
          <p className="text-[11px] font-bold text-slate-600">{d.getDate()}</p>
        </div>
      ))}
    </div>
  );
}

export default function RosterWeekView({ weekDays, shifts, staff, teams, memberships, canEdit, onChanged }: Props) {
  const [modal, setModal] = useState<ShiftModalState | null>(null);

  const shiftsFor = (staffId: string, date: string, teamId: string | null) =>
    shifts.filter((s) => s.staff_entity_id === staffId && s.shift_date === date && (s.team_id ?? null) === teamId);

  const openNew = (staffId: string, staffName: string, date: string, teamId: string | null) => {
    setModal({ staffId, staffName, date, startTime: "09:00", endTime: "17:00", roleNote: "", teamId });
  };
  const openShift = (shift: RosterShift, staffName: string) => setModal(shiftToModalState(shift, staffName));

  // Grand total across ALL of a staff member's shifts this week, regardless
  // of team -- overlaps are already rejected server-side (lib/rosterOverlap.ts),
  // so summing every shift here can't double-count the same time twice.
  const weekDateStrs = weekDays.map(toDateStr);
  const weeklyHours = (staffId: string): number => {
    const minutes = shifts
      .filter((s) => s.staff_entity_id === staffId && weekDateStrs.includes(s.shift_date))
      .reduce((sum, s) => sum + (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)), 0);
    return minutes / 60;
  };

  const renderGrid = (teamId: string | null, staffIds: string[]) => {
    const rows = staff.filter((m) => staffIds.includes(m.id));
    if (rows.length === 0) return null;
    return (
      <div className="space-y-1.5">
        {rows.map((member) => (
          <div key={member.id} className="grid grid-cols-[160px_repeat(7,1fr)] gap-1.5">
            <div className="flex items-center gap-2 px-3 py-2 min-w-0">
              <StaffAvatar staff={member} size={20} />
              <span className="text-[11px] font-bold text-slate-600 truncate">{member.name}</span>
              {canEdit && weeklyHours(member.id) > 0 && (
                <span className="ml-auto shrink-0 text-[9px] font-bold text-slate-400">{weeklyHours(member.id).toFixed(1)}h</span>
              )}
            </div>
            {weekDays.map((d, i) => {
              const dateStr = toDateStr(d);
              const dayShifts = shiftsFor(member.id, dateStr, teamId);
              const color = staffColor(member.id);
              return (
                <div key={i} className="group min-h-[76px] rounded-2xl border border-slate-100 bg-white p-1 flex flex-col gap-1">
                  {dayShifts.map((s) => {
                    const team = teams.find((t) => t.id === s.team_id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => openShift(s, member.name)}
                        className="relative text-left px-2.5 py-2 rounded-xl leading-tight transition-colors"
                        style={{
                          border: `1.5px ${s.status === "draft" ? "dashed" : "solid"} ${color}`,
                          backgroundColor: `${color}1a`,
                          color,
                        }}
                      >
                        {s.status === "draft" && (
                          <span className="absolute top-1 right-1.5 text-[7px] font-bold uppercase tracking-wider opacity-70">Draft</span>
                        )}
                        {team && <span className="block text-[8px] font-bold uppercase tracking-wide opacity-70 mb-0.5">{team.team_name}</span>}
                        <span className="block text-[11px] font-bold">{timeLabel(s.start_time)}</span>
                        <span className="block text-[11px] font-bold">{timeLabel(s.end_time)}</span>
                        {s.role_note && <span className="block text-[9px] font-medium opacity-70 truncate mt-0.5">{s.role_note}</span>}
                      </button>
                    );
                  })}
                  {canEdit && (
                    <button
                      onClick={() => openNew(member.id, member.name, dateStr, teamId)}
                      className="opacity-0 group-hover:opacity-100 flex items-center justify-center flex-1 min-h-[20px] text-slate-300 hover:text-indigo-500 transition-all"
                    >
                      <Plus size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const allStaffIds = staff.map((m) => m.id);
  // Team section membership comes from the real team_members roster (not
  // shift history) -- an admin should see everyone on a team even before
  // that person has a single shift booked yet this week.
  const staffIdsForTeam = (teamId: string) => {
    const memberProfileIds = new Set(memberships.filter((m) => m.team_id === teamId).map((m) => m.profile_id));
    return staff.filter((m) => m.linked_profile_id && memberProfileIds.has(m.linked_profile_id)).map((m) => m.id);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="min-w-[900px] space-y-6">
        {staff.length === 0 ? (
          <p className="text-center text-[11px] text-slate-300 italic py-16">No staff found for this company.</p>
        ) : (
          <>
            {teams.map((t) => {
              const staffIds = staffIdsForTeam(t.id);
              if (staffIds.length === 0) return null;
              return (
                <div key={t.id}>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pb-1.5 border-b-2 border-slate-100">{t.team_name}</p>
                  <DayHeader weekDays={weekDays} />
                  {renderGrid(t.id, staffIds)}
                </div>
              );
            })}
            <div>
              {teams.length > 0 && (
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pb-1.5 border-b-2 border-slate-100">Unassigned</p>
              )}
              <DayHeader weekDays={weekDays} />
              {renderGrid(null, allStaffIds)}
            </div>
          </>
        )}
      </div>

      {modal && (
        <ShiftModal modal={modal} staffList={staff} teams={teams} canEdit={canEdit} onClose={() => setModal(null)} onSaved={() => { setModal(null); onChanged(); }} />
      )}
    </div>
  );
}

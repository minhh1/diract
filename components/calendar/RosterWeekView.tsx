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
import { useState } from "react";
import { Plus } from "lucide-react";
import { toDateStr } from "@/lib/hooks/useCalendarNav";
import { StaffAvatar, staffColor } from "./StaffAvatar";
import ShiftModal, { shiftToModalState, type RosterShift, type ShiftModalState } from "./ShiftModal";

export type { RosterShift } from "./ShiftModal";

export interface RosterStaff {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface Props {
  weekDays: Date[];
  shifts: RosterShift[];
  staff: RosterStaff[];
  isAdmin: boolean;
  onChanged: () => void;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function timeLabel(t: string): string {
  return t.slice(0, 5);
}

export default function RosterWeekView({ weekDays, shifts, staff, isAdmin, onChanged }: Props) {
  const [modal, setModal] = useState<ShiftModalState | null>(null);

  const shiftsFor = (staffId: string, date: string) => shifts.filter((s) => s.staff_entity_id === staffId && s.shift_date === date);

  const openNew = (staffId: string, staffName: string, date: string) => {
    setModal({ staffId, staffName, date, startTime: "09:00", endTime: "17:00", roleNote: "" });
  };
  const openShift = (shift: RosterShift, staffName: string) => setModal(shiftToModalState(shift, staffName));

  return (
    <div className="flex-1 overflow-auto">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-[160px_repeat(7,1fr)] gap-1.5 mb-1.5">
          <div />
          {weekDays.map((d, i) => (
            <div key={i} className={`text-center py-2 rounded-2xl ${toDateStr(d) === toDateStr(new Date()) ? "bg-indigo-50" : ""}`}>
              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{DAY_LABELS[i]}</p>
              <p className="text-[11px] font-bold text-slate-600">{d.getDate()}</p>
            </div>
          ))}
        </div>

        {staff.length === 0 ? (
          <p className="text-center text-[11px] text-slate-300 italic py-16">No staff found for this company.</p>
        ) : (
          <div className="space-y-1.5">
            {staff.map((member) => (
              <div key={member.id} className="grid grid-cols-[160px_repeat(7,1fr)] gap-1.5">
                <div className="flex items-center gap-2 px-3 py-2 min-w-0">
                  <StaffAvatar staff={member} size={20} />
                  <span className="text-[11px] font-bold text-slate-600 truncate">{member.name}</span>
                </div>
                {weekDays.map((d, i) => {
                  const dateStr = toDateStr(d);
                  const dayShifts = shiftsFor(member.id, dateStr);
                  const color = staffColor(member.id);
                  return (
                    <div key={i} className="group min-h-[56px] rounded-2xl border border-slate-100 bg-white p-1 flex flex-col gap-1">
                      {dayShifts.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => openShift(s, member.name)}
                          className="text-left px-2 py-1 rounded-xl text-[10px] font-bold leading-tight transition-colors"
                          style={{
                            border: `1px ${s.status === "draft" ? "dashed" : "solid"} ${color}`,
                            backgroundColor: `${color}1a`,
                            color,
                          }}
                        >
                          {timeLabel(s.start_time)}-{timeLabel(s.end_time)}
                          {s.role_note && <span className="block font-medium opacity-70 truncate">{s.role_note}</span>}
                        </button>
                      ))}
                      {isAdmin && (
                        <button
                          onClick={() => openNew(member.id, member.name, dateStr)}
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
        )}
      </div>

      {modal && (
        <ShiftModal modal={modal} staffList={staff} canEdit={isAdmin} onClose={() => setModal(null)} onSaved={() => { setModal(null); onChanged(); }} />
      )}
    </div>
  );
}

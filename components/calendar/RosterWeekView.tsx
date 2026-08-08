"use client";

// Staff (rows) x day-of-week (columns) roster grid -- the actual feature
// requested, modeled visually on cafe-kiosk's weekly grid layout
// (/Users/minhhuynh/cafe-kiosk's app/page.tsx) since that's the only part
// of its rostering genuinely reusable (its draft/publish/copy-week logic
// doesn't exist there -- that project outsources rostering to Deputy).
// Dashed border = draft, solid = final -- one grid, not two separate views,
// since an admin needs to see both at once while building the week.
import { useState } from "react";
import { Plus, X, Trash2, Loader2 } from "lucide-react";
import { toDateStr } from "@/lib/hooks/useCalendarNav";

export interface RosterShift {
  id: string;
  staff_entity_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  role_note: string | null;
  status: "draft" | "final";
}

export interface RosterStaff {
  id: string;
  name: string;
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

interface ModalState {
  shiftId?: string;
  staffId: string;
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
  roleNote: string;
}

export default function RosterWeekView({ weekDays, shifts, staff, isAdmin, onChanged }: Props) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shiftsFor = (staffId: string, date: string) => shifts.filter((s) => s.staff_entity_id === staffId && s.shift_date === date);

  const openNew = (staffId: string, staffName: string, date: string) => {
    setError(null);
    setModal({ staffId, staffName, date, startTime: "09:00", endTime: "17:00", roleNote: "" });
  };
  const openEdit = (shift: RosterShift, staffName: string) => {
    setError(null);
    setModal({
      shiftId: shift.id, staffId: shift.staff_entity_id, staffName, date: shift.shift_date,
      startTime: timeLabel(shift.start_time), endTime: timeLabel(shift.end_time), roleNote: shift.role_note || "",
    });
  };

  const handleSave = async () => {
    if (!modal) return;
    setSaving(true);
    setError(null);
    try {
      const body = { staff_entity_id: modal.staffId, shift_date: modal.date, start_time: modal.startTime, end_time: modal.endTime, role_note: modal.roleNote || null };
      const res = modal.shiftId
        ? await fetch(`/api/calendar/roster/shifts/${modal.shiftId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/calendar/roster/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Could not save shift");
      setModal(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save shift");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!modal?.shiftId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/roster/shifts/${modal.shiftId}`, { method: "DELETE" });
      if (!res.ok) { const json = await res.json().catch(() => null); throw new Error(json?.error || "Could not delete shift"); }
      setModal(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete shift");
    } finally {
      setSaving(false);
    }
  };

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
                <div className="flex items-center px-3 py-2 text-[11px] font-bold text-slate-600 truncate">{member.name}</div>
                {weekDays.map((d, i) => {
                  const dateStr = toDateStr(d);
                  const dayShifts = shiftsFor(member.id, dateStr);
                  return (
                    <div key={i} className="group min-h-[56px] rounded-2xl border border-slate-100 bg-white p-1 flex flex-col gap-1">
                      {dayShifts.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => isAdmin && openEdit(s, member.name)}
                          className={`text-left px-2 py-1 rounded-xl text-[10px] font-bold leading-tight transition-colors ${
                            s.status === "draft"
                              ? "border border-dashed border-indigo-300 bg-indigo-50/60 text-indigo-600"
                              : "border border-indigo-200 bg-indigo-100 text-indigo-700"
                          }`}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !saving && setModal(null)}>
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-bold text-slate-800">{modal.staffName}</p>
                <p className="text-[11px] text-slate-400">{modal.date}</p>
              </div>
              <button onClick={() => setModal(null)} className="p-1 text-slate-300 hover:text-slate-700"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Start
                <input type="time" value={modal.startTime} onChange={(e) => setModal({ ...modal, startTime: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-[12px] font-medium outline-none" />
              </label>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                End
                <input type="time" value={modal.endTime} onChange={(e) => setModal({ ...modal, endTime: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-[12px] font-medium outline-none" />
              </label>
            </div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Role / note (optional)
              <input type="text" value={modal.roleNote} onChange={(e) => setModal({ ...modal, roleNote: e.target.value })}
                placeholder="e.g. Front desk"
                className="mt-1 w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-[12px] font-medium outline-none" />
            </label>
            {error && <p className="text-[11px] text-red-500">{error}</p>}
            <div className="flex items-center gap-2 pt-1">
              {modal.shiftId && (
                <button onClick={handleDelete} disabled={saving} className="p-2.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
              <button onClick={handleSave} disabled={saving}
                className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                {modal.shiftId ? "Save changes" : "Add shift"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

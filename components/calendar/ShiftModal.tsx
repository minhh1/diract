"use client";

// Shared shift create/edit/view modal -- used by RosterWeekView (create +
// edit, its original home) and the month/day views on the calendar page
// (view existing shifts, edit too if the viewer can). Pulled out to its own
// component so "click a shift to see its particulars" works the same way
// regardless of which view it was clicked from, instead of three separate
// modal implementations drifting apart.
import { useState } from "react";
import { X, Trash2, Loader2 } from "lucide-react";
import { StaffAvatar, type StaffLike } from "./StaffAvatar";

export interface RosterShift {
  id: string;
  staff_entity_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  role_note: string | null;
  team_id: string | null;
  status: "draft" | "final";
}

// The app's existing teams (Admin -> Teams, components/admin/AdminTeamsTab.tsx)
// -- roster_shifts.team_id points at the same `teams` table, not a
// roster-specific one, so this shape matches its real column names.
export interface RosterTeam {
  id: string;
  team_name: string;
}

export interface ShiftModalState {
  shiftId?: string;
  staffId: string;
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
  roleNote: string;
  teamId: string | null;
  status?: "draft" | "final";
}

function timeLabel(t: string): string {
  return t.slice(0, 5);
}

export function shiftToModalState(shift: RosterShift, staffName: string): ShiftModalState {
  return {
    shiftId: shift.id, staffId: shift.staff_entity_id, staffName, date: shift.shift_date,
    startTime: timeLabel(shift.start_time), endTime: timeLabel(shift.end_time), roleNote: shift.role_note || "",
    teamId: shift.team_id, status: shift.status,
  };
}

interface Props {
  modal: ShiftModalState;
  staffList: StaffLike[];
  teams: RosterTeam[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function ShiftModal({ modal: initial, staffList, teams, canEdit, onClose, onSaved }: Props) {
  const [modal, setModal] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const staffMember = staffList.find((s) => s.id === modal.staffId);
  const team = teams.find((t) => t.id === modal.teamId);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { staff_entity_id: modal.staffId, shift_date: modal.date, start_time: modal.startTime, end_time: modal.endTime, role_note: modal.roleNote || null, team_id: modal.teamId };
      const res = modal.shiftId
        ? await fetch(`/api/calendar/roster/shifts/${modal.shiftId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/calendar/roster/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Could not save shift");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save shift");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!modal.shiftId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/roster/shifts/${modal.shiftId}`, { method: "DELETE" });
      if (!res.ok) { const json = await res.json().catch(() => null); throw new Error(json?.error || "Could not delete shift"); }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete shift");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-[28px] p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {staffMember && <StaffAvatar staff={staffMember} size={28} />}
            <div>
              <p className="text-[13px] font-bold text-slate-800">{modal.staffName}</p>
              <p className="text-[11px] text-slate-400">
                {new Date(modal.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>

        {!canEdit ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-slate-700">{modal.startTime}-{modal.endTime}</span>
              {modal.status && (
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${modal.status === "draft" ? "bg-indigo-50 text-indigo-500" : "bg-emerald-50 text-emerald-600"}`}>
                  {modal.status}
                </span>
              )}
            </div>
            {team && <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{team.team_name}</p>}
            {modal.roleNote && <p className="text-[12px] text-slate-500">{modal.roleNote}</p>}
          </div>
        ) : (
          <>
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
            {teams.length > 0 && (
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Team (optional)
                <select value={modal.teamId ?? ""} onChange={(e) => setModal({ ...modal, teamId: e.target.value || null })}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-[12px] font-medium outline-none">
                  <option value="">No team</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.team_name}</option>)}
                </select>
              </label>
            )}
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
          </>
        )}
      </div>
    </div>
  );
}

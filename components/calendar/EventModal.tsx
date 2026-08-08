"use client";

// Create/edit modal for a bookable calendar event -- also the RSVP surface
// for a logged-in internal invitee (Accept/Decline their own invite) and
// the cancel action for whoever can manage the event. One modal covers all
// three roles rather than three separate UIs, since which controls show is
// just a question of who's looking at it.
import { useState } from "react";
import { X, Loader2, Trash2, Plus, Check, Clock } from "lucide-react";

export interface EventInvite {
  id: string;
  event_id: string;
  invite_type: "internal" | "external";
  internal_user_id: string | null;
  external_name: string | null;
  external_email: string | null;
  rsvp_status: "pending" | "accepted" | "declined";
}
export interface CalendarEventData {
  id: string;
  created_by: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  status: "confirmed" | "cancelled";
}
export interface StaffOption { id: string; name: string; linked_profile_id: string }

interface Props {
  event?: CalendarEventData;
  invites?: EventInvite[];
  staff: StaffOption[];
  currentUserId: string;
  canManage: boolean;
  defaultDate?: Date;
  onClose: () => void;
  onSaved: () => void;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventModal({ event, invites, staff, currentUserId, canManage, defaultDate, onClose, onSaved }: Props) {
  const isEdit = !!event;
  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [location, setLocation] = useState(event?.location || "");
  const start0 = event ? new Date(event.start_at) : (defaultDate ? new Date(defaultDate) : new Date());
  const end0 = event ? new Date(event.end_at) : new Date(start0.getTime() + 60 * 60 * 1000);
  const [startAt, setStartAt] = useState(toLocalInput(start0.toISOString()));
  const [endAt, setEndAt] = useState(toLocalInput(end0.toISOString()));
  const [internalIds, setInternalIds] = useState<Set<string>>(new Set());
  const [externalRows, setExternalRows] = useState<{ name: string; email: string }[]>([{ name: "", email: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myInvite = (invites || []).find((i) => i.internal_user_id === currentUserId);

  const toggleInternal = (profileId: string) => setInternalIds((prev) => {
    const next = new Set(prev);
    if (next.has(profileId)) next.delete(profileId); else next.add(profileId);
    return next;
  });

  const handleSave = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const invitees = [
        ...Array.from(internalIds).map((user_id) => ({ type: "internal" as const, user_id })),
        ...externalRows.filter((r) => r.email.trim()).map((r) => ({ type: "external" as const, name: r.name.trim() || r.email.trim(), email: r.email.trim() })),
      ];
      const payload = {
        title: title.trim(), description: description.trim() || null, location: location.trim() || null,
        start_at: new Date(startAt).toISOString(), end_at: new Date(endAt).toISOString(),
      };
      const res = isEdit
        ? await fetch(`/api/calendar/events/${event!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, add_invitees: invitees }) })
        : await fetch("/api/calendar/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, invitees }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Could not save event");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save event");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEvent = async () => {
    if (!event) return;
    setSaving(true);
    const res = await fetch(`/api/calendar/events/${event.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
    setSaving(false);
    if (res.ok) onSaved();
  };

  const handleRespond = async (response: "accepted" | "declined") => {
    if (!event) return;
    setSaving(true);
    const res = await fetch(`/api/calendar/events/${event.id}/respond`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }) });
    setSaving(false);
    if (res.ok) onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-[28px] p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold text-slate-800">{isEdit ? "Event" : "New event"}</p>
          <button onClick={onClose} className="p-1 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>

        {event?.status === "cancelled" && (
          <p className="text-[11px] font-bold text-red-500 uppercase tracking-widest">Cancelled</p>
        )}

        {myInvite && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 rounded-2xl">
            <span className="text-[11px] text-slate-500 flex-1">Your RSVP: <span className="font-bold">{myInvite.rsvp_status}</span></span>
            <button onClick={() => handleRespond("accepted")} disabled={saving} className="px-3 py-1.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-40">Accept</button>
            <button onClick={() => handleRespond("declined")} disabled={saving} className="px-3 py-1.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-40">Decline</button>
          </div>
        )}

        {canManage ? (
          <>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[13px] font-medium outline-none focus:border-indigo-400" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-indigo-400 resize-none" />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-indigo-400" />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Start
                <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-[12px] font-medium outline-none" />
              </label>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                End
                <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-[12px] font-medium outline-none" />
              </label>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Invite staff</p>
              <div className="flex flex-wrap gap-1.5">
                {staff.map((s) => (
                  <button key={s.id} onClick={() => toggleInternal(s.linked_profile_id)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${internalIds.has(s.linked_profile_id) ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Invite external people</p>
              {externalRows.map((row, i) => (
                <div key={i} className="flex items-center gap-1.5 mb-1.5">
                  <input value={row.name} onChange={(e) => setExternalRows((prev) => prev.map((r, ri) => ri === i ? { ...r, name: e.target.value } : r))}
                    placeholder="Name" className="flex-1 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] outline-none" />
                  <input value={row.email} onChange={(e) => setExternalRows((prev) => prev.map((r, ri) => ri === i ? { ...r, email: e.target.value } : r))}
                    placeholder="Email" className="flex-1 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] outline-none" />
                </div>
              ))}
              <button onClick={() => setExternalRows((prev) => [...prev, { name: "", email: "" }])} className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700">
                <Plus size={10} /> Add another
              </button>
            </div>

            {invites && invites.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Invited</p>
                <div className="space-y-1">
                  {invites.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl text-[11px]">
                      <span className="flex-1 truncate text-slate-600">{inv.invite_type === "internal" ? staff.find((s) => s.linked_profile_id === inv.internal_user_id)?.name || "Staff" : inv.external_name}</span>
                      <span className={`text-[9px] font-bold uppercase ${inv.rsvp_status === "accepted" ? "text-emerald-600" : inv.rsvp_status === "declined" ? "text-red-500" : "text-slate-400"}`}>
                        {inv.rsvp_status === "pending" ? <Clock size={10} className="inline mr-0.5" /> : inv.rsvp_status === "accepted" ? <Check size={10} className="inline mr-0.5" /> : null}
                        {inv.rsvp_status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-[11px] text-red-500">{error}</p>}

            <div className="flex items-center gap-2 pt-1">
              {isEdit && event?.status !== "cancelled" && (
                <button onClick={handleCancelEvent} disabled={saving} className="p-2.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors" title="Cancel event">
                  <Trash2 size={14} />
                </button>
              )}
              <button onClick={handleSave} disabled={saving}
                className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                {isEdit ? "Save changes" : "Create event"}
              </button>
            </div>
          </>
        ) : (
          <div>
            <p className="text-[15px] font-bold text-slate-800">{event?.title}</p>
            {event?.location && <p className="text-[12px] text-slate-500 mt-1">{event.location}</p>}
            {event?.description && <p className="text-[12px] text-slate-600 mt-2">{event.description}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

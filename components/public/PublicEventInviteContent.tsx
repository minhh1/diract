"use client";

// The actual RSVP UI for a public event invite -- genuinely unauthenticated,
// talks only to app/api/calendar/event-invites/public/[slug]/* (no
// supabase.auth call anywhere in this file, unlike PublicClientUpdateContent.tsx's
// dual-mode). Deliberately simple: view details, Accept or Decline, done --
// no PIN gate (see lib/eventInvitePageGate.ts's own comment on why).
import { useState, useEffect, useCallback } from "react";
import { Loader2, CalendarDays, MapPin, Check, X } from "lucide-react";

interface InviteData {
  event: { title: string; description: string | null; location: string | null; start_at: string; end_at: string; status: "confirmed" | "cancelled" };
  invite: { name: string | null; rsvp_status: "pending" | "accepted" | "declined"; responded_at: string | null };
}

export default function PublicEventInviteContent({ slug }: { slug: string }) {
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [responding, setResponding] = useState<"accepted" | "declined" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/calendar/event-invites/public/${slug}`);
    if (!res.ok) { setNotFound(true); setLoading(false); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const respond = async (response: "accepted" | "declined") => {
    setResponding(response);
    const res = await fetch(`/api/calendar/event-invites/public/${slug}/respond`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }),
    });
    setResponding(null);
    if (res.ok) load();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 size={22} className="animate-spin text-slate-300" /></div>;
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-[13px] text-slate-400">This invite is not available.</p>
      </div>
    );
  }

  const { event, invite } = data;
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const dateLabel = start.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeLabel = `${start.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-[32px] p-8 space-y-6">
        <div className="flex items-center gap-2.5">
          <CalendarDays size={18} className="text-indigo-600 shrink-0" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {event.status === "cancelled" ? "Event cancelled" : "You're invited"}
          </p>
        </div>

        <div>
          <h1 className="text-xl font-light tracking-tight text-slate-900">{event.title}</h1>
          <p className="text-[13px] text-slate-500 mt-2">{dateLabel}</p>
          <p className="text-[13px] text-slate-500">{timeLabel}</p>
          {event.location && (
            <p className="flex items-center gap-1.5 text-[13px] text-slate-500 mt-1">
              <MapPin size={12} className="shrink-0" /> {event.location}
            </p>
          )}
          {event.description && <p className="text-[13px] text-slate-600 mt-4 leading-relaxed">{event.description}</p>}
        </div>

        {event.status === "cancelled" ? (
          <p className="text-[12px] text-slate-400 italic">This event has been cancelled by the organizer.</p>
        ) : invite.rsvp_status !== "pending" ? (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-[12px] font-medium ${invite.rsvp_status === "accepted" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {invite.rsvp_status === "accepted" ? <Check size={14} /> : <X size={14} />}
            You {invite.rsvp_status === "accepted" ? "accepted" : "declined"} this invite.
            <button onClick={() => respond(invite.rsvp_status === "accepted" ? "declined" : "accepted")} className="ml-auto text-indigo-600 hover:text-indigo-700 font-bold underline underline-offset-2">
              Change response
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => respond("accepted")}
              disabled={responding !== null}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-indigo-600 text-white rounded-full text-[12px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all"
            >
              {responding === "accepted" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Accept
            </button>
            <button
              onClick={() => respond("declined")}
              disabled={responding !== null}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-slate-100 text-slate-600 rounded-full text-[12px] font-bold hover:bg-slate-200 disabled:opacity-50 transition-all"
            >
              {responding === "declined" ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Decline
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

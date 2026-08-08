// components/kiosk/CheckInPanel.tsx
// Today's rostered staff as large, tap-friendly rows for an iPad at a
// shared work location. Two ways in: tap a row (or scan the person's own
// check-in QR code, shown from their phone's Profile page -- see
// app/api/staff/checkin-qr/route.ts), then, if that person has set a PIN
// (app/(app)/dashboard/profile/page.tsx's CheckinPinSection), enter it
// before the check-in/out actually commits. Staff with no PIN (never
// logged in -- the "zero login" design this whole feature is built around,
// see staff_checkins' migration comment) keep the old plain-tap behaviour.
// Mounted alongside the calendar on /dashboard/calendar when the signed-in
// session is a kiosk account, or an admin is previewing kiosk mode as one
// (see components/KioskAppShell.tsx) -- kioskAccountId, when present, is
// only relevant to the latter: it tells the API which of the company's
// kiosk_accounts this admin's session should act as, so check-in/out stays
// correctly scoped per physical device even though the admin never
// actually logs into each one. Talks to app/api/kiosk/checkins/route.ts,
// not raw supabase -- that route does its own companyId scoping
// server-side as a second layer alongside RLS.
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle2, Circle, Loader2, Clock, ScanLine, X, Delete } from "lucide-react";
import jsQR from "jsqr";
import { parseCheckinQrPayload } from "@/lib/staffCheckinQr";

interface Shift {
  id: string;
  staff_entity_id: string;
  start_time: string;
  end_time: string;
  role_note: string | null;
}
interface Staff { id: string; name: string; hasPin: boolean }
interface Checkin {
  id: string;
  roster_shift_id: string | null;
  staff_entity_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
}
type CommitResult = { ok: true } | { ok: false; error: string };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

export default function CheckInPanel({ kioskAccountId }: { kioskAccountId?: string | null }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<Shift | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/kiosk/checkins");
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      setShifts(data.shifts ?? []);
      setStaff(data.staff ?? []);
      setCheckins(data.checkins ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCheckinFor = (staffEntityId: string) =>
    checkins.find(c => c.staff_entity_id === staffEntityId && !c.checked_out_at);

  const commit = async (shift: Shift, pin?: string): Promise<CommitResult> => {
    const open = openCheckinFor(shift.staff_entity_id);
    setActingId(shift.id);
    const res = await fetch("/api/kiosk/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(open
        ? { action: "check_out", staff_entity_id: shift.staff_entity_id, pin, kioskAccountId }
        : { action: "check_in", staff_entity_id: shift.staff_entity_id, roster_shift_id: shift.id, pin, kioskAccountId }),
    });
    const data = await res.json().catch(() => null);
    setActingId(null);
    if (res.ok && data?.checkin) {
      setCheckins(prev => open
        ? prev.map(c => c.id === data.checkin.id ? data.checkin : c)
        : [...prev, data.checkin]);
      return { ok: true };
    }
    return { ok: false, error: data?.error || "Something went wrong" };
  };

  const handleTap = useCallback((shift: Shift) => {
    const member = staff.find(s => s.id === shift.staff_entity_id);
    if (member?.hasPin) { setPinTarget(shift); return; }
    commit(shift);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, checkins]);

  const handleScanned = useCallback((staffEntityId: string) => {
    setScanning(false);
    const shift = shifts.find(s => s.staff_entity_id === staffEntityId);
    if (!shift) return; // not rostered today -- nothing to check in against
    handleTap(shift);
  }, [shifts, handleTap]);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={18} className="animate-spin text-slate-300" /></div>;
  }

  return (
    <div className="space-y-2.5">
      <button
        onClick={() => setScanning(true)}
        className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-[24px] border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors text-[12px] font-bold"
      >
        <ScanLine size={16} /> Scan check-in QR code
      </button>

      {shifts.length === 0 ? (
        <p className="text-center text-[12px] text-slate-300 italic py-12">No one is rostered on today.</p>
      ) : (
        shifts.map(shift => {
          const member = staff.find(s => s.id === shift.staff_entity_id);
          const open = openCheckinFor(shift.staff_entity_id);
          const acting = actingId === shift.id;
          return (
            <button
              key={shift.id}
              onClick={() => handleTap(shift)}
              disabled={acting}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-[24px] border text-left transition-colors active:scale-[0.99] disabled:opacity-60 ${
                open ? "bg-emerald-50 border-emerald-300" : "bg-white border-slate-200"
              }`}
            >
              {acting ? (
                <Loader2 size={20} className="animate-spin text-slate-300 shrink-0" />
              ) : open ? (
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
              ) : (
                <Circle size={22} className="text-slate-300 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-slate-800 truncate">{member?.name || "Unknown"}</p>
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock size={10} /> {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}{shift.role_note ? ` · ${shift.role_note}` : ""}
                </p>
              </div>
              <span className={`text-[11px] font-bold shrink-0 ${open ? "text-emerald-700" : "text-slate-400"}`}>
                {open ? `Checked in ${fmtTime(open.checked_in_at)} · Tap to check out` : member?.hasPin ? "Tap to enter PIN" : "Tap to check in"}
              </span>
            </button>
          );
        })
      )}

      {pinTarget && (
        <PinPadModal
          name={staff.find(s => s.id === pinTarget.staff_entity_id)?.name || "Staff member"}
          checkingOut={!!openCheckinFor(pinTarget.staff_entity_id)}
          onCancel={() => setPinTarget(null)}
          onSubmit={async pin => {
            const result = await commit(pinTarget, pin);
            if (result.ok) setPinTarget(null);
            return result;
          }}
        />
      )}

      {scanning && <QrScanModal onCancel={() => setScanning(false)} onDetect={handleScanned} />}
    </div>
  );
}

function PinPadModal({ name, checkingOut, onCancel, onSubmit }: {
  name: string;
  checkingOut: boolean;
  onCancel: () => void;
  onSubmit: (pin: string) => Promise<CommitResult>;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = (digit: string) => {
    if (busy || pin.length >= 6) return;
    setError(null);
    setPin(prev => prev + digit);
  };
  const backspace = () => { if (!busy) { setError(null); setPin(prev => prev.slice(0, -1)); } };
  const submit = async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    const result = await onSubmit(pin);
    setBusy(false);
    if (!result.ok) { setError(result.error); setPin(""); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-white rounded-[32px] p-8 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[15px] font-bold text-slate-800">{name}</p>
          <button onClick={onCancel} className="p-1.5 text-slate-300 hover:text-slate-500"><X size={18} /></button>
        </div>
        <p className="text-[11px] text-slate-400 mb-5">Enter your PIN to {checkingOut ? "check out" : "check in"}</p>

        <div className="flex items-center justify-center gap-3 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`w-3.5 h-3.5 rounded-full border-2 ${i < pin.length ? "bg-slate-800 border-slate-800" : "border-slate-200"}`} />
          ))}
        </div>
        {error && <p className="text-center text-[12px] text-red-500 mb-4">{error}</p>}

        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
            <button key={d} onClick={() => press(d)} disabled={busy}
              className="py-4 rounded-2xl bg-slate-50 hover:bg-slate-100 text-[18px] font-bold text-slate-700 transition-colors disabled:opacity-40">
              {d}
            </button>
          ))}
          <button onClick={backspace} disabled={busy}
            className="py-4 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center disabled:opacity-40">
            <Delete size={18} />
          </button>
          <button onClick={() => press("0")} disabled={busy}
            className="py-4 rounded-2xl bg-slate-50 hover:bg-slate-100 text-[18px] font-bold text-slate-700 transition-colors disabled:opacity-40">
            0
          </button>
          <button onClick={submit} disabled={busy || pin.length < 4}
            className="py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center disabled:opacity-30 transition-colors">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function QrScanModal({ onCancel, onDetect }: { onCancel: () => void; onDetect: (staffEntityId: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    function tick() {
      if (doneRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          const staffEntityId = code ? parseCheckinQrPayload(code.data) : null;
          if (staffEntityId) {
            doneRef.current = true;
            onDetect(staffEntityId);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch {
        setError("Couldn't access the camera. Check this browser's camera permission for the site.");
      }
    })();

    return () => {
      cancelled = true;
      doneRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [onDetect]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
      <div className="bg-white rounded-[32px] p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-bold text-slate-800">Scan check-in QR code</p>
          <button onClick={onCancel} className="p-1.5 text-slate-300 hover:text-slate-500"><X size={18} /></button>
        </div>
        {error ? (
          <p className="text-[12px] text-red-500 py-8 text-center">{error}</p>
        ) : (
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-8 border-2 border-white/70 rounded-2xl pointer-events-none" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

// app/dashboard/virtual-computers/[id]/page.tsx
// Full-screen session view. The API layer (app/api/virtual-computers/[id]/*)
// guards that only the assigned member or an admin can reach this VM.
//
// Disconnect detection is entirely passive here -- there's no "explicit
// logoff" action tied to leaving this page (that coupling used to live on
// the back button plus an app-wide navigation guard, but it made leaving
// the page feel fiddly and could get stuck asking to "log off" a VM that
// was already mid-hibernate). Just bump last_seen_at while the tab is open
// and let the sweep route's own inactivity rule (see
// app/api/virtual-computers/sweep/route.ts) decide, whenever this page
// happens to be closed.
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import GuacamoleViewer from "@/components/virtualcomputers/GuacamoleViewer";
import VmStatusBadge from "@/components/virtualcomputers/VmStatusBadge";

interface VmStatus {
  id: string;
  status: string;
  errorMessage: string | null;
  os: "linux" | "windows";
  provider: string;
  createdAt: string;
  hibernateDeadline: string | null;
  resolutionWidth: number | null;
  resolutionHeight: number | null;
}

// "Ultra-wide" is an honest single wide desktop, not real multi-monitor --
// Guacamole's RDP support doesn't have confirmed multi-monitor capability.
const RESOLUTION_PRESETS: { label: string; width: number | null; height: number | null }[] = [
  { label: "Match my screen", width: null, height: null },
  { label: "1920 x 1080", width: 1920, height: 1080 },
  { label: "2560 x 1440", width: 2560, height: 1440 },
  { label: "3840 x 1080 (ultra-wide)", width: 3840, height: 1080 },
];

function elapsedLabel(createdAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;
const EXTEND_PROMPT_LEAD_MS = 15 * 60 * 1000;

export default function VirtualComputerSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<VmStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showExtendPrompt, setShowExtendPrompt] = useState(false);
  const wakeRequested = useRef(false);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/virtual-computers/${id}/status`);
    if (!res.ok) {
      router.replace("/dashboard/virtual-computers");
      return;
    }
    const json = await res.json();
    setStatus(json);
  }, [id, router]);

  useEffect(() => {
    poll();
  }, [poll]);

  const isWaiting = status?.status === "provisioning" || status?.status === "snapshotting" || status?.status === "hibernated";

  useEffect(() => {
    if (!isWaiting) return;
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [isWaiting, poll]);

  useEffect(() => {
    if (!isWaiting) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isWaiting]);

  // Auto-wake: arriving at a hibernated VM (outside the schedule's
  // pre-warmed window) still gets a working experience, just without the
  // head start -- kick off wake once, then poll like any other
  // provisioning wait.
  useEffect(() => {
    if (status?.status !== "hibernated" || wakeRequested.current) return;
    wakeRequested.current = true;
    fetch(`/api/virtual-computers/${id}/wake`, { method: "POST" }).finally(poll);
  }, [status, id, poll]);

  // Deliberately coarse (every 30 min), just bumps last_seen_at. Runs any
  // time the tab is open with the VM running -- whether that staleness
  // actually matters (and how stale is stale enough) is entirely decided
  // server-side by the sweep route's inactivity rule.
  useEffect(() => {
    if (status?.status !== "running") return;
    const interval = setInterval(() => {
      fetch(`/api/virtual-computers/${id}/heartbeat`, { method: "POST" });
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, id]);

  // Midnight backstop extend prompt.
  useEffect(() => {
    if (status?.status !== "running" || !status.hibernateDeadline) {
      setShowExtendPrompt(false);
      return;
    }
    const msUntilDeadline = new Date(status.hibernateDeadline).getTime() - now;
    setShowExtendPrompt(msUntilDeadline <= EXTEND_PROMPT_LEAD_MS);
  }, [status, now]);

  useEffect(() => {
    if (status?.status !== "running") return;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [status]);

  const extendSession = async () => {
    await fetch(`/api/virtual-computers/${id}/extend`, { method: "POST" });
    setShowExtendPrompt(false);
    poll();
  };

  const setResolution = async (width: number | null, height: number | null) => {
    await fetch(`/api/virtual-computers/${id}/resolution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ width, height }),
    });
    poll();
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 bg-white shrink-0">
        <button
          onClick={() => router.push("/dashboard/virtual-computers")}
          className="p-1.5 text-slate-400 hover:text-slate-700"
        >
          <ArrowLeft size={16} />
        </button>
        <p className="text-[13px] font-bold text-slate-800 flex-1">Virtual Computer</p>
        {status && (
          <select
            value={RESOLUTION_PRESETS.findIndex(
              (p) => p.width === status.resolutionWidth && p.height === status.resolutionHeight
            )}
            onChange={(e) => {
              const preset = RESOLUTION_PRESETS[Number(e.target.value)];
              setResolution(preset.width, preset.height);
            }}
            title="Display size (takes effect next connect)"
            className="px-2 py-1 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-400"
          >
            {RESOLUTION_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {status && <VmStatusBadge status={status.status} />}
      </div>

      {showExtendPrompt && (
        <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 text-amber-700 text-[12px] shrink-0">
          <p className="flex-1">Still working? This virtual computer is scheduled to log off soon.</p>
          <button onClick={extendSession} className="px-4 py-1.5 bg-amber-600 text-white rounded-full font-bold hover:bg-amber-700 transition-colors">
            Keep it running
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {!status ? null : status.status === "running" ? (
          <GuacamoleViewer vmId={id} />
        ) : status.status === "error" ? (
          <div className="flex items-center justify-center h-full text-[13px] text-red-600 bg-red-50 m-6 rounded-2xl p-6">
            {status.errorMessage || "Something went wrong provisioning this virtual computer."}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <Loader2 size={20} className="text-indigo-400 animate-spin" />
            <p className="text-[13px] text-slate-500 font-medium">
              {status.status === "hibernated"
                ? "Waking up your virtual computer..."
                : status.status === "snapshotting"
                ? "Saving a snapshot before shutting down..."
                : "Setting up your virtual computer..."}
              {status.createdAt && ` (${elapsedLabel(status.createdAt, now)})`}
            </p>
            <p className="text-[12px] text-slate-400 max-w-sm">
              {status.os === "windows" && status.provider === "digitalocean"
                ? "Installing Windows 11 from scratch -- this can take 75-90 minutes."
                : status.os === "windows"
                ? "Installing Windows and Microsoft Office -- this can take 10-15 minutes."
                : "This usually takes about a minute."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// components/precedents/PrecedentLibraryTopUp.tsx
// Shows how current a company's install is against today's seeded precedent
// library (see lib/precedents/installLibrary.ts) and lets an admin top it up
// in one click. Used in three places: Settings → Precedents, the matter-level
// Precedents tab, and (indirectly, via the same underlying install call) the
// template marketplace's install/upgrade flow -- this component is the one
// a firm sees day to day, since the marketplace is a one-off visit.
//
// Silent by design when there's nothing to say: renders null while loading,
// on a 403 (company isn't on the Law Firm template -- see hasLawFirmTemplate),
// or once the library is fully installed and the panel variant isn't forcing
// itself to stay visible. A banner nobody can act on is worse than no banner.
"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2 } from "lucide-react";

interface LibraryStatus {
  total: number;
  installed: number;
  available: number;
}

export default function PrecedentLibraryTopUp({
  isAdmin,
  variant = "banner",
  onInstalled,
  className = "",
}: {
  isAdmin: boolean;
  /** "panel": always visible once the company has the library, even at 0 available. "banner": only renders when there's something to install. */
  variant?: "panel" | "banner";
  onInstalled?: () => void;
  className?: string;
}) {
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [applicable, setApplicable] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/precedents/library/install");
    if (!res.ok) { setApplicable(false); return; }
    setStatus(await res.json());
    setApplicable(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const install = async () => {
    setInstalling(true);
    setError("");
    const res = await fetch("/api/precedents/library/install", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setInstalling(false);
    if (!res.ok) { setError(json.error || "Install failed"); return; }
    await load();
    onInstalled?.();
  };

  if (!applicable || !status) return null;
  if (variant === "banner" && status.available === 0) return null;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl ${className}`}>
      <Sparkles size={14} className="text-indigo-500 shrink-0" />
      <p className="flex-1 text-[11px] font-medium text-indigo-700">
        {status.available === 0
          ? `Precedent library up to date · ${status.installed} of ${status.total} installed`
          : `${status.installed} of ${status.total} library precedents installed · ${status.available} new available`}
      </p>
      {status.available > 0 && (
        isAdmin ? (
          <button
            onClick={install}
            disabled={installing}
            className="shrink-0 px-3.5 py-1.5 bg-indigo-600 text-white rounded-full text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5"
          >
            {installing ? <Loader2 size={11} className="animate-spin" /> : `Install ${status.available}`}
          </button>
        ) : (
          <span className="shrink-0 text-[10px] text-indigo-400">Ask an admin to install</span>
        )
      )}
      {error && <span className="shrink-0 text-[10px] text-red-500">{error}</span>}
    </div>
  );
}

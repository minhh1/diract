// components/FollowUpToggle.tsx
// Second "tick" — tracks follow-ups done on a task, distinct from full
// completion. A task can be followed up more than once (e.g. chasing the
// same person repeatedly), so this keeps a dated log with a running count
// rather than a single boolean + date. Click the flag to log a new
// follow-up, review past ones, or remove one logged by mistake.
"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Flag, X } from "lucide-react";

export interface FollowUpEntry {
  id: string;
  followedUpAt: string;
}

interface Props {
  entries: FollowUpEntry[];
  onAdd: (date: string) => void;
  onRemove: (id: string) => void;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function FollowUpToggle({ entries, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState(todayStr());
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const count = entries.length;
  const sorted = [...entries].sort((a, b) => b.followedUpAt.localeCompare(a.followedUpAt));

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Popover width is 272px; flip to the left of the button if it would
  // otherwise overflow the right edge of the viewport, and reposition on
  // scroll/resize since it's portaled to <body> (fixed positioning).
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const popoverWidth = 272;
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 8) {
        left = Math.max(8, rect.right - popoverWidth);
      }
      setPos({ top: rect.bottom + 8, left });
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const handleAdd = () => {
    onAdd(pendingDate || todayStr());
    setPendingDate(todayStr());
  };

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        title={count > 0 ? `Followed up ${count} time${count !== 1 ? "s" : ""} — click to manage` : "Log a follow-up"}
        className={`h-5 min-w-[20px] px-1 rounded-full border-2 shrink-0 flex items-center justify-center gap-0.5 transition-all ${
          count > 0 ? "bg-amber-400 border-amber-400" : "border-slate-300 hover:border-amber-400"
        }`}
      >
        <Flag size={10} className={count > 0 ? "text-white" : "text-slate-300"} />
        {count > 1 && <span className="text-[9px] font-bold text-white leading-none">{count}</span>}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-[9999] w-[272px] bg-white border border-slate-200 rounded-2xl shadow-lg p-4 space-y-3"
        >
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Followed up? ({count})
          </p>

          {sorted.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {sorted.map(entry => (
                <div key={entry.id} className="flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-full">
                  <span className="text-[12px] text-slate-600">
                    {new Date(entry.followedUpAt + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <button onClick={() => onRemove(entry.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-1 border-t border-slate-100">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Date followed up</p>
            <input
              type="date"
              value={pendingDate}
              onChange={e => setPendingDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-amber-400"
            />
            <button onClick={handleAdd}
              className="w-full py-2 bg-amber-500 text-white text-[11px] font-bold rounded-full hover:bg-amber-600 transition-colors">
              Log follow-up
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

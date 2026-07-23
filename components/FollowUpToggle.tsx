// components/FollowUpToggle.tsx
// Second "tick" — tracks follow-ups done on a task, distinct from full
// completion. A task can be followed up more than once (e.g. chasing the
// same person repeatedly), so this keeps a dated log with a running count
// rather than a single boolean + date. Click the flag to log a new
// follow-up, review past ones, or remove one logged by mistake.
"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Flag, X, Check } from "lucide-react";

export interface FollowUpEntry {
  id: string;
  followedUpAt: string;
  isDone: boolean;
}

interface Props {
  entries: FollowUpEntry[];
  onAdd: (date: string) => void;
  onRemove: (id: string) => void;
  onMarkDone: (id: string) => void;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function FollowUpToggle({ entries, onAdd, onRemove, onMarkDone }: Props) {
  const [open, setOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState(todayStr());
  const [pos, setPos] = useState<{ left: number; top: number | null; bottom: number | null; maxHeight: number }>({ left: 0, top: 0, bottom: null, maxHeight: 340 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const doneEntries = entries.filter(e => e.isDone);
  const scheduledEntries = entries.filter(e => !e.isDone);
  const count = doneEntries.length;
  const hasScheduled = scheduledEntries.length > 0;
  const sorted = [...entries].sort((a, b) => {
    if (a.isDone !== b.isDone) return a.isDone ? 1 : -1; // scheduled (not done) first
    return b.followedUpAt.localeCompare(a.followedUpAt);
  });
  const isFutureDate = pendingDate > todayStr();

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
  // otherwise overflow the right edge of the viewport. Vertically, pick
  // whichever side (above/below the button) has more room — and clamp the
  // popover's own max-height to whatever that side actually has, with
  // internal scrolling as the last-resort safety net — so it can never
  // render off-screen even when the task row is right at the edge of the
  // viewport. Repositions on scroll/resize since it's portaled to <body>
  // (fixed positioning).
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
      const gap = 8;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const minComfortable = 220; // enough for header + date field + button without scrolling
      const openBelow = spaceBelow >= minComfortable || spaceBelow >= spaceAbove;
      if (openBelow) {
        setPos({ left, top: rect.bottom + gap, bottom: null, maxHeight: Math.max(120, spaceBelow) });
      } else {
        setPos({ left, top: null, bottom: window.innerHeight - rect.top + gap, maxHeight: Math.max(120, spaceAbove) });
      }
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
        title={
          hasScheduled ? `${scheduledEntries.length} follow-up${scheduledEntries.length !== 1 ? "s" : ""} scheduled — click to manage`
          : count > 0 ? `Followed up ${count} time${count !== 1 ? "s" : ""} — click to manage`
          : "Log a follow-up"
        }
        className={`h-5 min-w-[20px] px-1 rounded-full border-2 shrink-0 flex items-center justify-center gap-0.5 transition-all ${
          hasScheduled ? "bg-sky-400 border-sky-400" : count > 0 ? "bg-amber-400 border-amber-400" : "border-slate-300 hover:border-amber-400"
        }`}
      >
        <Flag size={10} className={hasScheduled || count > 0 ? "text-white" : "text-slate-300"} />
        {(count > 1 || hasScheduled) && (
          <span className="text-[9px] font-bold text-white leading-none">{hasScheduled ? scheduledEntries.length : count}</span>
        )}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed", left: pos.left,
            top: pos.top ?? undefined, bottom: pos.bottom ?? undefined,
            maxHeight: pos.maxHeight, overflowY: "auto",
          }}
          className="z-[9999] w-[272px] bg-white border border-slate-200 rounded-2xl shadow-lg p-4 space-y-3"
        >
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Follow-ups {hasScheduled ? `(${count} done, ${scheduledEntries.length} scheduled)` : `(${count})`}
          </p>

          {sorted.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {sorted.map(entry => (
                <div key={entry.id} className={`flex items-center justify-between px-3 py-1.5 rounded-full ${entry.isDone ? "bg-slate-50" : "bg-sky-50"}`}>
                  <span className={`text-[12px] ${entry.isDone ? "text-slate-600" : "text-sky-700 font-medium"}`}>
                    {entry.isDone ? "" : "📅 "}
                    {new Date(entry.followedUpAt + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    {!entry.isDone && " · scheduled"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {!entry.isDone && (
                      <button onClick={() => onMarkDone(entry.id)} title="Mark as followed up" className="text-sky-400 hover:text-emerald-500 transition-colors">
                        <Check size={13} />
                      </button>
                    )}
                    <button onClick={() => onRemove(entry.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-1 border-t border-slate-100">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              {isFutureDate ? "Schedule for" : "Date followed up"}
            </p>
            <input
              type="date"
              value={pendingDate}
              onChange={e => setPendingDate(e.target.value)}
              className={`w-full px-3 py-2 border rounded-full text-[12px] outline-none ${isFutureDate ? "border-sky-200 focus:border-sky-400" : "border-slate-200 focus:border-amber-400"}`}
            />
            {isFutureDate && (
              <p className="text-[10px] text-sky-600 leading-snug">Future date — this also moves the task's due date here.</p>
            )}
            <button onClick={handleAdd}
              className={`w-full py-2 text-white text-[11px] font-bold rounded-full transition-colors ${isFutureDate ? "bg-sky-500 hover:bg-sky-600" : "bg-amber-500 hover:bg-amber-600"}`}>
              {isFutureDate ? "Schedule follow-up" : "Log follow-up"}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

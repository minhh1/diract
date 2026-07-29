// components/NotificationBell.tsx
// Rail icon + dropdown, mounted in Sidebar.tsx's account cluster (bottom
// left, next to the profile avatar). Mirrors that file's own
// company-switcher dropdown idiom exactly (self-contained open/close state,
// a wrapper that stops click propagation so clicks inside the panel don't
// self-close it, and an unconditional document click listener that closes
// it otherwise) rather than depending on any of Sidebar's own state, since
// this needed to be a standalone component.
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useNotifications, type AppNotification } from "@/lib/hooks/useNotifications";
import { useProgressBar } from "@/components/TopProgressBar";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell() {
  const { userId } = useCompany();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(userId);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { startNavigation } = useProgressBar();

  useEffect(() => {
    if (!open) return;
    const handleClick = () => setOpen(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  const handleSelect = (n: AppNotification) => {
    if (!n.read_at) markRead(n.id);
    setOpen(false);
    if (n.link_url) { startNavigation(); router.push(n.link_url); }
  };

  if (!userId) return null;

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(p => !p)}
        title="Notifications"
        aria-label="Notifications"
        className="relative w-10 h-10 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-all"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-0 left-full ml-2 w-80 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <p className="text-[12px] font-bold text-slate-900">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-5 py-8 text-center text-[11px] text-slate-300 font-bold uppercase tracking-widest">No notifications</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleSelect(n)}
                  className={`w-full flex items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50 ${!n.read_at ? "bg-indigo-50/40" : ""}`}
                >
                  {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-indigo-600 shrink-0" />}
                  <div className={`flex-1 min-w-0 ${n.read_at ? "pl-[18px]" : ""}`}>
                    <p className="text-[12px] font-medium text-slate-900 truncate">{n.title}</p>
                    {n.body && <p className="text-[11px] text-slate-400 truncate">{n.body}</p>}
                    <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="block px-5 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-100 hover:bg-slate-50 hover:text-slate-700 transition-colors"
          >
            See all
          </Link>
        </div>
      )}
    </div>
  );
}

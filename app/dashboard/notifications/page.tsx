"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { supabase } from "@/lib/supabase";
import { useProgressBar, useProgressBarWhile } from "@/components/TopProgressBar";

const PAGE_SIZE = 30;

interface NotificationRow {
  id: string;
  event_type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}

async function fetchNotifications(userId: string, page: number): Promise<NotificationRow[]> {
  const from = page * PAGE_SIZE;
  const { data } = await supabase
    .from("notifications")
    .select("id, event_type, title, body, link_url, read_at, created_at")
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  return (data || []) as NotificationRow[];
}

export default function NotificationsPage() {
  const { userId } = useCompany();
  const [page, setPage] = useState(0);
  const router = useRouter();
  const { startNavigation } = useProgressBar();
  const queryClient = useQueryClient();

  const queryKey = ["notifications-history", userId, page] as const;
  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchNotifications(userId as string, page),
    enabled: !!userId,
  });

  useProgressBarWhile(isLoading);

  const markRead = async (id: string) => {
    queryClient.setQueryData(queryKey, (old: NotificationRow[] = []) =>
      old.map(n => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n))
    );
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  };

  const handleSelect = (n: NotificationRow) => {
    if (!n.read_at) markRead(n.id);
    if (n.link_url) { startNavigation(); router.push(n.link_url); }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white p-8 border-b border-slate-100 shrink-0 flex items-center gap-6">
        <Link href="/dashboard" className="p-2 hover:bg-slate-50 rounded-full transition-all text-slate-400">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-light text-slate-900 tracking-tight">Notifications</h1>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest mt-1">Everything sent to you</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-3xl mx-auto space-y-3 pb-20">
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => <div key={i} className="h-[76px] bg-white border border-slate-200 rounded-[32px] animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-20">
              {page === 0 ? "No notifications yet" : "No more notifications"}
            </p>
          ) : (
            items.map(n => (
              <button
                key={n.id}
                onClick={() => handleSelect(n)}
                className={`w-full flex items-start gap-4 text-left p-6 bg-white border rounded-[32px] shadow-sm transition-all hover:border-indigo-300 ${!n.read_at ? "border-indigo-200" : "border-slate-200"}`}
              >
                {!n.read_at && <span className="mt-2 h-2 w-2 rounded-full bg-indigo-600 shrink-0" />}
                <div className={`flex-1 min-w-0 ${n.read_at ? "pl-[16px]" : ""}`}>
                  <p className="text-[15px] font-medium text-slate-900">{n.title}</p>
                  {n.body && <p className="text-[13px] text-slate-500 mt-0.5">{n.body}</p>}
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                    {new Date(n.created_at).toLocaleString("en-AU")}
                  </p>
                </div>
              </button>
            ))
          )}

          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 text-[11px] font-bold text-slate-500 disabled:opacity-30 disabled:cursor-default hover:text-slate-900 transition-colors"
            >
              Newer
            </button>
            <span className="text-[11px] text-slate-400">Page {page + 1}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={items.length < PAGE_SIZE}
              className="px-4 py-2 text-[11px] font-bold text-slate-500 disabled:opacity-30 disabled:cursor-default hover:text-slate-900 transition-colors"
            >
              Older
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, X } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { supabase } from "@/lib/supabase";
import { useProgressBar, useProgressBarWhile } from "@/components/TopProgressBar";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/eventTypes";

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

type ReadFilter = "all" | "unread" | "read";
type SortOrder = "newest" | "oldest";

interface NotificationFilters {
  search: string;
  eventType: string; // "all" or a NOTIFICATION_EVENT_TYPES key
  read: ReadFilter;
  sort: SortOrder;
}

const DEFAULT_FILTERS: NotificationFilters = { search: "", eventType: "all", read: "all", sort: "newest" };

const EVENT_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  NOTIFICATION_EVENT_TYPES.map(e => [e.key, e.label])
);

async function fetchNotifications(userId: string, page: number, filters: NotificationFilters): Promise<NotificationRow[]> {
  let query = supabase
    .from("notifications")
    .select("id, event_type, title, body, link_url, read_at, created_at")
    .eq("recipient_user_id", userId);

  const term = filters.search.trim().replace(/[,()%]/g, "");
  if (term) query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
  if (filters.eventType !== "all") query = query.eq("event_type", filters.eventType);
  if (filters.read === "unread") query = query.is("read_at", null);
  if (filters.read === "read") query = query.not("read_at", "is", null);

  const from = page * PAGE_SIZE;
  const { data } = await query
    .order("created_at", { ascending: filters.sort === "oldest" })
    .range(from, from + PAGE_SIZE - 1);
  return (data || []) as NotificationRow[];
}

export default function NotificationsPage() {
  const { userId } = useCompany();
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<NotificationFilters>(DEFAULT_FILTERS);
  // Debounced separately from the input's own state so every keystroke
  // doesn't fire a query -- searchInput updates instantly (the input stays
  // responsive), filters.search (what the query actually uses) only
  // catches up 300ms after typing stops.
  const [searchInput, setSearchInput] = useState("");
  const router = useRouter();
  const { startNavigation } = useProgressBar();
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setFilters(f => ({ ...f, search: searchInput })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change starts back at page 0 -- a stale page number from a
  // previous, differently-filtered result set makes no sense to keep.
  const setFilter = <K extends keyof NotificationFilters>(key: K, value: NotificationFilters[K]) => {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(0);
  };

  const queryKey = ["notifications-history", userId, page, filters] as const;
  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchNotifications(userId as string, page, filters),
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

  const hasActiveFilters = filters.search || filters.eventType !== "all" || filters.read !== "all";
  const clearFilters = () => { setSearchInput(""); setFilters(DEFAULT_FILTERS); setPage(0); };

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
        <div className="max-w-3xl mx-auto space-y-4 pb-20">

          {/* ── Search + filters ── */}
          <div className="bg-white border border-slate-200 rounded-[32px] p-5 space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search title or body..."
                className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-[13px] text-slate-900 outline-none focus:border-indigo-400 transition-colors"
              />
              {searchInput && (
                <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-600 transition-colors">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filters.eventType}
                onChange={e => setFilter("eventType", e.target.value)}
                className="px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-medium text-slate-700 outline-none focus:border-indigo-400 transition-colors cursor-pointer"
              >
                <option value="all">All events</option>
                {NOTIFICATION_EVENT_TYPES.map(e => (
                  <option key={e.key} value={e.key}>{e.label}</option>
                ))}
              </select>

              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-full p-0.5">
                {(["all", "unread", "read"] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setFilter("read", opt)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize transition-colors ${
                      filters.read === opt ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-full p-0.5">
                {([{ v: "newest", l: "Newest" }, { v: "oldest", l: "Oldest" }] as const).map(opt => (
                  <button
                    key={opt.v}
                    onClick={() => setFilter("sort", opt.v)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                      filters.sort === opt.v ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>

              {hasActiveFilters && (
                <button onClick={clearFilters} className="px-3 py-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => <div key={i} className="h-[76px] bg-white border border-slate-200 rounded-[32px] animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-20">
              {hasActiveFilters ? "No notifications match these filters" : page === 0 ? "No notifications yet" : "No more notifications"}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[15px] font-medium text-slate-900">{n.title}</p>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 shrink-0">
                      {EVENT_LABEL_BY_KEY[n.event_type] || n.event_type}
                    </span>
                  </div>
                  {/* Full body, never truncated -- several event types (e.g.
                      gmail_sync_failure) carry the actual technical error as
                      their body, which is diagnostic detail an admin needs
                      in full, not a preview snippet. */}
                  {n.body && <p className="text-[13px] text-slate-500 mt-1 whitespace-pre-wrap break-words">{n.body}</p>}
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

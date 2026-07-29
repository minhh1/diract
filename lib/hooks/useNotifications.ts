// lib/hooks/useNotifications.ts
// Recent notifications + unread count for the bell dropdown
// (components/NotificationBell.tsx), kept live via useTableRealtime scoped
// to recipient_user_id instead of its usual company_id (see that hook's own
// comment for why this needed a filterColumn/filterValue override).
"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTableRealtime } from "./useTableRealtime";

export interface AppNotification {
  id: string;
  event_type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}

const RECENT_LIMIT = 10;

async function fetchUnreadCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { head: true, count: "exact" })
    .eq("recipient_user_id", userId)
    .is("read_at", null);
  return count || 0;
}

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setNotifications([]); setUnreadCount(0); setLoading(false); return; }
    setLoading(true);
    const [{ data: recent }, count] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, event_type, title, body, link_url, read_at, created_at")
        .eq("recipient_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
      fetchUnreadCount(userId),
    ]);
    setNotifications((recent || []) as AppNotification[]);
    setUnreadCount(count);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useTableRealtime({
    tableName: "notifications",
    companyId: null,
    filterColumn: "recipient_user_id",
    filterValue: userId,
    onInsert: (row) => {
      setNotifications(prev => [row as AppNotification, ...prev].slice(0, RECENT_LIMIT));
      setUnreadCount(prev => prev + 1);
    },
    onUpdate: (row) => {
      setNotifications(prev => prev.map(n => (n.id === row.id ? { ...n, ...row } as AppNotification : n)));
      // A realtime UPDATE patch doesn't tell us the previous read_at, so a
      // naive +/-1 on the count could drift (e.g. two tabs marking the same
      // notification read) -- a cheap re-count stays correct instead.
      if (userId) fetchUnreadCount(userId).then(setUnreadCount);
    },
    onDelete: () => {},
  });

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n)));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || now })));
    setUnreadCount(0);
    await supabase.from("notifications").update({ read_at: now }).eq("recipient_user_id", userId).is("read_at", null);
  }, [userId]);

  return { notifications, unreadCount, loading, markRead, markAllRead, refresh: load };
}

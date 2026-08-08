// lib/hooks/useMessagingChannels.ts
// The channel/DM list for the sidebar + the rail unread badge -- needed
// synchronously on nav-rail mount across the whole app (not just
// /dashboard/messaging), same "avoid a loading flash on every page" concern
// that motivated useCustomTables.ts's warm-cache tier, so this follows that
// same shape (module cache + shell cache) rather than useNotifications.ts's
// simpler per-page tier.
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { useIsomorphicLayoutEffect } from "@/lib/hooks/useIsomorphicLayoutEffect";
import { useTableRealtime } from "@/lib/hooks/useTableRealtime";
import type { Channel } from "@/lib/services/messaging";

export interface ChannelListItem extends Channel {
  is_member: boolean;
  last_read_at: string | null;
  last_message_at: string | null;
  unread: boolean;
  // Only set for type='dm' -- the other participant's user id, resolved once
  // here so ChannelSidebar/MessagingBell can render a real name instead of
  // "Direct message" without each doing their own channel_members lookup.
  dm_other_user_id: string | null;
}

const CACHE_TTL_MS = 30_000; // shorter than useCustomTables' 60s -- message activity is far more time-sensitive than schema
let cachedItems: ChannelListItem[] | null = null;
let cachedForUserId: string | null = null;
let cacheExpiresAt = 0;
let inFlight: Promise<ChannelListItem[]> | null = null;

function isCacheWarm(userId: string | null): boolean {
  return cachedItems !== null && cachedForUserId === userId && cacheExpiresAt > Date.now();
}

const shellKey = (userId: string) => `messaging-channels:${userId}`;

// Recent-messages-reduced-to-latest-per-channel, not a real "max per group"
// aggregate query -- fine at this feature's current message volume (a
// LIMIT high enough to cover "at least one message per active channel"),
// and realtime keeps it fresh after this initial seed. Worth replacing
// with a proper view/RPC if message volume grows enough that this LIMIT
// stops reliably covering every active channel.
const RECENT_MESSAGES_SEED_LIMIT = 500;

async function fetchChannelList(companyId: string, userId: string): Promise<ChannelListItem[]> {
  if (inFlight) return inFlight;
  const promise = (async () => {
    const [{ data: channels }, { data: memberships }, { data: recentMessages }] = await Promise.all([
      supabase.from("channels").select("*").eq("company_id", companyId).is("deleted_at", null).order("created_at"),
      supabase.from("channel_members").select("channel_id, last_read_at").eq("user_id", userId),
      supabase
        .from("messages")
        .select("channel_id, created_at")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(RECENT_MESSAGES_SEED_LIMIT),
    ]);

    const membershipByChannel = new Map((memberships ?? []).map((m) => [m.channel_id, m.last_read_at as string]));
    const lastMessageByChannel = new Map<string, string>();
    for (const m of recentMessages ?? []) {
      if (!lastMessageByChannel.has(m.channel_id)) lastMessageByChannel.set(m.channel_id, m.created_at as string);
    }

    // Resolve "the other participant" for every DM this user is in --
    // channel_members only tells us pairs (channel_id, user_id), so one
    // extra query across every DM channel id, reduced client-side.
    const dmChannelIds = (channels ?? []).filter((c) => c.type === "dm").map((c) => c.id);
    const dmOtherUserByChannel = new Map<string, string>();
    if (dmChannelIds.length) {
      const { data: dmMembers } = await supabase.from("channel_members").select("channel_id, user_id").in("channel_id", dmChannelIds);
      for (const row of dmMembers ?? []) {
        if (row.user_id !== userId) dmOtherUserByChannel.set(row.channel_id, row.user_id);
      }
    }

    const items: ChannelListItem[] = (channels ?? []).map((c) => {
      const lastReadAt = membershipByChannel.get(c.id) ?? null;
      const lastMessageAt = lastMessageByChannel.get(c.id) ?? null;
      return {
        ...(c as Channel),
        is_member: membershipByChannel.has(c.id),
        last_read_at: lastReadAt,
        last_message_at: lastMessageAt,
        unread: !!lastMessageAt && (!lastReadAt || new Date(lastMessageAt) > new Date(lastReadAt)),
        dm_other_user_id: dmOtherUserByChannel.get(c.id) ?? null,
      };
    });

    cachedItems = items;
    cachedForUserId = userId;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    inFlight = null;
    writeShellCache(shellKey(userId), items);
    return items;
  })();
  inFlight = promise;
  return promise;
}

export function invalidateMessagingChannels(): void {
  cachedItems = null;
  cacheExpiresAt = 0;
  inFlight = null;
}

export function useMessagingChannels(companyId: string | null, userId: string | null) {
  const [items, setItems] = useState<ChannelListItem[]>(() => (userId && isCacheWarm(userId)) ? cachedItems! : []);
  const [loading, setLoading] = useState<boolean>(() => !(userId && isCacheWarm(userId)));
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useIsomorphicLayoutEffect(() => {
    if (!userId || isCacheWarm(userId)) return;
    const cached = readShellCache<ChannelListItem[]>(shellKey(userId));
    if (cached) {
      setItems(cached);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const load = useCallback(async () => {
    if (!companyId || !userId) { setItems([]); setLoading(false); return; }
    if (isCacheWarm(userId)) {
      setItems(cachedItems!);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchChannelList(companyId, userId);
    setItems(result);
    setLoading(false);
  }, [companyId, userId]);

  useEffect(() => { load(); }, [load]);

  // Company-wide messages subscription -- bumps last_message_at/unread for
  // whichever channel a new message landed in, without opening every
  // channel's own subscription. The currently-open channel (if any) is
  // marked read separately by the caller via markChannelRead, which should
  // also patch this hook's local state (see useChannelMessages' own
  // markRead wiring) so a message in the channel you're actively viewing
  // doesn't show as unread just because this subscription fired first.
  useTableRealtime({
    tableName: "messages",
    companyId,
    onInsert: (row) => {
      setItems((prev) =>
        prev.map((c) =>
          c.id === row.channel_id
            ? { ...c, last_message_at: row.created_at, unread: row.user_id !== userId ? true : c.unread }
            : c
        )
      );
    },
    onUpdate: () => {},
    onDelete: () => {},
  });

  // New/renamed/archived channels
  useTableRealtime({
    tableName: "channels",
    companyId,
    onInsert: (row) => {
      // dm_other_user_id isn't resolvable from this row alone -- fine here
      // since the client that creates a DM already has the new channel id
      // from findOrCreateDm's own return value and navigates directly to
      // it; this realtime path only needs to make OTHER channels the
      // company creates show up in the list, where the name is what matters.
      setItems((prev) => [
        ...prev,
        { ...(row as Channel), is_member: row.created_by === userId, last_read_at: null, last_message_at: null, unread: false, dm_other_user_id: null },
      ]);
    },
    onUpdate: (row) => {
      setItems((prev) => (row.deleted_at ? prev.filter((c) => c.id !== row.id) : prev.map((c) => (c.id === row.id ? { ...c, ...row } : c))));
    },
    onDelete: (id) => setItems((prev) => prev.filter((c) => c.id !== id)),
  });

  const markChannelReadLocally = useCallback((channelId: string) => {
    setItems((prev) => prev.map((c) => (c.id === channelId ? { ...c, unread: false, last_read_at: new Date().toISOString() } : c)));
  }, []);

  const unreadChannelCount = items.filter((c) => c.unread).length;

  return { channels: items, loading, unreadChannelCount, markChannelReadLocally, refetch: load };
}

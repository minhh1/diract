// lib/hooks/useChannelMessages.ts
// Live message feed for whichever channel/DM is currently open, plus a
// sibling hook for an open thread's replies. Simple tier (mirrors
// useNotifications.ts) -- realtime-driven, no warm-cache layer, since a
// channel's messages only matter while that channel is actually open.
"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTableRealtime } from "@/lib/hooks/useTableRealtime";
import type { Message } from "@/lib/services/messaging";

export interface MessageReaction {
  id: string;
  message_id: string;
  emoji: string;
  user_id: string;
}

export interface MessageWithMeta extends Message {
  reactions: MessageReaction[];
  reply_count: number;
}

// No "load more" yet -- most recent N top-level messages per channel. A
// real cursor-paginated history view is a fast-follow once a channel
// actually accumulates enough volume to need it.
const MESSAGE_FETCH_LIMIT = 200;

function attachReactions(messages: Message[], reactions: MessageReaction[], replyCounts: Map<string, number>): MessageWithMeta[] {
  const reactionsByMessage = new Map<string, MessageReaction[]>();
  for (const r of reactions) {
    const list = reactionsByMessage.get(r.message_id) ?? [];
    list.push(r);
    reactionsByMessage.set(r.message_id, list);
  }
  return messages.map((m) => ({
    ...m,
    reactions: reactionsByMessage.get(m.id) ?? [],
    reply_count: replyCounts.get(m.id) ?? 0,
  }));
}

export function useChannelMessages(channelId: string | null) {
  const [messages, setMessages] = useState<MessageWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!channelId) { setMessages([]); setLoading(false); return; }
    setLoading(true);
    const [{ data: msgs }, { data: reactions }, { data: replies }] = await Promise.all([
      supabase
        .from("messages")
        .select("*")
        .eq("channel_id", channelId)
        .is("parent_message_id", null)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_FETCH_LIMIT),
      supabase.from("message_reactions").select("id, message_id, emoji, user_id").eq("channel_id", channelId),
      supabase.from("messages").select("parent_message_id").eq("channel_id", channelId).not("parent_message_id", "is", null),
    ]);

    const replyCounts = new Map<string, number>();
    for (const r of replies ?? []) {
      const key = r.parent_message_id as string;
      replyCounts.set(key, (replyCounts.get(key) ?? 0) + 1);
    }

    // Oldest first for a chat feed -- fetched newest-first (so LIMIT keeps
    // the most recent N, not the oldest N), reversed for display.
    const ordered = [...(msgs ?? [])].reverse() as Message[];
    setMessages(attachReactions(ordered, (reactions ?? []) as MessageReaction[], replyCounts));
    setLoading(false);
  }, [channelId]);

  useEffect(() => { load(); }, [load]);

  useTableRealtime({
    tableName: "messages",
    companyId: null,
    filterColumn: "channel_id",
    filterValue: channelId,
    onInsert: (row) => {
      const message = row as unknown as Message;
      if (message.parent_message_id) {
        // A reply landed -- bump its parent's reply_count in the main feed
        // rather than adding it as a top-level row.
        setMessages((prev) => prev.map((m) => (m.id === message.parent_message_id ? { ...m, reply_count: m.reply_count + 1 } : m)));
        return;
      }
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, { ...message, reactions: [], reply_count: 0 }]));
    },
    onUpdate: (row) => {
      setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...(row as Message) } : m)));
    },
    onDelete: () => {}, // messages are soft-deleted via UPDATE, not a real DELETE
  });

  useTableRealtime({
    tableName: "message_reactions",
    companyId: null,
    filterColumn: "channel_id",
    filterValue: channelId,
    onInsert: (row) => {
      const reaction = row as unknown as MessageReaction;
      setMessages((prev) =>
        prev.map((m) => (m.id === reaction.message_id ? { ...m, reactions: [...m.reactions, reaction] } : m))
      );
    },
    onUpdate: () => {},
    onDelete: (id) => {
      setMessages((prev) => prev.map((m) => ({ ...m, reactions: m.reactions.filter((r) => r.id !== id) })));
    },
  });

  return { messages, loading, refetch: load };
}

// A single open thread's replies -- separate hook since it's filtered by
// parent_message_id, a different column than the channel feed above (and
// useTableRealtime only supports one filter column at a time).
export function useThreadReplies(parentMessageId: string | null) {
  const [replies, setReplies] = useState<MessageWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!parentMessageId) { setReplies([]); setLoading(false); return; }
    setLoading(true);
    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("parent_message_id", parentMessageId)
      .order("created_at", { ascending: true });

    // Reactions on replies are fetched separately since they depend on
    // which reply ids came back above.
    const messageIds = (msgs ?? []).map((m) => m.id);
    const { data: reactionRows } = messageIds.length
      ? await supabase.from("message_reactions").select("id, message_id, emoji, user_id").in("message_id", messageIds)
      : { data: [] as MessageReaction[] };

    setReplies(attachReactions((msgs ?? []) as Message[], (reactionRows ?? []) as MessageReaction[], new Map()));
    setLoading(false);
  }, [parentMessageId]);

  useEffect(() => { load(); }, [load]);

  useTableRealtime({
    tableName: "messages",
    companyId: null,
    filterColumn: "parent_message_id",
    filterValue: parentMessageId,
    onInsert: (row) => {
      const message = row as unknown as Message;
      setReplies((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, { ...message, reactions: [], reply_count: 0 }]));
    },
    onUpdate: (row) => {
      setReplies((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...(row as Message) } : m)));
    },
    onDelete: () => {},
  });

  return { replies, loading, refetch: load };
}

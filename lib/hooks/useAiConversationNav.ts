"use client";

// Shared "which conversation is open, and the New/Open/Rename/Delete
// handlers for it" state -- previously duplicated near-verbatim between
// app/(app)/dashboard/ai/page.tsx and AiAssistantWidget.tsx (the two
// surfaces embedding AiChatThread against a conversation list). Extracted
// once both needed the exact same full sidebar (see AiConversationSidebar.tsx),
// not just visually similar -- keeping the mid-turn-remount and stale-open
// fixes below (both found live, see their own comments) in one place means
// a future third surface can't reintroduce either bug by copying stale code.
import { useState, useCallback } from "react";
import { useAiConversations } from "./useAiConversations";
import type { ChatMessage } from "@/components/ai/AiChatThread";

export function useAiConversationNav() {
  const { conversations, refetch: loadConversations, rename, togglePin, remove } = useAiConversations();
  // conversationId is for sidebar highlighting + telling AiChatThread which
  // conversation to POST against next; openedConversationId is what
  // actually drives AiChatThread's key/remount. They start in sync, but
  // AiChatThread's onConversationCreated fires SYNCHRONOUSLY the instant a
  // brand-new thread mints its own id (before any of that turn's messages
  // have been persisted anywhere this could reload from) -- if that also
  // changed the key, React would unmount/remount AiChatThread mid-turn
  // (React 18 batches the local setMessages calls inside the same send()
  // together with this parent's setState, so the OLD instance's just-
  // appended user/assistant messages never even commit -- the new instance
  // mounts fresh from initialMessages=[], which never gets updated either).
  // Confirmed live: the turn still completes and saves correctly server-
  // side, but the thread visibly goes blank until reopened. Only an
  // explicit user action (New chat / picking a different past conversation)
  // should trigger a remount -- see startNewChat/openConversation, the only
  // two places openedConversationId changes.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [openedConversationId, setOpenedConversationId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const startNewChat = useCallback(() => {
    setConversationId(null);
    setOpenedConversationId(null);
    setInitialMessages([]);
  }, []);

  const openConversation = useCallback(async (id: string) => {
    // Fetch BEFORE touching openedConversationId (the key AiChatThread
    // remounts on) -- messages only seed that new instance's state at
    // mount time (its useState initializer runs once), so setting
    // openedConversationId first would remount with whatever
    // initialMessages already held (stale/empty) and silently ignore this
    // fetch's result once it lands, same failure shape as the mid-turn
    // remount bug above. Confirmed live: without this ordering, clicking a
    // past conversation just shows an empty thread.
    setConversationId(id);
    const res = await fetch(`/api/ai/conversations/${id}`);
    if (!res.ok) return;
    const json = await res.json();
    setInitialMessages(
      (json.messages ?? []).map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content }))
    );
    setOpenedConversationId(id);
  }, []);

  const deleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    await remove(id);
    if (conversationId === id) startNewChat();
  }, [remove, startNewChat, conversationId]);

  const startRename = useCallback((id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentTitle);
  }, []);

  const confirmRename = useCallback(async (id: string) => {
    const value = renameValue.trim();
    setRenamingId(null);
    if (value) await rename(id, value);
  }, [renameValue, rename]);

  const cancelRename = useCallback(() => setRenamingId(null), []);

  return {
    conversations, loadConversations, togglePin,
    conversationId, openedConversationId, initialMessages,
    renamingId, renameValue, setRenameValue,
    startNewChat, openConversation, deleteConversation, startRename, confirmRename, cancelRename,
    setConversationId,
  };
}

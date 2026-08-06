"use client";

// Shared conversation-list data for the AI assistant's two chat surfaces --
// app/(app)/dashboard/ai/page.tsx's sidebar and
// components/dashboard/quickGlance/widgets/AiAssistantWidget.tsx's history
// dropdown -- so list/rename/pin/delete isn't duplicated between them.
// Every mutation is optimistic (applied to local state immediately) with
// rollback to the pre-mutation snapshot on failure, per this project's
// established convention for list mutations.
import { useCallback, useEffect, useState } from "react";

export interface AiConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  pinned: boolean;
}

export function useAiConversations() {
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/ai/conversations");
    if (res.ok) {
      const json = await res.json();
      setConversations(json.conversations ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Refetches afterward (not just rolled forward locally) -- a rename to
  // "" reverts server-side to the derived-from-first-message title (see
  // app/api/ai/conversations/[id]/route.ts's PATCH), which this hook has no
  // way to compute locally.
  const rename = useCallback(async (id: string, title: string): Promise<boolean> => {
    let prevSnapshot: AiConversationSummary[] = [];
    setConversations((cs) => {
      prevSnapshot = cs;
      return cs.map((c) => (c.id === id ? { ...c, title: title.trim() || c.title } : c));
    });
    const res = await fetch(`/api/ai/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      setConversations(prevSnapshot);
      return false;
    }
    refetch();
    return true;
  }, [refetch]);

  const togglePin = useCallback(async (id: string): Promise<boolean> => {
    let prevSnapshot: AiConversationSummary[] = [];
    let nextPinned = false;
    setConversations((cs) => {
      prevSnapshot = cs;
      const target = cs.find((c) => c.id === id);
      if (!target) return cs;
      nextPinned = !target.pinned;
      const patched = cs.map((c) => (c.id === id ? { ...c, pinned: nextPinned } : c));
      // Mirrors the server's own pinned-desc, updatedAt-desc order (see
      // app/api/ai/conversations/route.ts) so the row doesn't jump once the
      // next refetch happens.
      return [...patched].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
    });
    const res = await fetch(`/api/ai/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: nextPinned }),
    });
    if (!res.ok) {
      setConversations(prevSnapshot);
      return false;
    }
    return true;
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    let prevSnapshot: AiConversationSummary[] = [];
    setConversations((cs) => {
      prevSnapshot = cs;
      return cs.filter((c) => c.id !== id);
    });
    const res = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setConversations(prevSnapshot);
      return false;
    }
    return true;
  }, []);

  return { conversations, loading, refetch, rename, togglePin, remove };
}

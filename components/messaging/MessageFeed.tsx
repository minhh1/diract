// components/messaging/MessageFeed.tsx
// Scrollable list of top-level messages for the currently open channel/DM.
"use client";

import { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import MessageBubble from "@/components/messaging/MessageBubble";
import type { MessageWithMeta } from "@/lib/hooks/useChannelMessages";
import type { CompanyMember } from "@/lib/hooks/useCompanyMembers";

interface Props {
  messages: MessageWithMeta[];
  members: CompanyMember[];
  currentUserId: string;
  isAdmin: boolean;
  onOpenThread: (messageId: string) => void;
  emptyLabel?: string;
}

export default function MessageFeed({ messages, members, currentUserId, isAdmin, onOpenThread, emptyLabel }: Props) {
  const membersById = new Map(members.map((m) => [m.id, m]));
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
        <MessageSquare size={28} className="text-slate-200" />
        <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">{emptyLabel || "No messages yet"}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-3">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          sender={membersById.get(m.user_id)}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onOpenThread={onOpenThread}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

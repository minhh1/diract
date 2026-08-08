// components/messaging/ThreadPanel.tsx
// Right-side panel for an open thread: the parent message pinned at top,
// its replies below, and a composer scoped to this thread
// (parentMessageId set) -- Slack's own "thread in a side panel" pattern.
"use client";

import { X } from "lucide-react";
import { useThreadReplies } from "@/lib/hooks/useChannelMessages";
import MessageBubble from "@/components/messaging/MessageBubble";
import MessageComposer from "@/components/messaging/MessageComposer";
import type { MessageWithMeta } from "@/lib/hooks/useChannelMessages";
import type { CompanyMember } from "@/lib/hooks/useCompanyMembers";
import type { ChannelListItem } from "@/lib/hooks/useMessagingChannels";

interface Props {
  parentMessage: MessageWithMeta;
  channelId: string;
  companyId: string;
  currentUserId: string;
  isAdmin: boolean;
  members: CompanyMember[];
  channels: ChannelListItem[];
  onClose: () => void;
}

export default function ThreadPanel({ parentMessage, channelId, companyId, currentUserId, isAdmin, members, channels, onClose }: Props) {
  const { replies } = useThreadReplies(parentMessage.id);
  const membersById = new Map(members.map((m) => [m.id, m]));

  return (
    <div className="w-96 shrink-0 border-l border-slate-100 bg-white flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
        <p className="text-[12px] font-bold text-slate-900">Thread</p>
        <button onClick={onClose} className="p-1 text-slate-300 hover:text-slate-700 transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <MessageBubble
          message={parentMessage}
          sender={membersById.get(parentMessage.user_id)}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          showThreadAction={false}
        />
        <div className="border-t border-slate-100 mx-4" />
        {replies.map((r) => (
          <MessageBubble
            key={r.id}
            message={r}
            sender={membersById.get(r.user_id)}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            showThreadAction={false}
          />
        ))}
      </div>
      <div className="p-3 border-t border-slate-100 shrink-0">
        <MessageComposer
          channelId={channelId}
          companyId={companyId}
          userId={currentUserId}
          parentMessageId={parentMessage.id}
          members={members}
          channels={channels}
          placeholder="Reply in thread..."
        />
      </div>
    </div>
  );
}

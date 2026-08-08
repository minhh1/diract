// app/dashboard/messaging/page.tsx
// Company messaging: channels, DMs, threads, @mentions, #channel refs.
// Reads/writes go straight through lib/services/messaging.ts (direct,
// RLS-gated Supabase calls) -- there's no API route behind this feature.
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useCompany } from "@/components/CompanyContext";
import { useMessagingChannels } from "@/lib/hooks/useMessagingChannels";
import { useChannelMessages } from "@/lib/hooks/useChannelMessages";
import { useCompanyMembers } from "@/lib/hooks/useCompanyMembers";
import { joinChannel, markChannelRead } from "@/lib/services/messaging";
import ChannelSidebar from "@/components/messaging/ChannelSidebar";
import MessageFeed from "@/components/messaging/MessageFeed";
import MessageComposer from "@/components/messaging/MessageComposer";
import ThreadPanel from "@/components/messaging/ThreadPanel";
import NewChannelModal from "@/components/messaging/NewChannelModal";
import { Hash, Lock } from "lucide-react";

export default function MessagingPage() {
  const { companyId, userId, isAdmin, loading: companyLoading } = useCompany();
  const searchParams = useSearchParams();
  const router = useRouter();

  const { channels, loading: channelsLoading, markChannelReadLocally } = useMessagingChannels(companyId, userId);
  const { members } = useCompanyMembers(companyId);

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(searchParams.get("channel"));
  const [openThreadMessageId, setOpenThreadMessageId] = useState<string | null>(searchParams.get("message"));
  const [showNewModal, setShowNewModal] = useState(false);

  const { messages } = useChannelMessages(selectedChannelId);

  // Default to the first available channel once the list loads, if nothing
  // was specified via a notification deep-link (?channel=...).
  useEffect(() => {
    if (!selectedChannelId && channels.length > 0) setSelectedChannelId(channels[0].id);
  }, [channels, selectedChannelId]);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;

  // Auto-join a public channel the first time it's opened -- messages are
  // already readable/postable without a channel_members row (RLS treats
  // any public channel as accessible company-wide), but a membership row is
  // what makes it show as "read" and tracks last_read_at going forward.
  useEffect(() => {
    if (!selectedChannel || !userId || selectedChannel.is_member) return;
    joinChannel(selectedChannel.id, userId);
  }, [selectedChannel, userId]);

  useEffect(() => {
    if (!selectedChannelId || !userId) return;
    markChannelRead(selectedChannelId, userId);
    markChannelReadLocally(selectedChannelId);
  }, [selectedChannelId, userId, markChannelReadLocally]);

  const handleSelectChannel = (channelId: string) => {
    setSelectedChannelId(channelId);
    setOpenThreadMessageId(null);
    router.replace(`/dashboard/messaging?channel=${channelId}`);
  };

  const handleCreated = (channelId: string) => {
    setShowNewModal(false);
    handleSelectChannel(channelId);
  };

  const openThreadMessage = messages.find((m) => m.id === openThreadMessageId) ?? null;

  if (companyLoading) return null;

  return (
    <div className="flex h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <ChannelSidebar
        channels={channels}
        members={members}
        selectedChannelId={selectedChannelId}
        onSelect={handleSelectChannel}
        onNew={() => setShowNewModal(true)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedChannel ? (
          <>
            <header className="bg-white border-b border-slate-100 shrink-0 px-6 py-4 flex items-center gap-2">
              {selectedChannel.type === "channel" ? (
                selectedChannel.is_private ? <Lock size={14} className="text-slate-300" /> : <Hash size={14} className="text-slate-300" />
              ) : null}
              <p className="text-[14px] font-bold text-slate-900">
                {selectedChannel.type === "channel" ? selectedChannel.name : members.find((m) => m.id === selectedChannel.dm_other_user_id)?.full_name || "Direct message"}
              </p>
              {selectedChannel.topic && <p className="text-[11px] text-slate-400 truncate">— {selectedChannel.topic}</p>}
            </header>

            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                <MessageFeed
                  messages={messages}
                  members={members}
                  currentUserId={userId!}
                  isAdmin={isAdmin}
                  onOpenThread={setOpenThreadMessageId}
                />
                {userId && companyId && (
                  <div className="px-6 py-4 border-t border-slate-100 shrink-0">
                    <MessageComposer
                      channelId={selectedChannel.id}
                      companyId={companyId}
                      userId={userId}
                      members={members}
                      channels={channels}
                    />
                  </div>
                )}
              </div>

              {openThreadMessage && userId && companyId && (
                <ThreadPanel
                  parentMessage={openThreadMessage}
                  channelId={selectedChannel.id}
                  companyId={companyId}
                  currentUserId={userId}
                  isAdmin={isAdmin}
                  members={members}
                  channels={channels}
                  onClose={() => setOpenThreadMessageId(null)}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[12px] text-slate-300">
              {channelsLoading ? "Loading..." : "Create a channel or start a conversation to get going."}
            </p>
          </div>
        )}
      </div>

      {showNewModal && companyId && userId && (
        <NewChannelModal companyId={companyId} userId={userId} members={members} onClose={() => setShowNewModal(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}

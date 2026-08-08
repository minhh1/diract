// components/messaging/ChannelSidebar.tsx
// Channel + DM list for the messaging page. Every public channel is
// listed for every company member (RLS already allows reading/posting in
// any public channel without an explicit "join" -- channel_members mainly
// exists for last_read_at tracking and the sidebar list; see page.tsx's
// auto-join-on-open).
"use client";

import { Plus, Hash, Lock } from "lucide-react";
import type { ChannelListItem } from "@/lib/hooks/useMessagingChannels";
import type { CompanyMember } from "@/lib/hooks/useCompanyMembers";

interface Props {
  channels: ChannelListItem[];
  members: CompanyMember[];
  selectedChannelId: string | null;
  onSelect: (channelId: string) => void;
  onNew: () => void;
}

function dmLabel(channel: ChannelListItem, members: CompanyMember[]): string {
  const other = members.find((m) => m.id === channel.dm_other_user_id);
  return other?.full_name || other?.email || "Direct message";
}

export default function ChannelSidebar({ channels, members, selectedChannelId, onSelect, onNew }: Props) {
  const namedChannels = channels.filter((c) => c.type === "channel").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const dms = channels.filter((c) => c.type === "dm");

  return (
    <div className="w-64 shrink-0 bg-white border-r border-slate-100 flex flex-col">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <p className="text-[13px] font-bold text-slate-900">Messages</p>
        <button onClick={onNew} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors" title="New channel or DM">
          <Plus size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <p className="px-3 pt-2 pb-1 text-[9px] font-bold text-slate-300 uppercase tracking-widest">Channels</p>
        {namedChannels.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-left ${
              selectedChannelId === c.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600"
            }`}
          >
            {c.is_private ? <Lock size={12} className="shrink-0 opacity-50" /> : <Hash size={12} className="shrink-0 opacity-50" />}
            <p className={`text-[12.5px] truncate flex-1 ${c.unread ? "font-bold text-slate-900" : "font-medium"}`}>{c.name}</p>
            {c.unread && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 shrink-0" />}
          </button>
        ))}
        {namedChannels.length === 0 && <p className="px-3 py-2 text-[11px] text-slate-300">No channels yet</p>}

        <p className="px-3 pt-4 pb-1 text-[9px] font-bold text-slate-300 uppercase tracking-widest">Direct messages</p>
        {dms.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-left ${
              selectedChannelId === c.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600"
            }`}
          >
            <div className="h-5 w-5 rounded-full bg-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-600 uppercase shrink-0">
              {dmLabel(c, members).charAt(0)}
            </div>
            <p className={`text-[12.5px] truncate flex-1 ${c.unread ? "font-bold text-slate-900" : "font-medium"}`}>
              {dmLabel(c, members)}
            </p>
            {c.unread && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 shrink-0" />}
          </button>
        ))}
        {dms.length === 0 && <p className="px-3 py-2 text-[11px] text-slate-300">No conversations yet</p>}
      </div>
    </div>
  );
}

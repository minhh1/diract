// components/messaging/NewChannelModal.tsx
// "+ New" flow for the messaging sidebar -- either create a public channel
// or start a DM with another company member.
"use client";

import { useState } from "react";
import { X, Hash, Search } from "lucide-react";
import { createChannel, findOrCreateDm } from "@/lib/services/messaging";
import type { CompanyMember } from "@/lib/hooks/useCompanyMembers";

interface Props {
  companyId: string;
  userId: string;
  members: CompanyMember[];
  onClose: () => void;
  onCreated: (channelId: string) => void;
}

export default function NewChannelModal({ companyId, userId, members, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<"channel" | "dm">("channel");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherMembers = members.filter((m) => m.id !== userId);
  const filteredMembers = otherMembers.filter((m) => (m.full_name || m.email || "").toLowerCase().includes(search.toLowerCase()));

  const handleCreateChannel = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    const { channel, error: err } = await createChannel(companyId, userId, name, topic || undefined);
    setSaving(false);
    if (err || !channel) { setError(err || "Failed to create channel"); return; }
    onCreated(channel.id);
  };

  const handleStartDm = async (otherUserId: string) => {
    setSaving(true);
    setError(null);
    const { channel, error: err } = await findOrCreateDm(companyId, userId, otherUserId);
    setSaving(false);
    if (err || !channel) { setError(err || "Failed to start conversation"); return; }
    onCreated(channel.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" onClick={onClose}>
      <div className="bg-white rounded-[28px] w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[15px] font-bold text-slate-900">New</p>
          <button onClick={onClose} className="p-1 text-slate-300 hover:text-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 mb-4 bg-slate-50 rounded-full p-1">
          <button
            onClick={() => setMode("channel")}
            className={`flex-1 py-1.5 rounded-full text-[11px] font-bold transition-colors ${mode === "channel" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}
          >
            Channel
          </button>
          <button
            onClick={() => setMode("dm")}
            className={`flex-1 py-1.5 rounded-full text-[11px] font-bold transition-colors ${mode === "dm" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}
          >
            Direct message
          </button>
        </div>

        {error && <p className="text-[11px] text-red-500 mb-3">{error}</p>}

        {mode === "channel" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-full">
              <Hash size={13} className="text-slate-300 shrink-0" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="channel-name"
                className="flex-1 text-[13px] outline-none"
                autoFocus
              />
            </div>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic (optional)"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400"
            />
            <button
              onClick={handleCreateChannel}
              disabled={saving || !name.trim()}
              className="w-full py-2.5 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {saving ? "Creating..." : "Create channel"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-full">
              <Search size={13} className="text-slate-300 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people..."
                className="flex-1 text-[13px] outline-none"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleStartDm(m.id)}
                  disabled={saving}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-slate-50 transition-colors text-left disabled:opacity-40"
                >
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-bold text-indigo-600 uppercase shrink-0">
                    {(m.full_name || m.email || "?").charAt(0)}
                  </div>
                  <p className="text-[12.5px] font-medium text-slate-700 truncate">{m.full_name || m.email}</p>
                </button>
              ))}
              {filteredMembers.length === 0 && <p className="text-[11px] text-slate-300 text-center py-6">No one found</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

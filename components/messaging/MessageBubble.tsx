// components/messaging/MessageBubble.tsx
// One message: sender, timestamp, formatted body (mention/#channel chips +
// minimal inline formatting), reactions, and hover actions. Formatting is
// deliberately minimal (bold/italic/code/auto-linked URLs via one
// non-nested regex pass) -- see the plan's scope cut against a full
// markdown/WYSIWYG composer.
"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Smile, Pencil, Trash2 } from "lucide-react";
import { toggleReaction, deleteMessage, editMessage } from "@/lib/services/messaging";
import type { MessageWithMeta } from "@/lib/hooks/useChannelMessages";
import type { CompanyMember } from "@/lib/hooks/useCompanyMembers";

const QUICK_EMOJI = ["👍", "❤️", "😄", "🎉", "👀"];
const MENTION_OR_CHANNEL_RE = /(@\[[^\]]+\]\([0-9a-f-]{36}\))|(#\[[^\]]+\]\([0-9a-f-]{36}\))/gi;
const INLINE_FORMAT_RE = /(\*\*[^*]+\*\*)|(_[^_]+_)|(`[^`]+`)|(https?:\/\/\S+)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  INLINE_FORMAT_RE.lastIndex = 0;
  while ((match = INLINE_FORMAT_RE.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1]) parts.push(<strong key={`${keyPrefix}-${i++}`}>{match[1].slice(2, -2)}</strong>);
    else if (match[2]) parts.push(<em key={`${keyPrefix}-${i++}`}>{match[2].slice(1, -1)}</em>);
    else if (match[3]) parts.push(<code key={`${keyPrefix}-${i++}`} className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">{match[3].slice(1, -1)}</code>);
    else if (match[4]) parts.push(<a key={`${keyPrefix}-${i++}`} href={match[4]} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">{match[4]}</a>);
    lastIndex = INLINE_FORMAT_RE.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function renderMessageBody(body: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  MENTION_OR_CHANNEL_RE.lastIndex = 0;
  while ((match = MENTION_OR_CHANNEL_RE.exec(body))) {
    if (match.index > lastIndex) parts.push(<span key={key++}>{renderInline(body.slice(lastIndex, match.index), `t${key}`)}</span>);
    if (match[1]) {
      const label = match[1].match(/@\[([^\]]+)\]/)?.[1] ?? "";
      parts.push(
        <span key={key++} className="inline-block text-indigo-700 font-semibold bg-indigo-50 rounded px-1.5">@{label}</span>
      );
    } else if (match[2]) {
      const label = match[2].match(/#\[([^\]]+)\]/)?.[1] ?? "";
      const id = match[2].match(/\(([0-9a-f-]{36})\)/)?.[1] ?? "";
      parts.push(
        <Link key={key++} href={`/dashboard/messaging?channel=${id}`} className="inline-block text-indigo-700 font-semibold bg-indigo-50 rounded px-1.5 hover:bg-indigo-100">
          #{label}
        </Link>
      );
    }
    lastIndex = MENTION_OR_CHANNEL_RE.lastIndex;
  }
  if (lastIndex < body.length) parts.push(<span key={key++}>{renderInline(body.slice(lastIndex), `t${key}`)}</span>);
  return parts;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  message: MessageWithMeta;
  sender: CompanyMember | undefined;
  currentUserId: string;
  isAdmin: boolean;
  onOpenThread?: (messageId: string) => void;
  showThreadAction?: boolean;
}

export default function MessageBubble({ message, sender, currentUserId, isAdmin, onOpenThread, showThreadAction = true }: Props) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);

  const canEdit = message.user_id === currentUserId;
  const canDelete = message.user_id === currentUserId || isAdmin;
  const label = sender?.full_name || sender?.email || "Unknown";

  const reactionGroups = message.reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
    acc[r.emoji].count += 1;
    if (r.user_id === currentUserId) acc[r.emoji].mine = true;
    return acc;
  }, {});

  const handleReact = async (emoji: string) => {
    setShowEmojiPicker(false);
    await toggleReaction(message.id, currentUserId, emoji);
  };

  const handleSaveEdit = async () => {
    if (editText.trim() && editText !== message.body) await editMessage(message.id, editText);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this message?")) return;
    await deleteMessage(message.id);
  };

  if (message.deleted_at) {
    return (
      <div className="flex items-start gap-3 px-4 py-1.5 group">
        <div className="h-8 w-8 shrink-0" />
        <p className="text-[12px] text-slate-300 italic">Message deleted</p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 px-4 py-1.5 hover:bg-slate-50/60 rounded-xl group relative">
      <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-bold text-indigo-600 uppercase shrink-0">
        {label.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-[12.5px] font-bold text-slate-800">{label}</p>
          <p className="text-[10px] text-slate-300">{timeLabel(message.created_at)}{message.edited_at && " (edited)"}</p>
        </div>

        {editing ? (
          <div className="mt-1 flex items-center gap-2">
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded-full text-[12.5px] outline-none focus:border-indigo-400"
              autoFocus
            />
            <button onClick={handleSaveEdit} className="text-[11px] font-bold text-indigo-600">Save</button>
            <button onClick={() => setEditing(false)} className="text-[11px] text-slate-400">Cancel</button>
          </div>
        ) : (
          <p className="text-[13px] text-slate-700 whitespace-pre-wrap leading-relaxed">{renderMessageBody(message.body)}</p>
        )}

        {Object.keys(reactionGroups).length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {Object.entries(reactionGroups).map(([emoji, { count, mine }]) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                  mine ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <span>{emoji}</span>
                <span className="font-bold">{count}</span>
              </button>
            ))}
          </div>
        )}

        {showThreadAction && message.reply_count > 0 && (
          <button
            onClick={() => onOpenThread?.(message.id)}
            className="mt-1 text-[11px] font-bold text-indigo-600 hover:underline"
          >
            {message.reply_count} {message.reply_count === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      <div className="absolute top-0 right-4 hidden group-hover:flex items-center gap-1 bg-white border border-slate-200 rounded-full shadow-sm px-1 py-0.5">
        <div className="relative">
          <button onClick={() => setShowEmojiPicker((p) => !p)} className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors" title="React">
            <Smile size={13} />
          </button>
          {showEmojiPicker && (
            <div className="absolute top-full right-0 mt-1 flex items-center gap-1 bg-white border border-slate-200 rounded-full shadow-lg px-2 py-1.5 z-10">
              {QUICK_EMOJI.map((emoji) => (
                <button key={emoji} onClick={() => handleReact(emoji)} className="text-[15px] hover:scale-125 transition-transform">
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        {showThreadAction && (
          <button onClick={() => onOpenThread?.(message.id)} className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors" title="Reply in thread">
            <MessageSquare size={13} />
          </button>
        )}
        {canEdit && (
          <button onClick={() => setEditing(true)} className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors" title="Edit">
            <Pencil size={13} />
          </button>
        )}
        {canDelete && (
          <button onClick={handleDelete} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

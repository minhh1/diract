// components/messaging/MessageComposer.tsx
// Text input for a channel or a thread reply (parentMessageId set), with
// @mention / #channel autocomplete. The textarea shows plain, readable text
// while composing ("@John Smith") rather than the raw @[Name](uuid) token
// syntax -- a real chip-based rich editor is out of scope for this phase
// (see the plan's "minimal regex-based renderer, not a full WYSIWYG
// composer" scope cut). Only names actually picked from the dropdown
// become real linked mentions; typing a name by hand without autocomplete
// sends as plain text, same as Slack's own behavior.
"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { sendMessage } from "@/lib/services/messaging";
import type { CompanyMember } from "@/lib/hooks/useCompanyMembers";
import type { ChannelListItem } from "@/lib/hooks/useMessagingChannels";

interface PendingMention {
  token: string; // the plain text inserted into the textarea, e.g. "@John Smith"
  label: string;
  id: string;
  kind: "user" | "channel";
}

interface AutocompleteState {
  kind: "user" | "channel";
  query: string;
  triggerIndex: number;
}

interface Props {
  channelId: string;
  companyId: string;
  userId: string;
  parentMessageId?: string | null;
  members: CompanyMember[];
  channels: ChannelListItem[];
  placeholder?: string;
  onSent?: () => void;
}

function memberLabel(m: CompanyMember): string {
  return m.full_name || m.email || "Unknown";
}

export default function MessageComposer({ channelId, companyId, userId, parentMessageId, members, channels, placeholder, onSent }: Props) {
  const [text, setText] = useState("");
  const [pendingMentions, setPendingMentions] = useState<PendingMention[]>([]);
  const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(null);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const namedChannels = channels.filter((c) => c.type === "channel" && c.name);

  const autocompleteResults = (() => {
    if (!autocomplete) return [];
    const q = autocomplete.query.toLowerCase();
    if (autocomplete.kind === "user") {
      return members.filter((m) => memberLabel(m).toLowerCase().includes(q)).slice(0, 6).map((m) => ({ id: m.id, label: memberLabel(m) }));
    }
    return namedChannels.filter((c) => (c.name || "").toLowerCase().includes(q)).slice(0, 6).map((c) => ({ id: c.id, label: c.name! }));
  })();

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    const cursor = e.target.selectionStart;
    const uptoCursor = value.slice(0, cursor);
    const atMatch = uptoCursor.match(/(?:^|\s)@([^\s@#]*)$/);
    const hashMatch = uptoCursor.match(/(?:^|\s)#([^\s@#]*)$/);
    if (atMatch) {
      setAutocomplete({ kind: "user", query: atMatch[1], triggerIndex: cursor - atMatch[1].length - 1 });
    } else if (hashMatch) {
      setAutocomplete({ kind: "channel", query: hashMatch[1], triggerIndex: cursor - hashMatch[1].length - 1 });
    } else {
      setAutocomplete(null);
    }
  };

  const selectAutocomplete = (item: { id: string; label: string }) => {
    if (!autocomplete) return;
    const before = text.slice(0, autocomplete.triggerIndex);
    const after = text.slice(autocomplete.triggerIndex + 1 + autocomplete.query.length);
    const prefix = autocomplete.kind === "user" ? "@" : "#";
    const token = `${prefix}${item.label}`;
    setText(`${before}${token} ${after}`);
    setPendingMentions((prev) => [...prev, { token, label: item.label, id: item.id, kind: autocomplete.kind }]);
    setAutocomplete(null);
    // focus() alone leaves the caret at position 0 (a fresh value set via
    // React resets selection), which would put further typing before the
    // token instead of continuing after it -- explicitly place the caret
    // right after the inserted token + its trailing space.
    const caretPos = before.length + token.length + 1;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caretPos, caretPos);
    });
  };

  const buildBodyForSend = (): string => {
    let body = text;
    // Longest tokens first so "@John" doesn't accidentally match inside "@John Smith".
    const sorted = [...pendingMentions].sort((a, b) => b.token.length - a.token.length);
    for (const m of sorted) {
      const wrapped = m.kind === "user" ? `@[${m.label}](${m.id})` : `#[${m.label}](${m.id})`;
      body = body.split(m.token).join(wrapped);
    }
    return body;
  };

  const handleSend = async () => {
    const body = buildBodyForSend();
    if (!body.trim() || sending) return;
    setSending(true);
    const { error } = await sendMessage(channelId, companyId, userId, body, parentMessageId ?? null);
    setSending(false);
    if (!error) {
      setText("");
      setPendingMentions([]);
      onSent?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !autocomplete) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative">
      {autocomplete && autocompleteResults.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-20">
          {autocompleteResults.map((item) => (
            <button
              key={item.id}
              onClick={() => selectAutocomplete(item)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span className="text-slate-300">{autocomplete.kind === "user" ? "@" : "#"}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Message... (@ to mention, # for a channel)"}
          rows={1}
          className="flex-1 px-4 py-3 border border-slate-200 rounded-2xl text-[13px] outline-none focus:border-indigo-400 resize-none max-h-40"
        />
        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="w-11 h-11 shrink-0 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

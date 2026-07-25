"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Send, Loader2, X, Check, AlertCircle } from "lucide-react";

interface Props {
  entityId: string;
  entityName: string;
  phoneNumber: string | null;
}

interface SmsMessage {
  id: string;
  to_number: string;
  body: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  created_at: string;
}

// On-demand "text this lead/client" action -- entities only, mirrors
// TeamMemberLinkCard's placement/style. Sends through the platform's shared
// Twilio account via app/api/sms/send (see lib/sms/sendMessage.ts) -- no
// per-company setup needed, unlike WhatsApp.
export default function SendSmsCard({ entityId, entityName, phoneNumber }: Props) {
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const res = await fetch(`/api/sms/send?entityId=${entityId}`);
    const json = await res.json();
    setMessages(json.messages ?? []);
    setLoadingHistory(false);
  }, [entityId]);

  useEffect(() => {
    if (composing) loadHistory();
  }, [composing, loadHistory]);

  const send = async () => {
    if (!phoneNumber || !text.trim()) return;
    setSending(true);
    setSendError(null);
    const res = await fetch("/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, to: phoneNumber, body: text.trim() }),
    });
    const json = await res.json();
    setSending(false);
    if (!res.ok) {
      setSendError(json.error || "Failed to send");
      return;
    }
    setText("");
    loadHistory();
  };

  if (!phoneNumber) {
    return (
      <div className="mb-4">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-slate-300 border border-dashed border-slate-200 w-fit">
          <MessageSquare size={12} /> No phone number on file
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {!composing ? (
        <button
          onClick={() => setComposing(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-slate-400 hover:text-indigo-600 border border-dashed border-slate-200 hover:border-indigo-300 transition-all"
        >
          <MessageSquare size={12} /> Text {phoneNumber}
        </button>
      ) : (
        <div className="max-w-sm bg-slate-50 border border-slate-200 rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Text {phoneNumber}</span>
            <button
              onClick={() => { setComposing(false); setText(""); setSendError(null); }}
              className="text-slate-300 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`Message ${entityName}...`}
            rows={3}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[12px] outline-none focus:border-indigo-400 resize-none"
          />
          {sendError && (
            <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1.5">
              <AlertCircle size={11} /> {sendError}
            </p>
          )}
          <div className="flex justify-end mt-2">
            <button
              onClick={send}
              disabled={sending || !text.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {sending ? "Sending..." : "Send"}
            </button>
          </div>

          {(loadingHistory || messages.length > 0) && (
            <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5 max-h-40 overflow-y-auto">
              {loadingHistory ? (
                <div className="flex justify-center py-2">
                  <Loader2 size={12} className="animate-spin text-slate-300" />
                </div>
              ) : (
                messages.map(m => (
                  <div key={m.id} className="text-[11px]">
                    <div className="flex items-center gap-1.5">
                      {m.status === "sent" ? (
                        <Check size={10} className="text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle size={10} className="text-red-500 shrink-0" />
                      )}
                      <span className="text-slate-400">{new Date(m.created_at).toLocaleString("en-AU")}</span>
                    </div>
                    <p className="text-slate-600 truncate pl-4">{m.body}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

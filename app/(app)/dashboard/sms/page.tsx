"use client";

// Standalone "text anyone" composer -- app/api/sms/send/route.ts already
// supports an arbitrary `to` with no entityId (entityId only tags which
// record's thread a message belongs to), so this is the free-text
// counterpart to components/dashboard/SendSmsCard.tsx's per-entity one,
// not a replacement for it. Guarded the same way that route is: the
// platform-wide opt-out list and a per-company daily cap, both enforced
// server-side -- this page just surfaces whatever the API rejects.
import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Send, Loader2, Check, AlertCircle } from "lucide-react";

interface SmsMessage {
  id: string;
  entity_id: string | null;
  to_number: string;
  body: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  created_at: string;
}

export default function SendSmsPage() {
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const res = await fetch("/api/sms/send");
    const json = await res.json();
    setMessages(json.messages ?? []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const send = async () => {
    if (!to.trim() || !text.trim()) return;
    setSending(true);
    setSendError(null);
    setJustSent(false);
    const res = await fetch("/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: to.trim(), body: text.trim() }),
    });
    const json = await res.json();
    setSending(false);
    if (!res.ok) {
      setSendError(json.error || "Failed to send");
      return;
    }
    setText("");
    setJustSent(true);
    loadHistory();
  };

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white border-b border-slate-100 shrink-0">
        <div className="pt-16 md:pt-8 px-8 pb-6">
          <h1 className="text-3xl font-light uppercase tracking-tight text-slate-900">
            Send SMS
          </h1>
          <p className="text-[12px] text-slate-400 mt-1">Text any phone number, not just a linked record</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-lg mx-auto space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                To
              </label>
              <input
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="0412 345 678"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Message
              </label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Type a message..."
                rows={4}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:border-indigo-400 resize-none"
              />
            </div>
            {sendError && (
              <p className="flex items-center gap-1.5 text-[12px] text-red-500">
                <AlertCircle size={13} /> {sendError}
              </p>
            )}
            {justSent && !sendError && (
              <p className="flex items-center gap-1.5 text-[12px] text-emerald-600">
                <Check size={13} /> Sent
              </p>
            )}
            <button
              onClick={send}
              disabled={sending || !to.trim() || !text.trim()}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-900 text-white text-[12px] font-bold rounded-full disabled:opacity-40 transition-opacity"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sending ? "Sending..." : "Send"}
            </button>
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Recent messages
            </p>
            <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-50 overflow-hidden">
              {loadingHistory ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={16} className="animate-spin text-slate-300" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center py-8 text-[11px] text-slate-300 italic">No messages sent yet</p>
              ) : (
                messages.map(m => (
                  <div key={m.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[12px] font-bold text-slate-700">
                        <MessageSquare size={12} className="text-slate-300" /> {m.to_number}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(m.created_at).toLocaleString("en-AU")}
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-500 mt-1">{m.body}</p>
                    {m.status === "failed" && (
                      <p className="flex items-center gap-1 text-[10px] text-red-500 mt-1">
                        <AlertCircle size={10} /> {m.error || "Failed to send"}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

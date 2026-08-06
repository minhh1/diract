// app/dashboard/ai/page.tsx
// Chat UI for the table/dashboard-builder assistant (see
// app/api/ai/chat/route.ts) -- describe your business and it creates the
// custom tables, fields, and dashboards for it, via tool-calling against
// this company's own schema. Admin-only, since every tool it can call runs
// with admin-equivalent rights (see lib/ai/tableBuilderTools.ts).
//
// Conversations are personal (not shared with teammates) and persisted via
// supabase/ai_conversations.sql + ai_messages.sql -- see
// app/api/ai/conversations for the list/load/rename/pin/delete endpoints
// (list+mutations wrapped by lib/hooks/useAiConversations.ts, shared with
// AiAssistantWidget.tsx's own history dropdown). The conversation id is
// generated client-side (crypto.randomUUID()) so the first message in a
// new chat can create the row inline in app/api/ai/chat/route.ts rather
// than needing a separate create call.
//
// The actual message-list/tool-call-chip rendering lives in
// components/ai/AiChatThread.tsx, shared with AiAssistantWidget.tsx (an
// ordinary Quick Glance widget embed of this same assistant, for a
// templateless company). This page owns the conversation-list sidebar and
// remounts AiChatThread (via `key`) whenever the selected conversation
// changes, rather than lifting its message/conversationId state up here.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Plus, Trash2, MessageSquare, Shield, Pin, Pencil, Check, X } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useAiConversations } from "@/lib/hooks/useAiConversations";
import AiChatThread, { type ChatMessage } from "@/components/ai/AiChatThread";

export default function AiAssistantPage() {
  const router = useRouter();
  const { isAdmin, loading: companyLoading } = useCompany();

  const { conversations, refetch: loadConversations, rename, togglePin, remove } = useAiConversations();
  // conversationId is for sidebar highlighting + telling AiChatThread which
  // conversation to POST against next; openedConversationId is what
  // actually drives AiChatThread's key/remount. They start in sync, but
  // AiChatThread's onConversationCreated fires SYNCHRONOUSLY the instant a
  // brand-new thread mints its own id (before any of that turn's messages
  // have been persisted anywhere this page could reload from) -- if that
  // also changed the key, React would unmount/remount AiChatThread mid-turn
  // (React 18 batches the local setMessages calls inside the same send()
  // together with this parent's setState, so the OLD instance's just-
  // appended user/assistant messages never even commit -- the new instance
  // mounts fresh from initialMessages=[], which this page never updated
  // either). Confirmed live: the turn still completes and saves correctly
  // server-side, but the thread visibly goes blank until the page reloads.
  // Only an explicit user action (New chat / picking a different past
  // conversation) should trigger a remount -- see startNewChat/
  // openConversation, the only two places openedConversationId changes.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [openedConversationId, setOpenedConversationId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const startNewChat = () => {
    setConversationId(null);
    setOpenedConversationId(null);
    setInitialMessages([]);
  };

  const openConversation = async (id: string) => {
    setConversationId(id);
    setOpenedConversationId(id);
    const res = await fetch(`/api/ai/conversations/${id}`);
    if (!res.ok) return;
    const json = await res.json();
    setInitialMessages(
      (json.messages ?? []).map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content }))
    );
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    await remove(id);
    if (conversationId === id) startNewChat();
  };

  const startRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentTitle);
  };

  const confirmRename = async (id: string) => {
    const value = renameValue.trim();
    setRenamingId(null);
    if (value) await rename(id, value);
  };

  if (companyLoading) return null;

  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center h-screen gap-3">
      <Shield size={32} className="text-slate-200" />
      <p className="text-slate-400 font-bold text-[11px] uppercase tracking-widest">
        Admin access required
      </p>
      <button
        onClick={() => router.back()}
        className="text-[11px] text-indigo-600 font-bold hover:underline"
      >
        Go back
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      {/* Conversation list */}
      <div className="w-64 shrink-0 bg-white border-r border-slate-100 flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <button
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 active:scale-[0.98] transition-all"
          >
            <Plus size={13} /> New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => renamingId !== c.id && openConversation(c.id)}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-2xl cursor-pointer transition-colors ${
                conversationId === c.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600"
              }`}
            >
              <MessageSquare size={13} className="shrink-0 opacity-60" />
              {renamingId === c.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.key === "Enter" && confirmRename(c.id)}
                  className="flex-1 min-w-0 px-2 py-1 text-[12px] font-medium border border-indigo-200 rounded-lg outline-none focus:border-indigo-400"
                />
              ) : (
                <p className="text-[12px] font-medium truncate flex-1">{c.title}</p>
              )}
              {renamingId === c.id ? (
                <>
                  <button onClick={(e) => { e.stopPropagation(); confirmRename(c.id); }} className="p-1 text-emerald-500 hover:text-emerald-700 shrink-0">
                    <Check size={11} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setRenamingId(null); }} className="p-1 text-slate-300 hover:text-slate-500 shrink-0">
                    <X size={11} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePin(c.id); }}
                    title={c.pinned ? "Unpin" : "Pin"}
                    className={`p-1 shrink-0 transition-all ${
                      c.pinned ? "text-indigo-600" : "text-slate-300 opacity-0 group-hover:opacity-100 hover:text-indigo-500"
                    }`}
                  >
                    <Pin size={11} fill={c.pinned ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={(e) => startRename(c.id, c.title, e)}
                    className="p-1 text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={(e) => deleteConversation(c.id, e)}
                    className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  >
                    <Trash2 size={11} />
                  </button>
                </>
              )}
            </div>
          ))}
          {conversations.length === 0 && <p className="text-[11px] text-slate-300 text-center py-8">No conversations yet</p>}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-100 shrink-0 px-8 py-6">
          <div className="flex items-center gap-3 max-w-3xl mx-auto">
            <motion.div
              className="h-9 w-9 rounded-2xl bg-indigo-50 flex items-center justify-center"
              animate={sending ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={sending ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" } : undefined}
            >
              <Sparkles size={18} className="text-indigo-600" />
            </motion.div>
            <h1 className="text-2xl font-light uppercase tracking-tight text-slate-900">Ask AI</h1>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto h-full">
            <AiChatThread
              key={openedConversationId ?? "new"}
              initialConversationId={openedConversationId}
              initialMessages={initialMessages}
              emptyStateHint={'Tell it about your business, e.g. "I run a plumbing company with 10 employees, I want to create invoices and manage payroll" -- it\'ll set up the tables, fields, and dashboards for you.'}
              onConversationCreated={setConversationId}
              onTurnComplete={loadConversations}
              onSendingChange={setSending}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

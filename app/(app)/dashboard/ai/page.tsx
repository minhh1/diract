// app/dashboard/ai/page.tsx
// Chat UI for the table/dashboard-builder assistant (see
// app/api/ai/chat/route.ts) -- describe your business and it creates the
// custom tables, fields, and dashboards for it, via tool-calling against
// this company's own schema. Admin-only, since every tool it can call runs
// with admin-equivalent rights (see lib/ai/tableBuilderTools.ts).
//
// Conversations are personal (not shared with teammates) and persisted via
// supabase/ai_conversations.sql + ai_messages.sql -- see
// app/api/ai/conversations for the list/load/delete endpoints. The
// conversation id is generated client-side (crypto.randomUUID()) so the
// first message in a new chat can create the row inline in
// app/api/ai/chat/route.ts rather than needing a separate create call.
//
// Live tool-call progress ("Creating table 'Invoices'...") and an animated
// thinking indicator are rendered from the stream's `{tool, phase}` events
// (see lib/ai/modelCall.ts's onToolCall) -- not fabricated busy-work, this
// is the actual multi-step tool loop happening server-side, surfaced as it
// happens rather than the chat going silent for however long a build takes.
// Tool activity isn't persisted (only the final assistant text is, per
// ai_messages' schema), so reopening a past conversation shows just the
// text, same as before.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, Loader2, AlertTriangle, Plus, Trash2, MessageSquare, Shield,
  Check, X, Table2, LayoutDashboard, ListChecks, PlusSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { renderMarkdown } from "@/lib/renderMarkdown";

interface ToolCallEvent {
  name: string;
  input: Record<string, unknown>;
  phase: "start" | "done";
  isError?: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallEvent[];
}

interface Usage {
  tokensUsed: number;
  tokenCap: number;
  estimatedCostUsd: number;
  periodEnd: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

const TOOL_ICONS: Record<string, LucideIcon> = {
  list_existing_tables: ListChecks,
  list_existing_dashboards: ListChecks,
  create_table: Table2,
  create_field: PlusSquare,
  create_dashboard: LayoutDashboard,
  add_widget: LayoutDashboard,
  delete_table: Trash2,
  delete_field: Trash2,
  remove_widget: Trash2,
  delete_dashboard: Trash2,
};

function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "list_existing_tables": return "Checking existing tables";
    case "list_existing_dashboards": return "Checking existing dashboards";
    case "create_table": return `Creating table "${input.name ?? ""}"`;
    case "create_field": return `Adding field "${input.label ?? ""}"`;
    case "create_dashboard": return `Creating dashboard "${input.name ?? ""}"`;
    case "add_widget": return `Adding a ${input.widget_type ?? "widget"} widget`;
    case "delete_table": return "Deleting table";
    case "delete_field": return "Removing field";
    case "remove_widget": return "Removing widget";
    case "delete_dashboard": return "Deleting dashboard";
    default: return name;
  }
}

function ToolCallChip({ call }: { call: ToolCallEvent }) {
  const Icon = TOOL_ICONS[call.name] || Sparkles;
  const inFlight = call.phase === "start";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium border w-fit ${
        inFlight
          ? "bg-indigo-50 border-indigo-100 text-indigo-600"
          : call.isError
          ? "bg-red-50 border-red-100 text-red-600"
          : "bg-emerald-50 border-emerald-100 text-emerald-700"
      }`}
    >
      {inFlight ? (
        <Loader2 size={11} className="animate-spin shrink-0" />
      ) : call.isError ? (
        <X size={11} className="shrink-0" />
      ) : (
        <Check size={11} className="shrink-0" />
      )}
      <Icon size={11} className="shrink-0 opacity-60" />
      <span className="truncate">{toolLabel(call.name, call.input)}</span>
    </motion.div>
  );
}

// Animated "thinking" indicator shown while the assistant has produced
// neither text nor a tool call yet for this turn -- a pulsing sparkle plus
// three sequentially-bouncing dots, i.e. real motion rather than a static
// "...".
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <motion.div
        className="flex items-center justify-center h-6 w-6 rounded-full bg-indigo-50 shrink-0"
        animate={{ rotate: [0, 12, -12, 0] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      >
        <Sparkles size={12} className="text-indigo-500" />
      </motion.div>
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-indigo-300"
            animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
    </div>
  );
}

export default function AiAssistantPage() {
  const router = useRouter();
  const { isAdmin, loading: companyLoading } = useCompany();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadUsage = useCallback(async () => {
    const res = await fetch("/api/ai/usage");
    if (!res.ok) return;
    setUsage(await res.json());
  }, []);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/ai/conversations");
    if (!res.ok) return;
    const json = await res.json();
    setConversations(json.conversations ?? []);
  }, []);

  useEffect(() => {
    loadUsage();
    loadConversations();
  }, [loadUsage, loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const capReached = usage ? usage.tokensUsed >= usage.tokenCap : false;

  const startNewChat = () => {
    setConversationId(null);
    setMessages([]);
    setError(null);
  };

  const openConversation = async (id: string) => {
    setConversationId(id);
    setError(null);
    const res = await fetch(`/api/ai/conversations/${id}`);
    if (!res.ok) return;
    const json = await res.json();
    setMessages(
      (json.messages ?? []).map((m: { role: "user" | "assistant"; content: string }) => ({
        role: m.role,
        content: m.content,
      }))
    );
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    if (conversationId === id) startNewChat();
    loadConversations();
  };

  const send = async () => {
    const question = input.trim();
    if (!question || sending || capReached) return;

    const activeConversationId = conversationId ?? crypto.randomUUID();
    if (!conversationId) setConversationId(activeConversationId);

    setError(null);
    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setSending(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, conversationId: activeConversationId }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error || "Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.delta) {
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + evt.delta };
              return next;
            });
          }
          if (evt.tool) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              const toolCalls = [...(last.toolCalls ?? [])];
              if (evt.phase === "start") {
                toolCalls.push({ name: evt.tool, input: evt.input ?? {}, phase: "start" });
              } else {
                for (let i = toolCalls.length - 1; i >= 0; i--) {
                  if (toolCalls[i].name === evt.tool && toolCalls[i].phase === "start") {
                    toolCalls[i] = { ...toolCalls[i], phase: "done", isError: evt.isError };
                    break;
                  }
                }
              }
              next[next.length - 1] = { ...last, toolCalls };
              return next;
            });
          }
          if (evt.error) setError(evt.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
      loadUsage();
      loadConversations();
    }
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
              onClick={() => openConversation(c.id)}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-2xl cursor-pointer transition-colors ${
                conversationId === c.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600"
              }`}
            >
              <MessageSquare size={13} className="shrink-0 opacity-60" />
              <p className="text-[12px] font-medium truncate flex-1">{c.title}</p>
              <button
                onClick={(e) => deleteConversation(c.id, e)}
                className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
              >
                <Trash2 size={11} />
              </button>
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

          {usage && (
            <div className="max-w-3xl mx-auto mt-4">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                <span>
                  {usage.tokensUsed.toLocaleString()} / {usage.tokenCap.toLocaleString()} tokens this period
                </span>
                <span>~${usage.estimatedCostUsd.toFixed(2)} spent</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${capReached ? "bg-red-500" : "bg-indigo-500"}`}
                  initial={false}
                  animate={{ width: `${Math.min(100, (usage.tokensUsed / usage.tokenCap) * 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.length === 0 && (
              <p className="text-[12px] text-slate-400 text-center py-12">
                Tell it about your business, e.g. &quot;I run a plumbing company with 10 employees, I want to create invoices and manage payroll&quot; -- it&apos;ll set up the tables, fields, and dashboards for you.
              </p>
            )}
            <AnimatePresence initial={false}>
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                const toolsInFlight = (m.toolCalls ?? []).some((t) => t.phase === "start");
                const showThinking = m.role === "assistant" && !m.content && sending && isLast && !toolsInFlight;
                const showCursor = m.role === "assistant" && !!m.content && sending && isLast;
                return (
                  <motion.div
                    key={i}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-[24px] px-5 py-3 text-[13px] ${
                        m.role === "user" ? "bg-indigo-600 text-white whitespace-pre-wrap" : "bg-white border border-slate-200 text-slate-700"
                      }`}
                    >
                      {m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0 && (
                        <div className="flex flex-col gap-1.5 mb-2.5">
                          <AnimatePresence initial={false}>
                            {m.toolCalls.map((call, ci) => (
                              <ToolCallChip key={ci} call={call} />
                            ))}
                          </AnimatePresence>
                        </div>
                      )}

                      {m.role === "user" ? (
                        m.content
                      ) : showThinking ? (
                        <ThinkingIndicator />
                      ) : m.content ? (
                        <>
                          <div className="ai-chat-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                          {showCursor && <span className="inline-block w-[2px] h-[13px] bg-indigo-400 mt-0.5 animate-pulse" />}
                        </>
                      ) : null}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        </main>

        <footer className="bg-white border-t border-slate-100 shrink-0 px-8 py-6">
          <div className="max-w-3xl mx-auto">
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-1.5 text-[11px] text-red-500 mb-2 overflow-hidden"
                >
                  <AlertTriangle size={12} /> {error}
                </motion.p>
              )}
            </AnimatePresence>
            {capReached && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-2xl px-4 py-2 mb-2">
                <AlertTriangle size={12} /> Monthly token cap reached -- ask a company admin to raise it in Admin → AI Assistant.
              </p>
            )}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                disabled={capReached}
                placeholder="Describe your business..."
                className="flex-1 px-4 py-3 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400 transition-colors disabled:opacity-40"
              />
              <button
                onClick={send}
                disabled={sending || capReached || !input.trim()}
                className="w-11 h-11 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 active:scale-[0.94] disabled:opacity-40 disabled:active:scale-100 transition-all"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

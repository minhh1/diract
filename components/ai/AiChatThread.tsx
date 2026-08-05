"use client";

// The actual message-list + input + streaming/tool-call rendering for the
// table/dashboard-builder assistant (see app/api/ai/chat/route.ts) --
// shared by app/(app)/dashboard/ai/page.tsx (the full page, with its own
// conversation-list sidebar around this) and WelcomeOnboarding.tsx (a
// compact, single-conversation embed for a brand-new company's very first
// screen). Pulled out of the AI page rather than duplicated, since the
// streaming/tool-call-chip logic is the least trivial part of either.
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, Loader2, AlertTriangle, Check, X, Table2, LayoutDashboard, ListChecks, PlusSquare, Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { renderMarkdown } from "@/lib/renderMarkdown";

export interface ToolCallEvent {
  name: string;
  input: Record<string, unknown>;
  phase: "start" | "done";
  isError?: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallEvent[];
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

// Spelled out with the actual specifics the model passed (field type, which
// fields a widget shows, ...), not just the tool name -- the point of
// showing these live is telling the user exactly what's being created, not
// just that "something" is happening.
function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "list_existing_tables": return "Checking existing tables";
    case "list_existing_dashboards": return "Checking existing dashboards";
    case "create_table": return `Creating table "${input.name ?? ""}"`;
    case "create_field": {
      const type = typeof input.field_type === "string" ? ` (${input.field_type})` : "";
      return `Adding field "${input.label ?? ""}"${type}`;
    }
    case "create_dashboard": return `Creating dashboard "${input.name ?? ""}"`;
    case "add_widget": {
      const labels = Array.isArray(input.field_labels) && input.field_labels.length ? `: ${input.field_labels.join(", ")}` : "";
      return `Adding a ${input.widget_type ?? "widget"} widget${labels}`;
    }
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

// Shown while the assistant has produced neither text nor a tool call yet
// for this turn -- deliberately NOT inside the bordered message-bubble
// chrome (that's for actual content), just a pulsing sparkle, three
// sequentially-bouncing dots, and a label naming what's actually happening,
// so it reads as "in progress" rather than "here's an empty reply".
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2.5 py-1 pl-1">
      <motion.div
        className="flex items-center justify-center h-6 w-6 rounded-full bg-indigo-50 shrink-0"
        animate={{ rotate: [0, 12, -12, 0] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      >
        <Sparkles size={12} className="text-indigo-500" />
      </motion.div>
      <span className="text-[12px] font-medium text-slate-400">Reading your request and deciding what to build</span>
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

interface Usage {
  tokensUsed: number;
  tokenCap: number;
  estimatedCostUsd: number;
  periodEnd: string;
}

export interface AiChatThreadProps {
  // Compact mode drops the token-usage bar and uses tighter spacing/a
  // rounded card shell -- meant to sit embedded inside another page
  // (WelcomeOnboarding) rather than own the whole viewport the way
  // app/(app)/dashboard/ai/page.tsx's chat pane does.
  compact?: boolean;
  // Seeds the thread with an assistant message that's already there on
  // load, no API round trip -- e.g. a welcome greeting. Purely local state;
  // doesn't get persisted until the user actually sends their first
  // message (same as every other turn).
  initialAssistantMessage?: string;
  // For app/(app)/dashboard/ai/page.tsx's "open a past conversation" --
  // pass both alongside a `key` prop that changes per conversation (see
  // that page) so switching conversations remounts this component fresh
  // rather than needing conversationId/messages lifted into shared state.
  initialConversationId?: string | null;
  initialMessages?: ChatMessage[];
  emptyStateHint?: string;
  placeholder?: string;
  // Bumped every time a create_table/create_dashboard/add_widget tool call
  // completes -- WelcomeOnboarding uses this to know when to stop showing
  // itself and hand off to the real quick-glance/schema view.
  onBuildProgress?: () => void;
  // Fires the moment this thread mints its own conversation id (its very
  // first send) -- lets a host page refresh its own conversation-list
  // sidebar without this component needing to know that list exists.
  onConversationCreated?: (id: string) => void;
  // Fires after every send/stream settles (success or failure) -- for a
  // host page's own usage/conversation-list refresh, same timing as this
  // component's own internal usage refetch.
  onTurnComplete?: () => void;
  // For a host page's own "in progress" chrome (e.g. the pulsing header
  // icon on app/(app)/dashboard/ai/page.tsx) -- this component already
  // tracks sending internally for its own send-button spinner either way.
  onSendingChange?: (sending: boolean) => void;
}

const BUILD_TOOL_NAMES = new Set(["create_table", "create_field", "create_dashboard", "add_widget"]);

export default function AiChatThread({
  compact = false,
  initialAssistantMessage,
  initialConversationId = null,
  initialMessages,
  emptyStateHint,
  placeholder = "Describe your business...",
  onBuildProgress,
  onConversationCreated,
  onTurnComplete,
  onSendingChange,
}: AiChatThreadProps) {
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages ?? (initialAssistantMessage ? [{ role: "assistant", content: initialAssistantMessage }] : [])
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (compact) return; // onboarding embed skips the usage bar -- see prop doc
    fetch("/api/ai/usage").then(res => res.ok ? res.json() : null).then(json => { if (json) setUsage(json); });
  }, [compact]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const capReached = usage ? usage.tokensUsed >= usage.tokenCap : false;

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || sending || capReached) return;

    const activeConversationId = conversationId ?? crypto.randomUUID();
    if (!conversationId) {
      setConversationId(activeConversationId);
      onConversationCreated?.(activeConversationId);
    }

    setError(null);
    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setSending(true);
    onSendingChange?.(true);

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
            if (evt.phase === "done" && !evt.isError && BUILD_TOOL_NAMES.has(evt.tool)) onBuildProgress?.();
          }
          if (evt.error) setError(evt.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
      onSendingChange?.(false);
      if (!compact) fetch("/api/ai/usage").then(res => res.ok ? res.json() : null).then(json => { if (json) setUsage(json); });
      onTurnComplete?.();
    }
  }, [input, sending, capReached, conversationId, messages, compact, onBuildProgress, onConversationCreated, onTurnComplete, onSendingChange]);

  return (
    <div className={`flex flex-col ${compact ? "" : "h-full"}`}>
      {!compact && usage && (
        <div className="shrink-0 mb-4">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            <span>{usage.tokensUsed.toLocaleString()} / {usage.tokenCap.toLocaleString()} tokens this period</span>
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

      <div className={`flex-1 ${compact ? "max-h-[420px]" : ""} overflow-y-auto`}>
        <div className="space-y-4">
          {messages.length === 0 && emptyStateHint && (
            <p className="text-[12px] text-slate-400 text-center py-12">{emptyStateHint}</p>
          )}
          <AnimatePresence initial={false}>
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              const hasToolCalls = (m.toolCalls?.length ?? 0) > 0;
              const toolsInFlight = (m.toolCalls ?? []).some((t) => t.phase === "start");
              const showThinking = m.role === "assistant" && !m.content && sending && isLast && !toolsInFlight;
              const showCursor = m.role === "assistant" && !!m.content && sending && isLast;

              // An assistant turn that ended up with nothing at all (no
              // text, no tool calls, no longer sending -- e.g. the request
              // errored before producing anything) has nothing worth
              // showing; the error banner below already explains why.
              if (m.role === "assistant" && !m.content && !hasToolCalls && !sending) return null;

              return (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "user" ? (
                    <div className="max-w-[80%] rounded-[24px] px-5 py-3 text-[13px] bg-indigo-600 text-white whitespace-pre-wrap">
                      {m.content}
                    </div>
                  ) : (
                    // No card/bubble on the assistant side -- tool activity
                    // and the reply itself sit directly on the page,
                    // distinguished from the user's messages by alignment
                    // alone (ChatGPT-style), not a boxed container.
                    <div className="max-w-[80%] text-[13px] text-slate-700 py-1">
                      {hasToolCalls && (
                        <div className="flex flex-col gap-1.5 mb-2.5">
                          <AnimatePresence initial={false}>
                            {m.toolCalls!.map((call, ci) => (
                              <ToolCallChip key={ci} call={call} />
                            ))}
                          </AnimatePresence>
                        </div>
                      )}

                      {showThinking ? (
                        <ThinkingIndicator />
                      ) : m.content ? (
                        <>
                          <div className="ai-chat-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                          {showCursor && <span className="inline-block w-[2px] h-[13px] bg-indigo-400 mt-0.5 animate-pulse" />}
                        </>
                      ) : null}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </div>

      <div className={compact ? "mt-4 shrink-0" : "shrink-0 pt-6"}>
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
            placeholder={placeholder}
            className="flex-1 px-4 py-3 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400 transition-colors disabled:opacity-40"
          />
          <button
            onClick={send}
            disabled={sending || capReached || !input.trim()}
            className="w-11 h-11 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 active:scale-[0.94] disabled:opacity-40 disabled:active:scale-100 transition-all shrink-0"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

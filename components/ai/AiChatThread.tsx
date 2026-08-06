"use client";

// The actual message-list + input + tool-call rendering for the
// table/dashboard-builder assistant (see app/api/ai/chat/route.ts) --
// shared by app/(app)/dashboard/ai/page.tsx (the full page, with its own
// conversation-list sidebar around this) and AiAssistantWidget.tsx (a
// compact, single-conversation embed as an ordinary Quick Glance widget for
// a templateless company). Pulled out of the AI page rather than
// duplicated, since the tool-call-chip logic is the least trivial part of
// either.
//
// A turn doesn't stream over a held-open connection anymore -- the route
// creates an ai_chat_jobs row and hands the real work to Next's after(),
// which keeps running even if this component (or the whole tab) goes away
// mid-turn (see that route's own header comment). This component instead
// subscribes to that one job row via Supabase Realtime (useTableRealtime)
// and patches the last assistant message's content/toolCalls from each
// update, same shape components/dashboard/AutoTimeRecordingPanel.tsx
// already uses for auto_time_entry_generation_jobs. On mount, it also
// checks for an already-running job on the conversation it was opened
// with, so reopening a chat whose turn is still going (closed the tab,
// came back) resumes live instead of showing a stale/incomplete thread.
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, Loader2, AlertTriangle, Check, X, Table2, LayoutDashboard, ListChecks, PlusSquare, Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { renderMarkdown } from "@/lib/renderMarkdown";
import { supabase } from "@/lib/supabase";
import { useTableRealtime } from "@/lib/hooks/useTableRealtime";

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
  // (AiAssistantWidget) rather than own the whole viewport the way
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
  // completes -- AiAssistantWidget uses this to refetch the tables list so
  // something this conversation just built shows up immediately in
  // AddQuickGlanceWidgetMenu.tsx without a manual page reload.
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

// A job whose progress hasn't moved in a while is presumed stalled (e.g.
// killed mid-way by Vercel's execution ceiling on the after() invocation --
// see app/api/ai/chat/route.ts's own header comment) -- same threshold and
// "checked on an interval, not a single timeout" shape
// AutoTimeRecordingPanel.tsx already uses for the identical concern.
const STALL_TIMEOUT_MS = 5 * 60 * 1000;

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

  // The job this thread is currently attached to (either one it just
  // created via send(), or one it found already running for
  // initialConversationId on mount -- see the attach effect below). Both
  // paths converge on the same applyJobRow handling.
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const jobUpdatedAtRef = useRef<number>(0);
  // Indices within the CURRENT turn's toolCalls array that have already
  // fired onBuildProgress -- realtime delivers the whole array on every
  // update (not a diff), so without this a build tool that was already
  // "done" on a prior update would re-fire every subsequent update too.
  // Reset at the start of every new/attached turn.
  const firedBuildIndicesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (compact) return; // onboarding embed skips the usage bar -- see prop doc
    fetch("/api/ai/usage").then(res => res.ok ? res.json() : null).then(json => { if (json) setUsage(json); });
  }, [compact]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const capReached = usage ? usage.tokensUsed >= usage.tokenCap : false;

  // Applies one ai_chat_jobs row (from the attach-on-mount lookup or a
  // realtime update) to the last (assistant) message, and finalizes the
  // turn once the job leaves 'running' -- same shape
  // AutoTimeRecordingPanel.tsx's own applyJobRow uses.
  const applyJobRow = useCallback((row: any) => {
    jobUpdatedAtRef.current = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
    const toolCalls: ToolCallEvent[] = row.tool_calls ?? [];

    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], content: row.content ?? "", toolCalls };
      return next;
    });

    toolCalls.forEach((call, i) => {
      if (call.phase === "done" && !call.isError && BUILD_TOOL_NAMES.has(call.name) && !firedBuildIndicesRef.current.has(i)) {
        firedBuildIndicesRef.current.add(i);
        onBuildProgress?.();
      }
    });

    if (row.status === "error") {
      setError(row.error || "Something went wrong");
    } else if (row.status === "done" && row.hit_iteration_limit) {
      // A cut-short multi-step build looks, from the client's point of
      // view, like the assistant just stopped talking mid-task -- this
      // tells the user why, rather than leaving it looking finished when
      // it isn't. (Together/OpenAI-style APIs have no distinct "refusal"
      // signal the way Anthropic's does -- a decline just comes back as
      // normal assistant text with finish_reason "stop".)
      setError("This is taking more steps than I can do in one go -- ask me to continue and I'll pick up from here.");
    }

    if (row.status !== "running") {
      setActiveJobId(null);
      setSending(false);
      onSendingChange?.(false);
      if (!compact) fetch("/api/ai/usage").then(res => res.ok ? res.json() : null).then(json => { if (json) setUsage(json); });
      onTurnComplete?.();
    }
  }, [compact, onBuildProgress, onSendingChange, onTurnComplete]);

  // Live progress for the job this thread is currently attached to --
  // filtered to that one row, not the whole table, same as
  // AutoTimeRecordingPanel.tsx.
  useTableRealtime({
    tableName: "ai_chat_jobs",
    companyId: null,
    filterColumn: "id",
    filterValue: activeJobId,
    onInsert: () => {},
    onUpdate: applyJobRow,
    onDelete: () => {},
  });

  // Runs once, on mount -- this component already remounts per-conversation
  // via the hosting page's key={conversationId} (see this file's own prop
  // docs), so "on mount" already means "whenever a different conversation
  // is opened." Finds a job still 'running' for initialConversationId (left
  // going when the tab/component last went away) and resumes it live
  // instead of the conversation just sitting there looking finished.
  useEffect(() => {
    if (!initialConversationId) return;
    let cancelled = false;
    supabase
      .from("ai_chat_jobs")
      .select("id, content, tool_calls, status, error, hit_iteration_limit, updated_at")
      .eq("conversation_id", initialConversationId)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        firedBuildIndicesRef.current = new Set();
        jobUpdatedAtRef.current = data.updated_at ? new Date(data.updated_at).getTime() : Date.now();
        setMessages((prev) => [...prev, { role: "assistant", content: data.content ?? "", toolCalls: data.tool_calls ?? [] }]);
        setSending(true);
        onSendingChange?.(true);
        setActiveJobId(data.id);
      });
    return () => { cancelled = true; };
    // Intentionally mount-only -- see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sending || !activeJobId) return;
    const interval = setInterval(() => {
      if (Date.now() - jobUpdatedAtRef.current > STALL_TIMEOUT_MS) {
        setError("This is taking much longer than expected and may have stalled -- please try again.");
        setActiveJobId(null);
        setSending(false);
        onSendingChange?.(false);
        onTurnComplete?.();
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [sending, activeJobId, onSendingChange, onTurnComplete]);

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
    firedBuildIndicesRef.current = new Set();

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, conversationId: activeConversationId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.jobId) throw new Error(json?.error || "Request failed");
      jobUpdatedAtRef.current = Date.now();
      setActiveJobId(json.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSending(false);
      onSendingChange?.(false);
      onTurnComplete?.();
    }
  }, [input, sending, capReached, conversationId, messages, onConversationCreated, onSendingChange, onTurnComplete]);

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

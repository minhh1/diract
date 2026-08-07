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
  Search, ChevronDown, ChevronRight, Brain,
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
  // The model's own chain-of-thought for this turn (see
  // app/api/ai/chat/route.ts's runJob / lib/ai/modelCall.ts's
  // reasoningEffort param) -- only ever set on the first turn of a build,
  // not accumulated across the whole conversation.
  reasoning?: string;
}

const TOOL_ICONS: Record<string, LucideIcon> = {
  list_existing_tables: ListChecks,
  list_existing_dashboards: ListChecks,
  research: Search,
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
    case "research": return `Researching: ${input.question ?? ""}`;
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

// Neutral, bordered cards -- not filled with brand color -- so a turn with
// several tool calls reads as a quiet activity log sitting above the reply,
// not a row of colorful badges competing with the actual answer. State
// (in-flight/done/error) is carried by the small icon/spinner alone.
function ToolCallChip({ call }: { call: ToolCallEvent }) {
  const Icon = TOOL_ICONS[call.name] || Sparkles;
  const inFlight = call.phase === "start";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] text-slate-600 bg-slate-50 border border-slate-200/70 w-fit"
    >
      {inFlight ? (
        <Loader2 size={13} className="animate-spin shrink-0 text-slate-400" />
      ) : call.isError ? (
        <X size={13} className="shrink-0 text-red-500" />
      ) : (
        <Check size={13} className="shrink-0 text-emerald-600" />
      )}
      <Icon size={13} className="shrink-0 text-slate-400" />
      <span className="truncate">{toolLabel(call.name, call.input)}</span>
    </motion.div>
  );
}

// Shown while the assistant has produced neither text nor a tool call yet
// for this turn -- just a slow pulse and a label naming what's actually
// happening, so it reads as "in progress" rather than "here's an empty
// reply". Quiet by design (this app's own reasoning text, when the
// provider returns any, replaces it -- see ThinkingBlock below).
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      >
        <Sparkles size={15} className="text-slate-300" />
      </motion.div>
      <span className="text-[14px] text-slate-400">Thinking</span>
    </div>
  );
}

// The model's real chain-of-thought for a turn (see ChatMessage.reasoning's
// own doc) -- collapsible since it's not meant to be the main thing you
// read, just available for anyone who wants to see the reasoning behind
// what it's about to build. Plain whitespace-pre-wrap, not renderMarkdown --
// chain-of-thought isn't reliably well-formed markdown, same reasoning the
// user bubble already renders raw text instead of markdown.
function ThinkingBlock({ text, defaultExpanded }: { text: string; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-slate-600 transition-colors"
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Brain size={13} />
        {expanded ? "Hide thinking" : "Show thinking"}
      </button>
      {expanded && (
        <div className="mt-2 pl-3.5 border-l-2 border-slate-100 text-[14px] leading-relaxed text-slate-400 whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}

export interface Usage {
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
  // Reports usage/cap on every fetch -- app/(app)/dashboard/ai/page.tsx
  // renders it itself, in its own header, rather than this component
  // reserving a full-width row for what's a short one-line stat (compact
  // mode never wanted it anyway, and the non-compact page-level caller is
  // the only one that ever did).
  onUsageChange?: (usage: Usage | null) => void;
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
  onUsageChange,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    onUsageChange?.(usage);
    // onUsageChange is a plain callback prop, not meant to retrigger this --
    // only actual usage changes should report upward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Grows the textarea to fit what's typed (up to a cap, then it scrolls
  // internally) instead of a fixed single-line input -- resets to "auto"
  // first so it can shrink back down too, not just grow.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

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
      next[next.length - 1] = { ...next[next.length - 1], content: row.content ?? "", toolCalls, reasoning: row.reasoning || undefined };
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
      .select("id, content, reasoning, tool_calls, status, error, hit_iteration_limit, updated_at")
      .eq("conversation_id", initialConversationId)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        firedBuildIndicesRef.current = new Set();
        jobUpdatedAtRef.current = data.updated_at ? new Date(data.updated_at).getTime() : Date.now();
        setMessages((prev) => [...prev, { role: "assistant", content: data.content ?? "", toolCalls: data.tool_calls ?? [], reasoning: data.reasoning || undefined }]);
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
      <div className={`flex-1 ${compact ? "max-h-[440px]" : ""} overflow-y-auto`}>
        <div className={`mx-auto w-full ${compact ? "" : "max-w-[720px]"} space-y-8`}>
          {messages.length === 0 && emptyStateHint && (
            <p className="text-[15px] text-slate-400 text-center py-16">{emptyStateHint}</p>
          )}
          <AnimatePresence initial={false}>
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              const hasToolCalls = (m.toolCalls?.length ?? 0) > 0;
              const toolsInFlight = (m.toolCalls ?? []).some((t) => t.phase === "start");
              const showThinking = m.role === "assistant" && !m.content && sending && isLast && !toolsInFlight && !m.reasoning;
              const showCursor = m.role === "assistant" && !!m.content && sending && isLast;

              // An assistant turn that ended up with nothing at all (no
              // text, no tool calls, no longer sending -- e.g. the request
              // errored before producing anything) has nothing worth
              // showing; the error banner below already explains why.
              if (m.role === "assistant" && !m.content && !hasToolCalls && !m.reasoning && !sending) return null;

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
                    // Soft neutral fill, not a saturated brand-color pill --
                    // the point of a user bubble is just to mark "this is
                    // what you typed," not to compete visually with the
                    // reply underneath it.
                    <div className="max-w-[75%] rounded-[22px] px-5 py-3 text-[15px] leading-relaxed bg-[#F0EFEA] text-slate-800 whitespace-pre-wrap">
                      {m.content}
                    </div>
                  ) : (
                    // No card/bubble on the assistant side -- tool activity
                    // and the reply itself sit directly on the page,
                    // distinguished from the user's messages by alignment
                    // alone (Claude/ChatGPT-style), not a boxed container.
                    <div className="max-w-[85%] text-[15px] leading-7 text-slate-800 py-1">
                      {m.reasoning && (
                        <ThinkingBlock text={m.reasoning} defaultExpanded={isLast && sending && !m.content} />
                      )}

                      {hasToolCalls && (
                        <div className="flex flex-col gap-1.5 mb-3">
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
                          {showCursor && <span className="inline-block w-[2px] h-[15px] bg-slate-400 mt-0.5 animate-pulse align-middle" />}
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

      <div className={`mx-auto w-full ${compact ? "mt-4 shrink-0" : "max-w-[720px] shrink-0 pt-6"}`}>
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-1.5 text-[13px] text-red-500 mb-2 overflow-hidden"
            >
              <AlertTriangle size={13} /> {error}
            </motion.p>
          )}
        </AnimatePresence>
        {capReached && (
          <p className="flex items-center gap-1.5 text-[13px] text-amber-700 bg-amber-50 rounded-2xl px-4 py-2 mb-2">
            <AlertTriangle size={13} /> Monthly token cap reached -- ask a company admin to raise it in Admin → AI Assistant.
          </p>
        )}
        {/* Enter to send, shift+Enter for a newline -- an auto-growing
            textarea rather than a fixed single-line input, so a longer
            message doesn't get silently clipped from view while typing. */}
        <div className="relative flex items-end border border-slate-200 rounded-[26px] bg-white shadow-sm focus-within:border-slate-300 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={capReached}
            placeholder={placeholder}
            // truncate (only while empty) keeps a too-long placeholder on
            // one line instead of visually wrapping into a second line
            // that gets clipped by the pill's own height -- the auto-grow
            // effect above only measures the empty VALUE's scrollHeight
            // (always one line), not how the placeholder text wraps, so a
            // narrow host (e.g. AiAssistantWidget.tsx's Quick Glance card)
            // never gets a chance to grow tall enough for it. Confirmed
            // live on a phone screenshot. Real typed input still wraps
            // normally the instant there's any value.
            className={`flex-1 resize-none px-5 py-3.5 text-[15px] leading-relaxed outline-none disabled:opacity-40 bg-transparent max-h-[200px] ${input ? "" : "truncate"}`}
          />
          <button
            onClick={send}
            disabled={sending || capReached || !input.trim()}
            className="m-2 w-9 h-9 flex items-center justify-center bg-slate-800 text-white rounded-full hover:bg-slate-900 active:scale-[0.94] disabled:opacity-30 disabled:active:scale-100 transition-all shrink-0"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

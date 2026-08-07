"use client";

// The same table/dashboard-builder assistant WelcomeOnboarding.tsx used to
// show as a full-page takeover (components/ai/AiChatThread.tsx, shared with
// app/(app)/dashboard/ai/page.tsx), now an ordinary addable/movable Quick
// Glance widget instead -- a templateless company keeps easy access to it
// for adjusting its schema (add a table, add a field, ...) as part of the
// same customizable canvas everything else lives in, rather than a
// dedicated screen that only ever shows once and then disappears the
// moment a real template gets installed.
//
// Unlike the full /dashboard/ai page (a persistent sidebar column), this is
// a condensed history dropdown (same positioned-overlay pattern
// AddQuickGlanceWidgetMenu.tsx already uses) -- there isn't room in a
// widget-sized card for a permanent list. Same underlying data/mutations
// (lib/hooks/useAiConversations.ts) and the same remount-via-key pattern
// switching conversations that the full page uses, just condensed.
import { useEffect, useRef, useState } from "react";
import { Sparkles, History, Plus, MessageSquare, Pin, Pencil, Check, X, Trash2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import { useAiConversations } from "@/lib/hooks/useAiConversations";
import AiChatThread, { type ChatMessage } from "@/components/ai/AiChatThread";

export default function AiAssistantWidget() {
  const { isAdmin, userId } = useCompany();
  // Own fetch of the tables list, purely for its refetch -- so a table this
  // same conversation just built shows up immediately in "Add widget"
  // (AddQuickGlanceWidgetMenu.tsx) without the user needing to reload the
  // page. useCustomTables' module-level cache (see its own header comment)
  // means this doesn't cost a second round trip beyond what
  // QuickGlanceCanvas.tsx's own call already pays for.
  const { refetch } = useCustomTables(userId);

  const { conversations, refetch: loadConversations, rename, togglePin, remove } = useAiConversations();
  // conversationId is for highlighting the active row + telling
  // AiChatThread which conversation to POST against next; openedConversationId
  // is what actually drives AiChatThread's key/remount. Kept separate so
  // AiChatThread minting its own id mid-turn (onConversationCreated, fired
  // synchronously the instant a brand-new thread starts) doesn't remount
  // this component and drop the in-progress turn -- see
  // app/(app)/dashboard/ai/page.tsx's identical fix for the full reasoning
  // (confirmed live: without this, the turn still completes and saves
  // correctly server-side, but the thread visibly goes blank until
  // reopened).
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [openedConversationId, setOpenedConversationId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!historyOpen) return;
    const onClick = (e: MouseEvent) => { if (historyRef.current && !historyRef.current.contains(e.target as Node)) setHistoryOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [historyOpen]);

  const startNewChat = () => {
    setConversationId(null);
    setOpenedConversationId(null);
    setInitialMessages([]);
    setHistoryOpen(false);
  };

  const openConversation = async (id: string) => {
    // Fetch BEFORE touching openedConversationId (the key AiChatThread
    // remounts on) -- see app/(app)/dashboard/ai/page.tsx's identical fix
    // for why: initialMessages only seeds a new instance's state at mount
    // time, so setting the key first would remount before this fetch
    // lands and silently ignore its result. Confirmed live: without this
    // ordering, clicking a past conversation just shows an empty thread.
    setConversationId(id);
    setHistoryOpen(false);
    const res = await fetch(`/api/ai/conversations/${id}`);
    if (!res.ok) return;
    const json = await res.json();
    setInitialMessages(
      (json.messages ?? []).map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content }))
    );
    setOpenedConversationId(id);
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

  return (
    // Not h-full/flex-1 -- react-grid-layout (QuickGlanceCanvas.tsx) gives
    // every cell a fixed PIXEL height (rowHeight * h) regardless of
    // viewport width, with no responsive/mobile breakpoint handling at
    // all. On a narrow phone that same fixed height (this widget's default
    // layout is h:12, ~612px -- lib/dashboardWidgets/quickGlanceTypes.ts)
    // is squarish on desktop but absurdly tall next to the shrunk mobile
    // width. Every other widget already tolerates this by sizing to its
    // own intrinsic content and leaving quiet background whitespace below
    // -- this one was the outlier, explicitly stretching its bordered card
    // to fill the whole oversized cell (confirmed live: a mostly-empty
    // white rounded box with the input stranded near the top). Sizing to
    // content instead, matching the others, rather than fixing the grid's
    // actual sizing system (a much larger change affecting every widget).
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <Sparkles size={15} className="text-slate-400 shrink-0" />
        <p className="text-[13px] font-medium text-slate-700 flex-1">AI Assistant</p>
        {isAdmin && (
          <div className="relative" ref={historyRef}>
            <div className="flex items-center gap-1">
              <button onClick={startNewChat} title="New chat" className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors">
                <Plus size={14} />
              </button>
              <button onClick={() => setHistoryOpen((o) => !o)} title="History" className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors">
                <History size={14} />
              </button>
            </div>
            {historyOpen && (
              <div className="absolute right-0 z-20 mt-2 w-64 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5">
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => renamingId !== c.id && openConversation(c.id)}
                    className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${
                      conversationId === c.id ? "bg-slate-100 text-slate-800" : "hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    <MessageSquare size={11} className="shrink-0 opacity-50" />
                    {renamingId === c.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.key === "Enter" && confirmRename(c.id)}
                        className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] border border-slate-300 rounded-md outline-none focus:border-slate-400"
                      />
                    ) : (
                      <p className="text-[11px] truncate flex-1">{c.title}</p>
                    )}
                    {renamingId === c.id ? (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); confirmRename(c.id); }} className="p-0.5 text-emerald-500 hover:text-emerald-700 shrink-0">
                          <Check size={10} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setRenamingId(null); }} className="p-0.5 text-slate-300 hover:text-slate-500 shrink-0">
                          <X size={10} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); togglePin(c.id); }}
                          title={c.pinned ? "Unpin" : "Pin"}
                          className={`p-0.5 shrink-0 transition-all ${
                            c.pinned ? "text-slate-500" : "text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-500"
                          }`}
                        >
                          <Pin size={10} fill={c.pinned ? "currentColor" : "none"} />
                        </button>
                        <button
                          onClick={(e) => startRename(c.id, c.title, e)}
                          className="p-0.5 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          onClick={(e) => deleteConversation(c.id, e)}
                          className="p-0.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        >
                          <Trash2 size={10} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {conversations.length === 0 && <p className="text-[11px] text-slate-300 text-center py-6">No conversations yet</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {isAdmin ? (
        // A fixed height WE pick (not h-full stretching to fill
        // react-grid-layout's own oversized cell, the original mostly-
        // empty-box bug) -- flex flex-col so AiChatThread's own h-full
        // root can fill it and its message area actually grows into the
        // space (via its internal flex-1) instead of collapsing to
        // whatever's shortest. overflow-hidden here since AiChatThread's
        // own message area is the one that scrolls internally.
        <div className="bg-[#FAF9F6] border border-slate-200 rounded-2xl overflow-hidden p-4 h-[420px] flex flex-col">
          <AiChatThread
            key={openedConversationId ?? "new"}
            compact
            initialConversationId={openedConversationId}
            initialMessages={initialMessages}
            initialAssistantMessage={
              initialMessages.length === 0
                ? 'Tell me what you do, and I\'ll help set your database up -- e.g. "I run a plumbing company with 10 employees, I want to track jobs, invoices, and payroll."'
                : undefined
            }
            placeholder="Add or change something..."
            onConversationCreated={setConversationId}
            onBuildProgress={refetch}
            onTurnComplete={loadConversations}
          />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl flex items-center justify-center p-8 text-center">
          <p className="text-[12px] text-slate-400">
            Ask a company admin to describe your business to the AI assistant to set up tables, fields, and dashboards.
          </p>
        </div>
      )}
    </div>
  );
}

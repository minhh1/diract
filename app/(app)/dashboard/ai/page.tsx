// app/dashboard/ai/page.tsx
// Chat UI for the table/dashboard-builder assistant (see
// app/api/ai/chat/route.ts) -- describe your business and it creates the
// custom tables, fields, and dashboards for it, via tool-calling against
// this company's own schema. Admin-only, since every tool it can call runs
// with admin-equivalent rights (see lib/ai/tableBuilderTools.ts).
//
// Conversations are personal (not shared with teammates) and persisted via
// supabase/ai_conversations.sql + ai_messages.sql -- see
// app/api/ai/conversations for the list/load/rename/pin/delete endpoints.
// The conversation-list sidebar (AiConversationSidebar.tsx) and its nav
// state/handlers (lib/hooks/useAiConversationNav.ts) are shared with
// AiAssistantWidget.tsx -- an expanded Quick Glance widget embed of this
// same assistant for a templateless company, which now fills the canvas the
// same way this page fills the viewport rather than a condensed dropdown.
// The conversation id is generated client-side (crypto.randomUUID()) so the
// first message in a new chat can create the row inline in
// app/api/ai/chat/route.ts rather than needing a separate create call.
//
// The actual message-list/tool-call-chip rendering lives in
// components/ai/AiChatThread.tsx, shared the same way. This page owns the
// conversation-list sidebar and remounts AiChatThread (via `key`) whenever
// the selected conversation changes, rather than lifting its message/
// conversationId state up here.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Shield, Loader2, PanelLeft } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useAiConversationNav } from "@/lib/hooks/useAiConversationNav";
import AiConversationSidebar from "@/components/ai/AiConversationSidebar";
import AiChatThread, { type Usage } from "@/components/ai/AiChatThread";

export default function AiAssistantPage() {
  const router = useRouter();
  const { isAdmin, loading: companyLoading } = useCompany();
  const nav = useAiConversationNav();
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  // Sidebar starts hidden below md (see the wrapper's own comment) --
  // reported live: on a phone the 64-wide conversation list ate the whole
  // screen, leaving no room for the chat itself.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    // h-full, not h-screen -- this already sits inside DashboardLayout's own
    // height-constrained content column (100vh minus the trial-workspace
    // banner, when one's showing). h-screen here would re-claim a full
    // 100vh that doesn't actually fit, overflowing that column by the
    // banner's height; AiChatThread's own bottomRef.scrollIntoView() then
    // drags that ancestor scroll container down to compensate, which
    // visually shoves this page's header up behind the banner. Confirmed
    // live: this is what caused it, not the header restyle itself.
    <div className="relative flex h-full bg-[#FAF9F6] font-sans antialiased text-slate-600 overflow-hidden">
      {/* Below md, the sidebar is an off-canvas drawer (only the chat shows
          by default) rather than a permanent column -- toggled via the
          header button, and a tap on the backdrop or picking/starting a
          chat closes it again. md: resets it back to a normal in-flow
          column, same as before this existed. */}
      <div
        className={`absolute inset-y-0 left-0 z-20 bg-[#FAF9F6] shadow-xl md:shadow-none transition-transform duration-200 ease-out md:static md:translate-x-0 md:z-auto ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <AiConversationSidebar
          conversations={nav.conversations}
          activeId={nav.conversationId}
          renamingId={nav.renamingId}
          renameValue={nav.renameValue}
          onRenameValueChange={nav.setRenameValue}
          onNew={() => { nav.startNewChat(); setMobileNavOpen(false); }}
          onSelect={(id) => { nav.openConversation(id); setMobileNavOpen(false); }}
          onStartRename={nav.startRename}
          onConfirmRename={nav.confirmRename}
          onCancelRename={nav.cancelRename}
          onTogglePin={nav.togglePin}
          onDelete={nav.deleteConversation}
        />
      </div>
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="absolute inset-0 z-10 bg-black/30 md:hidden"
        />
      )}

      {/* Chat */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Show conversations"
              className="md:hidden -ml-1.5 p-1.5 text-slate-500 hover:text-slate-700"
            >
              <PanelLeft size={17} />
            </button>
            <motion.div
              animate={sending ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
              transition={sending ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" } : undefined}
            >
              <Sparkles size={16} className="text-slate-400" />
            </motion.div>
            <h1 className="text-[15px] font-medium text-slate-700">Ask AI</h1>
          </div>
          {usage && (
            <div className="flex items-center gap-2 text-[12px] text-slate-400 shrink-0">
              <span>{usage.tokensUsed.toLocaleString()} / {usage.effectiveTokenCap.toLocaleString()} tokens</span>
              <span className="text-slate-300">&middot;</span>
              <span>~${usage.estimatedCostUsd.toFixed(2)} spent</span>
              <div className="h-1 w-16 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${usage.tokensUsed >= usage.effectiveTokenCap ? "bg-red-400" : "bg-slate-300"}`}
                  initial={false}
                  animate={{ width: `${Math.min(100, (usage.tokensUsed / usage.effectiveTokenCap) * 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto px-8 pb-8">
          <div className="h-full">
            {/* Gated on conversationsLoading (not just companyLoading) --
                AiChatThread's initialMessages only seeds its internal
                useState once at mount, so mounting before nav's own fetch
                of past messages resolves would bake in an empty thread
                permanently for this instance. This fetch is fast; the
                spinner is brief. */}
            {nav.conversationsLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={18} className="animate-spin text-slate-300" />
              </div>
            ) : (
              <AiChatThread
                key={nav.openedConversationId ?? "new"}
                initialConversationId={nav.openedConversationId}
                initialMessages={nav.initialMessages}
                welcomeMessage={nav.initialMessages.length === 0 ? nav.welcomeMessage : undefined}
                onConversationCreated={nav.setConversationId}
                onTurnComplete={nav.loadConversations}
                onSendingChange={setSending}
                onUsageChange={setUsage}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

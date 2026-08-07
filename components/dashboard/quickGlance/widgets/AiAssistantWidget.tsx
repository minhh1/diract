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
// Reported live: a condensed history dropdown felt cramped once this widget
// started filling the whole canvas by default (lib/dashboardWidgets/
// defaultQuickGlanceLayout.ts's templateless w:12 layout) instead of being
// a small card among others -- there's room for the exact same two-pane
// layout app/(app)/dashboard/ai/page.tsx uses now. Both surfaces share the
// same nav state/handlers (lib/hooks/useAiConversationNav.ts) and the same
// sidebar UI (AiConversationSidebar.tsx) so there's one copy of the
// mid-turn-remount and stale-open fixes, not a third divergent one.
import { Sparkles, Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import { useAiConversationNav } from "@/lib/hooks/useAiConversationNav";
import AiConversationSidebar from "@/components/ai/AiConversationSidebar";
import AiChatThread from "@/components/ai/AiChatThread";

export default function AiAssistantWidget() {
  const { isAdmin, userId } = useCompany();
  // Own fetch of the tables list, purely for its refetch -- so a table this
  // same conversation just built shows up immediately in "Add widget"
  // (AddQuickGlanceWidgetMenu.tsx) without the user needing to reload the
  // page. useCustomTables' module-level cache (see its own header comment)
  // means this doesn't cost a second round trip beyond what
  // QuickGlanceCanvas.tsx's own call already pays for.
  const { refetch } = useCustomTables(userId);
  const nav = useAiConversationNav();

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2.5 shrink-0 px-1 pb-3">
        <Sparkles size={15} className="text-slate-400 shrink-0" />
        <p className="text-[13px] font-medium text-slate-700">AI Assistant</p>
      </div>

      {isAdmin ? (
        <div className="flex-1 min-h-0 flex bg-[#FAF9F6] border border-slate-200 rounded-2xl overflow-hidden">
          <AiConversationSidebar
            conversations={nav.conversations}
            activeId={nav.conversationId}
            renamingId={nav.renamingId}
            renameValue={nav.renameValue}
            onRenameValueChange={nav.setRenameValue}
            onNew={nav.startNewChat}
            onSelect={nav.openConversation}
            onStartRename={nav.startRename}
            onConfirmRename={nav.confirmRename}
            onCancelRename={nav.cancelRename}
            onTogglePin={nav.togglePin}
            onDelete={nav.deleteConversation}
          />
          <div className="flex-1 min-w-0 p-4 overflow-hidden">
            {/* Gated on conversationsLoading -- see page.tsx's identical
                comment: initialAssistantMessage only seeds AiChatThread's
                internal state once at mount, so mounting before
                nav.welcomeMessage's real value is known would bake in the
                wrong one (first-time pitch vs personalized "welcome back")
                permanently for this instance. */}
            {nav.conversationsLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={18} className="animate-spin text-slate-300" />
              </div>
            ) : (
              <AiChatThread
                key={nav.openedConversationId ?? "new"}
                compact
                initialConversationId={nav.openedConversationId}
                initialMessages={nav.initialMessages}
                initialAssistantMessage={nav.initialMessages.length === 0 ? nav.welcomeMessage : undefined}
                placeholder="Add or change something..."
                onConversationCreated={nav.setConversationId}
                onBuildProgress={refetch}
                onTurnComplete={nav.loadConversations}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl flex-1 min-h-0 flex items-center justify-center p-8 text-center">
          <p className="text-[12px] text-slate-400">
            Ask a company admin to describe your business to the AI assistant to set up tables, fields, and dashboards.
          </p>
        </div>
      )}
    </div>
  );
}

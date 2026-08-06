"use client";

// The same table/dashboard-builder assistant WelcomeOnboarding.tsx used to
// show as a full-page takeover (components/ai/AiChatThread.tsx, shared with
// app/(app)/dashboard/ai/page.tsx), now an ordinary addable/movable Quick
// Glance widget instead -- a templateless company keeps easy access to it
// for adjusting its schema (add a table, add a field, ...) as part of the
// same customizable canvas everything else lives in, rather than a
// dedicated screen that only ever shows once and then disappears the
// moment a real template gets installed.
import { Sparkles } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
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

  return (
    <div className="space-y-3 h-full flex flex-col">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
          <Sparkles size={16} className="text-indigo-600" />
        </div>
        <p className="text-[13px] font-bold text-slate-800">AI Assistant</p>
      </div>

      {isAdmin ? (
        <div className="bg-white border border-slate-200 rounded-2xl flex-1 min-h-0 overflow-y-auto p-4">
          <AiChatThread
            compact
            initialAssistantMessage={'Tell me what you do, and I\'ll help set your database up -- e.g. "I run a plumbing company with 10 employees, I want to track jobs, invoices, and payroll."'}
            placeholder="Tell it what to add or change..."
            onBuildProgress={refetch}
          />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl flex-1 min-h-0 flex items-center justify-center p-4 text-center">
          <p className="text-[12px] text-slate-400">
            Ask a company admin to describe your business to the AI assistant to set up tables, fields, and dashboards.
          </p>
        </div>
      )}
    </div>
  );
}

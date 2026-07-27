"use client";

// View-mode body for a PublicTaskPageWidget (see
// lib/dashboardWidgets/types.ts) -- the create/revoke flow lives in the
// config panel (components/dashboard/builder/WidgetConfigPanel.tsx's
// PublicTaskPageConfig); this renders the ACTUAL public task report inline
// (via components/public/PublicTasksContent.tsx, the same component
// /public/tasks/[pageId] itself uses) once a page exists, rather than just
// a link out to it.
import { Share2 } from "lucide-react";
import PublicTasksContent from "@/components/public/PublicTasksContent";

interface Props {
  pageId: string | null;
}

export default function PublicTaskPageWidget({ pageId }: Props) {
  if (!pageId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
        <Share2 size={18} className="text-slate-300" />
        <p className="text-[11px] text-slate-400">Open this widget's settings to create the public link</p>
      </div>
    );
  }

  return <PublicTasksContent pageId={pageId} embedded />;
}

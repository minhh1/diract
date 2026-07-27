"use client";

// View-mode body for a PublicDocumentPageWidget (see
// lib/dashboardWidgets/types.ts) -- the picker that sets pageId lives in
// the config panel (components/dashboard/builder/WidgetConfigPanel.tsx's
// PublicDocumentPageConfig); this renders the ACTUAL document-fill form
// inline (via components/public/PublicDocumentsContent.tsx, the same
// component /public/documents/[pageId] itself uses) once a page's been
// picked, rather than just a link out to it.
import { FileSignature } from "lucide-react";
import PublicDocumentsContent from "@/components/public/PublicDocumentsContent";

interface Props {
  pageId: string | null;
}

export default function DocumentPublicPageWidget({ pageId }: Props) {
  if (!pageId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
        <FileSignature size={18} className="text-slate-300" />
        <p className="text-[11px] text-slate-400">Open this widget's settings to pick a document link</p>
      </div>
    );
  }

  return <PublicDocumentsContent pageId={pageId} embedded />;
}

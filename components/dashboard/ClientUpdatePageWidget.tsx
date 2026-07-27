"use client";

// View-mode body for a PublicClientUpdatePageWidget (see
// lib/dashboardWidgets/types.ts) -- the create/pick/revoke flow lives in
// the config panel (components/dashboard/builder/WidgetConfigPanel.tsx's
// PublicClientUpdatePageConfig); this renders the ACTUAL client-update
// board inline (via components/public/PublicClientUpdateContent.tsx, the
// same component /public/updates/[slug] itself uses) once a page exists,
// rather than just a link out to it. Since the viewer already has a staff
// session here, it naturally resolves to the fully editable board -- no
// PIN prompt, same as opening the standalone link while signed in.
import { Newspaper } from "lucide-react";
import PublicClientUpdateContent from "@/components/public/PublicClientUpdateContent";

interface Props {
  slug: string | null;
}

export default function ClientUpdatePageWidget({ slug }: Props) {
  if (!slug) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
        <Newspaper size={18} className="text-slate-300" />
        <p className="text-[11px] text-slate-400">Open this widget's settings to create or pick a client update page</p>
      </div>
    );
  }

  return <PublicClientUpdateContent slug={slug} embedded />;
}

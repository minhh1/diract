"use client";

// View-mode card for a PublicTaskPageWidget (see
// lib/dashboardWidgets/types.ts) -- the actual create/revoke flow lives in
// the config panel (components/dashboard/builder/WidgetConfigPanel.tsx's
// PublicTaskPageConfig); this just shows the resulting link once one
// exists, or a hint to configure it if the widget was added but never set up.
import { useState } from "react";
import { Copy, Check, ExternalLink, Share2 } from "lucide-react";

interface Props {
  pageId: string | null;
}

export default function PublicTaskPageWidget({ pageId }: Props) {
  const [copied, setCopied] = useState(false);

  if (!pageId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
        <Share2 size={18} className="text-slate-300" />
        <p className="text-[11px] text-slate-400">Open this widget's settings to create the public link</p>
      </div>
    );
  }

  const url = typeof window !== 'undefined' ? `${window.location.origin}/public/tasks/${pageId}` : `/public/tasks/${pageId}`;

  return (
    <div className="h-full flex flex-col justify-between gap-3 p-4 bg-white border border-slate-200 rounded-2xl">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
          <Share2 size={14} />
        </div>
        <p className="text-[12px] font-bold text-slate-800">My tasks + unallocated</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
          title="Open"
        >
          <ExternalLink size={16} />
        </a>
      </div>
    </div>
  );
}

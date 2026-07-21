// components/admin/CredentialsHelpDrawer.tsx
// Right-side slide-out panel explaining where to find each credential a
// connect form asks for -- same overlay + right-anchored panel convention
// as ColumnConfigDrawer.tsx. Shared by AdminWhatsAppTab and AdminMsTeamsTab
// since both need "where do I find these values" walkthroughs; content is
// passed in as steps rather than duplicating the drawer chrome per service.
"use client";

import { X, ExternalLink } from "lucide-react";

interface Step {
  title: string;
  description: string;
  linkLabel?: string;
  linkUrl?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  intro: string;
  steps: Step[];
}

export default function CredentialsHelpDrawer({ isOpen, onClose, title, intro, steps }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={onClose} />

      <div className="relative ml-auto w-[28rem] bg-white h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 pt-10 pb-4 border-b border-slate-100 shrink-0">
          <h2 className="text-[13px] font-bold text-slate-800 uppercase tracking-wide">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <p className="text-[12px] text-slate-500">{intro}</p>

          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="text-[12px] font-bold text-slate-700">{step.title}</p>
                  <p className="text-[12px] text-slate-500 mt-0.5">{step.description}</p>
                  {step.linkUrl && (
                    <a
                      href={step.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline mt-1"
                    >
                      {step.linkLabel ?? step.linkUrl} <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

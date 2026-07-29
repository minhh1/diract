// components/SmartFieldHint.tsx
// Inline "here's a quick improvement" hint, rendered under a name/title
// field -- see lib/smartValidation/nameQuality.ts for the rules and
// lib/hooks/useNameQualityCheck.ts for the per-field state. Deliberately
// amber, not MasterTable.tsx's existing red dashed-underline+tooltip
// pattern (its cellErrors Map) -- these are friendly suggestions, never a
// blocking validation error.
"use client";

import { Lightbulb, X } from "lucide-react";
import type { NameSuggestion } from "@/lib/smartValidation/nameQuality";

interface Props {
  suggestions: NameSuggestion[];
  onApply: (suggestion: NameSuggestion) => void;
  onDismiss: (id: string) => void;
}

export default function SmartFieldHint({ suggestions, onApply, onDismiss }: Props) {
  if (!suggestions.length) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {suggestions.map(s => (
        <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-[11px] text-amber-800">
          <Lightbulb size={12} className="shrink-0 text-amber-500" />
          <span className="flex-1 min-w-0">{s.message}</span>
          {s.apply && s.actionLabel && (
            <button type="button" onClick={() => onApply(s)}
              className="shrink-0 px-2.5 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-full hover:bg-indigo-700 transition-colors">
              {s.actionLabel}
            </button>
          )}
          <button type="button" onClick={() => onDismiss(s.id)} title="Dismiss"
            className="shrink-0 p-0.5 text-amber-400 hover:text-amber-700 transition-colors">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

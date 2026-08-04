// components/legal/JurisdictionTabs.tsx
// Switches between the AU / EU & UK / US jurisdiction-specific sections of
// the Terms of Service and Privacy Policy. Pre-selects the tab matching the
// visitor's detected location (see lib/legalJurisdiction.ts) but never
// hides the other two -- see that file's own comment for why.
"use client";

import { useState, type ReactNode } from "react";
import type { Jurisdiction } from "@/lib/legalJurisdiction";

const LABELS: Record<Jurisdiction, string> = {
  AU: "Australia",
  EU_UK: "European Union & UK",
  US: "United States",
};

export default function JurisdictionTabs({
  defaultJurisdiction,
  sections,
}: {
  defaultJurisdiction: Jurisdiction;
  sections: Record<Jurisdiction, ReactNode>;
}) {
  const [active, setActive] = useState<Jurisdiction>(defaultJurisdiction);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Jurisdiction">
        {(Object.keys(LABELS) as Jurisdiction[]).map(j => (
          <button
            key={j}
            role="tab"
            aria-selected={active === j}
            onClick={() => setActive(j)}
            className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
              active === j
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-slate-500 hover:bg-slate-100"
            }`}
          >
            {LABELS[j]}
            {defaultJurisdiction === j && <span className="ml-1.5 opacity-60 font-normal">(your region)</span>}
          </button>
        ))}
      </div>
      <div className="text-slate-600 text-sm leading-relaxed">
        {sections[active]}
      </div>
    </div>
  );
}

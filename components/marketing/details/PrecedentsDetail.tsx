"use client";

// The rich deep-dive page for "Precedents" -- reuses the real precedents
// mockup from mockups.tsx, and adds the two genuinely real AI-assisted
// features found in app/api/precedents/[id]/draft, draft-subject, and
// cross-reference-check: a pre-fill draft (never auto-applied, always
// editable before issuing) and a defined-terms/cross-reference checker
// that works on any uploaded .docx, not just the library.
import { FileText, Sparkles, Search } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

const PrecedentsMockup = MOCKUPS.precedents;

export default function PrecedentsDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={FileText}
          badgeText="Precedents"
          badgeClass="bg-indigo-50 border-indigo-100 text-indigo-600"
          headlineLines={["A library your team trusts,", "not a folder of old Word docs."]}
          accentClass="text-indigo-600"
          subheadline="Grouped by practice area, flagged when they need a second look, and issued straight into a matter, fully tracked from draft to execution."
        />

        <Section eyebrow="Library" title="Grouped, flagged, and one click to issue">
          <div className={isDark ? "dark" : ""}><PrecedentsMockup /></div>
        </Section>

        <Section eyebrow="AI assist" title="A drafted starting point, never the final word">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Give the AI a short brief and it drafts a subject and body to fill the issue form. It's entirely optional, and it
            never issues anything on its own. You review and edit before anything goes out, every time.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Sparkles size={14} className="text-indigo-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Draft with AI</span>
          </div>
        </Section>

        <Section eyebrow="Quality check" title="Catch a broken cross-reference before it goes out">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Upload any Word document, not just from the library, and it's checked for cross-references that point nowhere
            (a clause, schedule, or annexure number that doesn't exist) and defined terms that are declared but never used, or
            used without ever being defined. Issues come back as real comments in a marked-up copy of your own document.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Search size={14} className="text-indigo-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Cross-reference &amp; defined-terms check</span>
          </div>
        </Section>
      </div>
    </section>
  );
}

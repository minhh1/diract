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
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const PrecedentsMockup = MOCKUPS.precedents;

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Precedents",
  headlineLine1: "A library your team trusts,",
  headlineLine2: "not a folder of old Word docs.",
  subheadline: "Grouped by practice area, flagged when they need a second look, and issued straight into a matter, fully tracked from draft to execution.",
  sections: [
    { key: "library", eyebrow: "Library", title: "Grouped, flagged, and one click to issue", body: [] },
    {
      key: "ai-assist",
      eyebrow: "AI assist",
      title: "A drafted starting point, never the final word",
      body: ["Give the AI a short brief and it drafts a subject and body to fill the issue form. It's entirely optional, and it never issues anything on its own. You review and edit before anything goes out, every time."],
    },
    {
      key: "quality-check",
      eyebrow: "Quality check",
      title: "Catch a broken cross-reference before it goes out",
      body: ["Upload any Word document, not just from the library, and it's checked for cross-references that point nowhere (a clause, schedule, or annexure number that doesn't exist) and defined terms that are declared but never used, or used without ever being defined. Issues come back as real comments in a marked-up copy of your own document."],
    },
  ],
};

export default function PrecedentsDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={FileText}
          badgeText={copy.badgeText}
          badgeClass="bg-indigo-50 border-indigo-100 text-indigo-600"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-indigo-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} title={copy.sections[0].title}>
          <div className={isDark ? "dark" : ""}><PrecedentsMockup /></div>
        </Section>

        <Section eyebrow={copy.sections[1].eyebrow} title={copy.sections[1].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[1].body[0]}
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Sparkles size={14} className="text-indigo-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Draft with AI</span>
          </div>
        </Section>

        <Section eyebrow={copy.sections[2].eyebrow} title={copy.sections[2].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[2].body[0]}
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

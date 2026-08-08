"use client";

// The rich deep-dive page for the "Residual land solver" -- grounded in
// lib/residualLandValue.ts, which genuinely solves by bisection for the
// land price where margin-on-cost hits your target, re-deriving stamp
// duty and title fees at every candidate price rather than holding them
// fixed. The real UI (components/public/ResidualLandSolverContent.tsx)
// discloses its own two simplifications, reproduced honestly here rather
// than glossed over: finance cost uses the standard feasibility shorthand
// (average balance ≈ 50% of peak debt), and duty rates are general (no
// PPR concessions or foreign-buyer surcharges).
import { Calculator } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS, Stat } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const ResidualLandMockup = MOCKUPS.residualLand;

const INPUTS = [
  "Number of dwellings", "Average dwelling size", "Expected sale price per dwelling", "Project duration",
  "Construction rate ($/sqm)", "Professional fees (% of construction)", "Contingency (% of construction)",
  "Marketing & selling (% of revenue)", "Interest rate", "Loan to cost", "Target margin on cost", "State (for duty)",
];

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Residual land solver",
  headlineLine1: "Solved backward from your margin,",
  headlineLine2: "not forced forward from a guess.",
  subheadline: "Set the margin you need, and the solver works backward to the land price that actually supports it. It re-checks stamp duty and title fees at every price it tests, not just once at the end.",
  sections: [
    { key: "output", eyebrow: "Output", title: "A land price, and everything it's built on", body: [] },
    { key: "inputs", eyebrow: "Inputs", title: "The real numbers behind the answer", body: [] },
    {
      key: "honestly",
      eyebrow: "Honestly",
      title: "Two simplifications, stated plainly",
      body: ["Finance cost uses the standard feasibility shorthand: a progressively-drawn loan's average balance treated as roughly half of peak debt, not a dated drawdown schedule. Duty rates are general figures, without PPR concessions or foreign-buyer surcharges. Both are disclosed right in the tool, not hidden in a footnote."],
    },
  ],
};

export default function ResidualLandSolverDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Calculator}
          badgeText={copy.badgeText}
          badgeClass="bg-amber-50 border-amber-100 text-amber-700"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-amber-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} eyebrowClass="text-amber-500" title={copy.sections[0].title}>
          <div className={isDark ? "dark" : ""}><ResidualLandMockup /></div>
        </Section>

        <Section eyebrow={copy.sections[1].eyebrow} eyebrowClass="text-amber-500" title={copy.sections[1].title}>
          <div className="flex flex-wrap gap-2 max-w-2xl">
            {INPUTS.map((i) => (
              <span key={i} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-[12px] font-medium">{i}</span>
            ))}
          </div>
        </Section>

        <Section eyebrow={copy.sections[2].eyebrow} eyebrowClass="text-amber-500" title={copy.sections[2].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed">
            {copy.sections[2].body[0]}
          </p>
        </Section>
      </div>
    </section>
  );
}

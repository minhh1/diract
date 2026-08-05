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

const ResidualLandMockup = MOCKUPS.residualLand;

const INPUTS = [
  "Number of dwellings", "Average dwelling size", "Expected sale price per dwelling", "Project duration",
  "Construction rate ($/sqm)", "Professional fees (% of construction)", "Contingency (% of construction)",
  "Marketing & selling (% of revenue)", "Interest rate", "Loan to cost", "Target margin on cost", "State (for duty)",
];

export default function ResidualLandSolverDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Calculator}
          badgeText="Residual land solver"
          badgeClass="bg-amber-50 border-amber-100 text-amber-700"
          headlineLines={["Solved backward from your margin,", "not forced forward from a guess."]}
          accentClass="text-amber-600"
          subheadline="Set the margin you need, and the solver works backward to the land price that actually supports it. It re-checks stamp duty and title fees at every price it tests, not just once at the end."
        />

        <Section eyebrow="Output" eyebrowClass="text-amber-500" title="A land price, and everything it's built on">
          <div className={isDark ? "dark" : ""}><ResidualLandMockup /></div>
        </Section>

        <Section eyebrow="Inputs" eyebrowClass="text-amber-500" title="The real numbers behind the answer">
          <div className="flex flex-wrap gap-2 max-w-2xl">
            {INPUTS.map((i) => (
              <span key={i} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-[12px] font-medium">{i}</span>
            ))}
          </div>
        </Section>

        <Section eyebrow="Honestly" eyebrowClass="text-amber-500" title="Two simplifications, stated plainly">
          <p className="text-[15px] text-slate-500 leading-relaxed">
            Finance cost uses the standard feasibility shorthand: a progressively-drawn loan's average balance treated as
            roughly half of peak debt, not a dated drawdown schedule. Duty rates are general figures, without PPR concessions or
            foreign-buyer surcharges. Both are disclosed right in the tool, not hidden in a footnote.
          </p>
        </Section>
      </div>
    </section>
  );
}

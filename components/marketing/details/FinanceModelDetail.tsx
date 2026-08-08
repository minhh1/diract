"use client";

// The rich deep-dive page for "Finance model" -- grounded in the real
// 7-tab structure (components/public/PublicFinanceModelContent.tsx):
// Overview (Budget vs Actual, synced to Xero), Transactions, Timeline,
// Loans, Duty & Fees, Feasibility, Attachments. The Feasibility calculator
// itself (lib/feasibilityCalculator.ts) computes GFA, revenue, costs,
// margin-on-cost %, required equity, and return on equity.
import { TrendingUp } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS, Stat } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const FinanceModelMockup = MOCKUPS.financeModel;
const TABS = ["Overview", "Transactions", "Timeline", "Loans", "Duty & Fees", "Feasibility", "Attachments"];

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Finance model",
  headlineLine1: "A real budget,",
  headlineLine2: "reconciled against real transactions.",
  subheadline: "One record per deal, seven real tabs deep. It goes from a live budget-vs-actual synced to Xero, through to a full feasibility calculator, without ever leaving the platform.",
  sections: [
    {
      key: "overview",
      eyebrow: "Overview",
      title: "Budget vs Actual, synced to Xero",
      body: ["Every cost category shows budgeted against actual, reconciled straight from your Xero transactions. It's not a spreadsheet someone has to update by hand after the fact."],
    },
    { key: "structure", eyebrow: "Structure", title: "Seven tabs, one deal", body: [] },
    {
      key: "feasibility",
      eyebrow: "Feasibility",
      title: "Margin, equity, and return, calculated for you",
      body: ["Revenue, acquisition, construction, professional fees, contingency, holding costs, and GST all roll up into the numbers that actually decide whether a deal stacks up."],
    },
  ],
};

export default function FinanceModelDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={TrendingUp}
          badgeText={copy.badgeText}
          badgeClass="bg-violet-50 border-violet-100 text-violet-600"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-violet-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} eyebrowClass="text-violet-500" title={copy.sections[0].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[0].body[0]}
          </p>
          <div className={isDark ? "dark" : ""}><FinanceModelMockup /></div>
        </Section>

        <Section eyebrow={copy.sections[1].eyebrow} eyebrowClass="text-violet-500" title={copy.sections[1].title}>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <span key={t} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-[12px] font-medium">{t}</span>
            ))}
          </div>
        </Section>

        <Section eyebrow={copy.sections[2].eyebrow} eyebrowClass="text-violet-500" title={copy.sections[2].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[2].body[0]}
          </p>
          <div className={`flex gap-3 max-w-sm ${isDark ? "dark" : ""}`}>
            <Stat label="Margin on cost" value="18.4%" />
            <Stat label="Return on equity" value="31.2%" />
          </div>
        </Section>
      </div>
    </section>
  );
}

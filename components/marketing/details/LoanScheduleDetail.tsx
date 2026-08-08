"use client";

// The rich deep-dive page for the loan schedule inside Finance Model --
// grounded in the real Loans subtab (components/public/financeModel/
// LoansSubtab.tsx): interest-rate history, a computed repayment schedule
// (lib/loanCalculator.ts), a loan-split editor across multiple projects,
// and a calculated-vs-actual comparison matched against real Xero
// transactions.
import { CalendarClock } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const LoanScheduleMockup = MOCKUPS.loanSchedule;

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Loan tab in finance models",
  headlineLine1: "A computed schedule,",
  headlineLine2: "checked against what actually happened.",
  subheadline: "Interest and principal, period by period, calculated from the loan's own rate history and repayment phases, then compared against the real repayments matched from Xero.",
  sections: [
    {
      key: "schedule",
      eyebrow: "Schedule",
      title: "Opening balance to closing balance, every period",
      body: [`Interest is calculated on the real per-period rate history, not one flat number for the life of the loan, and "costed" interest (what actually hits your budget) is automatically capped at the project's completion date, distinct from the full contractual interest.`],
    },
    {
      key: "reconciliation",
      eyebrow: "Reconciliation",
      title: "Calculated vs actual, matched from Xero",
      body: ["The schedule this produces is compared directly against real repayment transactions synced from Xero, so a gap between what should have happened and what actually did shows up on its own, not months later at reconciliation."],
    },
  ],
};

export default function LoanScheduleDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={CalendarClock}
          badgeText={copy.badgeText}
          badgeClass="bg-sky-50 border-sky-100 text-sky-700"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-sky-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} eyebrowClass="text-sky-500" title={copy.sections[0].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[0].body[0]}
          </p>
          <div className={isDark ? "dark" : ""}><LoanScheduleMockup /></div>
        </Section>

        <Section eyebrow={copy.sections[1].eyebrow} eyebrowClass="text-sky-500" title={copy.sections[1].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[1].body[0]}
          </p>
        </Section>
      </div>
    </section>
  );
}

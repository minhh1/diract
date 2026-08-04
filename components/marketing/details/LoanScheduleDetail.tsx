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

const LoanScheduleMockup = MOCKUPS.loanSchedule;

export default function LoanScheduleDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={CalendarClock}
          badgeText="Loan tab in finance models"
          badgeClass="bg-sky-50 border-sky-100 text-sky-700"
          headlineLines={["A computed schedule,", "checked against what actually happened."]}
          accentClass="text-sky-600"
          subheadline="Interest and principal, period by period, calculated from the loan's own rate history and repayment phases — then compared against the real repayments matched from Xero."
        />

        <Section eyebrow="Schedule" eyebrowClass="text-sky-500" title="Opening balance to closing balance, every period">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Interest is calculated on the real per-period rate history, not one flat number for the life of the loan — and
            "costed" interest (what actually hits your budget) is automatically capped at the project's completion date, distinct
            from the full contractual interest.
          </p>
          <div className={isDark ? "dark" : ""}><LoanScheduleMockup /></div>
        </Section>

        <Section eyebrow="Reconciliation" eyebrowClass="text-sky-500" title="Calculated vs actual, matched from Xero">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            The schedule this produces is compared directly against real repayment transactions synced from Xero — so a gap
            between what should have happened and what actually did shows up on its own, not months later at reconciliation.
          </p>
        </Section>
      </div>
    </section>
  );
}

"use client";

// The rich deep-dive page for "Loan tables" -- grounded in the real
// Niksen Loans board and LoanPhasesPanel (components/clientUpdatePages/
// LoanPhasesPanel.tsx). That panel is deliberately narrow -- it edits a
// loan's repayment PHASE sequence only (type, start/end date, frequency,
// notes), not interest rate or a computed schedule, which live in the
// richer Loans subtab inside Finance Model (see the "loan-schedule" page).
import { Landmark } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

const LoanTableMockup = MOCKUPS.loanTable;

export default function LoanFacilitiesDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Landmark}
          badgeText="Loan tables"
          badgeClass="bg-indigo-50 border-indigo-100 text-indigo-600"
          headlineLines={["Every facility on one board,", "not scattered across lenders."]}
          accentClass="text-indigo-600"
          subheadline="A portfolio-wide view of every loan across every deal, with name, lender type, and principal, and the messy detail of repayment phases fixable right from the same board."
        />

        <Section eyebrow="Portfolio" title="One board, every facility">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Senior debt, mezzanine, private lenders: all in one place, not a separate spreadsheet per lender relationship.
          </p>
          <div className={isDark ? "dark" : ""}><LoanTableMockup /></div>
        </Section>

        <Section eyebrow="Phases" title="Fix a messy repayment structure in place">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Each loan is a sequence of repayment phases: interest-only or amortising, on a monthly, quarterly, six-monthly, or
            at-maturity schedule. Edit the sequence directly from the portfolio board, useful when phases come in messy from an
            import and need correcting without opening every loan individually.
          </p>
        </Section>
      </div>
    </section>
  );
}

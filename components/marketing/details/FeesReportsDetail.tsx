"use client";

// The rich deep-dive page for "Fees reports" -- reuses the real
// TimeFeesReportWidget recreation from mockups.tsx (see that file's own
// comment for the source), the only new content here is the explanation
// of what the report is actually built from.
import { BarChart3 } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

const FeesReportMockup = MOCKUPS.feesReport;

export default function FeesReportsDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={BarChart3}
          badgeText="Fees reports"
          badgeClass="bg-sky-50 border-sky-100 text-sky-700"
          headlineLines={["Every fee earner's numbers,", "not a month-end guess."]}
          accentClass="text-sky-600"
          subheadline="Built directly from the same time entries your team logs every day — no separate spreadsheet to keep in sync, no reconciling two sources of truth at month-end."
        />

        <Section eyebrow="Report" eyebrowClass="text-sky-500" title="Entries, hours, billable hours, and amount — per person">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Switch between this week, this month, or all time. Every row totals automatically, so the bottom line is always
            right there.
          </p>
          <div className={isDark ? "dark" : ""}><FeesReportMockup /></div>
        </Section>
      </div>
    </section>
  );
}

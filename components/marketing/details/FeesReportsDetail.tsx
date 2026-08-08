"use client";

// The rich deep-dive page for "Fees reports" -- reuses the real
// TimeFeesReportWidget recreation from mockups.tsx (see that file's own
// comment for the source), the only new content here is the explanation
// of what the report is actually built from.
import { BarChart3 } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const FeesReportMockup = MOCKUPS.feesReport;

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Fees reports",
  headlineLine1: "Every fee earner's numbers,",
  headlineLine2: "not a month-end guess.",
  subheadline: "Built directly from the same time entries your team logs every day. There's no separate spreadsheet to keep in sync, no reconciling two sources of truth at month-end.",
  sections: [
    {
      key: "report",
      eyebrow: "Report",
      title: "Entries, hours, billable hours, and amount, per person",
      body: ["Switch between this week, this month, or all time. Every row totals automatically, so the bottom line is always right there."],
    },
  ],
};

export default function FeesReportsDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={BarChart3}
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
          <div className={isDark ? "dark" : ""}><FeesReportMockup /></div>
        </Section>
      </div>
    </section>
  );
}
